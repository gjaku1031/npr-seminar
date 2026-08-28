import { Injectable } from "@nestjs/common";
import { DomainError } from "../../common/errors/domain-error.js";
import { IdempotencyService } from "../../common/idempotency/idempotency.service.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

type BranchCode = "SONGPA" | "WIRYE" | "GWANGJIN";
interface SessionInput {
  readonly scope: "ALL" | "BRANCH";
  readonly branch: BranchCode | null;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly location: string;
  readonly bookingOpensAt: string;
  readonly bookingClosesAt: string;
  readonly guestBookingEnabled?: boolean;
}

export interface SessionOperationsSummary {
  activeBookingCount: number;
  checkedInBookingCount: number;
  uncheckedBookingCount: number;
  cancelledBookingCount: number;
  noShowBookingCount: number;
  /** 예약 기준 예상 참석 인원(모/부 = 2). 실제로 온 사람 수가 아니다. */
  attendeeCount: number;
  /**
   * **실제로 입장한 사람 수.** 게이트에서 확정한 인원의 합이다.
   *
   * attendeeCount 와 다르다: 2명 예약에 한 분만 오면 예상은 2, 실제는 1이다. 운영 중에
   * "지금 안에 몇 명 있나"를 답하는 것은 이 값뿐이다.
   */
  attendedPeopleCount: number;
}

/** 세미나·회차를 조회하고 변경 요청은 {@link IdempotencyService}의 트랜잭션에서 처리한다. */
@Injectable()
export class SeminarsService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** 출간된 세미나의 열린 회차를 시작 시각순으로 반환하고 현재 시각 기준 예약 가능 상태를 계산한다. */
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

  /** 관리자의 세미나 목록을 생성 역순으로 반환하며 상태가 없으면 전체 상태를 조회한다. */
  public async list(status?: string) {
    const rows = await this.prisma.seminar.findMany({ where: status === undefined ? {} : { status }, orderBy: { createdAt: "desc" } });
    return { items: rows.map((row) => this.seminar(row)), page: this.page(rows.length) };
  }

  /** 세미나 상세를 반환하며 해당 UUID가 없으면 {@link DomainError} 404를 던진다. */
  public async get(seminarId: string) {
    const row = await this.prisma.seminar.findUnique({ where: { publicId: seminarId } });
    if (row === null) this.fail(404, "SEMINAR_NOT_FOUND");
    return this.seminar(row);
  }

  /** 멱등 키와 생성 입력으로 세미나를 저장하고 201 응답용 투영을 반환한다. */
  public create(input: { title: string; description?: string | null }, key: string) {
    return this.idempotency.execute("SEMINAR_CREATE", key, input, async (transaction) => {
      const row = await transaction.seminar.create({ data: { title: input.title, description: input.description ?? null } });
      return this.seminar(row);
    }, 201);
  }

  /** 버전 조건으로 보관되지 않은 세미나를 수정한다. 대상·버전이 맞지 않으면 409를 던진다. */
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

  /** 기대 버전이 일치하는 세미나를 보관하고 갱신된 투영을 반환한다. 불일치 시 409를 던진다. */
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

  /** 회차와 상태별 예약 요약을 반환한다. 테스트 예약도 집계하며 세미나가 없으면 404를 던진다. */
  public async listSessions(seminarId: string) {
    const exists = await this.prisma.seminar.count({ where: { publicId: seminarId } });
    if (exists !== 1) this.fail(404, "SEMINAR_NOT_FOUND");
    const rows = await this.prisma.seminarSession.findMany({
      where: { seminar: { publicId: seminarId } }, include: { seminar: true, branch: true }, orderBy: { startsAt: "asc" },
    });
    const statusCounts = rows.length === 0 ? [] : await this.prisma.familyBooking.groupBy({
      by: ["sessionId", "status", "attendanceParty"],
      // 테스트 예약도 집계에 **포함**한다 — 당일 전에 숫자가 실제로 움직이는지 확인해야 하고,
      // 그 확인은 실제 화면의 실제 집계로만 된다. 확인이 끝나면 그 예약을 취소해 정리한다.
      // (구글시트 투영과 문자 대상은 여전히 분리한다 — 그건 집계가 아니라 외부로 나가는 것이다.)
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
          // 실제 입장 인원은 예약 인원에서 파생하지 않는다 — 게이트가 확정한 값만 더한다.
          // 도입 전 입장 건은 마이그레이션이 예약 인원으로 채웠으므로 null 이 남지 않는다.
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

  /** 회차 상세 투영을 반환하며 해당 UUID가 없으면 404를 던진다. */
  public async getSession(sessionId: string) {
    const row = await this.prisma.seminarSession.findUnique({ where: { publicId: sessionId }, include: { seminar: true, branch: true } });
    if (row === null) this.fail(404, "SEMINAR_SESSION_NOT_FOUND");
    return this.session(row);
  }

  /**
   * 멱등 트랜잭션에서 회차를 초안으로 생성하고 201 응답용 투영을 반환한다.
   * 세미나가 없거나 보관 중이면 404, 범위·지점 또는 시간 순서가 유효하지 않으면 400을 던진다.
   * 관리자 식별자가 있으면 게스트 예약 정책의 생성 감사 기록을 함께 저장한다.
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
   * 멱등 트랜잭션에서 회차 행을 FOR UPDATE로 잠근 뒤 버전과 범위·지점 쌍을 검사한다.
   * 회차 부재는 404, 버전 충돌은 409, 잘못된 범위·지점 입력은 400을 던진다.
   * 게스트 예약 허용 값이 바뀌면 감사 기록을 저장하고 갱신된 회차를 반환한다.
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
   * 멱등 트랜잭션에서 회차 버전과 예약 부재를 확인해 보관한다.
   * 회차 부재는 404, 버전 충돌 또는 예약 존재는 409를 던지며 명시적 행 잠금은 사용하지 않는다.
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

  /** 전체 지점이면 null을, 지점 회차면 활성 지점 ID를 반환한다. 잘못된 쌍·지점은 400을 던진다. */
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

  /** 회차 시작·종료와 예약 시작·종료의 각 순서만 검사하며 잘못되면 400을 던진다. */
  private validateTimes(input: SessionInput): void {
    if (new Date(input.startsAt) >= new Date(input.endsAt)
      || new Date(input.bookingOpensAt) >= new Date(input.bookingClosesAt)) this.fail(400, "SESSION_TIME_INVALID");
  }

  /** 세미나 공개 ID와 숫자 버전을 관리자 응답으로 투영한다. */
  private seminar(row: { publicId: string; title: string; description: string | null; status: string; version: bigint; createdAt: Date; updatedAt: Date }) {
    return { seminarId: row.publicId, title: row.title, description: row.description, status: row.status, version: Number(row.version), createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  /** 회차의 공개 ID·지점·예약 기간과 숫자 버전을 응답으로 투영한다. */
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

  /** 연결된 예약이 없는 회차의 운영 지표를 모두 0으로 반환한다. */
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

  private page(totalItems: number) { return { page: 1, pageSize: totalItems, totalItems, totalPages: totalItems === 0 ? 0 : 1 }; }
  /** 지정한 상태와 코드의 {@link DomainError}를 던지며 정상 반환하지 않는다. */
  private fail(status: number, code: string): never { throw new DomainError(status, code, "The seminar operation could not be completed."); }
}
