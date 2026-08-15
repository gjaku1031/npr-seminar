export interface PublicMaskedFamilyBookingParticipant {
  readonly participantType: string;
  readonly maskedName: string;
  readonly branch: string;
}

export interface PublicMaskedFamilyBooking {
  readonly familyBookingId: string;
  readonly seminarSessionId: string;
  readonly maskedContact: string;
  readonly attendanceParty: string;
  readonly bookingSource: string;
  readonly seatCount: number;
  readonly status: string;
  readonly participants: readonly PublicMaskedFamilyBookingParticipant[];
  readonly qrStatus: string;
  readonly version: number;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
  readonly checkedInAt: Date | string | null;
  readonly cancelledAt: Date | string | null;
}

interface MaskableParticipantRow {
  readonly active: boolean;
  readonly releasedAt: Date | null;
  readonly participantType: string;
  readonly studentNameSnapshot: string;
  readonly branchCodeAtBooking: string;
}

export interface MaskableFamilyBookingRow {
  readonly publicId: string;
  readonly session: { readonly publicId: string };
  readonly attendanceParty: string;
  readonly bookingSource: string;
  readonly seatCount: number;
  readonly status: string;
  readonly students: readonly MaskableParticipantRow[];
  readonly qrCredentials: readonly { readonly status: string }[];
  readonly version: bigint | number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly checkedInAt: Date | null;
  readonly cancelledAt: Date | null;
}

interface MaskableFamilyBookingCore {
  readonly familyBookingId: string;
  readonly seminarSessionId: string;
  readonly attendanceParty: string;
  readonly bookingSource: string;
  readonly seatCount: number;
  readonly status: string;
  readonly students: readonly {
    readonly participantType: string;
    readonly name: string;
    readonly branch: string;
  }[];
  readonly qrStatus: string;
  readonly version: number;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
  readonly checkedInAt: Date | string | null;
  readonly cancelledAt: Date | string | null;
}

export function maskPhone(normalizedContact: string): string {
  return `${normalizedContact.slice(0, 3)}-****-${normalizedContact.slice(-4)}`;
}

export function maskPersonName(value: string): string {
  const characters = [...value.normalize("NFC").trim()];
  if (characters.length <= 1) return "*";
  if (characters.length === 2) return `${characters[0]}*`;
  return `${characters[0]}${"*".repeat(characters.length - 2)}${characters.at(-1)}`;
}

export function mapMaskedFamilyBookingRow(
  row: MaskableFamilyBookingRow,
  normalizedContact: string,
): PublicMaskedFamilyBooking {
  const qr = row.qrCredentials[0];
  return {
    familyBookingId: row.publicId,
    seminarSessionId: row.session.publicId,
    maskedContact: maskPhone(normalizedContact),
    attendanceParty: row.attendanceParty,
    bookingSource: row.bookingSource,
    seatCount: row.seatCount,
    status: row.status,
    participants: currentParticipants(row.students).map((participant) => ({
      participantType: participant.participantType,
      maskedName: maskPersonName(participant.studentNameSnapshot),
      branch: participant.branchCodeAtBooking,
    })),
    qrStatus: qr?.status ?? "REVOKED",
    version: Number(row.version),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    checkedInAt: row.checkedInAt,
    cancelledAt: row.cancelledAt,
  };
}

export function mapMaskedFamilyBookingCore(
  booking: MaskableFamilyBookingCore,
  normalizedContact: string,
): PublicMaskedFamilyBooking {
  return {
    familyBookingId: booking.familyBookingId,
    seminarSessionId: booking.seminarSessionId,
    maskedContact: maskPhone(normalizedContact),
    attendanceParty: booking.attendanceParty,
    bookingSource: booking.bookingSource,
    seatCount: booking.seatCount,
    status: booking.status,
    participants: booking.students.map((participant) => ({
      participantType: participant.participantType,
      maskedName: maskPersonName(participant.name),
      branch: participant.branch,
    })),
    qrStatus: booking.qrStatus,
    version: booking.version,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
    checkedInAt: booking.checkedInAt,
    cancelledAt: booking.cancelledAt,
  };
}

function currentParticipants(links: readonly MaskableParticipantRow[]): readonly MaskableParticipantRow[] {
  const active = links.filter((link) => link.active);
  if (active.length > 0) return active;
  const latestRelease = Math.max(...links.map((link) => link.releasedAt?.getTime() ?? -1));
  return links.filter((link) => link.releasedAt?.getTime() === latestRelease);
}
