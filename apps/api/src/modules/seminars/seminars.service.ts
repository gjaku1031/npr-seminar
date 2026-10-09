import { Injectable } from "@nestjs/common";
import { DomainError } from "../../common/errors/domain-error.js";
import { IdempotencyService } from "../../common/idempotency/idempotency.service.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

/**
 * 지점 코드
 */
type BranchCode = "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

/**
 * 회차 생성·변경 입력
 */
interface SessionInput {
  /**
   * 대상 범위
   */
  readonly scope: "ALL" | "BRANCH";

  /**
   * 지점. BRANCH일 때만
   */
  readonly branch: BranchCode | null;

  /**
   * 시작 시각(ISO 8601)
   */
  readonly startsAt: string;

  /**
   * 종료 시각(ISO 8601)
   */
  readonly endsAt: string;

  /**
   * 장소
   */
  readonly location: string;

  /**
   * 예약 시작 시각
   */
  readonly bookingOpensAt: string;

  /**
   * 예약 마감 시각
   */
  readonly bookingClosesAt: string;

  /**
   * 비재원생 예약 허용 여부. 생성 시 생략하면 false
   */
  readonly guestBookingEnabled?: boolean;
}

/**
 * 회차 예약 운영 요약
 */
export interface SessionOperationsSummary {
  /**
   * 활성 예약 수. 예약·입장 합
   */
  activeBookingCount: number;

  /**
   * 입장한 예약 수
   */
  checkedInBookingCount: number;

  /**
   * 미입장 예약 수
   */
  uncheckedBookingCount: number;

  /**
   * 취소 예약 수
   */
  cancelledBookingCount: number;

  /**
   * 미참석 예약 수
   */
  noShowBookingCount: number;

  /**
   * 예약 기준 예상 참석 인원(모/부 = 2). 실제 온 사람 수가 아님
   */
  attendeeCount: number;

  /**
   * 실제 입장 인원. 게이트에서 확정한 인원의 합
   *
   * attendeeCount와 다름. 2명 예약에 한 명만 오면 예상 2, 실제 1
   * 운영 중 현재 입장 인원은 이 값으로만 알 수 있음
   */
  attendedPeopleCount: number;
}

/**
 * 설명회·회차 조회와 관리
 *
 * 변경 요청은 IdempotencyService 트랜잭션 안에서 처리
 */
@Injectable()
export class SeminarsService {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * 멱등 처리
     */
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * 공개 회차 조회
   *
   * 공개된 설명회의 OPEN 회차를 시작 시각순으로 반환하고 현재 시각 기준 예약 가능 상태 계산
   * 예약 시작·마감이 없으면 회차 시작 시각 기준
   *
   * @param branch 지정하면 전 지점 회차와 해당 지점 회차만
   */
  public async listPublic(branch?: BranchCode) {
    const now = new Date();
    const rows = await this.prisma.seminarSession.findMany({
      where: {
        seminar: { status: "PUBLISHED" }, status: "OPEN",
        ...(branch === undefined ? {} : { OR: [{ scope: "ALL" }, { scope: "BRANCH", branch: { code: branch } }] }),
      },
      include: { seminar: true, branch: true },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    });
    return {
      items: rows.map((row) => {
        const availability = now < (row.bookingOpensAt ?? row.startsAt) ? "NOT_OPEN"
          : now > (row.bookingClosesAt ?? row.startsAt) ? "CLOSED" : "AVAILABLE";
        return {
          seminarId: row.seminar.publicId, seminarSessionId: row.publicId, seminarTitle: row.seminar.title,
          scope: row.scope, branch: row.branch?.code ?? null, startsAt: row.startsAt, endsAt: row.endsAt,
          location: row.place, bookingOpensAt: row.bookingOpensAt, bookingClosesAt: row.bookingClosesAt,
          guestBookingEnabled: row.guestBookingEnabled, availability,
        };
      }),
      page: this.page(rows.length),
    };
  }

  /**
   * 설명회 목록. 생성 역순
   *
   * @param status 상태 필터. 생략하면 전체
   */
  public async list(status?: string) {
    const rows = await this.prisma.seminar.findMany({ where: status === undefined ? {} : { status }, orderBy: { createdAt: "desc" } });
    return { items: rows.map((row) => this.seminar(row)), page: this.page(rows.length) };
  }

  /**
   * 설명회 상세
   *
   * @throws {DomainError} 404 SEMINAR_NOT_FOUND
   */
  public async get(seminarId: string) {
    const row = await this.prisma.seminar.findUnique({ where: { publicId: seminarId } });
    if (row === null) this.fail(404, "SEMINAR_NOT_FOUND");
    return this.seminar(row);
  }

  /**
   * 설명회 생성 후 201 응답
   */
  public create(input: { title: string; description?: string | null }, key: string) {
    return this.idempotency.execute("SEMINAR_CREATE", key, input, async (transaction) => {
      const row = await transaction.seminar.create({ data: { title: input.title, description: input.description ?? null } });
      return this.seminar(row);
    }, 201);
  }

  /**
   * 설명회 변경
   *
   * 보관되지 않았고 버전이 같은 행만 갱신
   *
   * @throws {DomainError} 409 대상 없음·버전 불일치·보관됨
   */
  public update(seminarId: string, input: { expectedVersion: number; title?: string; description?: string | null; status?: string }, key: string) {
    return this.idempotency.execute("SEMINAR_UPDATE", key, { seminarId, ...input }, async (transaction) => {
      const changed = await transaction.seminar.updateMany({
        where: { publicId: seminarId, version: BigInt(input.expectedVersion), status: { not: "ARCHIVED" } },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.status === undefined ? {} : { status: input.status }),
          version: { increment: 1 }, updatedAt: new Date(),
        },
      });
      if (changed.count !== 1) this.fail(409, "SEMINAR_VERSION_CONFLICT");
      return this.seminar(await transaction.seminar.findUniqueOrThrow({ where: { publicId: seminarId } }));
    });
  }

  /**
   * 설명회 보관
   *
   * @throws {DomainError} 409 대상 없음·버전 불일치
   */
  public archive(seminarId: string, expectedVersion: number, reason: string, key: string) {
    return this.idempotency.execute("SEMINAR_ARCHIVE", key, { seminarId, expectedVersion, reason }, async (transaction) => {
      const changed = await transaction.seminar.updateMany({
        where: { publicId: seminarId, version: BigInt(expectedVersion) },
        data: { status: "ARCHIVED", version: { increment: 1 }, updatedAt: new Date() },
      });
      if (changed.count !== 1) this.fail(409, "SEMINAR_VERSION_CONFLICT");
      return this.seminar(await transaction.seminar.findUniqueOrThrow({ where: { publicId: seminarId } }));
    });
  }

  /**
   * 설명회의 회차와 상태별 예약 운영 요약
   *
   * @throws {DomainError} 404 설명회 없음
   */
  public async listSessions(seminarId: string) {
    const exists = await this.prisma.seminar.count({ where: { publicId: seminarId } });
    if (exists !== 1) this.fail(404, "SEMINAR_NOT_FOUND");
    const rows = await this.prisma.seminarSession.findMany({
      where: { seminar: { publicId: seminarId } }, include: { seminar: true, branch: true }, orderBy: { startsAt: "asc" },
    });
    const statusCounts = rows.length === 0 ? [] : await this.prisma.familyBooking.groupBy({
      by: ["sessionId", "status", "attendanceParty"],
      // 테스트 예약도 집계에 포함함. 당일 전에 실제 화면 집계가 움직이는지 확인해야 하고, 확인 후 예약을 취소해 정리
      // 시트 반영과 문자 대상에서는 계속 분리함. 그쪽은 집계가 아니라 외부로 나가는 동작
      where: { sessionId: { in: rows.map((row) => row.id) } },
      _count: { _all: true },
      _sum: { attendedCount: true },
    });
    const summaries = new Map(rows.map((row) => [row.id.toString(), this.emptyOperationsSummary()]));
    for (const statusCount of statusCounts) {
      const summary = summaries.get(statusCount.sessionId.toString());
      if (summary === undefined) continue;
      const count = statusCount._count._all;
      switch (statusCount.status) {
        case "RESERVED":
          summary.activeBookingCount += count;
          summary.uncheckedBookingCount += count;
          summary.attendeeCount += statusCount.attendanceParty === "BOTH" ? count * 2 : count;
          break;
        case "CHECKED_IN":
          summary.activeBookingCount += count;
          summary.checkedInBookingCount += count;
          summary.attendeeCount += statusCount.attendanceParty === "BOTH" ? count * 2 : count;
          // 실제 입장 인원은 예약 인원에서 파생하지 않고 게이트가 확정한 값만 더함
          // 도입 전 입장 건은 마이그레이션이 예약 인원으로 채워 null이 남지 않음
          summary.attendedPeopleCount += statusCount._sum?.attendedCount ?? 0;
          break;
        case "CANCELLED":
          summary.cancelledBookingCount += count;
          break;
        case "NO_SHOW":
          summary.noShowBookingCount += count;
          break;
      }
    }
    return {
      items: rows.map((row) => ({
        ...this.session(row),
        operationsSummary: summaries.get(row.id.toString()) ?? this.emptyOperationsSummary(),
      })),
      page: this.page(rows.length),
    };
  }

  /**
   * 회차 상세
   *
   * @throws {DomainError} 404 SEMINAR_SESSION_NOT_FOUND
   */
  public async getSession(sessionId: string) {
    const row = await this.prisma.seminarSession.findUnique({ where: { publicId: sessionId }, include: { seminar: true, branch: true } });
    if (row === null) this.fail(404, "SEMINAR_SESSION_NOT_FOUND");
    return this.session(row);
  }

  /**
   * 회차 생성. DRAFT 상태로 저장 후 201 응답
   *
   * 관리자 식별자가 있으면 비재원생 예약 정책 생성 감사를 함께 저장
   *
   * @param actorSubject 감사 주체. 없으면 null
   * @throws {DomainError} 404 설명회 없음·보관됨, 400 범위·지점·시각 순서 오류
   */
  public createSession(seminarId: string, input: SessionInput, key: string, actorSubject: string | null = null) {
    return this.idempotency.execute("SESSION_CREATE", key, { seminarId, ...input }, async (transaction) => {
      const seminar = await transaction.seminar.findUnique({ where: { publicId: seminarId } });
      if (seminar === null || seminar.status === "ARCHIVED") this.fail(404, "SEMINAR_NOT_FOUND");
      const branchId = await this.branchId(transaction, input.scope, input.branch);
      this.validateTimes(input);
      const row = await transaction.seminarSession.create({
        data: {
          seminarId: seminar.id, branchId, scope: input.scope, title: "회차", place: input.location,
          startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt),
          bookingOpensAt: new Date(input.bookingOpensAt), bookingClosesAt: new Date(input.bookingClosesAt),
          guestBookingEnabled: input.guestBookingEnabled ?? false,
          status: "DRAFT",
        },
        include: { seminar: true, branch: true },
      });
      if (actorSubject !== null) await transaction.authAudit.create({ data: {
        actorSubject,
        eventType: "SESSION_GUEST_POLICY",
        resultCode: "CREATED",
        safeMetadata: { seminarSessionId: row.publicId, oldValue: null, newValue: row.guestBookingEnabled },
      } });
      return this.session(row);
    }, 201);
  }

  /**
   * 회차 변경
   *
   * 회차 행 FOR UPDATE 잠금 후 버전 확인. 범위와 지점은 함께 지정해야 함
   * 비재원생 예약 허용 값이 바뀌면 감사 기록
   * 시각 변경은 순서 검사를 하지 않음
   *
   * @throws {DomainError} 404 회차 없음, 409 버전 충돌, 400 범위·지점 입력 오류
   */
  public updateSession(sessionId: string, input: Partial<SessionInput> & { expectedVersion: number; status?: string }, key: string, actorSubject: string | null = null) {
    return this.idempotency.execute("SESSION_UPDATE", key, { sessionId, ...input }, async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: bigint; scope: string; branch_id: bigint | null; version: bigint; guest_booking_enabled: boolean }>>`
        select id,scope,branch_id,version,guest_booking_enabled from seminar_sessions where public_id=${sessionId}::uuid for update`;
      const current = locked[0];
      if (current === undefined) this.fail(404, "SEMINAR_SESSION_NOT_FOUND");
      if (current.version !== BigInt(input.expectedVersion)) this.fail(409, "SEMINAR_SESSION_VERSION_CONFLICT");
      if ((input.scope === undefined) !== (input.branch === undefined)) this.fail(400, "SESSION_SCOPE_BRANCH_REQUIRED_TOGETHER");
      const branchId = input.scope === undefined ? current.branch_id : await this.branchId(transaction, input.scope, input.branch ?? null);
      await transaction.seminarSession.update({
        where: { id: current.id },
        data: {
          ...(input.scope === undefined ? {} : { scope: input.scope, branchId }),
          ...(input.startsAt === undefined ? {} : { startsAt: new Date(input.startsAt) }),
          ...(input.endsAt === undefined ? {} : { endsAt: new Date(input.endsAt) }),
          ...(input.location === undefined ? {} : { place: input.location }),
          ...(input.bookingOpensAt === undefined ? {} : { bookingOpensAt: new Date(input.bookingOpensAt) }),
          ...(input.bookingClosesAt === undefined ? {} : { bookingClosesAt: new Date(input.bookingClosesAt) }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.guestBookingEnabled === undefined ? {} : { guestBookingEnabled: input.guestBookingEnabled }),
          version: { increment: 1 }, updatedAt: new Date(),
        },
      });
      if (input.guestBookingEnabled !== undefined && input.guestBookingEnabled !== current.guest_booking_enabled) {
        await transaction.authAudit.create({ data: {
          actorSubject,
          eventType: "SESSION_GUEST_POLICY",
          resultCode: "UPDATED",
          safeMetadata: {
            seminarSessionId: sessionId,
            oldValue: current.guest_booking_enabled,
            newValue: input.guestBookingEnabled,
          },
        } });
      }
      const row = await transaction.seminarSession.findUniqueOrThrow({ where: { id: current.id }, include: { seminar: true, branch: true } });
      return this.session(row);
    });
  }

  /**
   * 회차 보관
   *
   * 버전 일치와 예약 없음 확인. 명시적 행 잠금은 사용하지 않음
   *
   * @throws {DomainError} 404 회차 없음, 409 버전 충돌·예약 있음
   */
  public archiveSession(sessionId: string, expectedVersion: number, reason: string, key: string) {
    return this.idempotency.execute("SESSION_ARCHIVE", key, { sessionId, expectedVersion, reason }, async (transaction) => {
      const row = await transaction.seminarSession.findUnique({ where: { publicId: sessionId } });
      if (row === null) this.fail(404, "SEMINAR_SESSION_NOT_FOUND");
      if (row.version !== BigInt(expectedVersion)) this.fail(409, "SEMINAR_SESSION_VERSION_CONFLICT");
      if (await transaction.familyBooking.count({ where: { sessionId: row.id } }) > 0) this.fail(409, "SESSION_HAS_BOOKINGS");
      const updated = await transaction.seminarSession.update({
        where: { id: row.id }, data: { status: "ARCHIVED", version: { increment: 1 }, updatedAt: new Date() },
        include: { seminar: true, branch: true },
      });
      return this.session(updated);
    });
  }

  /**
   * 범위·지점 조합 확인과 지점 ID
   *
   * @returns 전 지점이면 null, 지점 회차면 활성 지점 ID
   * @throws {DomainError} 400 잘못된 조합·비활성 지점
   */
  private async branchId(transaction: Prisma.TransactionClient, scope: "ALL" | "BRANCH", branch: BranchCode | null) {
    if (scope === "ALL") {
      if (branch !== null) this.fail(400, "SESSION_SCOPE_BRANCH_INVALID");
      return null;
    }
    if (branch === null) this.fail(400, "SESSION_SCOPE_BRANCH_INVALID");
    const row = await transaction.branch.findUnique({ where: { code: branch } });
    if (row === null || !row.active) this.fail(400, "BRANCH_NOT_FOUND");
    return row.id;
  }

  /**
   * 회차 시작<종료, 예약 시작<마감 순서 확인. 두 구간 사이 관계는 검사하지 않음
   *
   * @throws {DomainError} 400 SESSION_TIME_INVALID
   */
  private validateTimes(input: SessionInput): void {
    if (new Date(input.startsAt) >= new Date(input.endsAt)
      || new Date(input.bookingOpensAt) >= new Date(input.bookingClosesAt)) this.fail(400, "SESSION_TIME_INVALID");
  }

  /**
   * 설명회 응답 변환. 버전은 숫자
   */
  private seminar(row: { publicId: string; title: string; description: string | null; status: string; version: bigint; createdAt: Date; updatedAt: Date }) {
    return { seminarId: row.publicId, title: row.title, description: row.description, status: row.status, version: Number(row.version), createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  /**
   * 회차 응답 변환. 버전은 숫자
   */
  private session(row: {
    publicId: string; seminar: { publicId: string }; scope: string; startsAt: Date; endsAt: Date; place: string;
    bookingOpensAt: Date | null; bookingClosesAt: Date | null; guestBookingEnabled: boolean; status: string; version: bigint;
    createdAt: Date; updatedAt: Date; branch: { code: string } | null;
  }) {
    return {
      seminarSessionId: row.publicId, seminarId: row.seminar.publicId, scope: row.scope, branch: row.branch?.code ?? null,
      startsAt: row.startsAt, endsAt: row.endsAt, location: row.place,
      bookingOpensAt: row.bookingOpensAt, bookingClosesAt: row.bookingClosesAt,
      guestBookingEnabled: row.guestBookingEnabled, status: row.status,
      version: Number(row.version), createdAt: row.createdAt, updatedAt: row.updatedAt,
    };
  }

  /**
   * 예약이 없는 회차의 0 요약
   */
  private emptyOperationsSummary(): SessionOperationsSummary {
    return {
      activeBookingCount: 0,
      checkedInBookingCount: 0,
      uncheckedBookingCount: 0,
      cancelledBookingCount: 0,
      noShowBookingCount: 0,
      attendeeCount: 0,
      attendedPeopleCount: 0,
    };
  }

  /**
   * 단일 페이지 응답 정보
   */
  private page(totalItems: number) { return { page: 1, pageSize: totalItems, totalItems, totalPages: totalItems === 0 ? 0 : 1 }; }

  /**
   * 설명회 작업 오류 발생
   *
   * @throws {DomainError} 지정 상태·코드
   */
  private fail(status: number, code: string): never { throw new DomainError(status, code, "The seminar operation could not be completed."); }
}
