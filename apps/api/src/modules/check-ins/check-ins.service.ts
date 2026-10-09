import { Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { AuthenticatedActor } from "../../common/auth/authenticated-actor.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { BookingCryptoService } from "../family-bookings/booking-crypto.service.js";
import type { AttendanceParty } from "../family-bookings/attendance.js";
import { SheetOutboxService } from "../google-sheets/sheet-outbox.service.js";
import { currentOrHistoricMathHomeroomTeacher } from "../student-sync/student-homeroom-policy.js";

/**
 * 입장 경로. QR 스캔 또는 연락처로 찾은 수동 입장
 */
type CheckInSource = "QR" | "MANUAL";

/**
 * 입장 판정 결과
 *
 * - CHECKED_IN: 입장 처리됨
 * - PARTY_SELECTION_REQUIRED: 실제 입장 인원 미입력. 예약은 변경하지 않고 되물음
 * - ALREADY_CHECKED_IN: 이미 입장함
 * - CANCELLED: 취소된 예약
 * - SESSION_MISMATCH: 스캐너가 선택한 회차와 예약 회차가 다름
 * - EXPIRED_QR·REVOKED_QR·INVALID_QR: QR 만료·폐기·형식 오류 또는 없음
 * - RESERVATION_NOT_FOUND: 수동 입장 예약 없음
 * - NOT_AUTHORIZED: 권한 없음
 */
type CheckInResult = "CHECKED_IN" | "PARTY_SELECTION_REQUIRED" | "ALREADY_CHECKED_IN" | "CANCELLED"
  | "SESSION_MISMATCH" | "EXPIRED_QR" | "REVOKED_QR" | "INVALID_QR" | "RESERVATION_NOT_FOUND" | "NOT_AUTHORIZED";

/**
 * 게이트에서 확정한 실제 입장 인원. 이 제품에는 좌석 개념이 없고 세는 단위는 사람뿐
 *
 * 예약 인원(seat_count)보다 작거나 클 수 있음. 2명 예약에 한 명만 오거나 1명 예약에 가족이 더 오기도 하므로 사실 그대로 기록
 */
export type AttendedCount = number;

/**
 * 입장 인원 상한. 숫자패드 오타(1 대신 111) 방지용이며 정책이 아님. DB 제약과 같은 값이어야 함
 */
export const MAX_ATTENDED_COUNT = 20;

/**
 * 입장 처리 시점의 스캐너 정보
 */
interface ScannerContext {
  /**
   * 기기 ID
   */
  readonly id: bigint;

  /**
   * 기기 공개 ID
   */
  readonly publicId: string;

  /**
   * 기기 이름
   */
  readonly name: string;

  /**
   * 설치 위치(입구 이름)
   */
  readonly location: string | null;

  /**
   * 기기 캠퍼스
   */
  readonly branchCode: string;

  /**
   * 출입구 코드
   */
  readonly gateCode: string;

  /**
   * 선택 회차 ID
   */
  readonly sessionId: bigint;

  /**
   * 선택 회차 공개 ID
   */
  readonly sessionPublicId: string;
}

/**
 * 입장 당시 스캐너 이름·입구·출입구·캠퍼스를 감사 메타데이터로 고정
 */
export function scannerCheckInMetadata(scanner: Pick<ScannerContext, "name" | "location" | "gateCode" | "branchCode">) {
  return {
    scannerDeviceName: scanner.name,
    scannerEntranceName: scanner.location,
    scannerGateCode: scanner.gateCode,
    scannerBranchCode: scanner.branchCode,
  } as const;
}

/**
 * 스캐너 입장 결과. 업무 거절도 이 결과와 이벤트로 기록
 */
export interface CheckInOutcome {
  /**
   * 입장 이벤트 ID
   */
  readonly eventId: string;

  /**
   * 판정 결과
   */
  readonly result: CheckInResult;

  /**
   * 같은 멱등 키 재요청으로 저장 결과를 재생했는지 여부
   */
  readonly replayed: boolean;

  /**
   * 가족 예약 공개 ID. 예약을 찾지 못했으면 null
   */
  readonly familyBookingId: string | null;

  /**
   * 예약 인원. 예약을 찾지 못했으면 null
   */
  readonly familySeatCount: number | null;

  /**
   * 이 입장이 기록한 인원. CHECKED_IN·ALREADY_CHECKED_IN에서만 값이 있음
   */
  readonly attendedCount: number | null;

  /**
   * 참석 보호자
   */
  readonly attendanceParty: AttendanceParty | null;

  /**
   * 대표 학생 이름
   */
  readonly representativeStudentName: string | null;

  /**
   * 스캐너 선택 회차 ID
   */
  readonly seminarSessionId: string;

  /**
   * 스캐너 기기 ID
   */
  readonly deviceId: string;

  /**
   * 스캐너 캠퍼스
   */
  readonly branch: string;

  /**
   * 출입구 코드
   */
  readonly gateCode: string;

  /**
   * 입장 이벤트 시각
   */
  readonly occurredAt: Date;

  /**
   * 대표 학생 스냅샷. 예약을 찾지 못했거나 활성 학생이 없으면 null
   */
  readonly representativeStudent: {
    /**
     * 참여 유형
     */
    readonly participantType: string;

    /**
     * 학번
     */
    readonly sourceStudentNo: string;

    /**
     * 이름
     */
    readonly studentName: string;

    /**
     * 예약 시점 캠퍼스
     */
    readonly branch: string;

    /**
     * 반
     */
    readonly className: string;

    /**
     * 학교
     */
    readonly schoolName: string | null;

    /**
     * 학년
     */
    readonly grade: string | null;

    /**
     * 단위
     */
    readonly unitName: string | null;
  } | null;
}

/**
 * 대표 학생 후보 스냅샷
 */
interface RepresentativeCandidate {
  /**
   * 참여 유형. 재원생·비재원생
   */
  readonly participantType: string;

  /**
   * 원천 학번
   */
  readonly sourceStudentNoSnapshot: string;

  /**
   * 학생 이름
   */
  readonly studentNameSnapshot: string;

  /**
   * 예약 시점 캠퍼스
   */
  readonly branchCodeAtBooking: string;

  /**
   * 반
   */
  readonly classNameSnapshot: string;

  /**
   * 학교
   */
  readonly schoolNameSnapshot: string | null;

  /**
   * 학년
   */
  readonly gradeSnapshot: string | null;

  /**
   * 단위
   */
  readonly unitNameSnapshot: string | null;
}

/**
 * 입장 화면에 표시할 대표 학생 1명 선택
 *
 * 학년 내림차순, 이후 캠퍼스·단위·반·이름·학번 오름차순
 *
 * @returns 대표 학생. 후보가 없으면 null
 */
export function selectCheckInRepresentativeStudent(students: readonly RepresentativeCandidate[]) {
  const representative = [...students].sort((left, right) => {
    const byGrade = checkInGradeRank(right.gradeSnapshot, right.unitNameSnapshot, right.schoolNameSnapshot)
      - checkInGradeRank(left.gradeSnapshot, left.unitNameSnapshot, left.schoolNameSnapshot);
    if (byGrade !== 0) return byGrade;
    const byBranch = checkInBranchRank(left.branchCodeAtBooking) - checkInBranchRank(right.branchCodeAtBooking);
    if (byBranch !== 0) return byBranch;
    const byUnit = (left.unitNameSnapshot ?? "").localeCompare(right.unitNameSnapshot ?? "", "ko");
    if (byUnit !== 0) return byUnit;
    const byClass = left.classNameSnapshot.localeCompare(right.classNameSnapshot, "ko");
    if (byClass !== 0) return byClass;
    const byName = left.studentNameSnapshot.localeCompare(right.studentNameSnapshot, "ko");
    return byName !== 0 ? byName : left.sourceStudentNoSnapshot.localeCompare(right.sourceStudentNoSnapshot);
  })[0];
  if (representative === undefined) return null;
  return {
    participantType: representative.participantType,
    sourceStudentNo: representative.sourceStudentNoSnapshot,
    studentName: representative.studentNameSnapshot,
    branch: representative.branchCodeAtBooking,
    className: representative.classNameSnapshot,
    schoolName: representative.schoolNameSnapshot,
    grade: representative.gradeSnapshot,
    unitName: representative.unitNameSnapshot,
  };
}

/**
 * 학년 정렬 순위
 *
 * 학년 문자열의 `초/중/고+숫자`를 우선, 없으면 `N학년`과 단위·학교 이름의 학교급으로 계산
 * 초 100, 중 200, 고 300에 학년을 더함
 */
function checkInGradeRank(grade: string | null, unitName: string | null, schoolName: string | null): number {
  const normalizedGrade = grade?.normalize("NFKC").replaceAll(" ", "") ?? "";
  const explicit = normalizedGrade.match(/([초중고])([1-6])/u);
  if (explicit !== null) return checkInSchoolLevelRank(explicit[1]!, Number(explicit[2]));
  const year = Number(normalizedGrade.match(/([1-6])학년/u)?.[1] ?? 0);
  const unitLevel = checkInUnitSchoolLevel(unitName);
  if (unitLevel !== null) return checkInSchoolLevelRank(unitLevel, year);
  const schoolLevel = checkInSchoolNameLevel(schoolName);
  if (schoolLevel !== null) return checkInSchoolLevelRank(schoolLevel, year);
  return year;
}

/**
 * 단위 이름의 학교급. 판정 불가면 null
 */
function checkInUnitSchoolLevel(unitName: string | null): "초" | "중" | "고" | null {
  const normalized = unitName?.normalize("NFKC").replaceAll(" ", "") ?? "";
  if (/^(?:고등|고[1-3]|예고|과고)/u.test(normalized)) return "고";
  if (/^(?:중등|중[1-3]|예중)/u.test(normalized)) return "중";
  if (/^(?:초등|초[1-6])/u.test(normalized)) return "초";
  return null;
}

/**
 * 학교 이름 끝의 학교급. 판정 불가면 null
 */
function checkInSchoolNameLevel(schoolName: string | null): "초" | "중" | "고" | null {
  const normalized = schoolName?.normalize("NFKC").replaceAll(" ", "") ?? "";
  if (/(?:고등학교|고)$/u.test(normalized)) return "고";
  if (/(?:중학교|중)$/u.test(normalized)) return "중";
  if (/(?:초등학교|초)$/u.test(normalized)) return "초";
  return null;
}

/**
 * 학교급과 학년을 합친 순위
 */
function checkInSchoolLevelRank(level: string, year: number): number {
  const base = level === "고" ? 300 : level === "중" ? 200 : level === "초" ? 100 : 0;
  return base + year;
}

/**
 * 캠퍼스 정렬 순위. A·B·C, 그 외 99
 */
function checkInBranchRank(branch: string): number {
  return ({ CAMPUS_A: 0, CAMPUS_B: 1, CAMPUS_C: 2 } as Record<string, number>)[branch] ?? 99;
}

/**
 * 스캐너 입장 처리
 *
 * 스캐너 컨텍스트 확인, 입장 판정, 입장 이벤트와 시트 반영 대기열을 하나의 입장 트랜잭션으로 묶음
 */
@Injectable()
export class CheckInsService {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * QR·멱등 키 다이제스트
     */
    private readonly crypto: BookingCryptoService,

    /**
     * 시트 반영 대기열
     */
    private readonly sheetOutbox: SheetOutboxService,
  ) {}

  /**
   * 스캐너 캠퍼스에 맞는 OPEN 회차와 기기가 현재 선택한 회차
   *
   * @throws {DomainError} 403 스캐너 아님, 401 기기 취소
   */
  public async listEligibleSessions(actor: AuthenticatedActor) {
    const device = await this.device(actor);
    const sessions = await this.prisma.seminarSession.findMany({
      where: {
        status: "OPEN",
        OR: [{ scope: "ALL" }, { scope: "BRANCH", branchId: device.branchId }],
      },
      select: {
        publicId: true, scope: true, startsAt: true, endsAt: true, place: true,
        branch: { select: { code: true } }, seminar: { select: { publicId: true, title: true } },
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    });
    return {
      items: sessions.map((session) => ({
        seminarId: session.seminar.publicId,
        seminarSessionId: session.publicId,
        seminarTitle: session.seminar.title,
        scope: session.scope,
        branch: session.branch?.code ?? null,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        location: session.place,
      })),
      currentSessionId: device.selectedSession?.publicId ?? null,
    };
  }

  /**
   * 수동 입장 후보
   *
   * 선택 회차의 예약·입장 상태 예약 중 연락처 끝 4자리가 같은 최대 20건. 연락처는 마스킹
   *
   * @throws {DomainError} 400 4자리 숫자 아님, 409 회차 미선택
   */
  public async manualCandidates(actor: AuthenticatedActor, phoneLast4: string) {
    if (!/^\d{4}$/.test(phoneLast4)) this.fail(400, "PHONE_LAST4_INVALID");
    const scanner = await this.context(actor);
    const bookings = await this.prisma.familyBooking.findMany({
      where: { sessionId: scanner.sessionId, contactLast4: phoneLast4, status: { in: ["RESERVED", "CHECKED_IN"] } },
      select: {
        publicId: true, contactLast4: true, attendanceParty: true, seatCount: true, status: true,
        students: {
          where: { active: true },
          select: {
            studentNameSnapshot: true, classNameSnapshot: true, schoolNameSnapshot: true,
            gradeSnapshot: true, branchCodeAtBooking: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 20,
    });
    return {
      items: bookings.map((booking) => ({
        familyBookingId: booking.publicId,
        maskedContact: `***-****-${booking.contactLast4}`,
        attendanceParty: booking.attendanceParty,
        seatCount: booking.seatCount,
        status: booking.status,
        students: booking.students.map((student) => ({
          name: student.studentNameSnapshot,
          className: student.classNameSnapshot,
          schoolName: student.schoolNameSnapshot,
          grade: student.gradeSnapshot,
          branch: student.branchCodeAtBooking,
        })),
      })),
    };
  }

  /**
   * QR 입장
   *
   * 토큰 형식이 틀려도 HTTP 오류 대신 INVALID_QR 결과와 이벤트로 기록
   */
  public async byQr(
    actor: AuthenticatedActor,
    qrToken: string,
    idempotencyKey: string,
    attendedCount?: AttendedCount,
  ): Promise<CheckInOutcome> {
    if (qrToken.length < 43 || qrToken.length > 512 || !/^[A-Za-z0-9_-]+$/.test(qrToken)) {
      return this.perform(actor, "QR", null, null, idempotencyKey, attendedCount, "INVALID_QR");
    }
    return this.perform(actor, "QR", this.crypto.digest(qrToken), null, idempotencyKey, attendedCount);
  }

  /**
   * 예약 ID로 수동 입장. 실제 인원 생략도 결과 이벤트로 남김
   */
  public byManual(
    actor: AuthenticatedActor,
    familyBookingId: string,
    idempotencyKey: string,
    attendedCount?: AttendedCount,
  ): Promise<CheckInOutcome> {
    return this.perform(actor, "MANUAL", null, familyBookingId, idempotencyKey, attendedCount);
  }

  /**
   * 관리자 입장 이벤트 순번 오름차순 조회
   *
   * 스캐너 표시 정보는 입장 당시 메타데이터를 우선 사용
   *
   * @param filters limit은 1~200, 기본 50
   */
  public async listEvents(filters: {
    familyBookingId?: string; sessionId?: string; deviceId?: string; result?: string;
    afterSequence?: string; limit?: number;
  }) {
    const after = filters.afterSequence === undefined ? 0n : BigInt(filters.afterSequence);
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const rows = await this.prisma.checkInEvent.findMany({
      where: {
        id: { gt: after },
        ...(filters.result === undefined ? {} : { result: filters.result }),
        ...(filters.familyBookingId === undefined ? {} : { familyBooking: { publicId: filters.familyBookingId } }),
        ...(filters.sessionId === undefined ? {} : { session: { publicId: filters.sessionId } }),
        ...(filters.deviceId === undefined ? {} : { scannerDevice: { publicId: filters.deviceId } }),
      },
      select: {
        id: true, eventId: true, source: true, result: true, seatCount: true, gateCode: true,
        actorSubject: true, safeMetadata: true, occurredAt: true,
        familyBooking: { select: {
          publicId: true,
          // 실시간 로그가 누가 들어왔는지 보여야 하므로 대표 참가자 한 명의 스냅샷 이름을 포함
          // 형제가 있어도 로그 한 줄에는 이름 하나로 충분
          students: { where: { active: true }, orderBy: { id: "asc" }, take: 1, select: { studentNameSnapshot: true } },
        } },
        session: { select: { publicId: true } },
        scannerDevice: { select: { publicId: true, name: true, location: true } },
      },
      orderBy: { id: "asc" }, take: limit + 1,
    });
    const hasMore = rows.length > limit;
    return {
      items: rows.slice(0, limit).map((row) => {
        const metadata = this.safeMetadata(row.safeMetadata);
        return {
          sequence: row.id.toString(), eventId: row.eventId, source: row.source, result: row.result,
          familyBookingId: row.familyBooking?.publicId ?? null, seminarSessionId: row.session.publicId,
          representativeStudentName: row.familyBooking?.students?.[0]?.studentNameSnapshot ?? null,
          deviceId: row.scannerDevice?.publicId ?? null,
          scannerDeviceName: this.metadataText(metadata, "scannerDeviceName") ?? row.scannerDevice?.name ?? null,
          scannerEntranceName: this.metadataText(metadata, "scannerEntranceName") ?? row.scannerDevice?.location ?? null,
          scannerGateCode: this.metadataText(metadata, "scannerGateCode") ?? row.gateCode,
          seatCount: row.seatCount, gateCode: row.gateCode,
          actorSubject: row.actorSubject, safeMetadata: row.safeMetadata, occurredAt: row.occurredAt,
        };
      }),
      page: { nextAfterSequence: hasMore ? rows[limit - 1]!.id.toString() : null, hasMore },
    };
  }

  /**
   * 입장 판정과 기록
   *
   * 잠금 순서: 멱등 키 advisory lock → 스캐너 → 회차(ID 오름차순) → 예약 → QR 자격
   * 입장 성공은 예약 변경·예약 이벤트·시트 반영 대기열·입장 이벤트·멱등 응답을 함께 커밋
   * PARTY_SELECTION_REQUIRED 등 업무 실패는 예약을 바꾸지 않고 입장 이벤트와 결과만 남김
   * 같은 키의 같은 요청은 저장 결과에 replayed=true를 붙여 반환, 다른 요청이면 409
   * READ COMMITTED 격리, 제한 시간 10초
   *
   * @param forcedResult 사전 검사에서 정한 결과. 지정하면 판정을 건너뜀
   * @throws {DomainError} 400 멱등 키 형식, 401 기기 취소, 409 회차 미선택·키 재사용
   */
  private async perform(
    actor: AuthenticatedActor,
    source: CheckInSource,
    tokenDigest: Buffer | null,
    familyBookingId: string | null,
    idempotencyKey: string,
    attendedCount?: AttendedCount,
    forcedResult?: CheckInResult,
  ): Promise<CheckInOutcome> {
    if (idempotencyKey.trim().length < 8 || idempotencyKey.length > 200) this.fail(400, "IDEMPOTENCY_KEY_INVALID");
    const keyDigest = this.crypto.digest(idempotencyKey);
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`select pg_advisory_xact_lock(${keyDigest.readBigInt64BE()})`;
      const scanner = await this.contextForUpdate(transaction, actor);
      const requestDigest = this.crypto.digest(this.crypto.stableJson({
        source,
        tokenDigest: tokenDigest?.toString("base64url") ?? null,
        familyBookingId,
        // 인원도 다이제스트에 포함. 같은 키로 인원만 바꾼 요청은 재시도가 아니라 다른 요청이므로 키 재사용으로 거부
        attendedCount: attendedCount ?? null,
        scannerSessionId: scanner.sessionPublicId,
        scannerDeviceId: scanner.publicId,
      }));
      const existing = await transaction.idempotencyRecord.findUnique({
        where: { scope_keyDigest: { scope: "SCANNER_CHECK_IN", keyDigest: this.bytes(keyDigest) } },
      });
      if (existing !== null) {
        if (!this.equal(existing.requestDigest, requestDigest)) this.fail(409, "IDEMPOTENCY_KEY_REUSED");
        return { ...(existing.responseBody as unknown as CheckInOutcome), replayed: true };
      }

      // QR 다이제스트 또는 예약 ID로 대상 예약과 회차 위치 확인(잠금 전 조회)
      let booking: {
        id: bigint; public_id: string; session_id: bigint; status: string; seat_count: number;
        attendance_party: AttendanceParty; checked_in_at: Date | null; attended_count: number | null;
      } | undefined;
      let credential: { id: bigint; status: string; expires_at: Date } | undefined;
      let located: { bookingId: bigint; sessionId: bigint; credentialId: bigint | null } | undefined;
      if (source === "QR" && tokenDigest !== null) {
        const matches = await transaction.$queryRaw<Array<{ credential_id: bigint; booking_id: bigint; session_id: bigint }>>`
            select q.id credential_id,fb.id booking_id,fb.session_id
              from qr_credentials q join family_bookings fb on fb.id=q.family_booking_id
             where q.token_digest=${this.bytes(tokenDigest)}`;
        const match = matches[0];
        if (match !== undefined) located = { bookingId: match.booking_id, sessionId: match.session_id, credentialId: match.credential_id };
      } else if (source === "MANUAL" && familyBookingId !== null) {
        const matches = await transaction.$queryRaw<Array<{ id: bigint; session_id: bigint }>>`
          select id,session_id from family_bookings where public_id=${familyBookingId}::uuid`;
        const match = matches[0];
        if (match !== undefined) located = { bookingId: match.id, sessionId: match.session_id, credentialId: null };
      }
      if (located !== undefined) {
        // 전체 잠금 순서: 스캐너 → 회차 → 예약 → QR 자격
        // 조회 당시 회차와 스캐너 선택 회차를 ID 순으로 함께 잠근 뒤 예약의 실제 회차를 다시 판정
        // 동시에 예약 회차가 바뀌어도 다른 회차 예약을 잘못 입장 처리하지 않기 위함
        const sessionIds = [...new Set([located.sessionId, scanner.sessionId])]
          .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
        const lockedSessions = await transaction.$queryRaw<Array<{ id: bigint }>>`
          select id from seminar_sessions
           where id=any(${sessionIds}::bigint[])
           order by id for update`;
        if (lockedSessions.length !== sessionIds.length) this.fail(409, "SEMINAR_SESSION_NOT_FOUND");
        const bookings = await transaction.$queryRaw<Array<{
          id: bigint; public_id: string; session_id: bigint; status: string; seat_count: number;
          attendance_party: AttendanceParty; checked_in_at: Date | null; attended_count: number | null;
        }>>`select id,public_id,session_id,status,seat_count,attendance_party,checked_in_at,attended_count
              from family_bookings
             where id=${located.bookingId} for update`;
        booking = bookings[0];
        // 잠근 뒤 QR 자격이 여전히 같은 예약·토큰인지 확인. 아니면 예약을 찾지 못한 것으로 처리
        if (booking !== undefined && located.credentialId !== null && tokenDigest !== null) {
          const credentials = await transaction.$queryRaw<Array<{ id: bigint; status: string; expires_at: Date }>>`
            select id,status,expires_at from qr_credentials
             where id=${located.credentialId} and family_booking_id=${booking.id}
               and token_digest=${this.bytes(tokenDigest)} for update`;
          credential = credentials[0];
          if (credential === undefined) booking = undefined;
        }
      }

      let result = forcedResult ?? this.resultFor(source, scanner, booking, credential);

      // 실제 입장 인원 확정
      // 예약 인원과 무관하게 항상 되물음. 1명 예약에 두 명이 오거나 가족이 더 오는 경우가 있어,
      // 예약 인원을 실제 입장으로 단정하면 틀린 숫자가 조용히 쌓임
      // 인원을 받지 못하면 예약 상태·입장 인원은 바꾸지 않고 결과 이벤트만 남겨 스캐너에 되물음
      // 예약보다 많은 인원도 그대로 받음. 실제로 온 사람 수가 사실이며, 상한은 DB 제약(1~20)이 오타만 막음
      let recordedCount: number | null = null;
      if (result === "CHECKED_IN" && booking !== undefined) {
        if (attendedCount === undefined) result = "PARTY_SELECTION_REQUIRED";
        else recordedCount = attendedCount;
      }

      // 입장 확정: 예약 상태 변경, 예약 이벤트, 시트 반영 대기열 적재
      if (result === "CHECKED_IN" && booking !== undefined && recordedCount !== null) {
        const updated = await transaction.familyBooking.updateMany({
          where: { id: booking.id, status: "RESERVED", checkedInAt: null },
          data: {
            status: "CHECKED_IN",
            checkedInAt: new Date(),
            attendedCount: recordedCount,
            version: { increment: 1 },
            updatedAt: new Date(),
          },
        });
        if (updated.count !== 1) {
          // 경합에서 밀림. 이 호출은 아무것도 기록하지 않음
          result = "ALREADY_CHECKED_IN";
          recordedCount = null;
        } else {
          const bookingEvent = await transaction.bookingEvent.create({
            data: {
              familyBookingId: booking.id,
              eventType: "CHECKED_IN",
              actorSubject: actor.subject,
              safeMetadata: {
                source,
                attendedCount: recordedCount,
                ...scannerCheckInMetadata(scanner),
              },
            },
          });
          const delivery = await transaction.familyBooking.findUniqueOrThrow({
            where: { id: booking.id },
            select: {
              publicId: true, contactCiphertext: true, contactDigest: true, contactLast4: true,
              version: true, createdAt: true, attendanceParty: true, bookingSource: true,
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
          await this.sheetOutbox.enqueueBookingEvent(transaction, {
            eventId: bookingEvent.eventId, eventType: "CHECKED_IN", occurredAt: bookingEvent.occurredAt,
            seminarSessionPublicId: delivery.session.publicId, familyBookingPublicId: delivery.publicId,
            bookingVersion: delivery.version, bookingCreatedAt: delivery.createdAt,
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
      }
      // 판정 결과와 관계없이 입장 이벤트 기록
      const event = await transaction.checkInEvent.create({
        data: {
          familyBookingId: booking?.id ?? null,
          qrCredentialId: credential?.id ?? null,
          sessionId: scanner.sessionId,
          source,
          result,
          // seatCount는 예약 인원(기존 의미 유지). 실제 입장 인원은 메타데이터에 따로 남겨
          // 감사 로그에서 2명 예약·1명 입장을 구분할 수 있게 함
          seatCount: booking?.seat_count ?? 0,
          scannerDeviceId: scanner.id,
          gateCode: scanner.gateCode,
          actorSubject: actor.subject,
          idempotencyKeyDigest: this.bytes(keyDigest),
          safeMetadata: { ...scannerCheckInMetadata(scanner), attendedCount: recordedCount },
        },
      });
      const representativeStudent = booking === undefined
        ? null
        : await this.representativeStudent(transaction, booking.id);
      const outcome: CheckInOutcome = {
        eventId: event.eventId,
        result,
        replayed: false,
        familyBookingId: booking?.public_id ?? null,
        familySeatCount: booking?.seat_count ?? null,
        // 방금 기록한 인원, 또는 이미 입장한 예약의 기존 인원. 그 외에는 기록이 없어 null
        attendedCount: recordedCount ?? (result === "ALREADY_CHECKED_IN" ? booking?.attended_count ?? null : null),
        attendanceParty: booking?.attendance_party ?? null,
        representativeStudentName: representativeStudent?.studentName ?? null,
        seminarSessionId: scanner.sessionPublicId,
        deviceId: scanner.publicId,
        branch: scanner.branchCode,
        gateCode: scanner.gateCode,
        occurredAt: event.occurredAt,
        representativeStudent,
      };
      // 멱등 응답 24시간 보관
      await transaction.idempotencyRecord.create({
        data: {
          scope: "SCANNER_CHECK_IN", keyDigest: this.bytes(keyDigest), requestDigest: this.bytes(requestDigest),
          resourcePublicId: booking?.public_id ?? null, responseStatus: 200,
          responseBody: outcome as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
        },
      });
      return outcome;
    }, { isolationLevel: "ReadCommitted", timeout: 10_000, maxWait: 5_000 });
  }

  /**
   * 잠긴 예약·QR 자격의 현재 상태로 결과 판정. 업무 실패는 HTTP 오류가 아님
   *
   * 판정 순서: 예약 없음 → 회차 불일치 → 취소 → QR 폐기 → QR 만료 → 이미 입장 → 입장
   */
  private resultFor(
    source: CheckInSource,
    scanner: ScannerContext,
    booking: { session_id: bigint; status: string; checked_in_at: Date | null } | undefined,
    credential: { status: string; expires_at: Date } | undefined,
  ): CheckInResult {
    if (booking === undefined) return source === "QR" ? "INVALID_QR" : "RESERVATION_NOT_FOUND";
    if (booking.session_id !== scanner.sessionId) return "SESSION_MISMATCH";
    if (booking.status === "CANCELLED") return "CANCELLED";
    if (credential?.status === "REVOKED") return "REVOKED_QR";
    if (credential !== undefined && (credential.status === "EXPIRED" || credential.expires_at <= new Date())) return "EXPIRED_QR";
    if (booking.status === "CHECKED_IN" || booking.checked_in_at !== null) return "ALREADY_CHECKED_IN";
    return "CHECKED_IN";
  }

  /**
   * 활성 학생 스냅샷 중 입장 결과에 표시할 대표 1명
   *
   * @returns 대표 학생. 없으면 null
   */
  private async representativeStudent(transaction: Prisma.TransactionClient, familyBookingId: bigint) {
    const students = await transaction.familyBookingStudent.findMany({
      where: { familyBookingId, active: true },
      select: {
        participantType: true,
        sourceStudentNoSnapshot: true,
        studentNameSnapshot: true,
        branchCodeAtBooking: true,
        classNameSnapshot: true,
        schoolNameSnapshot: true,
        gradeSnapshot: true,
        unitNameSnapshot: true,
      },
    });
    return selectCheckInRepresentativeStudent(students);
  }

  /**
   * 읽기 경로의 스캐너 컨텍스트
   *
   * @throws {DomainError} 403 스캐너 아님, 401 기기 취소, 409 회차 미선택
   */
  private async context(actor: AuthenticatedActor): Promise<ScannerContext> {
    const device = await this.device(actor);
    if (device.selectedSession === null) this.fail(409, "SCANNER_SHIFT_REQUIRED");
    return {
      id: device.id,
      publicId: device.publicId,
      name: device.name,
      location: device.location,
      branchCode: device.branch.code,
      gateCode: device.gateCode,
      sessionId: device.selectedSession.id,
      sessionPublicId: device.selectedSession.publicId,
    };
  }

  /**
   * 변경 경로의 스캐너 컨텍스트. 트랜잭션의 첫 도메인 행 잠금(기기 행 FOR UPDATE)
   *
   * @throws {DomainError} 403 스캐너 아님, 401 기기 취소, 409 회차 미선택
   */
  private async contextForUpdate(transaction: Prisma.TransactionClient, actor: AuthenticatedActor): Promise<ScannerContext> {
    if (actor.role !== "SCANNER" || actor.scannerDeviceId === undefined) this.fail(403, "SCANNER_ROLE_REQUIRED");
    const rows = await transaction.$queryRaw<Array<{
      id: bigint; public_id: string; device_name: string; location: string | null;
      branch_code: string; gate_code: string;
      selected_session_id: bigint | null; session_public_id: string | null;
    }>>`select d.id,d.public_id,d.name device_name,d.location,b.code branch_code,d.gate_code,d.selected_session_id,
               ss.public_id session_public_id
          from scanner_devices d join branches b on b.id=d.branch_id
          left join seminar_sessions ss on ss.id=d.selected_session_id
         where d.public_id=${actor.scannerDeviceId}::uuid and d.status='ACTIVE'
         for update of d`;
    const device = rows[0];
    if (device === undefined) this.fail(401, "SCANNER_DEVICE_REVOKED");
    if (device.selected_session_id === null || device.session_public_id === null) this.fail(409, "SCANNER_SHIFT_REQUIRED");
    return {
      id: device.id,
      publicId: device.public_id,
      name: device.device_name,
      location: device.location,
      branchCode: device.branch_code,
      gateCode: device.gate_code,
      sessionId: device.selected_session_id,
      sessionPublicId: device.session_public_id,
    };
  }

  /**
   * 세션 스캐너 ID의 활성 기기 조회
   *
   * @throws {DomainError} 403 스캐너 아님, 401 기기 취소
   */
  private async device(actor: AuthenticatedActor) {
    if (actor.role !== "SCANNER" || actor.scannerDeviceId === undefined) this.fail(403, "SCANNER_ROLE_REQUIRED");
    const device = await this.prisma.scannerDevice.findFirst({
      where: { publicId: actor.scannerDeviceId, status: "ACTIVE" },
      select: {
        id: true, publicId: true, name: true, location: true, branchId: true, gateCode: true,
        branch: { select: { code: true } },
        selectedSession: { select: { id: true, publicId: true } },
      },
    });
    if (device === null) this.fail(401, "SCANNER_DEVICE_REVOKED");
    return device;
  }

  /**
   * 다이제스트 상수 시간 비교
   */
  private equal(left: Uint8Array, right: Uint8Array): boolean {
    const a = Buffer.from(left); const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Prisma Bytes 입력용 ArrayBuffer 기반 복사본
   */
  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy;
  }

  /**
   * JSON 객체 메타데이터. 객체가 아니면 빈 객체
   */
  private safeMetadata(value: Prisma.JsonValue): Readonly<Record<string, Prisma.JsonValue | undefined>> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Readonly<Record<string, Prisma.JsonValue | undefined>>;
  }

  /**
   * 메타데이터 문자열 값. 없거나 빈 문자열이면 null
   */
  private metadataText(metadata: Readonly<Record<string, Prisma.JsonValue | undefined>>, key: string): string | null {
    const value = metadata[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  /**
   * 요청 자체의 실패 발생. 업무 판정 결과 코드와 구분
   *
   * @throws {DomainError} 지정 상태·코드
   */
  private fail(status: number, code: string): never {
    throw new DomainError(status, code, "The check-in operation could not be completed.");
  }
}
