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
  readonly capacity: number;
  readonly guestBookingEnabled?: boolean;
}

export interface SessionOperationsSummary {
  activeBookingCount: number;
  checkedInBookingCount: number;
  uncheckedBookingCount: number;
  cancelledBookingCount: number;
  noShowBookingCount: number;
}

@Injectable()
export class SeminarsService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  public async listPublic(branch?: BranchCode) {
    const now = new Date();
    const rows = await this.prisma.seminarSession.findMany({
      where: {
        seminar: { status: "PUBLISHED" }, status: "OPEN",
        ...(branch === undefined ? {} : { OR: [{ scope: "ALL" }, { scope: "BRANCH", branch: { code: branch } }] }),
      },
      include: { seminar: true, branch: true, capacity: true },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    });
    return {
      items: rows.map((row) => {
        const remaining = Math.max(0, (row.capacity?.capacity ?? 0) - (row.capacity?.reservedCount ?? 0));
        const availability = now < (row.bookingOpensAt ?? row.startsAt) ? "NOT_OPEN"
          : now > (row.bookingClosesAt ?? row.startsAt) ? "CLOSED"
            : remaining === 0 ? "FULL" : "AVAILABLE";
        return {
          seminarId: row.seminar.publicId, seminarSessionId: row.publicId, seminarTitle: row.seminar.title,
          scope: row.scope, branch: row.branch?.code ?? null, startsAt: row.startsAt, endsAt: row.endsAt,
          location: row.place, bookingOpensAt: row.bookingOpensAt, bookingClosesAt: row.bookingClosesAt,
          guestBookingEnabled: row.guestBookingEnabled, availability, remainingCapacity: remaining,
        };
      }),
      page: this.page(rows.length),
    };
  }

  public async list(status?: string) {
    const rows = await this.prisma.seminar.findMany({ where: status === undefined ? {} : { status }, orderBy: { createdAt: "desc" } });
    return { items: rows.map((row) => this.seminar(row)), page: this.page(rows.length) };
  }

  public async get(seminarId: string) {
    const row = await this.prisma.seminar.findUnique({ where: { publicId: seminarId } });
    if (row === null) this.fail(404, "SEMINAR_NOT_FOUND");
    return this.seminar(row);
  }

  public create(input: { title: string; description?: string | null }, key: string) {
    return this.idempotency.execute("SEMINAR_CREATE", key, input, async (transaction) => {
      const row = await transaction.seminar.create({ data: { title: input.title, description: input.description ?? null } });
      return this.seminar(row);
    }, 201);
  }

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

  public async listSessions(seminarId: string) {
    const exists = await this.prisma.seminar.count({ where: { publicId: seminarId } });
    if (exists !== 1) this.fail(404, "SEMINAR_NOT_FOUND");
    const rows = await this.prisma.seminarSession.findMany({
      where: { seminar: { publicId: seminarId } }, include: { seminar: true, branch: true, capacity: true }, orderBy: { startsAt: "asc" },
    });
    const statusCounts = rows.length === 0 ? [] : await this.prisma.familyBooking.groupBy({
      by: ["sessionId", "status"],
      where: { sessionId: { in: rows.map((row) => row.id) } },
      _count: { _all: true },
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
          break;
        case "CHECKED_IN":
          summary.activeBookingCount += count;
          summary.checkedInBookingCount += count;
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

  public async getSession(sessionId: string) {
    const row = await this.prisma.seminarSession.findUnique({ where: { publicId: sessionId }, include: { seminar: true, branch: true, capacity: true } });
    if (row === null) this.fail(404, "SEMINAR_SESSION_NOT_FOUND");
    return this.session(row);
  }

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
          status: "DRAFT", capacity: { create: { capacity: input.capacity } },
        },
        include: { seminar: true, branch: true, capacity: true },
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

  public updateSession(sessionId: string, input: Partial<SessionInput> & { expectedVersion: number; status?: string }, key: string, actorSubject: string | null = null) {
    return this.idempotency.execute("SESSION_UPDATE", key, { sessionId, ...input }, async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: bigint; scope: string; branch_id: bigint | null; version: bigint; guest_booking_enabled: boolean }>>`
        select id,scope,branch_id,version,guest_booking_enabled from seminar_sessions where public_id=${sessionId}::uuid for update`;
      const current = locked[0];
      if (current === undefined) this.fail(404, "SEMINAR_SESSION_NOT_FOUND");
      if (current.version !== BigInt(input.expectedVersion)) this.fail(409, "SEMINAR_SESSION_VERSION_CONFLICT");
      if ((input.scope === undefined) !== (input.branch === undefined)) this.fail(400, "SESSION_SCOPE_BRANCH_REQUIRED_TOGETHER");
      const branchId = input.scope === undefined ? current.branch_id : await this.branchId(transaction, input.scope, input.branch ?? null);
      const capacity = await transaction.sessionCapacity.findUniqueOrThrow({ where: { sessionId: current.id } });
      if (input.capacity !== undefined && input.capacity < capacity.reservedCount) this.fail(409, "CAPACITY_BELOW_RESERVED");
      if (input.capacity !== undefined) await transaction.sessionCapacity.update({
        where: { sessionId: current.id }, data: { capacity: input.capacity, version: { increment: 1 }, updatedAt: new Date() },
      });
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
      const row = await transaction.seminarSession.findUniqueOrThrow({ where: { id: current.id }, include: { seminar: true, branch: true, capacity: true } });
      return this.session(row);
    });
  }

  public archiveSession(sessionId: string, expectedVersion: number, reason: string, key: string) {
    return this.idempotency.execute("SESSION_ARCHIVE", key, { sessionId, expectedVersion, reason }, async (transaction) => {
      const row = await transaction.seminarSession.findUnique({ where: { publicId: sessionId }, include: { capacity: true } });
      if (row === null) this.fail(404, "SEMINAR_SESSION_NOT_FOUND");
      if (row.version !== BigInt(expectedVersion)) this.fail(409, "SEMINAR_SESSION_VERSION_CONFLICT");
      if ((row.capacity?.reservedCount ?? 0) > 0) this.fail(409, "SESSION_HAS_BOOKINGS");
      const updated = await transaction.seminarSession.update({
        where: { id: row.id }, data: { status: "ARCHIVED", version: { increment: 1 }, updatedAt: new Date() },
        include: { seminar: true, branch: true, capacity: true },
      });
      return this.session(updated);
    });
  }

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

  private validateTimes(input: SessionInput): void {
    if (new Date(input.startsAt) >= new Date(input.endsAt)
      || new Date(input.bookingOpensAt) >= new Date(input.bookingClosesAt)) this.fail(400, "SESSION_TIME_INVALID");
  }

  private seminar(row: { publicId: string; title: string; description: string | null; status: string; version: bigint; createdAt: Date; updatedAt: Date }) {
    return { seminarId: row.publicId, title: row.title, description: row.description, status: row.status, version: Number(row.version), createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  private session(row: {
    publicId: string; seminar: { publicId: string }; scope: string; startsAt: Date; endsAt: Date; place: string;
    bookingOpensAt: Date | null; bookingClosesAt: Date | null; guestBookingEnabled: boolean; status: string; version: bigint;
    createdAt: Date; updatedAt: Date; branch: { code: string } | null;
    capacity: { capacity: number; reservedCount: number; checkedInCount: number; version: bigint } | null;
  }) {
    const capacity = row.capacity!;
    return {
      seminarSessionId: row.publicId, seminarId: row.seminar.publicId, scope: row.scope, branch: row.branch?.code ?? null,
      startsAt: row.startsAt, endsAt: row.endsAt, location: row.place,
      bookingOpensAt: row.bookingOpensAt, bookingClosesAt: row.bookingClosesAt,
      guestBookingEnabled: row.guestBookingEnabled, status: row.status,
      capacity: { capacity: capacity.capacity, reservedCount: capacity.reservedCount, checkedInCount: capacity.checkedInCount,
        remainingCount: Math.max(0, capacity.capacity - capacity.reservedCount), version: Number(capacity.version) },
      version: Number(row.version), createdAt: row.createdAt, updatedAt: row.updatedAt,
    };
  }

  private emptyOperationsSummary(): SessionOperationsSummary {
    return {
      activeBookingCount: 0,
      checkedInBookingCount: 0,
      uncheckedBookingCount: 0,
      cancelledBookingCount: 0,
      noShowBookingCount: 0,
    };
  }

  private page(totalItems: number) { return { page: 1, pageSize: totalItems, totalItems, totalPages: totalItems === 0 ? 0 : 1 }; }
  private fail(status: number, code: string): never { throw new DomainError(status, code, "The seminar operation could not be completed."); }
}
