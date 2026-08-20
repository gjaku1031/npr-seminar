import "reflect-metadata";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { EnvironmentModule } from "../common/config/environment.module.js";
import { PhoneProtector } from "../common/crypto/phone-protector.service.js";
import { PrismaModule } from "../common/prisma/prisma.module.js";
import { PrismaService } from "../common/prisma/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { QrTokenProtector } from "../modules/family-bookings/qr-token-protector.service.js";

/**
 * QR 리허설용 테스트 예약을 한 건 보장한다.
 *
 * 왜 필요한가: 게이트 장비와 QR 흐름은 실제 예약으로 확인할 수 없다. 실제 입장 기록은
 * 되돌릴 수 없기 때문이다(되돌릴 수 있으면 그게 더 큰 문제다). 그래서 `is_test` 가 붙은
 * 예약을 하나 두고 그것만 몇 번이고 입장·취소한다.
 *
 * 이 예약은 **통계에 그대로 잡힌다** — 집계가 실제로 도는지 당일 전에 확인해야 하고, 그
 * 확인은 실제 화면의 실제 숫자로만 된다. 확인이 끝나면 운영자가 이 예약을 취소해 정리한다.
 * 다만 구글시트 투영과 일반 문자 대상에서는 빠진다: 그건 집계가 아니라 시스템 **밖으로
 * 나가는** 것이라, 리허설이 실제 시트나 실제 번호에 닿아서는 안 된다.
 *
 * 이 예약은 **2명(모/부) 예약**이다. 인원 선택 화면까지 함께 리허설해야 하기 때문이다.
 *
 * 비재원(GUEST) 참가자로 만든다 — 실제 학생 레코드를 건드리지 않고, 명단의 재원생 행을
 * 오염시키지 않는다.
 *
 * 멱등이다. 같은 회차에 테스트 예약이 이미 있으면 다시 만들지 않고 그대로 둔다. QR 이
 * 없거나 죽어 있으면 그것만 새로 발급한다.
 *
 * 취소된 테스트 예약은 **다시 예약 상태로 되돌린다.** 리허설은 취소까지 해 보는 것이
 * 목적이라 취소는 자주 일어나고, 그때마다 사람이 DB 를 직접 만지게 둘 이유가 없다.
 * 되돌리는 대상은 `is_test` 예약뿐이다 — 실제 가정의 취소는 이 명령이 손대지 않는다.
 */

const TEST_CONTACT = "01000007147";
const TEST_GUEST_NAME = "테스트 계정";
const TEST_SOURCE_STUDENT_NO = "NPR-TEST-0001";

@Module({
  imports: [
    ConfigModule.forRoot({ cache: true, isGlobal: true, ignoreEnvFile: process.env.NODE_ENV === "production" }),
    EnvironmentModule,
    PrismaModule,
  ],
  providers: [PhoneProtector, QrTokenProtector],
})
class EnsureTestBookingModule {}

export interface EnsureTestBookingResult {
  readonly action: "CREATED" | "UNCHANGED" | "QR_REISSUED" | "REINSTATED";
  readonly familyBookingId: string;
  readonly seminarSessionId: string;
  /**
   * 이 예약을 여는 개인 링크. 원문 토큰은 **fragment 로만** 실린다 — path·query 에 담으면
   * 서버 로그·리퍼러에 남는다.
   *
   * 링크만으로는 열리지 않는다: 교환에 연락처(010-0000-7147)가 함께 필요하다. 그래서 이
   * 값을 한 번 출력하는 것이 자격 자체를 넘겨주는 것과 같지 않다. 그래도 테스트 예약에만
   * 쓰고 실제 가족 링크를 이렇게 뽑지 않는다.
   */
  readonly accessUrl: string;
}

export async function ensureTestBooking(
  prisma: PrismaService,
  phones: PhoneProtector,
  qrTokens: QrTokenProtector,
  sessionPublicId: string,
  branchCode: string,
  publicBaseUrl: string,
): Promise<EnsureTestBookingResult> {
  const session = await prisma.seminarSession.findUnique({
    where: { publicId: sessionPublicId },
    select: { id: true, publicId: true, endsAt: true },
  });
  if (session === null) throw new Error(`No seminar session with id ${sessionPublicId}`);

  const contact = phones.protect(TEST_CONTACT);
  const expiresAt = new Date(session.endsAt.getTime() + 86_400_000);

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.familyBooking.findFirst({
      where: { sessionId: session.id, isTest: true },
      select: {
        id: true, publicId: true, status: true,
        qrCredentials: { where: { status: "ACTIVE" }, select: { id: true } },
      },
    });

    if (existing !== null && existing.status === "CANCELLED") {
      const accessUrl = await reinstate(transaction, qrTokens, existing.id, expiresAt, publicBaseUrl);
      return { action: "REINSTATED", familyBookingId: existing.publicId, seminarSessionId: session.publicId, accessUrl };
    }

    if (existing !== null) {
      // 접근 링크는 매번 새로 낸다. 원문 토큰은 저장하지 않으므로 기존 자격의 URL 은 다시
      // 만들어 낼 수 없고, 리허설하려면 지금 쓸 수 있는 링크가 하나 필요하다.
      const accessUrl = await issueAccessCredential(transaction, publicBaseUrl, existing.id, expiresAt);
      if (existing.qrCredentials.length > 0) {
        return { action: "UNCHANGED", familyBookingId: existing.publicId, seminarSessionId: session.publicId, accessUrl };
      }
      await issueCredential(transaction, qrTokens, existing.id, expiresAt);
      return { action: "QR_REISSUED", familyBookingId: existing.publicId, seminarSessionId: session.publicId, accessUrl };
    }

    // 예약은 OTP 증빙을 반드시 가리켜야 한다(FK). 테스트 예약도 예외를 만들지 않고
    // 소비 완료 상태의 증빙을 하나 남긴다 — 스키마에 구멍을 내는 것보다 낫다.
    const proof = await transaction.otpProofAudit.create({
      data: {
        proofDigest: prismaBytes(createHash("sha256").update(`npr-test-booking:${session.publicId}`).digest()),
        purpose: "FAMILY_BOOKING",
        contactDigest: prismaBytes(contact.digest),
        contactCiphertext: prismaBytes(contact.ciphertext),
        contactLast4: contact.last4,
        selectedBranchCode: branchCode,
        status: "CONSUMED",
        expiresAt: new Date(Date.now() + 10 * 60_000),
        verifiedAt: new Date(),
        consumedAt: new Date(),
      },
      select: { id: true },
    });

    const booking = await transaction.familyBooking.create({
      data: {
        sessionId: session.id,
        contactDigest: prismaBytes(contact.digest),
        contactCiphertext: prismaBytes(contact.ciphertext),
        contactLast4: contact.last4,
        // 2명 예약이어야 인원 선택 화면까지 리허설된다.
        attendanceParty: "BOTH",
        seatCount: 2,
        status: "RESERVED",
        bookingSource: "ON_SITE",
        otpProofAuditId: proof.id,
        isTest: true,
      },
      select: { id: true, publicId: true },
    });

    await transaction.familyBookingStudent.create({
      data: {
        familyBookingId: booking.id,
        sessionId: session.id,
        participantType: "GUEST",
        studentId: null,
        active: true,
        branchCodeAtBooking: branchCode,
        sourceStudentNoSnapshot: TEST_SOURCE_STUDENT_NO,
        studentNameSnapshot: TEST_GUEST_NAME,
        classNameSnapshot: "비재원생",
        schoolNameSnapshot: null,
        gradeSnapshot: null,
        unitNameSnapshot: "비재원생",
        teacherNameSnapshot: null,
      },
    });

    await transaction.bookingEvent.create({
      data: {
        familyBookingId: booking.id,
        eventType: "CREATED",
        actorSubject: null,
        safeMetadata: { testBooking: true },
      },
    });

    await issueCredential(transaction, qrTokens, booking.id, expiresAt);
    const accessUrl = await issueAccessCredential(transaction, publicBaseUrl, booking.id, expiresAt);
    return { action: "CREATED", familyBookingId: booking.publicId, seminarSessionId: session.publicId, accessUrl };
  });
}

/**
 * 취소된 테스트 예약을 다시 예약 상태로 되돌린다.
 *
 * 취소하면서 함께 내려간 것을 모두 되돌린다 — 참가 학생행, 입장 기록, 그리고 폐기된 QR.
 * QR 은 되살리지 않고 새로 낸다: 취소 시점에 폐기된 자격을 다시 살리면 "폐기된 QR 은
 * 다시 쓸 수 없다"는 성질이 테스트 예약에서만 깨진다.
 */
async function reinstate(
  transaction: Prisma.TransactionClient,
  qrTokens: QrTokenProtector,
  familyBookingId: bigint,
  expiresAt: Date,
  publicBaseUrl: string,
): Promise<string> {
  await transaction.familyBooking.update({
    where: { id: familyBookingId },
    data: {
      status: "RESERVED",
      cancelledAt: null,
      // RESERVED 는 입장 전 상태다(family_bookings_state_time_check).
      checkedInAt: null,
      attendedCount: null,
      version: { increment: 1 },
    },
  });
  await transaction.familyBookingStudent.updateMany({
    where: { familyBookingId },
    data: { active: true, releasedAt: null },
  });
  await transaction.bookingEvent.create({
    data: {
      familyBookingId,
      eventType: "UPDATED",
      actorSubject: "system:ensure-test-booking",
      safeMetadata: { testBookingReinstated: true },
    },
  });
  await issueCredential(transaction, qrTokens, familyBookingId, expiresAt);
  return issueAccessCredential(transaction, publicBaseUrl, familyBookingId, expiresAt);
}

/**
 * 원문 QR 은 저장하지 않는다(digest 와 암호문만). 운영자는 학부모와 똑같은 경로로 —
 * `/reserve?mode=manage` 에서 이 번호로 본인 확인 — QR 을 열어 스캔한다. 리허설이
 * 실제 흐름과 같아야 리허설로서 값을 한다.
 */
async function issueCredential(
  transaction: Prisma.TransactionClient,
  qrTokens: QrTokenProtector,
  familyBookingId: bigint,
  expiresAt: Date,
): Promise<void> {
  const rawToken = randomBytes(32).toString("base64url");
  // version 은 예약 안에서 유일해야 한다(qr_credentials_booking_version_unique). 폐기된
  // 자격도 그 자리를 계속 차지하므로, 늘 1 로 내면 두 번째 발급에서 부딪힌다.
  const latest = await transaction.qrCredential.findFirst({
    where: { familyBookingId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  await transaction.qrCredential.create({
    data: {
      familyBookingId,
      tokenDigest: prismaBytes(createHash("sha256").update(rawToken).digest()),
      tokenCiphertext: prismaBytes(qrTokens.protect(rawToken)),
      version: (latest?.version ?? 0) + 1,
      status: "ACTIVE",
      issuedAt: new Date(),
      expiresAt,
    },
  });
}

/**
 * 개인 접근 자격을 새로 내고 그 링크를 돌려준다. 이전 ACTIVE 자격은 폐기한다 —
 * 리허설용 링크가 여러 개 살아 있을 이유가 없다.
 *
 * 서버는 digest 만 보관하므로 원문은 지금 이 순간에만 존재한다. 그래서 링크를 여기서
 * 만들어 돌려주고, 저장하거나 다시 만들어 내려 하지 않는다.
 */
async function issueAccessCredential(
  transaction: Prisma.TransactionClient,
  publicBaseUrl: string,
  familyBookingId: bigint,
  expiresAt: Date,
): Promise<string> {
  await transaction.bookingAccessCredential.updateMany({
    where: { familyBookingId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  // 계약 형식: 정확히 43자 base64url (32바이트).
  const rawToken = randomBytes(32).toString("base64url");
  await transaction.bookingAccessCredential.create({
    data: {
      familyBookingId,
      tokenDigest: prismaBytes(createHash("sha256").update(rawToken).digest()),
      status: "ACTIVE",
      issuedAt: new Date(),
      expiresAt,
    },
  });
  return `${publicBaseUrl.replace(/\/+$/, "")}/booking/access#token=${rawToken}`;
}

async function main(): Promise<void> {
  const [, , sessionPublicId, branchCode] = process.argv;
  if (sessionPublicId === undefined || branchCode === undefined) {
    throw new Error("Usage: ensure-test-booking <seminarSessionId> <BRANCH_CODE>");
  }
  const context = await NestFactory.createApplicationContext(EnsureTestBookingModule, { logger: false });
  try {
    const publicBaseUrl = process.env.PUBLIC_BASE_URL;
    if (publicBaseUrl === undefined || publicBaseUrl === "") throw new Error("PUBLIC_BASE_URL is required");
    const result = await ensureTestBooking(
      context.get(PrismaService),
      context.get(PhoneProtector),
      context.get(QrTokenProtector),
      sessionPublicId,
      branchCode,
      publicBaseUrl,
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await context.close();
  }
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "ensure-test-booking failed"}\n`);
    process.exitCode = 1;
  });
}

/** Prisma 는 ArrayBuffer 기반 Uint8Array 를 요구한다 — Buffer 는 그대로 넘길 수 없다. */
function prismaBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
  copy.set(value);
  return copy;
}
