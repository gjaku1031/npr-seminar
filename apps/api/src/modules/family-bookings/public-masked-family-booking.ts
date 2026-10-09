/**
 * 공개 응답의 마스킹된 예약 참가자
 */
export interface PublicMaskedFamilyBookingParticipant {
  /**
   * 참여 유형
   */
  readonly participantType: string;

  /**
   * 마스킹한 이름
   */
  readonly maskedName: string;

  /**
   * 예약 시점 캠퍼스
   */
  readonly branch: string;
}

/**
 * 공개 응답의 마스킹된 예약
 */
export interface PublicMaskedFamilyBooking {
  /**
   * 가족 예약 공개 ID
   */
  readonly familyBookingId: string;

  /**
   * 회차 공개 ID
   */
  readonly seminarSessionId: string;

  /**
   * 마스킹한 연락처 `010-****-1234`
   */
  readonly maskedContact: string;

  /**
   * 참석 보호자
   */
  readonly attendanceParty: string;

  /**
   * 예약 경로
   */
  readonly bookingSource: string;

  /**
   * 예약 인원
   */
  readonly seatCount: number;

  /**
   * 예약 상태
   */
  readonly status: string;

  /**
   * 현재 참가자. 모두 해제됐으면 마지막 해제 참가자
   */
  readonly participants: readonly PublicMaskedFamilyBookingParticipant[];

  /**
   * 최신 QR 상태. QR이 없으면 REVOKED
   */
  readonly qrStatus: string;

  /**
   * 예약 버전
   */
  readonly version: number;

  /**
   * 생성 시각
   */
  readonly createdAt: Date | string;

  /**
   * 변경 시각
   */
  readonly updatedAt: Date | string;

  /**
   * 입장 시각
   */
  readonly checkedInAt: Date | string | null;

  /**
   * 취소 시각
   */
  readonly cancelledAt: Date | string | null;
}

/**
 * 마스킹 전 참가자 행
 */
interface MaskableParticipantRow {
  /**
   * 현재 포함 여부
   */
  readonly active: boolean;

  /**
   * 해제 시각
   */
  readonly releasedAt: Date | null;

  /**
   * 참여 유형
   */
  readonly participantType: string;

  /**
   * 학생 이름 스냅샷
   */
  readonly studentNameSnapshot: string;

  /**
   * 예약 시점 캠퍼스
   */
  readonly branchCodeAtBooking: string;
}

/**
 * 마스킹 전 예약 조회 행
 */
export interface MaskableFamilyBookingRow {
  /**
   * 가족 예약 공개 ID
   */
  readonly publicId: string;

  /**
   * 회차
   */
  readonly session: { readonly publicId: string };

  /**
   * 참석 보호자
   */
  readonly attendanceParty: string;

  /**
   * 예약 경로
   */
  readonly bookingSource: string;

  /**
   * 예약 인원
   */
  readonly seatCount: number;

  /**
   * 예약 상태
   */
  readonly status: string;

  /**
   * 참가자 행
   */
  readonly students: readonly MaskableParticipantRow[];

  /**
   * QR 자격. 최신 버전 1건만 조회해 전달
   */
  readonly qrCredentials: readonly { readonly status: string }[];

  /**
   * 예약 버전
   */
  readonly version: bigint | number;

  /**
   * 생성 시각
   */
  readonly createdAt: Date;

  /**
   * 변경 시각
   */
  readonly updatedAt: Date;

  /**
   * 입장 시각
   */
  readonly checkedInAt: Date | null;

  /**
   * 취소 시각
   */
  readonly cancelledAt: Date | null;
}

/**
 * 이미 조립한 예약 응답의 마스킹 입력
 */
interface MaskableFamilyBookingCore {
  /**
   * 가족 예약 공개 ID
   */
  readonly familyBookingId: string;

  /**
   * 회차 공개 ID
   */
  readonly seminarSessionId: string;

  /**
   * 참석 보호자
   */
  readonly attendanceParty: string;

  /**
   * 예약 경로
   */
  readonly bookingSource: string;

  /**
   * 예약 인원
   */
  readonly seatCount: number;

  /**
   * 예약 상태
   */
  readonly status: string;

  /**
   * 현재 참가자
   */
  readonly students: readonly {
    /**
     * 참여 유형
     */
    readonly participantType: string;

    /**
     * 이름(마스킹 전)
     */
    readonly name: string;

    /**
     * 캠퍼스
     */
    readonly branch: string;
  }[];

  /**
   * QR 상태
   */
  readonly qrStatus: string;

  /**
   * 예약 버전
   */
  readonly version: number;

  /**
   * 생성 시각
   */
  readonly createdAt: Date | string;

  /**
   * 변경 시각
   */
  readonly updatedAt: Date | string;

  /**
   * 입장 시각
   */
  readonly checkedInAt: Date | string | null;

  /**
   * 취소 시각
   */
  readonly cancelledAt: Date | string | null;
}

/**
 * 연락처 마스킹. 앞 3자리와 끝 4자리만 표시
 */
function maskPhone(normalizedContact: string): string {
  return `${normalizedContact.slice(0, 3)}-****-${normalizedContact.slice(-4)}`;
}

/**
 * 이름 마스킹. 1자는 `*`, 2자는 첫 글자만, 그 이상은 첫·끝 글자만 표시
 */
function maskPersonName(value: string): string {
  const characters = [...value.normalize("NFC").trim()];
  if (characters.length <= 1) return "*";
  if (characters.length === 2) return `${characters[0]}*`;
  return `${characters[0]}${"*".repeat(characters.length - 2)}${characters.at(-1)}`;
}

/**
 * DB 조회 행을 마스킹된 공개 예약으로 변환
 *
 * @param normalizedContact 조회에 쓴 정규화 연락처. 마스킹 표시용
 */
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

/**
 * 이미 조립한 예약 응답을 마스킹된 공개 예약으로 변환
 *
 * @param normalizedContact 정규화 연락처. 마스킹 표시용
 */
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

/**
 * 현재 참가자. 활성 참가자가 없으면 마지막 해제 시각의 참가자
 */
function currentParticipants(links: readonly MaskableParticipantRow[]): readonly MaskableParticipantRow[] {
  const active = links.filter((link) => link.active);
  if (active.length > 0) return active;
  const latestRelease = Math.max(...links.map((link) => link.releasedAt?.getTime() ?? -1));
  return links.filter((link) => link.releasedAt?.getTime() === latestRelease);
}
