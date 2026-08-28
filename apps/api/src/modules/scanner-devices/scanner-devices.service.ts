import { Inject, Injectable } from "@nestjs/common";
import { createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { type Request } from "express";
import { type AppEnvironment } from "../../common/config/environment.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { RedisService } from "../../common/redis/redis.service.js";
import { IdempotencyService } from "../../common/idempotency/idempotency.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

const PAIRING_TTL_SECONDS = 300;
const PAIRING_STATE_TTL_SECONDS = 3_600;
const PAIRING_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const PRESENCE_TTL_SECONDS = 60;
const HEARTBEAT_WRITE_INTERVAL_MS = 60_000;

interface PairingMetadata {
  readonly pairingCodeId: string;
  readonly expiresAtEpochMs: number;
  readonly branchCode: PairingInput["branchCode"];
  readonly name: string;
  readonly gateCode: string;
  readonly location: string;
  readonly pairedBy: string;
}

interface PairingState extends PairingMetadata {
  readonly codeDigest: string;
  readonly status: "ACTIVE" | "CLAIMED" | "CANCELLED";
  readonly claimRequestDigest?: string;
}

interface PairingInput {
  readonly branchCode: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";
  readonly name: string;
  readonly gateCode: string;
  readonly location?: string;
}

/** 관리자 기기 목록의 상태·캠퍼스 필터와 1부터 시작하는 페이지 입력. */
export interface ListScannerDevicesQuery {
  readonly branch?: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";
  readonly status: "ACTIVE" | "REVOKED" | "UNPAIRED";
  readonly page: number;
  readonly pageSize: number;
}

/** 일회성 코드의 비밀 원문을 제외한 발급 정보. */
export interface PairingCodeMetadata {
  readonly pairingCodeId: string;
  readonly branch: PairingInput["branchCode"];
  readonly gateCode: string;
  readonly intendedDeviceName: string;
  readonly expiresAt: Date;
  readonly ttlSeconds: number;
}

/** 최초 발급에만 pairingCode가 있고 멱등 재생에는 메타데이터만 있다. */
export type PairingCreateResult =
  | { readonly pairing: PairingCodeMetadata; readonly replayed: false; readonly pairingCode: string }
  | { readonly pairing: PairingCodeMetadata; readonly replayed: true };

/** 페어링의 Redis 임시 상태, 기기·감사 DB 기록, 스캐너 세션을 각 커밋 경계에서 관리한다. */
@Injectable()
export class ScannerDevicesService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly idempotency: IdempotencyService,
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  /**
   * Redis에 5분짜리 코드를 먼저 만들고 DB에 감사·멱등 결과를 기록한다.
   * 최초 성공에만 코드 원문을 반환하며 동일 키 재생에는 메타데이터만 반환한다.
   * @throws {DomainError} 비활성 캠퍼스 또는 코드 충돌로 발급할 수 없을 때.
   */
  public async createPairing(input: PairingInput, actorSubject: string, key: string): Promise<PairingCreateResult> {
    const replayRequest = { ...input, actorSubject };
    const replay = await this.idempotency.replay<{ pairing: PairingCodeMetadata }>("SCANNER_PAIRING_CREATE", key, replayRequest);
    if (replay !== null) return { ...replay, replayed: true as const };
    const branch = await this.prisma.branch.findUnique({ where: { code: input.branchCode } });
    if (branch === null || !branch.active) this.fail(404, "BRANCH_NOT_FOUND");
    let issued: { pairingCodeId: string; code: string } | undefined;
    for (let attempt = 0; attempt < 5 && issued === undefined; attempt += 1) {
      const pairingCodeId = randomUUID();
      const candidate = Array.from({ length: 6 }, () => PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)]).join("");
      const codeDigest = this.digest(candidate);
      const state: PairingState = {
        pairingCodeId,
        expiresAtEpochMs: Date.now() + PAIRING_TTL_SECONDS * 1_000,
        branchCode: input.branchCode,
        name: input.name.slice(0, 120),
        gateCode: input.gateCode.slice(0, 100),
        location: input.location?.slice(0, 160) ?? "",
        pairedBy: actorSubject.slice(0, 160),
        codeDigest,
        status: "ACTIVE",
      };
      const created = await this.redis.client.eval(
        "if redis.call('EXISTS',KEYS[1])==1 or redis.call('EXISTS',KEYS[2])==1 then return 0 end; redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[2]); redis.call('SET',KEYS[2],ARGV[3],'EX',ARGV[4]); return 1",
        {
          keys: [this.pairingKeyFromDigest(codeDigest), this.pairingStateKey(pairingCodeId)],
          arguments: [pairingCodeId, String(PAIRING_TTL_SECONDS), JSON.stringify(state), String(PAIRING_STATE_TTL_SECONDS)],
        },
      );
      if (Number(created) === 1) issued = { pairingCodeId, code: candidate };
    }
    if (issued === undefined) this.fail(503, "SCANNER_PAIRING_CODE_UNAVAILABLE");
    const stored: { pairing: PairingCodeMetadata } = {
      pairing: {
        pairingCodeId: issued.pairingCodeId,
        branch: input.branchCode,
        gateCode: input.gateCode,
        intendedDeviceName: input.name,
        expiresAt: new Date(Date.now() + PAIRING_TTL_SECONDS * 1_000),
        ttlSeconds: PAIRING_TTL_SECONDS,
      },
    };
    const durable = await this.idempotency.executeWithReplay("SCANNER_PAIRING_CREATE", key, replayRequest, async (transaction) => {
      await transaction.scannerPairingAudit.create({
        data: { eventType: "PAIRING_CREATED", actorSubject, resultCode: "CREATED", safeMetadata: { pairingCodeId: issued!.pairingCodeId } },
      });
      return stored;
    }, 201);
    if (durable.replayed) {
      await this.redis.client.del([
        this.pairingKey(issued.code),
        this.pairingStateKey(issued.pairingCodeId),
      ]);
      return { ...durable.value, replayed: true as const };
    }
    return { ...durable.value, replayed: false as const, pairingCode: issued.code };
  }

  /**
   * 미사용 코드의 Redis 상태를 먼저 취소하고 DB 감사·멱등 기록을 남긴다.
   * claim된 코드는 HTTP 409이며, 이미 기록된 동일 키는 재생 후 조용히 끝난다.
   */
  public async cancelPairing(pairingCodeId: string, actorSubject: string, key: string): Promise<void> {
    const replayRequest = { pairingCodeId };
    if (await this.idempotency.replay("SCANNER_PAIRING_CANCEL", key, replayRequest) !== null) return;
    const stateKey = this.pairingStateKey(pairingCodeId);
    const rawState = await this.redis.client.get(stateKey);
    if (rawState === null) this.fail(404, "PAIRING_CODE_NOT_FOUND");
    const state = this.parsePairingState(rawState);
    const result = await this.redis.client.eval(
      "local raw=redis.call('GET',KEYS[1]); if not raw then return 'NOT_FOUND' end; local s=cjson.decode(raw); if s.status=='CLAIMED' then return 'CLAIMED' end; if s.status=='CANCELLED' then return 'ALREADY_CANCELLED' end; redis.call('DEL',KEYS[2]); s.status='CANCELLED'; redis.call('SET',KEYS[1],cjson.encode(s),'KEEPTTL'); return 'CANCELLED'",
      { keys: [stateKey, this.pairingKeyFromDigest(state.codeDigest)], arguments: [] },
    );
    if (result === "NOT_FOUND") this.fail(404, "PAIRING_CODE_NOT_FOUND");
    if (result === "CLAIMED") this.fail(409, "PAIRING_CODE_ALREADY_CLAIMED");
    await this.idempotency.execute("SCANNER_PAIRING_CANCEL", key, replayRequest, async (transaction) => {
      await transaction.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${'scanner-pairing-cancel:' + pairingCodeId},0))`;
      const audited = await transaction.scannerPairingAudit.count({
        where: { eventType: "PAIRING_CANCELLED", safeMetadata: { path: ["pairingCodeId"], equals: pairingCodeId } },
      });
      if (audited === 0) await transaction.scannerPairingAudit.create({
        data: { eventType: "PAIRING_CANCELLED", actorSubject, resultCode: "CANCELLED", safeMetadata: { pairingCodeId } },
      });
      return { cancelled: true };
    }, 204);
  }

  /**
   * 사용 횟수를 제한한 뒤 Redis Lua로 코드를 원자적으로 claim하고 DB 기기·감사를 커밋한다.
   * 이후 {@link ScannerDevicesService.establishScannerSession}이 별도로 세션과 CSRF를 만든다.
   * 동일 멱등 키의 재생은 기존 기기에 새 스캐너 세션을 연결한다.
   * @throws {DomainError} 무효·이미 claim된 코드, 제한 초과, 기기 활성 상태 불일치 시.
   */
  public async claim(request: Request, suppliedCode: string, clientPlatform: string, deviceName: string, key: string) {
    const code = suppliedCode.normalize("NFKC").trim().toUpperCase();
    if (!/^[2-9A-HJ-NP-Z]{6}$/.test(code)) this.fail(400, "SCANNER_PAIRING_INVALID");
    const codeDigest = this.digest(code);
    const replayRequest = { codeDigest, clientPlatform, deviceName };
    const replay = await this.idempotency.replay<{ deviceId: string }>("SCANNER_PAIRING_CLAIM", key, replayRequest);
    if (replay !== null) return this.establishScannerSession(request, replay.deviceId);
    const ipDigest = this.digest(request.ip ?? "unknown");
    await Promise.all([
      this.rateLimit(`${this.redis.prefix}scanner:pairing-attempt:ip:${ipDigest}`, 20, PAIRING_TTL_SECONDS),
      this.rateLimit(`${this.redis.prefix}scanner:pairing-attempt:code:${codeDigest}`, 10, PAIRING_TTL_SECONDS),
      this.rateLimit(`${this.redis.prefix}scanner:pairing-attempt:global`, 600, 60),
    ]);
    const codeKey = this.pairingKey(code);
    const pairingCodeId = await this.redis.client.get(codeKey);
    const consumed = pairingCodeId === null ? null : await this.redis.client.eval(
      "local id=redis.call('GET',KEYS[1]); if not id or id~=ARGV[1] then return 'INVALID' end; local raw=redis.call('GET',KEYS[2]); if not raw then redis.call('DEL',KEYS[1]); return 'INVALID' end; local s=cjson.decode(raw); if s.status=='CLAIMED' then if s.claimRequestDigest==ARGV[3] then return cjson.encode(s) else return 'ALREADY_CLAIMED' end end; if s.status~='ACTIVE' or tonumber(s.expiresAtEpochMs)<=tonumber(ARGV[2]) then redis.call('DEL',KEYS[1]); return 'INVALID' end; s.status='CLAIMED'; s.claimRequestDigest=ARGV[3]; redis.call('SET',KEYS[2],cjson.encode(s),'KEEPTTL'); return cjson.encode(s)",
      { keys: [codeKey, this.pairingStateKey(pairingCodeId)], arguments: [pairingCodeId, String(Date.now()), this.digest(`claim:${key}:${this.digest(JSON.stringify(replayRequest))}`)] },
    );
    if (consumed === "ALREADY_CLAIMED") this.fail(409, "SCANNER_PAIRING_ALREADY_CLAIMED");
    if (typeof consumed !== "string" || consumed === "INVALID") {
      await this.prisma.scannerPairingAudit.create({ data: { eventType: "PAIRING_CLAIM", resultCode: "INVALID" } });
      this.fail(400, "SCANNER_PAIRING_INVALID");
    }
    const stored = this.parsePairingState(consumed);
    const durable = await this.idempotency.executeWithReplay("SCANNER_PAIRING_CLAIM", key, replayRequest, async (transaction) => {
      const branch = await transaction.branch.findUnique({ where: { code: stored.branchCode } });
      if (branch === null) this.fail(409, "SCANNER_PAIRING_INVALID");
      const device = await transaction.scannerDevice.create({ data: {
        branchId: branch.id, name: deviceName.slice(0, 100), model: clientPlatform.slice(0, 120),
        location: stored.location === "" ? null : stored.location, gateCode: stored.gateCode, pairedBy: stored.pairedBy,
      } });
      await transaction.scannerPairingAudit.create({ data: {
        scannerDeviceId: device.id, eventType: "PAIRING_CLAIM", resultCode: "SUCCEEDED",
        safeMetadata: { pairingCodeId: stored.pairingCodeId },
      } });
      return { deviceId: device.publicId };
    }, 201);
    return this.establishScannerSession(request, durable.value.deviceId);
  }

  /** DB에 기록된 활성 기기를 확인하고 세션·CSRF·presence를 만든 뒤 활성 상태를 재확인한다. */
  private async establishScannerSession(request: Request, deviceId: string) {
    const device = await this.prisma.scannerDevice.findUnique({
      where: { publicId: deviceId }, include: { branch: { select: { code: true } } },
    });
    if (device === null || device.status !== "ACTIVE") this.fail(409, "SCANNER_PAIRING_INVALID");
    await this.regenerate(request);
    request.session.actor = {
      subject: device.publicId,
      role: "SCANNER",
      scannerDeviceId: device.publicId,
    };
    request.session.absoluteExpiresAt = Date.now() + this.environment.sessionAbsoluteTtlSeconds * 1_000;
    const csrfToken = randomBytes(32).toString("base64url");
    request.session.csrfToken = csrfToken;
    await this.save(request);
    await this.redis.client.sAdd(this.deviceSessionsKey(device.publicId), request.sessionID);
    await this.redis.client.expire(this.deviceSessionsKey(device.publicId), this.environment.sessionAbsoluteTtlSeconds);
    const presenceExpiresAt = await this.markPresent(device.publicId);
    const stillActive = await this.prisma.scannerDevice.count({
      where: { publicId: device.publicId, status: "ACTIVE" },
    });
    if (stillActive !== 1) {
      await this.invalidateDeviceRuntime(device.publicId);
      await this.destroy(request);
      this.fail(409, "SCANNER_PAIRING_INVALID");
    }
    return {
      device: {
        deviceId: device.publicId,
        deviceName: device.name,
        branch: device.branch.code,
        gateCode: device.gateCode,
        status: device.status,
        pairedAt: device.pairedAt,
        revokedAt: null,
        online: true,
        presenceExpiresAt,
        lastBatteryLevelPercent: null,
        isCharging: null,
        batteryReportedAt: null,
      },
      csrfToken,
    };
  }

  /** 상태·캠퍼스로 기기를 페이지 조회하고 Redis presence TTL로 접속 상태를 덧붙인다. */
  public async list(query: ListScannerDevicesQuery) {
    const where: Prisma.ScannerDeviceWhereInput = {
      status: query.status,
      ...(query.branch === undefined ? {} : { branch: { code: query.branch } }),
    };
    const [devices, totalItems] = await Promise.all([
      this.prisma.scannerDevice.findMany({
        where,
        select: {
          publicId: true, name: true, model: true, location: true, gateCode: true, batteryPercent: true,
          batteryIsCharging: true, batteryReportedAt: true,
          status: true, pairedAt: true, lastHeartbeatAt: true, revokedAt: true,
          branch: { select: { code: true, displayName: true } },
          selectedSession: { select: { publicId: true, title: true, scope: true } },
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.scannerDevice.count({ where }),
    ]);
    const now = Date.now();
    const presenceTtls = await Promise.all(devices.map((device) => this.redis.client.ttl(this.presenceKey(device.publicId))));
    return { items: devices.map((device, index) => ({
      deviceId: device.publicId,
      deviceName: device.name,
      gateCode: device.gateCode,
      lastBatteryLevelPercent: device.batteryPercent,
      isCharging: device.batteryIsCharging,
      batteryReportedAt: device.batteryReportedAt,
      status: device.status,
      pairedAt: device.pairedAt,
      revokedAt: device.revokedAt,
      online: (presenceTtls[index] ?? -1) > 0,
      presenceExpiresAt: (presenceTtls[index] ?? -1) > 0 ? new Date(now + presenceTtls[index]! * 1_000) : null,
      branch: device.branch.code,
    })), page: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    } };
  }

  /** 세션의 활성 기기 정보와 잠긴 회차를 반환한다. 기기가 없으면 HTTP 404다. */
  public async current(deviceId: string) {
    const device = await this.prisma.scannerDevice.findFirst({
      where: { publicId: deviceId, status: "ACTIVE" },
      select: {
        publicId: true, name: true, model: true, location: true, gateCode: true,
        batteryPercent: true, batteryIsCharging: true, batteryReportedAt: true,
        status: true, pairedAt: true, lastHeartbeatAt: true,
        branch: { select: { code: true, displayName: true } },
        selectedSession: { select: { publicId: true, title: true, scope: true } },
      },
    });
    if (device === null) this.fail(404, "SCANNER_DEVICE_NOT_FOUND");
    const ttl = await this.redis.client.ttl(this.presenceKey(device.publicId));
    return {
      device: {
        deviceId: device.publicId,
        deviceName: device.name,
        branch: device.branch.code,
        gateCode: device.gateCode,
        lastBatteryLevelPercent: device.batteryPercent,
        isCharging: device.batteryIsCharging,
        batteryReportedAt: device.batteryReportedAt,
        status: device.status,
        pairedAt: device.pairedAt,
        revokedAt: null,
        online: ttl > 0,
        presenceExpiresAt: ttl > 0 ? new Date(Date.now() + ttl * 1_000) : null,
      },
      shift: await this.currentShift(deviceId),
    };
  }

  /** 관리자가 취소된 상태까지 포함한 기기 상세를 조회한다. 삭제되어 없으면 HTTP 404다. */
  public async detail(deviceId: string) {
    const device = await this.prisma.scannerDevice.findUnique({
      where: { publicId: deviceId },
      select: {
        publicId: true, name: true, gateCode: true, status: true, pairedAt: true, revokedAt: true,
        batteryPercent: true, batteryIsCharging: true, batteryReportedAt: true,
        branch: { select: { code: true } },
      },
    });
    if (device === null) this.fail(404, "SCANNER_DEVICE_NOT_FOUND");
    const ttl = await this.redis.client.ttl(this.presenceKey(deviceId));
    return {
      device: {
        deviceId: device.publicId, deviceName: device.name, branch: device.branch.code, gateCode: device.gateCode,
        status: device.status, pairedAt: device.pairedAt, revokedAt: device.revokedAt,
        online: ttl > 0, presenceExpiresAt: ttl > 0 ? new Date(Date.now() + ttl * 1_000) : null,
        lastBatteryLevelPercent: device.batteryPercent, isCharging: device.batteryIsCharging,
        batteryReportedAt: device.batteryReportedAt,
      },
      shift: device.status === "ACTIVE" ? await this.currentShift(deviceId) : { locked: false, lock: null },
    };
  }

  /** 해당 기기의 감사 사건을 sequence 오름차순으로 반환하고 다음 커서를 계산한다. */
  public async events(deviceId: string, afterSequence?: string, requestedLimit?: number) {
    const device = await this.prisma.scannerDevice.findUnique({ where: { publicId: deviceId }, select: { id: true } });
    if (device === null) this.fail(404, "SCANNER_DEVICE_NOT_FOUND");
    const after = afterSequence === undefined ? 0n : BigInt(afterSequence);
    const limit = Math.min(Math.max(requestedLimit ?? 50, 1), 200);
    const rows = await this.prisma.scannerPairingAudit.findMany({
      where: { scannerDeviceId: device.id, id: { gt: after } }, orderBy: { id: "asc" }, take: limit + 1,
      select: { id: true, eventId: true, eventType: true, actorSubject: true, resultCode: true, safeMetadata: true, occurredAt: true },
    });
    return {
      items: rows.slice(0, limit).map((row) => ({
        sequence: row.id.toString(), eventId: row.eventId, eventType: this.auditEventType(row.eventType),
        actorSubject: row.actorSubject, resultCode: row.resultCode, safeMetadata: row.safeMetadata, occurredAt: row.occurredAt,
      })),
      page: {
        nextAfterSequence: rows.length > limit ? rows[limit - 1]!.id.toString() : null,
        hasMore: rows.length > limit,
      },
    };
  }

  /** DB heartbeat 기록은 60초 간격으로 제한하고 Redis presence는 매번 60초로 갱신한다. */
  public async heartbeat(
    deviceId: string,
    actorDeviceId: string | undefined,
    batteryLevelPercent?: number | null,
    isCharging?: boolean | null,
  ) {
    if (actorDeviceId !== undefined && actorDeviceId !== deviceId) this.fail(403, "SCANNER_DEVICE_SCOPE_MISMATCH");
    const cutoff = new Date(Date.now() - HEARTBEAT_WRITE_INTERVAL_MS);
    const result = await this.prisma.scannerDevice.updateMany({
      where: { publicId: deviceId, status: "ACTIVE", OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: cutoff } }] },
      data: {
        lastHeartbeatAt: new Date(),
        ...(batteryLevelPercent === undefined ? {} : { batteryPercent: batteryLevelPercent }),
        ...(isCharging === undefined ? {} : { batteryIsCharging: isCharging }),
        ...(batteryLevelPercent === undefined && isCharging === undefined ? {} : { batteryReportedAt: new Date() }),
      },
    });
    if (result.count === 0) {
      const active = await this.prisma.scannerDevice.count({ where: { publicId: deviceId, status: "ACTIVE" } });
      if (active !== 1) this.fail(404, "SCANNER_DEVICE_NOT_FOUND");
    }
    const serverTime = new Date();
    const presenceExpiresAt = await this.markPresent(deviceId, serverTime);
    const stillActive = await this.prisma.scannerDevice.count({ where: { publicId: deviceId, status: "ACTIVE" } });
    if (stillActive !== 1) {
      await this.invalidateDeviceRuntime(deviceId);
      this.fail(404, "SCANNER_DEVICE_NOT_FOUND");
    }
    return { serverTime, presenceExpiresAt };
  }

  /** 기기 행 잠금 아래 OPEN·캠퍼스 일치 회차를 고정하고 감사·멱등 결과를 함께 커밋한다. */
  public async selectSession(request: Request, deviceId: string, sessionId: string, key: string) {
    const actor = request.session.actor!;
    if (actor.role === "SCANNER" && actor.scannerDeviceId !== deviceId) this.fail(403, "SCANNER_DEVICE_SCOPE_MISMATCH");
    const result = await this.idempotency.execute("SCANNER_SHIFT_SELECT", key, { deviceId, sessionId }, async (transaction) => {
      const devices = await transaction.$queryRaw<Array<{
        id: bigint; branch_id: bigint; selected_session_id: bigint | null; scan_mode_locked_at: Date | null;
      }>>`select id,branch_id,selected_session_id,scan_mode_locked_at from scanner_devices
           where public_id=${deviceId}::uuid and status='ACTIVE' for update`;
      const device = devices[0];
      if (device === undefined) this.fail(404, "SCANNER_DEVICE_NOT_FOUND");
      const session = await transaction.seminarSession.findUnique({ where: { publicId: sessionId } });
      if (session === null || session.status !== "OPEN"
        || (session.scope !== "ALL" && session.branchId !== device.branch_id)) this.fail(409, "SCANNER_SESSION_INVALID");
      if (device.selected_session_id !== null && device.selected_session_id !== session.id) {
        this.fail(409, "SCANNER_SESSION_LOCKED");
      }
      if (device.selected_session_id === null) {
        await transaction.scannerDevice.update({
          where: { id: device.id },
          data: { selectedSessionId: session.id, scanModeLockedAt: new Date() },
        });
        await transaction.scannerPairingAudit.create({
          data: { scannerDeviceId: device.id, eventType: "SHIFT_LOCKED", actorSubject: actor.subject, resultCode: "LOCKED" },
        });
      }
      return { sessionId: session.publicId };
    });
    actor.selectedSessionId = result.sessionId;
    await this.save(request);
    return this.currentShift(deviceId);
  }

  /** 활성 기기의 회차 잠금 정보를 반환한다. 선택 회차가 없으면 locked=false다. */
  public async currentShift(deviceId: string) {
    const device = await this.prisma.scannerDevice.findFirst({
      where: { publicId: deviceId, status: "ACTIVE" },
      select: {
        publicId: true, gateCode: true, scanModeLockedAt: true,
        branch: { select: { code: true } },
        selectedSession: { select: { publicId: true, scope: true, branch: { select: { code: true } } } },
      },
    });
    if (device === null) this.fail(404, "SCANNER_DEVICE_NOT_FOUND");
    if (device.selectedSession === null) return { locked: false, lock: null };
    return {
      locked: true,
      lock: {
        lockId: device.publicId,
        deviceId: device.publicId,
        branch: device.branch.code,
        gateCode: device.gateCode,
        seminarSessionId: device.selectedSession.publicId,
        sessionScope: device.selectedSession.scope,
        sessionBranch: device.selectedSession.branch?.code ?? null,
        lockedAt: device.scanModeLockedAt,
        lockedBy: device.publicId,
      },
    };
  }

  /** 기기 행을 잠그고 잠긴 회차가 있을 때만 해제·SHIFT_RELEASED 감사를 멱등 커밋한다. 스캐너 요청이면 세션도 갱신한다. */
  public async unlockSession(request: Request, deviceId: string, actorSubject: string, reason: string, key: string) {
    const actor = request.session.actor!;
    if (actor.role === "SCANNER" && actor.scannerDeviceId !== deviceId) this.fail(403, "SCANNER_DEVICE_SCOPE_MISMATCH");
    await this.idempotency.execute("SCANNER_SHIFT_RELEASE", key, { deviceId, reason }, async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ id: bigint; selected_session_id: bigint | null }>>`
        select id,selected_session_id from scanner_devices where public_id=${deviceId}::uuid and status='ACTIVE' for update`;
      const device = rows[0];
      if (device === undefined) this.fail(404, "SCANNER_DEVICE_NOT_FOUND");
      if (device.selected_session_id !== null) {
        await transaction.scannerDevice.update({
          where: { id: device.id }, data: { selectedSessionId: null, scanModeLockedAt: null },
        });
        await transaction.scannerPairingAudit.create({
          data: { scannerDeviceId: device.id, eventType: "SHIFT_RELEASED", actorSubject, resultCode: "RELEASED", safeMetadata: { reason } },
        });
      }
      return { deviceId, locked: false };
    });
    if (actor.role === "SCANNER") {
      delete actor.selectedSessionId;
      await this.save(request);
    }
    return { locked: false, lock: null };
  }

  /** DB에서 기기를 취소한 뒤 Redis 세션·presence를 무효화한다. 같은 키 재생도 사후 정리를 반복한다. */
  public async revoke(deviceId: string, actorSubject: string, reason: string, key: string) {
    await this.idempotency.execute("SCANNER_DEVICE_REVOKE", key, { deviceId, reason }, async (transaction) => {
      const status = await this.deactivateDevice(transaction, deviceId, "REVOKED", actorSubject, reason);
      return { deviceId, status };
    });
    // Redis 정리는 DB 트랜잭션 밖이다. 커밋 뒤 실패해도 같은 멱등 키를 재생하면 다시 정리한다.
    await this.invalidateDeviceRuntime(deviceId);
    return this.detail(deviceId);
  }

  /** 기기를 DB에서 삭제한 뒤 Redis 세션·presence·관련 페어링 상태를 지운다. 완료만 반환한다. */
  public async deleteDevice(deviceId: string, actorSubject: string, key: string): Promise<void> {
    const deletion = await this.idempotency.execute("SCANNER_DEVICE_DELETE", key, { deviceId, actorSubject }, async (transaction) => {
      const pairingCodeIds = await this.hardDeleteDevice(transaction, deviceId);
      return { deviceId, deleted: true, pairingCodeIds };
    }, 204);
    await Promise.all([
      this.invalidateDeviceRuntime(deviceId),
      this.invalidatePairingRuntime(deletion.pairingCodeIds ?? []),
    ]);
  }

  /** 자기 기기를 DB에서 삭제하고 Redis 상태를 지운 뒤 현재 Express 세션을 파기한다. */
  public async selfUnpair(request: Request, deviceId: string, key: string): Promise<void> {
    const deletion = await this.idempotency.execute("SCANNER_SELF_UNPAIR", key, { deviceId }, async (transaction) => {
      const pairingCodeIds = await this.hardDeleteDevice(transaction, deviceId);
      return { deviceId, deleted: true, pairingCodeIds };
    }, 204);
    await Promise.all([
      this.invalidateDeviceRuntime(deviceId),
      this.invalidatePairingRuntime(deletion.pairingCodeIds ?? []),
    ]);
    await this.destroy(request);
  }

  /** 서버 비밀 HMAC으로 코드·요청 출처를 다이제스트화한다. 비밀 미설정은 HTTP 503이다. */
  private digest(value: string): string {
    const secret = this.environment.scannerPairingHmacKey;
    if (secret === undefined) this.fail(503, "SESSION_NOT_CONFIGURED");
    return createHmac("sha256", Buffer.from(secret, "base64")).update(value).digest("base64url");
  }

  private pairingKey(code: string): string {
    return this.pairingKeyFromDigest(this.digest(code));
  }

  private pairingKeyFromDigest(codeDigest: string): string {
    return `${this.redis.prefix}scanner:pairing:code:${codeDigest}`;
  }

  private pairingStateKey(pairingCodeId: string): string {
    return `${this.redis.prefix}scanner:pairing:id:${pairingCodeId}`;
  }

  private presenceKey(deviceId: string): string {
    return `${this.redis.prefix}scanner:presence:${deviceId}`;
  }

  private deviceSessionsKey(deviceId: string): string {
    return `${this.redis.prefix}scanner:sessions:${deviceId}`;
  }

  /** 기기에 연결된 Express 세션과 presence를 Redis에서 함께 무효화한다. */
  private async invalidateDeviceRuntime(deviceId: string): Promise<void> {
    await this.redis.client.eval(
      "local ids=redis.call('SMEMBERS',KEYS[1]); for _,id in ipairs(ids) do redis.call('DEL',ARGV[1]..id) end; redis.call('DEL',KEYS[1],KEYS[2]); return #ids",
      {
        keys: [this.deviceSessionsKey(deviceId), this.presenceKey(deviceId)],
        arguments: [`${this.redis.prefix}session:`],
      },
    );
  }

  /** 삭제된 기기의 감사 메타데이터에서 찾은 코드 상태와 코드 조회 키를 Redis에서 지운다. */
  private async invalidatePairingRuntime(pairingCodeIds: readonly string[]): Promise<void> {
    if (pairingCodeIds.length === 0) return;
    await this.redis.client.eval(
      "for _,key in ipairs(KEYS) do local raw=redis.call('GET',key); if raw then local ok,state=pcall(cjson.decode,raw); if ok and type(state)=='table' and type(state.codeDigest)=='string' then redis.call('DEL',ARGV[1]..state.codeDigest) end end; redis.call('DEL',key) end; return #KEYS",
      {
        keys: pairingCodeIds.map((pairingCodeId) => this.pairingStateKey(pairingCodeId)),
        arguments: [`${this.redis.prefix}scanner:pairing:code:`],
      },
    );
  }

  /** 기기 행을 잠근 뒤 관련 페어링 코드 ID를 수집하고 DB 행을 삭제한다. 없으면 빈 목록이다. */
  private async hardDeleteDevice(transaction: Prisma.TransactionClient, deviceId: string): Promise<string[]> {
    const rows = await transaction.$queryRaw<Array<{ id: bigint }>>`
      select id from scanner_devices where public_id=${deviceId}::uuid for update`;
    const device = rows[0];
    if (device === undefined) return [];
    const audits = await transaction.scannerPairingAudit.findMany({
      where: { scannerDeviceId: device.id },
      select: { safeMetadata: true },
    });
    const pairingCodeIds = [...new Set(audits.flatMap((audit) => {
      const metadata = audit.safeMetadata;
      if (metadata === null || Array.isArray(metadata) || typeof metadata !== "object") return [];
      const pairingCodeId = (metadata as Record<string, unknown>).pairingCodeId;
      return typeof pairingCodeId === "string" ? [pairingCodeId] : [];
    }))];
    await transaction.scannerDevice.delete({ where: { id: device.id } });
    return pairingCodeIds;
  }

  /** 기기 행 잠금 아래 상태·회차 잠금 해제와 감사 사건을 기록한다. 이미 종료된 상태는 그대로 반환한다. */
  private async deactivateDevice(
    transaction: Prisma.TransactionClient,
    deviceId: string,
    targetStatus: "REVOKED" | "UNPAIRED",
    actorSubject: string,
    reason: string,
  ): Promise<"REVOKED" | "UNPAIRED"> {
    const rows = await transaction.$queryRaw<Array<{ id: bigint; status: string }>>`
      select id,status from scanner_devices where public_id=${deviceId}::uuid for update`;
    const device = rows[0];
    if (device === undefined) this.fail(404, "SCANNER_DEVICE_NOT_FOUND");
    if (device.status === "ACTIVE") {
      await transaction.scannerDevice.update({
        where: { id: device.id },
        data: {
          status: targetStatus,
          revokedAt: new Date(),
          revokedBy: actorSubject,
          selectedSessionId: null,
          scanModeLockedAt: null,
        },
      });
      await transaction.scannerPairingAudit.createMany({ data: [{
        scannerDeviceId: device.id,
        eventType: targetStatus === "REVOKED" ? "DEVICE_REVOKED" : "DEVICE_UNPAIRED",
        actorSubject,
        resultCode: targetStatus,
        safeMetadata: { reason },
      }, {
        scannerDeviceId: device.id,
        eventType: "SESSION_INVALIDATED",
        actorSubject,
        resultCode: "REQUESTED",
        safeMetadata: {},
      }] });
      return targetStatus;
    }
    if (device.status === "REVOKED" || device.status === "UNPAIRED") return device.status;
    this.fail(409, "SCANNER_DEVICE_STATE_INVALID");
  }

  /** Redis presence를 서버 시각부터 60초 동안 기록하고 만료 시각을 돌려준다. */
  private async markPresent(deviceId: string, serverTime = new Date()): Promise<Date> {
    const expiresAt = new Date(serverTime.getTime() + PRESENCE_TTL_SECONDS * 1_000);
    await this.redis.client.set(this.presenceKey(deviceId), "1", { PXAT: expiresAt.getTime() });
    return expiresAt;
  }

  /** 사용자가 보는 사건 종류로 내부 감사 이벤트명을 바꾼다. 대응값이 없으면 원문을 반환한다. */
  private auditEventType(value: string): string {
    const mapping: Readonly<Record<string, string>> = {
      PAIRING_CLAIM: "PAIRED",
      SHIFT_RELEASED: "SHIFT_RELEASED_BY_ADMIN",
      DEVICE_REVOKED: "REVOKED",
      DEVICE_UNPAIRED: "UNPAIRED_BY_DEVICE",
      SESSION_INVALIDATED: "SESSION_INVALIDATED",
    };
    return mapping[value] ?? value;
  }

  /** Redis 카운터로 페어링 시도를 제한한다. 한도를 넘으면 HTTP 429다. */
  private async rateLimit(key: string, maximum: number, ttlSeconds: number): Promise<void> {
    const attempts = await this.redis.client.incr(key);
    if (attempts === 1) await this.redis.client.expire(key, ttlSeconds);
    if (attempts > maximum) this.fail(429, "SCANNER_PAIRING_RATE_LIMITED");
  }

  /** Redis의 페어링 JSON을 검증한다. 누락·손상된 필드는 HTTP 400이다. */
  private parsePairingState(value: string): PairingState {
    try {
      const parsed = JSON.parse(value) as Partial<PairingState>;
      if (!(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"] as const).includes(parsed.branchCode as PairingInput["branchCode"])
        || typeof parsed.name !== "string" || typeof parsed.gateCode !== "string"
        || typeof parsed.location !== "string" || typeof parsed.pairedBy !== "string"
        || typeof parsed.pairingCodeId !== "string" || typeof parsed.expiresAtEpochMs !== "number"
        || typeof parsed.codeDigest !== "string"
        || !(["ACTIVE", "CLAIMED", "CANCELLED"] as const).includes(parsed.status as PairingState["status"])) {
        this.fail(400, "SCANNER_PAIRING_INVALID");
      }
      return parsed as PairingState;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      this.fail(400, "SCANNER_PAIRING_INVALID");
    }
  }

  /** 요청의 Express 세션 ID를 새로 발급받는다. 저장 실패는 호출자에게 전파한다. */
  private regenerate(request: Request): Promise<void> {
    return new Promise((resolve, reject) => request.session.regenerate((error) => error == null ? resolve() : reject(error)));
  }

  /** 현재 Express 세션을 저장한다. 저장 실패는 호출자에게 전파한다. */
  private save(request: Request): Promise<void> {
    return new Promise((resolve, reject) => request.session.save((error) => error == null ? resolve() : reject(error)));
  }

  /** 현재 Express 세션을 파기한다. 파기 실패는 호출자에게 전파한다. */
  private destroy(request: Request): Promise<void> {
    return new Promise((resolve, reject) => request.session.destroy((error) => error == null ? resolve() : reject(error)));
  }

  /** 기기 업무 실패를 HTTP 도메인 오류로 알린다. 항상 예외를 던진다. */
  private fail(status: number, code: string): never {
    throw new DomainError(status, code, "The scanner device operation could not be completed.");
  }
}
