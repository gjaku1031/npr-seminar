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

/**
 * 운영 콘솔 수동 입장 — 게이트를 거치지 않고 예약 하나를 입장 처리한다.
 *
 * 언제 쓰나: 현장에서 QR 도 번호 조회도 여의치 않을 때 운영자가 "이 가족 들어왔다"를
 * 사후에 적는 경로다. 스캐너용 API 는 페어링된 기기 세션을 요구하므로 콘솔에서는 쓸 수 없다.
 *
 * **정식 입장이 남기는 기록을 전부 남긴다** — 예약 상태 전이(경합 안전), booking_events,
 * 구글시트 투영, check_in_events 원장. 하나라도 빼면 명단·통계·시트·실시간 로그 중 어딘가가
 * 거짓말을 하게 된다. 원장에는 게이트 대신 `콘솔`로 남아, 나중에 "이 입장은 현장 스캔이
 * 아니었다"를 구분할 수 있다.
 *
 * 사용: console-check-in <familyBookingId> <attendedCount>
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

export interface ConsoleCheckInResult {
  readonly result: "CHECKED_IN" | "ALREADY_CHECKED_IN";
  readonly familyBookingId: string;
  readonly studentNames: readonly string[];
  readonly attendedCount: number | null;
}

const CONSOLE_METADATA = {
  scannerDeviceName: "운영 콘솔",
  scannerEntranceName: null,
  scannerGateCode: "콘솔",
  scannerBranchCode: null,
} as const;

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

    // 스캐너 흐름과 같은 경합 안전 전이 — RESERVED 일 때만 넘어간다.
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
          branch: link.branchCodeAtBooking as "SONGPA" | "WIRYE" | "GWANGJIN",
          unitName: link.unitNameSnapshot,
          teacherName: link.participantType === "GUEST"
            ? null
            : currentOrHistoricMathHomeroomTeacher(link.student, link.teacherNameSnapshot),
          schoolName: link.schoolNameSnapshot, grade: link.gradeSnapshot, active: true,
        })),
      });
    }

    // 원장은 결과와 무관하게 한 줄 남는다 — 시도 자체가 사건이다.
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

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "console-check-in failed"}\n`);
    process.exitCode = 1;
  });
}
