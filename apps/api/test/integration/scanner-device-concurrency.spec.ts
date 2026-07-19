import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import type { Request } from "express";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { DomainError } from "../../src/common/errors/domain-error.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { RedisService } from "../../src/common/redis/redis.service.js";
import { ScannerDevicesService } from "../../src/modules/scanner-devices/scanner-devices.service.js";
import { IdempotencyService } from "../../src/common/idempotency/idempotency.service.js";
import { PhoneProtector } from "../../src/common/crypto/phone-protector.service.js";
import { SmsMessagePolicy } from "../../src/modules/sms/sms-message-policy.service.js";
import { SmsOutboxService } from "../../src/modules/sms/sms-outbox.service.js";
import { SmsWorkerService } from "../../src/modules/sms/sms-worker.service.js";
import type { AligoGateway } from "../../src/modules/sms/aligo.gateway.js";
import { createHash, randomUUID } from "node:crypto";
import { verify } from "argon2";
import { bootstrapAdmin } from "../../src/commands/bootstrap-admin.js";
import { BookingCryptoService } from "../../src/modules/family-bookings/booking-crypto.service.js";
import { SheetOutboxService } from "../../src/modules/google-sheets/sheet-outbox.service.js";
import { CheckInsService } from "../../src/modules/check-ins/check-ins.service.js";

const apiDirectory = resolve(import.meta.dirname, "../..");

function bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
  copy.set(value);
  return copy;
}

function request(sessionId: string): Request {
  const session = {
    regenerate: (callback: (error?: Error) => void) => callback(),
    save: (callback: (error?: Error) => void) => callback(),
    destroy: (callback: (error?: Error) => void) => callback(),
  };
  return { ip: "127.0.0.1", sessionID: sessionId, session } as unknown as Request;
}

describe("scanner pairing and unpair concurrency", () => {
  let postgres: StartedTestContainer;
  let redisContainer: StartedTestContainer;
  let prisma: PrismaService;
  let redis: RedisService;
  let service: ScannerDevicesService;
  let environment: AppEnvironment;
  let phoneProtector: PhoneProtector;
  let smsOutbox: SmsOutboxService;

  beforeAll(async () => {
    [postgres, redisContainer] = await Promise.all([
      new GenericContainer("postgres:18-alpine")
        .withEnvironment({ POSTGRES_PASSWORD: "integration_only", POSTGRES_DB: "npr_integration" })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
        .start(),
      new GenericContainer("redis:8-alpine")
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
        .start(),
    ]);
    const databaseUrl = `postgresql://postgres:integration_only@${postgres.getHost()}:${postgres.getMappedPort(5432)}/npr_integration`;
    const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
    execFileSync(resolve(apiDirectory, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
      cwd: apiDirectory,
      env: { ...process.env, MIGRATION_DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });
    environment = {
      appEnv: "test",
      processRole: "api",
      port: 4000,
      databaseUrl,
      redisUrl,
      sessionSecret: "CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg=",
      scannerPairingHmacKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
      phoneEncryptionKey: "BgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgY=",
      phoneHmacKey: "BQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU=",
      otpPepper: "BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ=",
      trustProxy: 0,
      tongSyncEnabled: false,
      smsEnabled: false,
      smsRecipientAllowlistEnabled: true,
      smsTestRecipients: new Set(),
      smsSenders: { SONGPA: undefined, WIRYE: undefined, GWANGJIN: undefined },
      smsAligoTestMode: true,
      googleSheetsEnabled: false,
      sessionIdleTtlSeconds: 28_800,
      sessionAbsoluteTtlSeconds: 86_400,
    };
    prisma = new PrismaService(environment);
    redis = new RedisService(environment);
    await redis.onApplicationBootstrap();
    service = new ScannerDevicesService(prisma, redis, new IdempotencyService(prisma), environment);
    phoneProtector = new PhoneProtector(environment);
    smsOutbox = new SmsOutboxService(phoneProtector, new SmsMessagePolicy());
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await redis?.onModuleDestroy();
    await Promise.all([postgres?.stop(), redisContainer?.stop()]);
  });

  it("allows exactly one outcome when claim races pairing-code cancellation", async () => {
    const issued = await service.createPairing({ branchCode: "SONGPA", name: "Gate", gateCode: "G1" }, "admin-test", "create-pairing-race-key");
    if (!("pairingCode" in issued)) throw new Error("expected fresh pairing code");
    const outcomes = await Promise.allSettled([
      service.claim(request("claim-session"), issued.pairingCode, "test-platform", "test-device", "claim-pairing-race-key"),
      service.cancelPairing(issued.pairing.pairingCodeId, "admin-test", "cancel-pairing-race-key"),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(DomainError);
  });

  it("replays pairing creation without the raw code and claim without a second device", async () => {
    const input = { branchCode: "WIRYE" as const, name: "Replay Gate", gateCode: "R1" };
    const fresh = await service.createPairing(input, "admin-replay", "pairing-create-replay-key");
    if (!("pairingCode" in fresh)) throw new Error("expected fresh pairing code");
    expect(fresh).toHaveProperty("pairingCode");
    const creationReplay = await service.createPairing(input, "admin-replay", "pairing-create-replay-key");
    expect(creationReplay).toMatchObject({ replayed: true, pairing: { pairingCodeId: fresh.pairing.pairingCodeId } });
    expect(creationReplay).not.toHaveProperty("pairingCode");
    const claimed = await service.claim(request("claim-replay-a"), fresh.pairingCode, "test-platform", "replay-device", "pairing-claim-replay-key");
    const claimReplay = await service.claim(request("claim-replay-b"), fresh.pairingCode, "test-platform", "replay-device", "pairing-claim-replay-key");
    expect(claimReplay.device.deviceId).toBe(claimed.device.deviceId);
    expect(await prisma.scannerDevice.count({ where: { publicId: claimed.device.deviceId } })).toBe(1);
    expect(await prisma.scannerPairingAudit.count({ where: { scannerDevice: { publicId: claimed.device.deviceId }, eventType: "PAIRING_CLAIM" } })).toBe(1);
  });

  it("filters scanner devices and paginates all six matching rows without capping the total at five", async () => {
    const [gwangjin, songpa] = await Promise.all([
      prisma.branch.findUniqueOrThrow({ where: { code: "GWANGJIN" } }),
      prisma.branch.findUniqueOrThrow({ where: { code: "SONGPA" } }),
    ]);
    const inactive = { status: "UNPAIRED", revokedAt: new Date(), revokedBy: "list-test" };
    await prisma.scannerDevice.createMany({
      data: Array.from({ length: 6 }, (_value, index) => ({
        branchId: gwangjin.id,
        name: `List Device ${index + 1}`,
        gateCode: `LIST-${index + 1}`,
        pairedBy: "list-test",
        ...inactive,
      })),
    });
    await prisma.scannerDevice.create({
      data: { branchId: songpa.id, name: "Other Branch", gateCode: "LIST-OTHER", pairedBy: "list-test", ...inactive },
    });

    const first = await service.list({ branch: "GWANGJIN", status: "UNPAIRED", page: 1, pageSize: 5 });
    expect(first.items).toHaveLength(5);
    expect(first.items.every((item) => item.branch === "GWANGJIN" && item.status === "UNPAIRED")).toBe(true);
    expect(first.page).toEqual({ page: 1, pageSize: 5, totalItems: 6, totalPages: 2 });

    const second = await service.list({ branch: "GWANGJIN", status: "UNPAIRED", page: 2, pageSize: 5 });
    expect(second.items).toHaveLength(1);
    expect(second.page).toEqual({ page: 2, pageSize: 5, totalItems: 6, totalPages: 2 });

    const otherBranch = await service.list({ branch: "SONGPA", status: "UNPAIRED", page: 1, pageSize: 5 });
    expect(otherBranch.items).toHaveLength(1);
    expect(otherBranch.page.totalItems).toBe(1);
  });

  it("uses an exact 60-second presence window in Redis and in the heartbeat response", async () => {
    const branch = await prisma.branch.findUniqueOrThrow({ where: { code: "GWANGJIN" } });
    const device = await prisma.scannerDevice.create({
      data: { branchId: branch.id, name: "Presence TTL", gateCode: "TTL-60", pairedBy: "ttl-test" },
    });
    const heartbeat = await service.heartbeat(device.publicId, device.publicId, 75, true);
    expect(heartbeat.presenceExpiresAt.getTime() - heartbeat.serverTime.getTime()).toBe(60_000);
    expect(await redis.client.ttl(`${redis.prefix}scanner:presence:${device.publicId}`)).toBe(60);
    await service.deleteDevice(device.publicId, "ttl-test", "ttl-device-delete-key");
  });

  it("hard-deletes a device idempotently while cascading audits, retaining check-ins, and clearing runtime state", async () => {
    const branch = await prisma.branch.findUniqueOrThrow({ where: { code: "SONGPA" } });
    const session = await prisma.seminarSession.findUniqueOrThrow({ where: { publicId: "00000000-0000-4000-8000-000000000102" } });
    const device = await prisma.scannerDevice.create({
      data: { branchId: branch.id, name: "Admin Delete", gateCode: "DELETE-ADMIN", pairedBy: "admin-test" },
    });
    const pairingCodeId = randomUUID();
    const pairingCodeDigest = "dependent-pairing-code-digest";
    const audit = await prisma.scannerPairingAudit.create({
      data: {
        scannerDeviceId: device.id,
        eventType: "PAIRING_CLAIM",
        resultCode: "SUCCEEDED",
        safeMetadata: { pairingCodeId },
      },
    });
    const checkIn = await prisma.checkInEvent.create({
      data: {
        sessionId: session.id,
        source: "MANUAL",
        result: "CHECKED_IN",
        seatCount: 1,
        scannerDeviceId: device.id,
        gateCode: device.gateCode,
        actorSubject: device.publicId,
      },
    });
    await expect(prisma.scannerPairingAudit.delete({ where: { id: audit.id } })).rejects.toThrow(/append-only relation/);
    await redis.client.set(`${redis.prefix}scanner:pairing:id:${pairingCodeId}`, JSON.stringify({
      pairingCodeId,
      codeDigest: pairingCodeDigest,
    }), { EX: 3_600 });
    await redis.client.set(`${redis.prefix}scanner:pairing:code:${pairingCodeDigest}`, pairingCodeId, { EX: 300 });
    await redis.client.set(`${redis.prefix}scanner:presence:${device.publicId}`, "1", { EX: 60 });
    await redis.client.sAdd(`${redis.prefix}scanner:sessions:${device.publicId}`, ["admin-session-a", "admin-session-b"]);
    await Promise.all([
      redis.client.set(`${redis.prefix}session:admin-session-a`, "session-a"),
      redis.client.set(`${redis.prefix}session:admin-session-b`, "session-b"),
    ]);

    await Promise.all([
      service.deleteDevice(device.publicId, "admin-test", "admin-device-delete-same-key"),
      service.deleteDevice(device.publicId, "admin-test", "admin-device-delete-same-key"),
      service.deleteDevice(device.publicId, "admin-test", "admin-device-delete-other-key"),
    ]);
    await expect(service.deleteDevice(randomUUID(), "admin-test", "admin-device-delete-missing-key")).resolves.toBeUndefined();

    expect(await prisma.scannerDevice.findUnique({ where: { id: device.id } })).toBeNull();
    expect(await prisma.scannerPairingAudit.findUnique({ where: { id: audit.id } })).toBeNull();
    const retained = await prisma.checkInEvent.findUniqueOrThrow({ where: { id: checkIn.id } });
    expect(retained.scannerDeviceId).toBeNull();
    await expect(prisma.checkInEvent.update({
      where: { id: checkIn.id },
      data: { safeMetadata: { directMutation: true } },
    })).rejects.toThrow(/append-only relation/);
    expect(await redis.client.exists(`${redis.prefix}scanner:presence:${device.publicId}`)).toBe(0);
    expect(await redis.client.exists(`${redis.prefix}scanner:sessions:${device.publicId}`)).toBe(0);
    expect(await redis.client.exists(`${redis.prefix}scanner:pairing:id:${pairingCodeId}`)).toBe(0);
    expect(await redis.client.exists(`${redis.prefix}scanner:pairing:code:${pairingCodeDigest}`)).toBe(0);
    expect(await redis.client.exists(`${redis.prefix}session:admin-session-a`)).toBe(0);
    expect(await redis.client.exists(`${redis.prefix}session:admin-session-b`)).toBe(0);
  });

  it("hard-deletes on concurrent self-unpair and destroys every replaying request session", async () => {
    const branch = await prisma.branch.findUniqueOrThrow({ where: { code: "SONGPA" } });
    const device = await prisma.scannerDevice.create({
      data: { branchId: branch.id, name: "Concurrent", gateCode: "G2", pairedBy: "admin-test" },
    });
    const audit = await prisma.scannerPairingAudit.create({
      data: { scannerDeviceId: device.id, eventType: "PAIRING_CLAIM", resultCode: "SUCCEEDED" },
    });
    const firstRequest = request("unpair-a");
    const secondRequest = request("unpair-b");
    const replayRequest = request("unpair-c");
    const firstDestroy = vi.spyOn(firstRequest.session, "destroy");
    const secondDestroy = vi.spyOn(secondRequest.session, "destroy");
    const replayDestroy = vi.spyOn(replayRequest.session, "destroy");
    await redis.client.set(`${redis.prefix}scanner:presence:${device.publicId}`, "1", { EX: 60 });
    await redis.client.sAdd(`${redis.prefix}scanner:sessions:${device.publicId}`, ["unpair-a", "unpair-b"]);
    await Promise.all([
      redis.client.set(`${redis.prefix}session:unpair-a`, "session-a"),
      redis.client.set(`${redis.prefix}session:unpair-b`, "session-b"),
    ]);
    await Promise.all([
      service.selfUnpair(firstRequest, device.publicId, "unpair-key-a"),
      service.selfUnpair(secondRequest, device.publicId, "unpair-key-b"),
    ]);
    await service.selfUnpair(replayRequest, device.publicId, "unpair-key-a");

    expect(await prisma.scannerDevice.findUnique({ where: { id: device.id } })).toBeNull();
    expect(await prisma.scannerPairingAudit.findUnique({ where: { id: audit.id } })).toBeNull();
    expect(await redis.client.exists(`${redis.prefix}scanner:presence:${device.publicId}`)).toBe(0);
    expect(await redis.client.exists(`${redis.prefix}scanner:sessions:${device.publicId}`)).toBe(0);
    expect(await redis.client.exists(`${redis.prefix}session:unpair-a`)).toBe(0);
    expect(await redis.client.exists(`${redis.prefix}session:unpair-b`)).toBe(0);
    expect(firstDestroy).toHaveBeenCalledOnce();
    expect(secondDestroy).toHaveBeenCalledOnce();
    expect(replayDestroy).toHaveBeenCalledOnce();
  });

  it("removes a scanner session that is registered after delete cleanup has already run", async () => {
    const issued = await service.createPairing(
      { branchCode: "WIRYE", name: "Late Session", gateCode: "RACE-SESSION" },
      "admin-race",
      "race-session-create-key",
    );
    if (!("pairingCode" in issued)) throw new Error("expected fresh pairing code");
    const claimed = await service.claim(
      request("race-initial"),
      issued.pairingCode,
      "test-platform",
      "late-session-device",
      "race-session-claim-key",
    );
    const deviceId = claimed.device.deviceId;
    const sessionsKey = `${redis.prefix}scanner:sessions:${deviceId}`;
    const lateSessionKey = `${redis.prefix}session:race-late`;
    await redis.client.set(lateSessionKey, "late-session");

    let releaseRegistration!: () => void;
    let registrationReached!: () => void;
    const registrationGate = new Promise<void>((resolve) => { releaseRegistration = resolve; });
    const reachedGate = new Promise<void>((resolve) => { registrationReached = resolve; });
    const originalSAdd = redis.client.sAdd.bind(redis.client);
    const sAddSpy = vi.spyOn(redis.client, "sAdd").mockImplementation(async (key, members) => {
      if (String(key) === sessionsKey && members === "race-late") {
        registrationReached();
        await registrationGate;
      }
      return originalSAdd(key, members);
    });

    try {
      const replay = service.claim(
        request("race-late"),
        issued.pairingCode,
        "test-platform",
        "late-session-device",
        "race-session-claim-key",
      );
      await reachedGate;
      await service.deleteDevice(deviceId, "admin-race", "race-session-delete-key");
      releaseRegistration();
      await expect(replay).rejects.toBeInstanceOf(DomainError);
    } finally {
      releaseRegistration();
      sAddSpy.mockRestore();
    }

    expect(await prisma.scannerDevice.count({ where: { publicId: deviceId } })).toBe(0);
    expect(await redis.client.exists(sessionsKey)).toBe(0);
    expect(await redis.client.exists(lateSessionKey)).toBe(0);
    expect(await redis.client.exists(`${redis.prefix}scanner:presence:${deviceId}`)).toBe(0);
  });

  it("bootstraps an administrator idempotently and rotates only when explicit", async () => {
    const initialPassword = "Initial-Admin-Secret-2026!";
    const rotatedPassword = "Rotated-Admin-Secret-2026!";
    const created = await bootstrapAdmin(prisma, {
      username: "integration-admin", displayName: "Integration Admin", password: initialPassword, rotate: false,
    });
    expect(created.action).toBe("CREATED");
    const unchanged = await bootstrapAdmin(prisma, {
      username: "integration-admin", displayName: "Changed Name", password: rotatedPassword, rotate: false,
    });
    expect(unchanged).toEqual({ action: "UNCHANGED", adminUserId: created.adminUserId });
    const before = await prisma.adminUser.findUniqueOrThrow({ where: { publicId: created.adminUserId } });
    expect(await verify(before.passwordHash, initialPassword)).toBe(true);
    expect(before.displayName).toBe("Integration Admin");
    const rotated = await bootstrapAdmin(prisma, {
      username: "integration-admin", displayName: "Rotated Admin", password: rotatedPassword, rotate: true,
    });
    expect(rotated.action).toBe("ROTATED");
    const after = await prisma.adminUser.findUniqueOrThrow({ where: { publicId: created.adminUserId } });
    expect(await verify(after.passwordHash, rotatedPassword)).toBe(true);
    expect(after.displayName).toBe("Rotated Admin");
    expect(await prisma.authAudit.count({ where: { adminUserId: after.id, eventType: "ADMIN_BOOTSTRAP" } })).toBe(2);
  });

  it("projects first QR and manual check-ins to Sheets and returns scanner display fields", async () => {
    const branch = await prisma.branch.findUniqueOrThrow({ where: { code: "SONGPA" } });
    const session = await prisma.seminarSession.findUniqueOrThrow({ where: { publicId: "00000000-0000-4000-8000-000000000102" } });
    const run = await prisma.syncRun.create({ data: { runType: "MANUAL", status: "SUCCEEDED" } });
    const crypto = new BookingCryptoService();
    const checkIns = new CheckInsService(prisma, crypto, new SheetOutboxService(phoneProtector));
    const device = await prisma.scannerDevice.create({ data: {
      branchId: branch.id, name: "Check-in", gateCode: "G-CHECK", pairedBy: "integration",
      selectedSessionId: session.id, scanModeLockedAt: new Date(),
    } });
    const actor = { subject: device.publicId, role: "SCANNER" as const, scannerDeviceId: device.publicId, selectedSessionId: session.publicId };

    const seedBooking = async (suffix: string) => {
      const contact = phoneProtector.protect(`0101111${suffix}`);
      const student = await prisma.student.create({ data: {
        sourceStudentNo: `CHECK-${suffix}`, branchId: branch.id, name: `학생${suffix}`, className: "중3A",
        sourceHash: bytes(createHash("sha256").update(suffix).digest()), firstSeenRunId: run.id, lastSeenRunId: run.id,
        motherPhoneCiphertext: bytes(contact.ciphertext), motherPhoneDigest: bytes(contact.digest), motherPhoneLast4: contact.last4,
      } });
      const proof = await prisma.otpProofAudit.create({ data: {
        purpose: "FAMILY_BOOKING", contactDigest: bytes(contact.digest), contactCiphertext: bytes(contact.ciphertext),
        contactLast4: contact.last4, status: "CONSUMED", expiresAt: new Date(Date.now() + 600_000),
        verifiedAt: new Date(), consumedAt: new Date(),
      } });
      const booking = await prisma.familyBooking.create({ data: {
        sessionId: session.id, contactDigest: bytes(contact.digest), contactCiphertext: bytes(contact.ciphertext),
        contactLast4: contact.last4, attendanceParty: "MOTHER", seatCount: 1, otpProofAuditId: proof.id,
      } });
      await prisma.familyBookingStudent.create({ data: {
        familyBookingId: booking.id, sessionId: session.id, studentId: student.id, branchCodeAtBooking: "SONGPA",
        sourceStudentNoSnapshot: student.sourceStudentNo, studentNameSnapshot: student.name, classNameSnapshot: student.className,
      } });
      const issued = crypto.issueQr();
      await prisma.qrCredential.create({ data: {
        familyBookingId: booking.id, tokenDigest: bytes(issued.digest), version: 1, status: "ACTIVE",
        expiresAt: new Date(Date.now() + 3_600_000),
      } });
      await prisma.sessionCapacity.update({ where: { sessionId: session.id }, data: { reservedCount: { increment: 1 } } });
      return { booking, rawToken: issued.rawToken };
    };

    const manual = await seedBooking("1001");
    const qr = await seedBooking("1002");
    await expect(checkIns.byManual(actor, manual.booking.publicId, "manual-check-in-key-1001")).resolves.toMatchObject({
      result: "CHECKED_IN", attendanceParty: "MOTHER", representativeStudentName: "학생1001",
    });
    expect(await prisma.sheetOutbox.count({ where: { familyBookingPublicId: manual.booking.publicId, eventType: "CHECKED_IN" } })).toBe(1);
    const qrResults = await Promise.all(Array.from({ length: 20 }, (_value, index) =>
      checkIns.byQr(actor, qr.rawToken, `qr-check-in-key-1002-${index}`)));
    expect(qrResults.filter((result) => result.result === "CHECKED_IN")).toHaveLength(1);
    expect(qrResults.filter((result) => result.result === "ALREADY_CHECKED_IN")).toHaveLength(19);
    expect(qrResults.every((result) =>
      result.attendanceParty === "MOTHER" && result.representativeStudentName === "학생1002")).toBe(true);
    expect(await prisma.sheetOutbox.count({ where: { familyBookingPublicId: qr.booking.publicId, eventType: "CHECKED_IN" } })).toBe(1);
    expect(await prisma.bookingEvent.count({ where: { familyBookingId: qr.booking.id, eventType: "CHECKED_IN" } })).toBe(1);
    const capacity = await prisma.sessionCapacity.findUniqueOrThrow({ where: { sessionId: session.id } });
    expect(capacity.checkedInCount).toBeGreaterThanOrEqual(2);
  });

  it("deduplicates the same SMS domain event under concurrent transactions", async () => {
    const contact = phoneProtector.protect("01000000011");
    const input = {
      eventKey: "integration:sms:dedupe",
      source: "ADMIN_GROUP" as const,
      branch: "SONGPA" as const,
      recipientCiphertext: contact.ciphertext,
      recipientDigest: contact.digest,
      recipientLast4: contact.last4,
      message: "중복 방지 테스트",
    };
    await Promise.all([
      prisma.$transaction((transaction) => smsOutbox.enqueue(transaction, input)),
      prisma.$transaction((transaction) => smsOutbox.enqueue(transaction, input)),
    ]);
    const digest = createHash("sha256").update(input.eventKey).digest();
    expect(await prisma.smsOutbox.count({ where: { eventKeyDigest: bytes(digest) } })).toBe(1);
    await prisma.smsOutbox.updateMany({ where: { eventKeyDigest: bytes(digest) }, data: { status: "BLOCKED_DISABLED" } });
  });

  it("claims each row once across concurrent workers and never retries unknown acceptance", async () => {
    const sent = vi.fn().mockResolvedValue({ kind: "SENT", providerMessageId: "test-message", providerResultCode: 1, providerMessageType: "SMS" });
    const gateway = { send: sent } as unknown as AligoGateway;
    const workerA = new SmsWorkerService(prisma, phoneProtector, gateway);
    const workerB = new SmsWorkerService(prisma, phoneProtector, gateway);
    for (const suffix of ["21", "22"]) {
      const contact = phoneProtector.protect(`010000000${suffix}`);
      await prisma.$transaction((transaction) => smsOutbox.enqueue(transaction, {
        eventKey: `integration:sms:worker:${suffix}`, source: "ADMIN_GROUP", branch: "WIRYE",
        recipientCiphertext: contact.ciphertext, recipientDigest: contact.digest, recipientLast4: contact.last4,
        message: "동시 워커 테스트",
      }));
    }
    const expectedSends = await prisma.smsOutbox.count({ where: { status: "PENDING" } });
    await Promise.all([workerA.runOnce(), workerB.runOnce()]);
    expect(sent).toHaveBeenCalledTimes(expectedSends);
    expect(await prisma.smsOutbox.count({ where: { status: "SENT", actorSubject: null } })).toBeGreaterThanOrEqual(2);

    const unknownSend = vi.fn().mockResolvedValue({ kind: "DELIVERY_UNKNOWN", errorCode: "TEST_UNKNOWN" });
    const unknownWorker = new SmsWorkerService(prisma, phoneProtector, { send: unknownSend } as unknown as AligoGateway);
    const contact = phoneProtector.protect("01000000031");
    const eventKey = "integration:sms:unknown";
    await prisma.$transaction((transaction) => smsOutbox.enqueue(transaction, {
      eventKey, source: "ADMIN_GROUP", branch: "GWANGJIN",
      recipientCiphertext: contact.ciphertext, recipientDigest: contact.digest, recipientLast4: contact.last4,
      message: "불확실 응답 테스트",
    }));
    await unknownWorker.runOnce();
    await unknownWorker.runOnce();
    expect(unknownSend).toHaveBeenCalledTimes(1);
    const digest = createHash("sha256").update(eventKey).digest();
    expect(await prisma.smsOutbox.findUniqueOrThrow({ where: { eventKeyDigest: bytes(digest) } })).toMatchObject({ status: "DELIVERY_UNKNOWN", attemptCount: 1 });
  });
});
