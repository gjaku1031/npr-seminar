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

// QR 리허설용 테스트 예약 1건 보장 명령
// 사용: node dist/commands/ensure-test-booking.js <seminarSessionId> <BRANCH_CODE>. PUBLIC_BASE_URL 필수
//
// 게이트 장비와 QR 흐름은 실제 예약으로 확인할 수 없음. 실제 입장 기록은 되돌릴 수 없기 때문
// 그래서 is_test 예약 하나를 두고 그것만 반복해 입장·취소함
// 이 예약은 통계에 그대로 포함됨. 당일 전에 실제 화면 집계가 움직이는지 확인하고, 확인 후 운영자가 취소해 정리
// 시트 반영과 일반 문자 대상에서는 제외됨. 외부로 나가는 동작이라 리허설이 실제 시트·번호에 닿으면 안 됨
// 인원 선택 화면까지 리허설하도록 2명(모/부) 예약으로 생성
// 실제 학생 레코드와 명단의 재원생 행을 건드리지 않도록 비재원생 참가자로 생성
// 멱등: 같은 회차에 테스트 예약이 있으면 새로 만들지 않고, QR이 없거나 폐기됐으면 QR만 새로 발급
// 취소된 테스트 예약은 다시 예약 상태로 되돌림. 대상은 is_test 예약뿐이며 실제 가정의 취소는 건드리지 않음

/**
 * 테스트 예약 연락처
 */
const TEST_CONTACT = "01000007147";

/**
 * 테스트 참가자 이름
 */
const TEST_GUEST_NAME = "테스트 계정";

/**
 * 테스트 참가자 학번 표시
 */
const TEST_SOURCE_STUDENT_NO = "NPR-TEST-0001";

/**
 * 명령 전용 모듈. 환경 설정·DB·연락처 보호·QR 암호화 구성
 */
@Module({
  imports: [
    ConfigModule.forRoot({ cache: true, isGlobal: true, ignoreEnvFile: process.env.NODE_ENV === "production" }),
    EnvironmentModule,
    PrismaModule,
  ],
  providers: [PhoneProtector, QrTokenProtector],
})
class EnsureTestBookingModule {}

/**
 * 테스트 예약 보장 결과
 */
export interface EnsureTestBookingResult {
  /**
   * 처리 결과. 생성·변경 없음·QR 재발급·취소 복구
   */
  readonly action: "CREATED" | "UNCHANGED" | "QR_REISSUED" | "REINSTATED";

  /**
   * 가족 예약 공개 ID
   */
  readonly familyBookingId: string;

  /**
   * 회차 공개 ID
   */
  readonly seminarSessionId: string;

  /**
   * 이 예약을 여는 개인 관리 링크
   *
   * 원문 토큰은 URL 프래그먼트로만 전달. 경로·쿼리에 담으면 서버 로그·Referer에 남음
   * 링크만으로는 열리지 않고 교환에 연락처(010-0000-7147)가 함께 필요해, 출력이 자격 자체를 넘기는 것과 같지 않음
   * 테스트 예약에만 쓰고 실제 가족 링크는 이렇게 발급하지 않음
   */
  readonly accessUrl: string;
}

/**
 * 회차의 테스트 예약 보장
 *
 * 1. 취소된 테스트 예약이 있으면 복구
 * 2. 있으면 관리 링크를 새로 발급하고, ACTIVE QR이 없을 때만 QR 재발급
 * 3. 없으면 소비 완료 OTP 증명·예약·비재원생 참가자·생성 이벤트·QR·관리 링크 생성
 *
 * QR·관리 링크 만료는 회차 종료 1일 후
 *
 * @param branchCode 테스트 참가자 캠퍼스
 * @param publicBaseUrl 관리 링크 기준 URL
 * @throws {Error} 회차 없음
 */
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
      // 관리 링크는 매번 새로 발급. 원문 토큰을 저장하지 않아 기존 링크를 다시 만들 수 없고, 리허설에는 지금 쓸 링크가 필요함
      const accessUrl = await issueAccessCredential(transaction, publicBaseUrl, existing.id, expiresAt);
      if (existing.qrCredentials.length > 0) {
        return { action: "UNCHANGED", familyBookingId: existing.publicId, seminarSessionId: session.publicId, accessUrl };
      }
      await issueCredential(transaction, qrTokens, existing.id, expiresAt);
      return { action: "QR_REISSUED", familyBookingId: existing.publicId, seminarSessionId: session.publicId, accessUrl };
    }

    // 예약은 OTP 증명을 반드시 참조해야 함(외래 키). 테스트 예약도 예외 없이 소비 완료 상태의 증명을 남김
    // 스키마 제약에 예외를 만드는 것보다 나음
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
        // 2명 예약이어야 인원 선택 화면까지 리허설됨
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
 * 취소된 테스트 예약을 다시 예약 상태로 복구
 *
 * 취소와 함께 내려간 참가자·입장 기록을 되돌리고 QR·관리 링크를 새로 발급
 * 폐기된 QR은 되살리지 않음. 되살리면 폐기된 QR은 다시 쓸 수 없다는 성질이 테스트 예약에서만 깨짐
 *
 * @returns 새 관리 링크
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
      // RESERVED는 입장 전 상태(family_bookings_state_time_check 제약)
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
 * 새 QR 자격 증명 발급
 *
 * 원문 QR은 저장하지 않고 다이제스트와 암호문만 저장
 * 운영자는 학부모와 같은 경로(`/reserve?mode=manage`에서 이 번호로 본인 확인)로 QR을 열어 스캔. 리허설이 실제 흐름과 같아야 의미가 있음
 */
async function issueCredential(
  transaction: Prisma.TransactionClient,
  qrTokens: QrTokenProtector,
  familyBookingId: bigint,
  expiresAt: Date,
): Promise<void> {
  const rawToken = randomBytes(32).toString("base64url");
  // 버전은 예약 안에서 유일해야 함(qr_credentials_booking_version_unique). 폐기된 자격도 버전을 차지하므로 최신 버전+1 사용
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
 * 개인 관리 링크 자격 증명 발급
 *
 * 기존 ACTIVE 자격은 폐기. 리허설용 링크가 여러 개 유효할 이유가 없음
 * 서버는 다이제스트만 보관하므로 원문은 이 순간에만 존재해 여기서 링크를 만들어 반환
 *
 * @returns `{기준 URL}/booking/access#token={원문}`
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
  // 계약 형식: 정확히 43자 base64url(32바이트)
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

/**
 * 인자를 읽어 테스트 예약 보장 실행 후 결과 JSON 출력
 *
 * @throws {Error} 인자 누락, PUBLIC_BASE_URL 미설정
 */
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

// 직접 실행할 때만 main 호출
const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "ensure-test-booking failed"}\n`);
    process.exitCode = 1;
  });
}

/**
 * Prisma Bytes 입력용 ArrayBuffer 기반 복사본. Buffer를 그대로 넘길 수 없음
 */
function prismaBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
  copy.set(value);
  return copy;
}
