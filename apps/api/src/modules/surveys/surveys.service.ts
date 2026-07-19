import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { IdempotencyService } from "../../common/idempotency/idempotency.service.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { BookingProofService } from "../family-bookings/otp-proof.port.js";
import { canonicalUnitName } from "../student-sync/student-display-normalizer.js";
import { currentOrHistoricMathHomeroomTeacher } from "../student-sync/student-homeroom-policy.js";

export interface SubmitSurveyInput {
  readonly rating: number;
  readonly comment?: string;
  readonly photoAttached: boolean;
  readonly photoName?: string;
}

@Injectable()
export class SurveysService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly bookingProof: BookingProofService,
    private readonly phoneProtector: PhoneProtector,
  ) {}

  public async submit(familyBookingId: string, input: SubmitSurveyInput, proofValue: string, key: string) {
    const comment = input.comment?.normalize("NFC").trim() || null;
    const photoName = input.photoName?.normalize("NFC").trim() || null;
    if ((input.photoAttached && (photoName === null || /[/\\\0]/u.test(photoName)))
      || (!input.photoAttached && photoName !== null)) this.fail(400, "SURVEY_PHOTO_METADATA_INVALID");
    const proofDigest = createHash("sha256").update(proofValue).digest("base64url");
    const result = await this.idempotency.executeWithReplay(
      "SURVEY_RESPONSE_SUBMIT",
      key,
      { familyBookingId, rating: input.rating, comment, photoAttached: input.photoAttached, photoName, proofDigest },
      async (transaction) => {
        const bookings = await transaction.$queryRaw<Array<{
          id: bigint; public_id: string; session_id: bigint; session_public_id: string;
          status: string; contact_digest: Uint8Array; ends_at: Date;
        }>>`select fb.id,fb.public_id,fb.session_id,ss.public_id session_public_id,
                   fb.status,fb.contact_digest,ss.ends_at
              from family_bookings fb join seminar_sessions ss on ss.id=fb.session_id
             where fb.public_id=${familyBookingId}::uuid for update of fb`;
        const booking = bookings[0];
        if (booking === undefined) this.fail(404, "FAMILY_BOOKING_NOT_FOUND");
        const proof = await this.bookingProof.consume(transaction, proofValue, "BOOKING_MANAGE");
        if (!Buffer.from(booking.contact_digest).equals(Buffer.from(proof.contactDigest))) this.fail(403, "BOOKING_PROOF_CONTACT_MISMATCH");
        if (booking.status !== "CHECKED_IN" && booking.ends_at > new Date()) this.fail(409, "SURVEY_NOT_AVAILABLE");
        const existing = await transaction.surveyResponse.findUnique({ where: { familyBookingId: booking.id }, select: { id: true } });
        if (existing !== null) this.fail(409, "SURVEY_ALREADY_SUBMITTED");
        const created = await transaction.surveyResponse.create({ data: {
          familyBookingId: booking.id,
          sessionId: booking.session_id,
          rating: input.rating,
          comment,
          photoAttached: input.photoAttached,
          photoName,
        } });
        return {
          surveyResponseId: created.publicId,
          familyBookingId: booking.public_id,
          seminarSessionId: booking.session_public_id,
          rating: created.rating,
          comment: created.comment,
          photoAttached: created.photoAttached,
          photoName: created.photoName,
          submittedAt: created.submittedAt,
        };
      },
      201,
    );
    return { ...result.value, replayed: result.replayed };
  }

  public async listSession(sessionPublicId: string, page: number, pageSize: number) {
    const session = await this.prisma.seminarSession.findUnique({ where: { publicId: sessionPublicId }, select: { id: true } });
    if (session === null) this.fail(404, "SEMINAR_SESSION_NOT_FOUND");
    const where = { sessionId: session.id };
    const [rows, totalItems, aggregate, distribution] = await Promise.all([
      this.prisma.surveyResponse.findMany({
        where, orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize, take: pageSize,
        select: {
          publicId: true, rating: true, comment: true, photoAttached: true, photoName: true, submittedAt: true,
          familyBooking: { select: {
            publicId: true,
            contactCiphertext: true,
            students: {
              orderBy: { id: "asc" },
              select: {
                participantType: true,
                active: true,
                releasedAt: true,
                sourceStudentNoSnapshot: true,
                studentNameSnapshot: true,
                branchCodeAtBooking: true,
                classNameSnapshot: true,
                unitNameSnapshot: true,
                teacherNameSnapshot: true,
                student: { select: {
                  publicId: true,
                  sourceStudentNo: true,
                  name: true,
                  className: true,
                  unitName: true,
                  teacherName: true,
                  sourceActive: true,
                  assignments: { select: { className: true, sourceActive: true } },
                  branch: { select: { code: true } },
                } },
              },
            },
          } },
        },
      }),
      this.prisma.surveyResponse.count({ where }),
      this.prisma.surveyResponse.aggregate({ where, _avg: { rating: true } }),
      this.prisma.surveyResponse.groupBy({ by: ["rating"], where, _count: true }),
    ]);
    const ratings: Record<"1" | "2" | "3" | "4" | "5", number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const group of distribution) ratings[String(group.rating) as keyof typeof ratings] = group._count;
    return {
      items: rows.map((row) => {
        const links = this.currentParticipantLinks(row.familyBooking.students);
        const representative = links.find((link) => link.participantType === "ENROLLED"
          && link.student?.sourceActive === true)
          ?? links.find((link) => link.participantType === "ENROLLED" && link.student !== null)
          ?? links.find((link) => link.participantType === "GUEST")
          ?? links[0];
        if (representative === undefined) this.fail(500, "SURVEY_PARTICIPANT_CONTEXT_MISSING");
        const enrolled = representative.participantType === "ENROLLED" ? representative.student : null;
        const className = enrolled?.className ?? representative.classNameSnapshot;
        return {
          surveyResponseId: row.publicId,
          familyBookingId: row.familyBooking.publicId,
          participant: {
            participantType: representative.participantType,
            studentId: enrolled?.publicId ?? null,
            sourceStudentNo: enrolled?.sourceStudentNo ?? representative.sourceStudentNoSnapshot,
            branch: enrolled?.branch.code ?? representative.branchCodeAtBooking,
            unitName: enrolled === null
              ? canonicalUnitName(representative.classNameSnapshot) ?? representative.unitNameSnapshot
              : canonicalUnitName(enrolled.className) ?? enrolled.unitName,
            studentName: enrolled?.name ?? representative.studentNameSnapshot,
            className,
            teacherName: representative.participantType === "GUEST"
              ? null
              : currentOrHistoricMathHomeroomTeacher(representative.student, representative.teacherNameSnapshot),
            contact: this.phoneProtector.reveal(row.familyBooking.contactCiphertext),
            participantCount: links.length,
            additionalParticipantCount: Math.max(links.length - 1, 0),
          },
          rating: row.rating,
          comment: row.comment,
          photoAttached: row.photoAttached,
          photoName: row.photoAttached ? row.photoName : null,
          submittedAt: row.submittedAt,
        };
      }),
      page: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
      summary: { averageRating: aggregate._avg.rating, responseCount: totalItems, ratingDistribution: ratings },
    };
  }

  private currentParticipantLinks<T extends { readonly active: boolean; readonly releasedAt: Date | null }>(links: readonly T[]): T[] {
    const active = links.filter((link) => link.active);
    if (active.length > 0) return active;
    const latestRelease = Math.max(...links.map((link) => link.releasedAt?.getTime() ?? -1));
    return links.filter((link) => (link.releasedAt?.getTime() ?? -1) === latestRelease);
  }

  private fail(status: number, code: string): never {
    throw new DomainError(status, code, "The survey operation could not be completed.");
  }
}
