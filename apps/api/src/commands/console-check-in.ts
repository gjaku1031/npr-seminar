import "reflect-metadata";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { pathToFileURL } from "node:url";
import { EnvironmentModule } from "../common/config/environment.module.js";
import { PhoneProtector } from "../common/crypto/phone-protector.service.js";
import { PrismaModule } from "../common/prisma/prisma.module.js";
import { PrismaService } from "../common/prisma/prisma.service.js";
import { SheetOutboxService } from "../modules/google-sheets/sheet-outbox.service.js";
import { currentOrHistoricMathHomeroomTeacher } from "../modules/student-sync/student-homeroom-policy.js";

// 운영 콘솔 수동 입장 명령. 게이트를 거치지 않고 예약 하나를 입장 처리
// QR·번호 조회가 모두 어려운 현장 상황에서 운영자가 입장을 사후 기록하는 경로
// 스캐너 API는 페어링된 기기 세션이 필요해 콘솔에서 쓸 수 없음
// 정식 입장과 같은 기록(경합 안전 상태 전이, 예약 이벤트, 시트 반영, 입장 이벤트)을 모두 남김
// 하나라도 빠지면 명단·통계·시트·실시간 로그 중 어딘가가 사실과 달라짐
// 입장 이벤트에는 게이트 대신 `콘솔`로 남겨 현장 스캔이 아닌 입장을 구분
// 사용: node dist/commands/console-check-in.js <familyBookingId> <attendedCount>

/**
 * 명령 전용 모듈. 환경 설정·DB·연락처 보호·시트 반영 대기열 구성
 */
@Module({
  imports: [
    ConfigModule.forRoot({ cache: true, isGlobal: true, ignoreEnvFile: process.env.NODE_ENV === "production" }),
    EnvironmentModule,
    PrismaModule,
  ],
  providers: [PhoneProtector, SheetOutboxService],
})
class ConsoleCheckInModule {}

/**
 * 콘솔 입장 결과
 */
export interface ConsoleCheckInResult {
  /**
   * 처리 결과. 입장 처리 또는 이미 입장
   */
  readonly result: "CHECKED_IN" | "ALREADY_CHECKED_IN";

  /**
   * 가족 예약 공개 ID
   */
  readonly familyBookingId: string;

  /**
   * 현재 참가 학생 이름
   */
  readonly studentNames: readonly string[];

  /**
   * 이번에 기록한 입장 인원. 이미 입장이면 null
   */
  readonly attendedCount: number | null;
}

/**
 * 콘솔 입장 이벤트 메타데이터. 스캐너 정보 대신 운영 콘솔 표시
 */
const CONSOLE_METADATA = {
  scannerDeviceName: "운영 콘솔",
  scannerEntranceName: null,
  scannerGateCode: "콘솔",
  scannerBranchCode: null,
} as const;

/**
 * 콘솔 수동 입장
 *
 * 예약 상태 전이·예약 이벤트·시트 반영·입장 이벤트를 한 트랜잭션으로 기록
 *
 * @param attendedCount 실제 입장 인원. 1~20 정수
 * @throws {Error} 인원 범위 밖, 예약 없음, 취소된 예약
 */
export async function consoleCheckIn(
  prisma: PrismaService,
  sheetOutbox: SheetOutboxService,
  familyBookingPublicId: string,
  attendedCount: number,
): Promise<ConsoleCheckInResult> {
  if (!Number.isInteger(attendedCount) || attendedCount < 1 || attendedCount > 20) {
    throw new Error("attendedCount must be an integer between 1 and 20");
  }
  return prisma.$transaction(async (transaction) => {
    const booking = await transaction.familyBooking.findUnique({
      where: { publicId: familyBookingPublicId },
      select: { id: true, sessionId: true, seatCount: true, status: true },
    });
    if (booking === null) throw new Error(`No family booking ${familyBookingPublicId}`);
    if (booking.status === "CANCELLED") throw new Error("booking is cancelled — reinstate it first");

    // 스캐너 흐름과 같은 경합 안전 전이. RESERVED일 때만 입장 처리
    const updated = await transaction.familyBooking.updateMany({
      where: { id: booking.id, status: "RESERVED", checkedInAt: null },
      data: {
        status: "CHECKED_IN",
        checkedInAt: new Date(),
        attendedCount,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    const result: ConsoleCheckInResult["result"] = updated.count === 1 ? "CHECKED_IN" : "ALREADY_CHECKED_IN";
    const recordedCount = updated.count === 1 ? attendedCount : null;

    if (result === "CHECKED_IN") {
      const bookingEvent = await transaction.bookingEvent.create({
        data: {
          familyBookingId: booking.id,
          eventType: "CHECKED_IN",
          actorSubject: "system:operator-console",
          safeMetadata: { source: "MANUAL", attendedCount: recordedCount, ...CONSOLE_METADATA },
        },
      });
      const delivery = await transaction.familyBooking.findUniqueOrThrow({
        where: { id: booking.id },
        select: {
          publicId: true, version: true, createdAt: true, attendanceParty: true, bookingSource: true,
          session: { select: { publicId: true } },
          students: { where: { active: true }, orderBy: { id: "asc" }, select: {
            publicId: true, participantType: true, branchCodeAtBooking: true, sourceStudentNoSnapshot: true,
            studentNameSnapshot: true, unitNameSnapshot: true, teacherNameSnapshot: true,
            schoolNameSnapshot: true, gradeSnapshot: true, student: { select: {
              publicId: true,
              teacherName: true,
              assignments: { select: { className: true, sourceActive: true } },
            } },
          } },
        },
      });
      await sheetOutbox.enqueueBookingEvent(transaction, {
        eventId: bookingEvent.eventId, eventType: "CHECKED_IN", occurredAt: bookingEvent.occurredAt,
        seminarSessionPublicId: delivery.session.publicId, familyBookingPublicId: delivery.publicId,
        bookingVersion: BigInt(delivery.version), bookingCreatedAt: delivery.createdAt,
        attendanceParty: delivery.attendanceParty as "MOTHER" | "FATHER" | "BOTH",
        bookingSource: delivery.bookingSource as "WEB_APP" | "PHONE" | "TEACHER" | "ON_SITE",
        children: delivery.students.map((link) => ({
          familyBookingStudentPublicId: link.publicId, studentPublicId: link.student?.publicId ?? link.publicId,
          sourceStudentNo: link.sourceStudentNoSnapshot, studentName: link.studentNameSnapshot,
          branch: link.branchCodeAtBooking as "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C",
          unitName: link.unitNameSnapshot,
          teacherName: link.participantType === "GUEST"
            ? null
            : currentOrHistoricMathHomeroomTeacher(link.student, link.teacherNameSnapshot),
          schoolName: link.schoolNameSnapshot, grade: link.gradeSnapshot, active: true,
        })),
      });
    }

    // 입장 이벤트는 결과와 무관하게 한 줄 기록. 시도 자체가 사건임
    await transaction.checkInEvent.create({
      data: {
        familyBookingId: booking.id,
        qrCredentialId: null,
        sessionId: booking.sessionId,
        source: "MANUAL",
        result,
        seatCount: booking.seatCount,
        scannerDeviceId: null,
        gateCode: "콘솔",
        actorSubject: "system:operator-console",
        idempotencyKeyDigest: null,
        safeMetadata: { ...CONSOLE_METADATA, attendedCount: recordedCount },
      },
    });

    // 응답용 현재 참가 학생 이름
    const names = await transaction.familyBookingStudent.findMany({
      where: { familyBookingId: booking.id, active: true },
      select: { studentNameSnapshot: true },
      orderBy: { id: "asc" },
    });
    return {
      result,
      familyBookingId: familyBookingPublicId,
      studentNames: names.map((row) => row.studentNameSnapshot),
      attendedCount: recordedCount,
    };
  });
}

/**
 * 인자를 읽어 콘솔 입장 실행 후 결과 JSON 출력
 *
 * @throws {Error} 인자 누락
 */
async function main(): Promise<void> {
  const [, , familyBookingId, countRaw] = process.argv;
  if (familyBookingId === undefined || countRaw === undefined) {
    throw new Error("Usage: console-check-in <familyBookingId> <attendedCount>");
  }
  const context = await NestFactory.createApplicationContext(ConsoleCheckInModule, { logger: false });
  try {
    const result = await consoleCheckIn(
      context.get(PrismaService),
      context.get(SheetOutboxService),
      familyBookingId,
      Number(countRaw),
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
    process.stderr.write(`${error instanceof Error ? error.message : "console-check-in failed"}\n`);
    process.exitCode = 1;
  });
}
