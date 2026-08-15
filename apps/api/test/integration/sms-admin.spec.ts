import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { PhoneProtector } from "../../src/common/crypto/phone-protector.service.js";
import { IdempotencyService } from "../../src/common/idempotency/idempotency.service.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { SmsAdminService } from "../../src/modules/sms/sms-admin.service.js";
import { SmsMessagePolicy } from "../../src/modules/sms/sms-message-policy.service.js";
import { SmsOutboxService } from "../../src/modules/sms/sms-outbox.service.js";
import { SmsTemplateRenderer } from "../../src/modules/sms/sms-template-renderer.service.js";

const apiDirectory = resolve(import.meta.dirname, "../..");
const sessionPublicId = "00000000-0000-4000-8000-000000000102";

function bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
  copy.set(value);
  return copy;
}

describe("SMS administration", () => {
  let postgres: StartedTestContainer;
  let prisma: PrismaService;
  let protector: PhoneProtector;
  let service: SmsAdminService;
  const bookings = new Map<string, string>();

  beforeAll(async () => {
    postgres = await new GenericContainer("postgres:18-alpine")
      .withEnvironment({ POSTGRES_PASSWORD: "integration_only", POSTGRES_DB: "npr_sms" })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
      .start();
    const databaseUrl = `postgresql://postgres:integration_only@${postgres.getHost()}:${postgres.getMappedPort(5432)}/npr_sms`;
    execFileSync(resolve(apiDirectory, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
      cwd: apiDirectory,
      env: { ...process.env, MIGRATION_DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });
    const environment: AppEnvironment = {
      appEnv: "test",
      processRole: "api",
      port: 4000,
      databaseUrl,
      phoneEncryptionKey: "BgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgY=",
      phoneHmacKey: "BQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU=",
      publicBaseUrl: "https://public.test/internal/path?ignored=true",
      trustProxy: 0,
      tongSyncEnabled: false,
      smsEnabled: false,
      smsRecipientAllowlistEnabled: true,
      smsTestRecipients: new Set(),
      smsSenders: { CAMPUS_A: undefined, CAMPUS_B: undefined, CAMPUS_C: undefined },
      smsAligoTestMode: true,
      googleSheetsEnabled: false,
      sessionIdleTtlSeconds: 28_800,
      sessionAbsoluteTtlSeconds: 86_400,
    };
    prisma = new PrismaService(environment);
    protector = new PhoneProtector(environment);
    const policy = new SmsMessagePolicy();
    service = new SmsAdminService(
      prisma,
      new IdempotencyService(prisma),
      new SmsOutboxService(protector, policy),
      policy,
      new SmsTemplateRenderer(),
      environment,
    );
    await createBooking("RESERVED", "01020001001", "예약 학생");
    await createBooking("CHECKED_IN", "01020001002", "입장 학생");
    await createBooking("CANCELLED", "01020001003", "취소 학생");
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await postgres?.stop();
  });

  async function createBooking(status: "RESERVED" | "CHECKED_IN" | "CANCELLED", phone: string, studentName: string) {
    const session = await prisma.seminarSession.findUniqueOrThrow({ where: { publicId: sessionPublicId } });
    const contact = protector.protect(phone);
    const proof = await prisma.otpProofAudit.create({ data: {
      proofDigest: bytes(randomBytes(32)),
      purpose: "FAMILY_BOOKING",
      contactDigest: bytes(contact.digest),
      contactCiphertext: bytes(contact.ciphertext),
      contactLast4: contact.last4,
      status: "VERIFIED",
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: new Date(),
    } });
    const releasedAt = status === "CANCELLED" ? new Date() : null;
    const booking = await prisma.familyBooking.create({ data: {
      sessionId: session.id,
      contactDigest: bytes(contact.digest),
      contactCiphertext: bytes(contact.ciphertext),
      contactLast4: contact.last4,
      attendanceParty: "MOTHER",
      seatCount: 1,
      status,
      otpProofAuditId: proof.id,
      ...(status === "CHECKED_IN" ? { checkedInAt: new Date() } : {}),
      ...(status === "CANCELLED" ? { cancelledAt: releasedAt } : {}),
      students: { create: {
        participantType: "GUEST",
        active: status !== "CANCELLED",
        releasedAt,
        branchCodeAtBooking: "CAMPUS_A",
        sourceStudentNoSnapshot: `GUEST-${randomUUID()}`,
        studentNameSnapshot: studentName,
        classNameSnapshot: "비재원생",
      } },
    } });
    bookings.set(status, booking.publicId);
  }

  it("seeds four defaults and renders all four audiences with safe per-recipient links", async () => {
    const templates = await service.listTemplates();
    expect(templates.items).toHaveLength(4);
    expect(new Set(templates.items.map((template) => template.key))).toEqual(new Set([
      "BOOKING_CONFIRMED_DEFAULT",
      "DAY_BEFORE_REMINDER",
      "SURVEY_REQUEST_DEFAULT",
      "BOOKING_CANCELLED_DEFAULT",
    ]));

    const counts = await Promise.all([
      "BOOKED_FAMILIES",
      "RESERVED_FAMILIES",
      "CHECKED_IN_FAMILIES",
      "CANCELLED_FAMILIES",
    ].map(async (audience) => (await service.preview({
      branch: "CAMPUS_A",
      seminarSessionId: sessionPublicId,
      audience: audience as "BOOKED_FAMILIES" | "RESERVED_FAMILIES" | "CHECKED_IN_FAMILIES" | "CANCELLED_FAMILIES",
      message: "{학생명}|{설명회명}|{일시}|{장소}|{QR링크}|{문의전화}|{설문링크}",
    })).recipientCount));
    expect(counts).toEqual([2, 1, 1, 1]);

    const cancelled = await service.preview({
      branch: "CAMPUS_A",
      seminarSessionId: sessionPublicId,
      audience: "CANCELLED_FAMILIES",
      message: "{학생명}|{QR링크}|{설문링크}|{문의전화}",
    });
    expect(cancelled.samples).toHaveLength(1);
    expect(cancelled.samples[0]).toMatchObject({
      familyBookingId: bookings.get("CANCELLED"),
      maskedRecipient: "***-****-1003",
      messageType: "LMS",
    });
    expect(cancelled.samples[0]!.message).toContain("취소 학생");
    expect(cancelled.samples[0]!.message.match(/https:\/\/public\.test\/booking\//gu)).toHaveLength(2);
    expect(cancelled.samples[0]!.message).toContain("02-000-0001");
    expect(cancelled.samples[0]!.message).not.toContain("token");
    expect(cancelled.maximumMessageBytes).toBe(cancelled.samples[0]!.messageBytes);
    await expect(service.preview({
      branch: "CAMPUS_A",
      seminarSessionId: sessionPublicId,
      audience: "BOOKED_FAMILIES",
      message: "{알수없는변수}",
    })).rejects.toMatchObject({ code: "SMS_TEMPLATE_VARIABLE_UNKNOWN" });
  });

  it("refreshes only untouched legacy seed copy and preserves operator edits", async () => {
    const migration = readFileSync(resolve(
      apiDirectory,
      "prisma/migrations/20260719012000_refresh_legacy_sms_brand_copy/migration.sql",
    ), "utf8");
    const legacySurvey = "[npr] {학생명} 학부모님, 오늘 설명회는 어떠셨나요? 별점·후기·사진 남기기: {설문링크}";
    const refreshedSurvey = "[예시학원] {학생명} 학부모님, 오늘 설명회는 어떠셨나요? 별점·후기 남기기: {설문링크}";
    await prisma.smsTemplate.update({
      where: { key: "SURVEY_REQUEST_DEFAULT" },
      data: { body: legacySurvey },
    });
    await prisma.$executeRawUnsafe(migration);
    expect(await prisma.smsTemplate.findUniqueOrThrow({ where: { key: "SURVEY_REQUEST_DEFAULT" } }))
      .toMatchObject({ body: refreshedSurvey, updatedBy: "system:brand-copy-migration" });

    const operatorCopy = "운영자가 직접 수정한 리마인드 문구";
    await prisma.smsTemplate.update({
      where: { key: "DAY_BEFORE_REMINDER" },
      data: { body: operatorCopy, updatedBy: "integration:operator" },
    });
    await prisma.$executeRawUnsafe(migration);
    expect(await prisma.smsTemplate.findUniqueOrThrow({ where: { key: "DAY_BEFORE_REMINDER" } }))
      .toMatchObject({ body: operatorCopy, updatedBy: "integration:operator" });

    await prisma.smsTemplate.update({
      where: { key: "DAY_BEFORE_REMINDER" },
      data: {
        body: "[예시학원] 내일 {일시} {설명회명}이 진행됩니다. 예약 및 입장 QR을 확인해 주세요. {예약확인링크}",
        updatedBy: "system:brand-copy-migration",
      },
    });
    const knownSeeds = await prisma.smsTemplate.findMany({
      where: { key: { in: [
        "BOOKING_CONFIRMED_DEFAULT", "DAY_BEFORE_REMINDER",
        "SURVEY_REQUEST_DEFAULT", "BOOKING_CANCELLED_DEFAULT",
      ] } },
    });
    expect(knownSeeds.every((template) => !template.body.includes("[npr]"))).toBe(true);
    expect(knownSeeds.every((template) => !template.body.includes("사진"))).toBe(true);
  });

  it("binds enqueue to the exact preview, renders each row, and exposes aggregate batch history", async () => {
    const request = {
      branch: "CAMPUS_A" as const,
      seminarSessionId: sessionPublicId,
      audience: "BOOKED_FAMILIES" as const,
      message: "[npr] {학생명} 학부모님, QR: {QR링크}",
    };
    const stalePreview = await service.preview(request);
    await prisma.familyBooking.update({
      where: { publicId: bookings.get("RESERVED")! },
      data: { version: { increment: 1 } },
    });
    await expect(service.enqueue(
      { ...request, previewToken: stalePreview.previewToken },
      "integration:admin",
      randomUUID(),
      "ADMIN_GROUP",
    )).rejects.toMatchObject({ code: "SMS_PREVIEW_TOKEN_CHANGED" });

    const preview = await service.preview(request);
    const idempotencyKey = randomUUID();
    const accepted = await service.enqueue(
      { ...request, previewToken: preview.previewToken },
      "integration:admin",
      idempotencyKey,
      "ADMIN_GROUP",
    );
    expect(accepted).toMatchObject({ queuedCount: 2, previewToken: preview.previewToken, status: "QUEUED" });
    expect(await service.enqueue(
      { ...request, previewToken: preview.previewToken },
      "integration:admin",
      idempotencyKey,
      "ADMIN_GROUP",
    )).toEqual(accepted);

    const deliveries = await prisma.smsOutbox.findMany({
      where: { safeMetadata: { path: ["batchId"], equals: accepted.batchId } },
      orderBy: { familyBookingPublicId: "asc" },
    });
    expect(deliveries).toHaveLength(2);
    const messages = deliveries.map((delivery) => protector.decryptSmsPayload(delivery.messageCiphertext));
    expect(messages.some((message) => message.includes("예약 학생"))).toBe(true);
    expect(messages.some((message) => message.includes("입장 학생"))).toBe(true);
    expect(messages.every((message) => message.includes("https://public.test/booking/") && !message.includes("token"))).toBe(true);
    expect(deliveries.every((delivery) => {
      const metadata = delivery.safeMetadata as Record<string, unknown>;
      return metadata.batchId === accepted.batchId
        && metadata.templateId === null
        && metadata.templateName === "직접 입력"
        && metadata.audience === "BOOKED_FAMILIES"
        && metadata.seminarSessionId === sessionPublicId
        && metadata.branch === "CAMPUS_A";
    })).toBe(true);

    await prisma.smsOutbox.update({ where: { id: deliveries[0]!.id }, data: { status: "SENT" } });
    await prisma.smsOutbox.update({
      where: { id: deliveries[1]!.id },
      data: { status: "FAILED_PERMANENT", lastErrorCode: "INTEGRATION_FAILURE" },
    });
    const history = await service.history({ batchId: accepted.batchId });
    expect(history.items).toHaveLength(2);
    expect(history.items.every((item) => item.batchId === accepted.batchId && !Object.hasOwn(item, "message"))).toBe(true);
    expect(history.batches).toEqual([expect.objectContaining({
      batchId: accepted.batchId,
      recipientCount: 2,
      successCount: 1,
      failureCount: 1,
      pendingCount: 0,
      status: "PARTIAL",
      templateName: "직접 입력",
      audience: "BOOKED_FAMILIES",
    })]);
  });

  it("rejects duplicate keys and protects the active default under optimistic locking", async () => {
    await expect(service.createTemplate({
      key: "BOOKING_CONFIRMED_DEFAULT",
      name: "중복",
      purpose: "ADMIN_GROUP",
      body: "중복 템플릿",
    }, "integration:admin", randomUUID())).rejects.toMatchObject({ code: "SMS_TEMPLATE_KEY_CONFLICT" });

    const keep = await prisma.smsTemplate.findFirstOrThrow({ where: { key: "BOOKING_CONFIRMED_DEFAULT" } });
    await expect(service.removeTemplate(
      keep.publicId,
      keep.version.toString(),
      "integration:admin",
      randomUUID(),
    )).rejects.toMatchObject({ code: "SMS_DEFAULT_TEMPLATE_REASSIGN_REQUIRED" });
    expect(await prisma.smsTemplate.findUnique({ where: { id: keep.id } })).not.toBeNull();
  });

  it("deletes unused templates, archives used templates, and replays both outcomes", async () => {
    const unused = await service.createTemplate({
      key: `UNUSED_${randomUUID().replaceAll("-", "").toUpperCase()}`,
      name: "미사용 삭제",
      purpose: "ADMIN_GROUP",
      body: "미사용 템플릿",
    }, "integration:admin", randomUUID());
    const unusedKey = randomUUID();
    const deleted = await service.removeTemplate(
      unused.templateId, unused.version, "integration:admin", unusedKey,
    );
    expect(deleted).toEqual({
      templateId: unused.templateId,
      disposition: "DELETED",
      usageCount: 0,
      archivedTemplate: null,
    });
    expect(await service.removeTemplate(
      unused.templateId, unused.version, "integration:admin", unusedKey,
    )).toEqual(deleted);
    expect(await prisma.smsTemplate.findUnique({ where: { publicId: unused.templateId } })).toBeNull();

    const used = await service.createTemplate({
      key: `USED_${randomUUID().replaceAll("-", "").toUpperCase()}`,
      name: "사용 이력 보관",
      purpose: "ADMIN_GROUP",
      body: "[예시학원] {학생명} 안내",
    }, "integration:admin", randomUUID());
    const target = {
      branch: "CAMPUS_A" as const,
      seminarSessionId: sessionPublicId,
      audience: "BOOKED_FAMILIES" as const,
      templateId: used.templateId,
    };
    const preview = await service.preview(target);
    await service.enqueue({ ...target, previewToken: preview.previewToken }, "integration:admin", randomUUID(), "ADMIN_GROUP");
    const usedKey = randomUUID();
    const archived = await service.removeTemplate(used.templateId, used.version, "integration:admin", usedKey);
    expect(archived).toMatchObject({
      templateId: used.templateId,
      disposition: "ARCHIVED",
      usageCount: 2,
      archivedTemplate: { active: false, isDefault: false, version: "2" },
    });
    const archivedReplay = await service.removeTemplate(used.templateId, used.version, "integration:admin", usedKey);
    expect(JSON.parse(JSON.stringify(archivedReplay))).toEqual(JSON.parse(JSON.stringify(archived)));
    expect(await prisma.smsTemplate.findUniqueOrThrow({ where: { publicId: used.templateId } }))
      .toMatchObject({ active: false, version: 2n });
  });
});
