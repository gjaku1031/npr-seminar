import { Inject, Injectable } from "@nestjs/common";
import { createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { type Request } from "express";
import { type AppEnvironment } from "../../common/config/environment.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { RedisService } from "../../common/redis/redis.service.js";
import { IdempotencyService } from "../../common/idempotency/idempotency.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

/**
 * 페어링 코드 유효 시간(초). 5분
 */
const PAIRING_TTL_SECONDS = 300;

/**
 * 페어링 상태 보관 시간(초). 코드 만료 후에도 취소·사용 결과 확인용으로 1시간 유지
 */
const PAIRING_STATE_TTL_SECONDS = 3_600;

/**
 * 페어링 코드 문자 집합. 혼동되는 0·1·I·O 제외
 */
const PAIRING_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * 접속 표시 유지 시간(초)
 */
const PRESENCE_TTL_SECONDS = 60;

/**
 * DB 상태 보고 기록 최소 간격(밀리초)
 */
const HEARTBEAT_WRITE_INTERVAL_MS = 60_000;

/**
 * Redis에 저장하는 페어링 발급 정보
 */
interface PairingMetadata {
  /**
   * 페어링 코드 ID
   */
  readonly pairingCodeId: string;

  /**
   * 코드 만료 시각(epoch 밀리초)
   */
  readonly expiresAtEpochMs: number;

  /**
   * 캠퍼스
   */
  readonly branchCode: PairingInput["branchCode"];

  /**
   * 등록 예정 기기 이름
   */
  readonly name: string;

  /**
   * 출입구 코드
   */
  readonly gateCode: string;

  /**
   * 설치 위치. 없으면 빈 문자열
   */
  readonly location: string;

  /**
   * 발급 관리자
   */
  readonly pairedBy: string;
}

/**
 * Redis 페어링 상태. 코드 원문 대신 다이제스트만 보관
 */
interface PairingState extends PairingMetadata {
  /**
   * 코드 HMAC 다이제스트
   */
  readonly codeDigest: string;

  /**
   * 상태. ACTIVE 사용 가능, CLAIMED 사용됨, CANCELLED 취소됨
   */
  readonly status: "ACTIVE" | "CLAIMED" | "CANCELLED";

  /**
   * 사용 요청 다이제스트. 같은 요청의 재시도만 성공으로 재생
   */
  readonly claimRequestDigest?: string;
}

/**
 * 페어링 코드 발급 입력
 */
interface PairingInput {
  /**
   * 캠퍼스
   */
  readonly branchCode: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

  /**
   * 기기 이름
   */
  readonly name: string;

  /**
   * 출입구 코드
   */
  readonly gateCode: string;

  /**
   * 설치 위치
   */
  readonly location?: string;
}

/**
 * 관리자 기기 목록 쿼리. 페이지는 1부터
 */
export interface ListScannerDevicesQuery {
  /**
   * 캠퍼스 필터. 생략하면 전체
   */
  readonly branch?: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

  /**
   * 기기 상태
   */
  readonly status: "ACTIVE" | "REVOKED" | "UNPAIRED";

  /**
   * 페이지 번호
   */
  readonly page: number;

  /**
   * 페이지 크기
   */
  readonly pageSize: number;
}

/**
 * 일회성 코드 원문을 제외한 발급 정보
 */
export interface PairingCodeMetadata {
  /**
   * 페어링 코드 ID
   */
  readonly pairingCodeId: string;

  /**
   * 캠퍼스
   */
  readonly branch: PairingInput["branchCode"];

  /**
   * 출입구 코드
   */
  readonly gateCode: string;

  /**
   * 등록 예정 기기 이름
   */
  readonly intendedDeviceName: string;

  /**
   * 만료 시각
   */
  readonly expiresAt: Date;

  /**
   * 유효 시간(초)
   */
  readonly ttlSeconds: number;
}

/**
 * 페어링 코드 발급 결과. 최초 발급에만 원문 pairingCode가 있고 멱등 재생에는 발급 정보만 있음
 */
export type PairingCreateResult =
  | { readonly pairing: PairingCodeMetadata; readonly replayed: false; readonly pairingCode: string }
  | { readonly pairing: PairingCodeMetadata; readonly replayed: true };

/**
 * 스캐너 기기 페어링·관리
 *
 * 페어링 코드는 Redis 임시 상태, 기기·감사는 DB, 스캐너 세션은 Redis 세션 저장소에 두고 각 커밋 경계를 따로 관리
 * DB 커밋 후 Redis 정리가 실패해도 같은 멱등 키 재요청으로 정리를 반복할 수 있게 함
 */
@Injectable()
export class ScannerDevicesService {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * 페어링 상태·접속 표시·세션 저장소
     */
    private readonly redis: RedisService,

    /**
     * 멱등 처리
     */
    private readonly idempotency: IdempotencyService,

    /**
     * 실행 환경. HMAC 키·세션 만료
     */
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  /**
   * 페어링 코드 발급
   *
   * 1. 같은 키의 이전 결과가 있으면 발급 정보만 재생
   * 2. 활성 캠퍼스 확인 후 Redis에 코드 키·상태 키를 Lua로 원자 생성. 충돌하면 최대 5회 재시도
   * 3. DB에 감사·멱등 결과 기록. 그 사이 다른 요청이 같은 키를 먼저 기록했으면 방금 만든 Redis 코드를 지우고 재생
   *
   * @returns 최초 성공에만 코드 원문 포함
   * @throws {DomainError} 404 비활성 캠퍼스, 503 코드 충돌로 발급 불가
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
   * 미사용 페어링 코드 취소
   *
   * Redis 상태를 먼저 취소하고 DB 감사·멱등 기록을 남김. 이미 기록된 같은 키는 재생 후 종료
   * 감사 중복을 막기 위해 코드 ID 기준 advisory lock 아래 한 번만 기록
   *
   * @throws {DomainError} 404 코드 없음, 409 이미 사용된 코드
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
   * 공개 브라우저의 페어링 코드 사용
   *
   * 1. 코드 정규화·형식 확인, 같은 키 재요청이면 기존 기기에 새 스캐너 세션 연결
   * 2. IP별 20회·코드별 10회(5분), 전체 600회(1분) 시도 제한
   * 3. Redis Lua로 코드를 원자적으로 사용 처리. 같은 요청의 재시도만 재생 허용
   * 4. DB에 기기·감사 기록 후 establishScannerSession이 세션과 CSRF 토큰 발급
   *
   * @throws {DomainError} 400 무효 코드, 409 이미 사용됨·기기 비활성, 429 시도 초과
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

  /**
   * 스캐너 세션 수립
   *
   * 활성 기기 확인 후 세션 재생성, SCANNER 주체·절대 만료·CSRF 저장, 기기별 세션 목록·접속 표시 기록
   * 그 사이 기기가 취소됐으면 방금 만든 런타임 상태와 세션을 지우고 실패
   *
   * @throws {DomainError} 409 SCANNER_PAIRING_INVALID
   */
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
    // 세션 생성 중 취소된 기기는 런타임 상태를 지우고 거부
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

  /**
   * 상태·캠퍼스별 기기 페이지 조회. Redis 접속 표시 TTL로 접속 여부·만료 시각 계산
   */
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

  /**
   * 세션의 활성 기기 정보와 잠긴 회차
   *
   * @throws {DomainError} 404 활성 기기 없음
   */
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

  /**
   * 취소 상태까지 포함한 기기 상세. 활성 기기만 회차 잠금 조회
   *
   * @throws {DomainError} 404 삭제된 기기
   */
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

  /**
   * 기기 감사 이벤트를 순번 오름차순으로 조회하고 다음 커서 계산
   *
   * @param requestedLimit 1~200, 기본 50
   * @throws {DomainError} 404 기기 없음
   */
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

  /**
   * 스캐너 상태 보고
   *
   * DB 기록은 60초 간격으로 제한하고 Redis 접속 표시는 매번 서버 시각 기준 60초로 갱신
   * 갱신 중 기기가 취소됐으면 런타임 상태를 지우고 실패
   *
   * @param actorDeviceId 세션 주체 기기. 대상 기기와 달라야 하면 거부
   * @param batteryLevelPercent 생략하면 기존 값 유지
   * @param isCharging 생략하면 기존 값 유지
   * @throws {DomainError} 403 다른 기기, 404 활성 기기 없음
   */
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

  /**
   * 스캐너 회차 선택
   *
   * 기기 행 잠금 아래 OPEN이고 캠퍼스가 맞는 회차를 고정하고 감사·멱등 결과를 함께 커밋
   * 이미 같은 회차면 그대로 성공, 다른 회차가 잠겨 있으면 거부. 커밋 후 세션의 선택 회차 갱신
   *
   * @throws {DomainError} 403 다른 기기, 404 기기 없음, 409 회차 불가·다른 회차 잠김
   */
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

  /**
   * 활성 기기의 회차 잠금 정보. 선택 회차가 없으면 locked=false
   *
   * @throws {DomainError} 404 활성 기기 없음
   */
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

  /**
   * 회차 잠금 해제
   *
   * 기기 행을 잠그고 잠긴 회차가 있을 때만 해제·SHIFT_RELEASED 감사를 멱등 커밋. 스캐너 요청이면 세션 선택 회차도 제거
   *
   * @throws {DomainError} 403 다른 기기, 404 활성 기기 없음
   */
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

  /**
   * 기기 취소
   *
   * DB에서 취소한 뒤 Redis 세션·접속 표시 무효화. 같은 키 재요청도 정리를 반복
   */
  public async revoke(deviceId: string, actorSubject: string, reason: string, key: string) {
    await this.idempotency.execute("SCANNER_DEVICE_REVOKE", key, { deviceId, reason }, async (transaction) => {
      const status = await this.deactivateDevice(transaction, deviceId, "REVOKED", actorSubject, reason);
      return { deviceId, status };
    });
    // Redis 정리는 DB 트랜잭션 밖. 커밋 후 실패해도 같은 멱등 키 재요청으로 다시 정리
    await this.invalidateDeviceRuntime(deviceId);
    return this.detail(deviceId);
  }

  /**
   * 관리자 기기 삭제
   *
   * DB 삭제 후 Redis 세션·접속 표시와 관련 페어링 상태 정리
   */
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

  /**
   * 스캐너 자가 해제
   *
   * 자기 기기를 DB에서 삭제하고 Redis 상태를 지운 뒤 현재 세션 파기
   */
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

  /**
   * 서버 비밀 기반 HMAC-SHA256 다이제스트(base64url). 코드·요청 출처 식별용
   *
   * @throws {DomainError} 503 HMAC 키 미설정
   */
  private digest(value: string): string {
    const secret = this.environment.scannerPairingHmacKey;
    if (secret === undefined) this.fail(503, "SESSION_NOT_CONFIGURED");
    return createHmac("sha256", Buffer.from(secret, "base64")).update(value).digest("base64url");
  }

  /**
   * 코드 원문의 Redis 조회 키
   */
  private pairingKey(code: string): string {
    return this.pairingKeyFromDigest(this.digest(code));
  }

  /**
   * 코드 다이제스트의 Redis 조회 키
   */
  private pairingKeyFromDigest(codeDigest: string): string {
    return `${this.redis.prefix}scanner:pairing:code:${codeDigest}`;
  }

  /**
   * 페어링 상태 Redis 키
   */
  private pairingStateKey(pairingCodeId: string): string {
    return `${this.redis.prefix}scanner:pairing:id:${pairingCodeId}`;
  }

  /**
   * 접속 표시 Redis 키
   */
  private presenceKey(deviceId: string): string {
    return `${this.redis.prefix}scanner:presence:${deviceId}`;
  }

  /**
   * 기기별 세션 ID 집합 Redis 키
   */
  private deviceSessionsKey(deviceId: string): string {
    return `${this.redis.prefix}scanner:sessions:${deviceId}`;
  }

  /**
   * 기기에 연결된 모든 세션과 접속 표시를 Redis Lua로 한 번에 삭제
   */
  private async invalidateDeviceRuntime(deviceId: string): Promise<void> {
    await this.redis.client.eval(
      "local ids=redis.call('SMEMBERS',KEYS[1]); for _,id in ipairs(ids) do redis.call('DEL',ARGV[1]..id) end; redis.call('DEL',KEYS[1],KEYS[2]); return #ids",
      {
        keys: [this.deviceSessionsKey(deviceId), this.presenceKey(deviceId)],
        arguments: [`${this.redis.prefix}session:`],
      },
    );
  }

  /**
   * 삭제된 기기 감사 메타데이터의 페어링 상태와 코드 조회 키를 Redis에서 삭제
   */
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

  /**
   * 기기 행 잠금 후 관련 페어링 코드 ID를 수집하고 행 삭제
   *
   * @returns 페어링 코드 ID 목록. 기기가 없으면 빈 목록
   */
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

  /**
   * 기기 비활성화
   *
   * 기기 행 잠금 아래 상태 변경·회차 잠금 해제와 감사 기록. 이미 취소·해제된 기기는 현재 상태 반환
   *
   * @throws {DomainError} 404 기기 없음, 409 알 수 없는 상태
   */
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

  /**
   * 서버 시각부터 60초 동안 접속 표시 기록
   *
   * @returns 접속 표시 만료 시각
   */
  private async markPresent(deviceId: string, serverTime = new Date()): Promise<Date> {
    const expiresAt = new Date(serverTime.getTime() + PRESENCE_TTL_SECONDS * 1_000);
    await this.redis.client.set(this.presenceKey(deviceId), "1", { PXAT: expiresAt.getTime() });
    return expiresAt;
  }

  /**
   * 내부 감사 이벤트 이름을 화면 표시 종류로 변환. 대응값이 없으면 그대로
   */
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

  /**
   * 고정 창 페어링 시도 제한
   *
   * @throws {DomainError} 429 SCANNER_PAIRING_RATE_LIMITED
   */
  private async rateLimit(key: string, maximum: number, ttlSeconds: number): Promise<void> {
    const attempts = await this.redis.client.incr(key);
    if (attempts === 1) await this.redis.client.expire(key, ttlSeconds);
    if (attempts > maximum) this.fail(429, "SCANNER_PAIRING_RATE_LIMITED");
  }

  /**
   * Redis 페어링 상태 JSON 검증
   *
   * @throws {DomainError} 400 필드 누락·손상
   */
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

  /**
   * 세션 ID 재발급. 실패는 호출자에게 전파
   */
  private regenerate(request: Request): Promise<void> {
    return new Promise((resolve, reject) => request.session.regenerate((error) => error == null ? resolve() : reject(error)));
  }

  /**
   * 세션 저장. 실패는 호출자에게 전파
   */
  private save(request: Request): Promise<void> {
    return new Promise((resolve, reject) => request.session.save((error) => error == null ? resolve() : reject(error)));
  }

  /**
   * 세션 파기. 실패는 호출자에게 전파
   */
  private destroy(request: Request): Promise<void> {
    return new Promise((resolve, reject) => request.session.destroy((error) => error == null ? resolve() : reject(error)));
  }

  /**
   * 기기 작업 오류 발생
   *
   * @throws {DomainError} 지정 상태·코드
   */
  private fail(status: number, code: string): never {
    throw new DomainError(status, code, "The scanner device operation could not be completed.");
  }
}
