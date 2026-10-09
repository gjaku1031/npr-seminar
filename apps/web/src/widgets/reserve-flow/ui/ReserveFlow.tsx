"use client";

/**
 * 모바일 예약 플로우 — 공개 루트(`/`)의 학부모 앱
 *
 * 흐름: type → campus → list → auth(SMS OTP) → children(자동 연결 자녀) / guest(비재원 필수 정보)
 *       → 참석 학부모 → 생성 → done(QR). 첫 화면 예약 관리 링크는 manage 로 감
 *
 * 전부 브라우저에서 same-origin Nest `/api/v1` 계약 API 로만 동작함
 * `@/server`·서버 액션·목업 배열·전체 학생 데이터셋을 쓰지 않음
 *
 * 시크릿 경계:
 * - 앱이 원문 QR·토큰을 자동으로 남기는 경로는 없음 — URL·localStorage/sessionStorage·
 *   쿠키·서버 상태·로그·파일명·클립보드 어디에도 쓰지 않음
 * - 원문 QR 은 신규 발급 응답에서 한 번만 받아 QR 이미지로만 그림
 * - X-Booking-Proof 는 메모리 전용이고 화면 표시·내보내기 대상이 아님
 *
 * 인증 이후 뒤로가기·캠퍼스/회차/유형 변경은 한 함수(invalidateAuth)로 proof·OTP·자녀·guest
 *   초안·생성 오류·멱등 키를 모두 무효화함 — 이전 proof 로 생성 요청이 새어 나가지 않게 함
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Calendar, Check, MapPin, MessageSquare, Smartphone } from "lucide-react";
import { ReservationQr } from "@/entities/reservation";
import { Badge, BRAND_NAME, BRAND_NAME_ROMAN, BRAND_QR_DOWNLOAD_BASENAME, brandSeminarTitle, Button, Input, KV, Select } from "@/shared/ui";
import { fmtDateTime, fmtSessionCardDateTime } from "@/shared/lib/format";
import { fmtPhone } from "@/shared/lib/phone";
import { maskName, maskPhone } from "@/shared/lib/mask";
import { SEMINAR_LOCATION } from "@/shared/lib/seminar";
import {
  ATTENDANCE_PARTY_LABELS,
  attendancePartySummary,
  AVAILABILITY_LABELS,
  BRANCH_OPTIONS,
  createPublicFamilyBooking,
  defaultErrorMessage,
  GUEST_GRADE_OPTIONS,
  isApiError,
  isFreshBooking,
  searchAuthorizedStudents,
  seatCountFor,
  useOperationKey,
  type AttendanceParty,
  type Branch,
  type FamilyBooking,
  type GuestGrade,
  type PublicSeminarSession,
  type PublicStudent,
} from "@/shared/api";
import {
  campusSessionCount,
  guestEntryState,
  isSessionBookableForType,
  publicBranchLabel,
  sessionsForType,
  useBookingProof,
  useOtpFlow,
  usePublicSessions,
  type BookingProof,
  type ParticipantType,
} from "@/features/public-booking";
import { BottomBar, ErrorNote, FlowHeader, FlowToast } from "./MobileChrome";
import { ManageBookingPanel } from "./ManageBookingPanel";
import { ReservationTypeStep } from "./ReservationTypeStep";

/**
 * 예약 흐름 단계
 */
type Step = "type" | "campus" | "list" | "auth" | "children" | "guest" | "done" | "manage";

/**
 * 참석 보호자 선택지
 */
const ATTENDANCE_OPTIONS: AttendanceParty[] = ["MOTHER", "FATHER", "BOTH"];

/**
 * 새로 만든 예약의 완료 화면 정보
 */
interface FreshTicket {
  /**
   * 만든 예약
   */
  booking: FamilyBooking;
  /**
   * 원문 QR — 신규 커밋 응답에서만 옴. 리플레이엔 없음(활성 QR 은 예약 조회에서 확인)
   */
  qrToken: string | null;
  /**
   * 리플레이라 이 화면엔 QR 이미지가 없을 때 안내(오류가 아니라 정상 완료 안내)
   */
  qrNotice: string | null;
}

/**
 * 생성 오류 뒤 화면에 함께 내줄 복구 동선(있을 때만)
 */
interface CreateCta {
  /**
   * 버튼 문구
   */
  label: string;

  /**
   * 버튼 동작
   */
  run: () => void;
}

/**
 * 회차 시각·장소 문구
 */
function sessionMeta(session: PublicSeminarSession): string {
  return `${fmtDateTime(new Date(session.startsAt))} · ${SEMINAR_LOCATION}`;
}

/**
 * 초기 진입 모드 — 루트 포스터의 두 액션이 `/reserve` 검색어(`mode`)로 이걸 정함
 */
export type ReserveInitialMode = "reserve" | "manage";

/**
 * 예약 흐름 속성
 */
export interface ReserveFlowProps {
  /**
   * `manage` 면 첫 화면을 예약 조회·변경·취소 패널로 엶("이미 예약하셨나요?" 진입)
   * 그 밖(기본 `reserve`)은 지금처럼 예약 유형 선택부터 시작함. 플로우 내부 동작은 그대로임
   */
  initialMode?: ReserveInitialMode;
}

/**
 * 학부모 예약 흐름. 유형 → 캠퍼스 → 회차 → 인증 → 참가자 → 완료
 */
export function ReserveFlow({ initialMode = "reserve" }: ReserveFlowProps = {}) {
  const [step, setStep] = useState<Step>(initialMode === "manage" ? "manage" : "type");
  const [participantType, setParticipantType] = useState<ParticipantType | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<AttendanceParty>("MOTHER");
  // 개인정보 수집·이용 동의 — 예약 커밋 전 필수. API 본문에는 싣지 않고 UI 게이트로만 씀
  const [consent, setConsent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const { sessions, loading: sessionsLoading, error: sessionsError, reload } = usePublicSessions();
  // 유형별 회차 가시성(GUEST 는 guestBookingEnabled 회차만). 성공적으로 불러온 목록에서만 셈
  const visible = useMemo(
    () => sessionsForType(sessions, branch, participantType),
    [sessions, branch, participantType],
  );
  const session = useMemo(
    () => sessions.find((s) => s.seminarSessionId === sessionId) ?? null,
    [sessions, sessionId],
  );
  // 비재원 진입 가능 여부 — 로딩/오류/플래그를 정직하게 반영함
  const guestState = guestEntryState(sessionsLoading, sessionsError, sessions);

  const proof = useBookingProof();
  const [students, setStudents] = useState<PublicStudent[] | null>(null);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [guest, setGuest] = useState({ name: "", schoolName: "", grade: "" });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createCta, setCreateCta] = useState<CreateCta | null>(null);
  const [creating, setCreating] = useState(false);
  const [ticket, setTicket] = useState<FreshTicket | null>(null);
  const createKey = useOperationKey();

  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);
  const flash = useCallback((message: string) => {
    setToast(message);
    timers.current.push(setTimeout(() => setToast(null), 2600));
  }, []);

  // 학생 조회 — proof 가 연락처 digest 를 정함. 선택 캠퍼스의 활성 자녀를 전부 자동 연결함
  const loadStudents = useCallback(async (current: BookingProof, campus: Branch) => {
    setStudentsError(null);
    try {
      const page = await searchAuthorizedStudents(
        { branch: campus, pageSize: 100 },
        { bookingProof: current.value },
      );
      setStudents(page.items);
    } catch (caught) {
      setStudents([]);
      setStudentsError(defaultErrorMessage(caught));
    }
  }, []);

  // 인증·하위 상태 무효화 — 한 함수로 모음
  // children/guest 의 back, 캠퍼스/회차/유형 변경이 모두 이걸 부름
  // 연락처 입력값(otp.contact)은 편의를 위해 남지만 인증 효력은 전혀 없음(proof 를 버리므로)
  const otp = useOtpFlow({
    purpose: "FAMILY_BOOKING",
    branch: branch ?? undefined,
    onVerified: (issued) => {
      proof.adopt(issued);
      if (participantType === "ENROLLED") {
        setStep("children");
        if (branch) void loadStudents(issued, branch);
      } else {
        // GUEST: 선택 회차 flag 를 다시 확인한 뒤에만 폼으로 넘어감
        if (session?.guestBookingEnabled) {
          setStep("guest");
        } else {
          setCreateError("이 회차의 비재원생 예약이 마감됐습니다. 회차를 다시 선택해 주세요.");
          reload();
          setStep("list");
        }
      }
    },
  });

  const invalidateAuth = useCallback(() => {
    proof.clear();
    otp.restart();
    setStudents(null);
    setStudentsError(null);
    setGuest({ name: "", schoolName: "", grade: "" });
    setCreateError(null);
    setCreateCta(null);
    setConsent(false);
    createKey.reset();
  }, [proof, otp, createKey]);

  const reset = useCallback(() => {
    setStep("type");
    setParticipantType(null);
    setBranch(null);
    setSessionId(null);
    setAttendance("MOTHER");
    setTicket(null);
    invalidateAuth();
  }, [invalidateAuth]);

  const selectType = useCallback(
    (type: ParticipantType) => {
      setParticipantType(type);
      setBranch(null);
      setSessionId(null);
      invalidateAuth();
      setStep("campus");
    },
    [invalidateAuth],
  );

  // 생성 실패 코드별 UX — status 하나를 모두 "이미 예약"으로 번역하지 않음
  const handleCreateError = useCallback(
    (caught: unknown) => {
      if (!isApiError(caught)) {
        setCreateError(defaultErrorMessage(caught));
        return;
      }
      switch (caught.code) {
        case "GUEST_BOOKING_DISABLED":
          setCreateError(null);
          setCreateCta(null);
          flash("이 회차의 비재원생 예약이 마감됐습니다.");
          reload();
          setStep("list");
          return;
        case "ENROLLED_CONTACT_MUST_USE_ENROLLED_FLOW":
          setCreateError("입력하신 연락처는 재원생 학부모 연락처입니다. 재원생 예약으로 진행해 주세요.");
          setCreateCta({
            label: "재원생 예약으로 다시 시작",
            run: () => {
              invalidateAuth();
              setParticipantType("ENROLLED");
              setStep("auth");
            },
          });
          return;
        case "ENROLLED_STUDENT_NOT_FOUND":
          setCreateError("이 캠퍼스에 연결된 재원생이 없습니다. 처음부터 다시 선택해 주세요.");
          setCreateCta({ label: "처음부터 다시", run: reset });
          return;
        case "ACTIVE_FAMILY_BOOKING_EXISTS":
          setCreateError("이미 같은 연락처로 예약이 있습니다.");
          setCreateCta({ label: "예약 조회", run: () => { invalidateAuth(); setStep("manage"); } });
          return;
        case "SESSION_BRANCH_MISMATCH":
          setCreateError("선택한 캠퍼스와 회차가 맞지 않습니다. 회차를 다시 선택해 주세요.");
          setCreateCta({ label: "회차 다시 선택", run: () => { invalidateAuth(); setStep("list"); } });
          return;
        case "SESSION_NOT_BOOKABLE":
        case "BOOKING_WINDOW_CLOSED":
          setCreateError(null);
          setCreateCta(null);
          flash("이 회차는 예약이 마감됐습니다.");
          reload();
          setStep("list");
          return;
        default:
          break;
      }
      // proof 만료 계열 — 인증부터 다시
      if (caught.status === 401 || caught.status === 403) {
        invalidateAuth();
        flash("본인 확인이 만료됐습니다. 다시 인증해 주세요.");
        setStep("auth");
        return;
      }
      setCreateError(defaultErrorMessage(caught));
    },
    [flash, reload, invalidateAuth, reset],
  );

  // 예약 생성 — 신규 커밋만 원문 QR 을 줌. ENROLLED 는 studentIds 를 보내지 않음
  const create = useCallback(async () => {
    const current = proof.proof;
    if (!session || !current || participantType === null || branch === null) return;

    // GUEST 는 생성 직전 flag 를 다시 확인함. 최종 권위는 POST 응답임
    if (participantType === "GUEST" && !session.guestBookingEnabled) {
      setCreateError("이 회차의 비재원생 예약이 마감됐습니다. 회차를 다시 선택해 주세요.");
      setCreateCta({ label: "회차 다시 선택", run: () => { reload(); setStep("list"); } });
      return;
    }

    setCreating(true);
    setCreateError(null);
    setCreateCta(null);

    try {
      const body =
        participantType === "ENROLLED"
          ? ({
              participantType: "ENROLLED",
              seminarSessionId: session.seminarSessionId,
              attendanceParty: attendance,
            } as const)
          : ({
              participantType: "GUEST",
              seminarSessionId: session.seminarSessionId,
              attendanceParty: attendance,
              guest: {
                name: guest.name.trim(),
                // 비재원 참가자의 지점은 선택한 캠퍼스임 (계약상 필수·불변)
                branch: branch,
                schoolName: guest.schoolName.trim(),
                grade: guest.grade as GuestGrade,
              },
            } as const);

      const result = await createPublicFamilyBooking(body, {
        bookingProof: current.value,
        idempotencyKey: createKey.current(),
      });

      createKey.settle();
      // 생성이 성공하면 계약상 FAMILY_BOOKING proof 가 소비됨
      proof.consume();

      setTicket(
        isFreshBooking(result)
          ? { booking: result.booking, qrToken: result.qrToken, qrNotice: null }
          : {
              booking: result.booking,
              qrToken: null,
              qrNotice:
                "예약이 정상적으로 완료됐습니다. 예약 확인 링크(예약 조회)에서 기존 QR을 확인하실 수 있습니다.",
            },
      );
      setStep("done");
    } catch (caught) {
      createKey.settle(caught);
      handleCreateError(caught);
    } finally {
      setCreating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proof, session, participantType, attendance, guest, branch, createKey]);

  // ── 예약 유형 선택 (STEP 1 · TYPE) ──
  if (step === "type")
    return (
      <ReservationTypeStep
        guestState={guestState}
        onSelectEnrolled={() => selectType("ENROLLED")}
        onSelectGuest={() => selectType("GUEST")}
        onManage={() => setStep("manage")}
        onRetry={reload}
        toast={toast}
      />
    );

  // ── 캠퍼스 선택 ──
  if (step === "campus")
    return (
      <div data-screen-label="모바일 — 캠퍼스 선택" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        <FlowHeader back={() => { setParticipantType(null); setBranch(null); invalidateAuth(); setStep("type"); }} title={brandSeminarTitle()} />
        <div style={{ padding: "10px 18px 30px" }}>
          <div style={{ padding: "20px 4px 18px" }}>
            <div style={{ fontSize: 11, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)" }}>STEP 2 · CAMPUS</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 6, lineHeight: 1.3 }}>
              캠퍼스를
              <br />
              선택해 주세요
            </h2>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>예약하실 캠퍼스를 먼저 선택해 주세요.</div>
          </div>

          {sessionsError && (
            <div style={{ marginBottom: 14 }}>
              <ErrorNote message={`설명회 목록을 불러오지 못했습니다. ${sessionsError}`} />
              <Button variant="secondary" fullWidth onClick={reload} style={{ marginTop: 10 }}>
                다시 시도
              </Button>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {BRANCH_OPTIONS.map((option, i) => {
              const count = campusSessionCount(sessions, option.value, participantType);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { setBranch(option.value); setSessionId(null); invalidateAuth(); setStep("list"); }}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 20px", borderRadius: "var(--radius-lg)", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)", cursor: "pointer", textAlign: "left", width: "100%", fontFamily: "var(--font-body)", animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${i * 80}ms both` }}
                >
                  <span style={{ width: 44, height: 44, borderRadius: "var(--radius-sm)", background: "var(--violet-50)", color: "var(--violet-800)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <MapPin size={20} aria-hidden="true" />
                  </span>
                  <span style={{ flex: 1 }}>
                    {/* 공개 예약 사용자 문구는 풀 라벨(…캠퍼스). 전역 BRANCH_LABELS/BRANCH_OPTIONS 는 관리자 화면용이라 그대로 둠 */}
                    <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16.5, color: "var(--text-strong)" }}>{publicBranchLabel(option.value)}</span>
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>
                      {sessionsLoading ? "불러오는 중…" : `진행 설명회 ${count}개`}
                    </span>
                  </span>
                  <ArrowRight size={16} aria-hidden="true" style={{ color: "var(--violet-800)" }} />
                </button>
              );
            })}
          </div>

          <ManageLink onManage={() => setStep("manage")} />
        </div>
        <FlowToast message={toast} />
      </div>
    );

  // ── 설명회 선택 ──
  if (step === "list")
    return (
      <div data-screen-label="모바일 — 설명회 선택" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        <FlowHeader back={() => { setBranch(null); setSessionId(null); invalidateAuth(); setStep("campus"); }} title={brandSeminarTitle()} />
        <div style={{ padding: "10px 18px 30px" }}>
          <div style={{ padding: "20px 4px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)" }}>STEP 3 · RESERVATION</span>
              {branch && <Badge tone="brand" size="sm">{publicBranchLabel(branch)}</Badge>}
              <Badge tone="neutral" size="sm">{participantType === "GUEST" ? "비재원생" : "재원생"}</Badge>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 6, lineHeight: 1.3 }}>
              설명회를 선택하고
              <br />
              바로 예약하세요
            </h2>
          </div>

          {createError && (
            <div style={{ marginBottom: 12 }}>
              <ErrorNote message={createError} />
            </div>
          )}

          {sessionsLoading && (
            <p style={{ padding: "24px 4px", fontSize: 13, color: "var(--text-faint)" }}>설명회를 불러오는 중입니다.</p>
          )}

          {sessionsError && !sessionsLoading && (
            <>
              <ErrorNote message={`설명회 목록을 불러오지 못했습니다. ${sessionsError}`} />
              <Button variant="secondary" fullWidth onClick={reload} style={{ marginTop: 10 }}>
                다시 시도
              </Button>
            </>
          )}

          {!sessionsLoading && !sessionsError && visible.length === 0 && (
            <p style={{ padding: "24px 4px", fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
              {participantType === "GUEST"
                ? "지금 이 캠퍼스에서 비재원생이 예약할 수 있는 설명회가 없습니다."
                : "지금 이 캠퍼스에서 예약할 수 있는 설명회가 없습니다."}
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {visible.map((s, i) => {
              const bookable = participantType !== null && isSessionBookableForType(s, participantType);
              return (
                <button
                  key={s.seminarSessionId}
                  type="button"
                  disabled={!bookable}
                  onClick={() => { setSessionId(s.seminarSessionId); invalidateAuth(); setStep("auth"); }}
                  style={{ padding: "18px 20px", borderRadius: "var(--radius-lg)", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)", cursor: bookable ? "pointer" : "not-allowed", opacity: bookable ? 1 : 0.6, textAlign: "left", width: "100%", fontFamily: "var(--font-body)", animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${i * 80}ms both` }}
                >
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--text-strong)", lineHeight: 1.4 }}>{s.seminarTitle}</span>
                    {bookable && <ArrowRight size={16} aria-hidden="true" style={{ color: "var(--violet-800)", flexShrink: 0, marginTop: 3 }} />}
                  </span>
                  <span style={{ display: "flex", fontSize: 12.5, color: "var(--text-muted)", marginTop: 6, gap: 12, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                      <Calendar size={12} aria-hidden="true" /> {fmtDateTime(new Date(s.startsAt))}
                    </span>
                    <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                      <MapPin size={12} aria-hidden="true" /> {SEMINAR_LOCATION}
                    </span>
                  </span>
                  <span style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                    {bookable ? (
                      <Badge tone="accent" size="sm">{AVAILABILITY_LABELS.AVAILABLE}</Badge>
                    ) : (
                      <Badge tone="neutral" size="sm">{AVAILABILITY_LABELS[s.availability]}</Badge>
                    )}
                    {s.scope === "ALL" && <Badge tone="brand" size="sm">전 캠퍼스</Badge>}
                  </span>
                </button>
              );
            })}
          </div>

          <ManageLink onManage={() => setStep("manage")} />
        </div>
        <FlowToast message={toast} />
      </div>
    );

  // ── 본인 확인 (SMS OTP) ──
  if (step === "auth" && session)
    return (
      <div data-screen-label="모바일 — 본인 확인" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        <FlowHeader back={() => { invalidateAuth(); setStep("list"); }} title="본인 확인" />
        <div style={{ padding: "14px 18px 30px" }}>
          <div style={{ padding: "8px 4px 16px" }}>
            <h2 style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.35 }}>{session.seminarTitle}</h2>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5 }}>{sessionMeta(session)}</div>
          </div>

          <OtpFields
            otp={otp}
            hint={
              participantType === "GUEST"
                ? "예약 확인 문자를 받으실 학부모 연락처입니다. 모/부 번호 모두 가능합니다."
                : "재원생 학부모 연락처입니다. 모/부 번호 모두 가능하며, 이 연락처의 자녀가 자동으로 연결됩니다."
            }
          />
          {createError && (
            <>
              <ErrorNote message={createError} />
              {createCta && (
                <Button fullWidth onClick={createCta.run} style={{ marginTop: 12 }}>
                  {createCta.label}
                </Button>
              )}
            </>
          )}
        </div>
        <FlowToast message={toast} />
      </div>
    );

  // ── 재원생 자동 연결 자녀 확인 ──
  if (step === "children" && session)
    return (
      <div data-screen-label="모바일 — 재원생 예약" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        <FlowHeader back={() => { invalidateAuth(); setStep("auth"); }} title="재원생 예약" />
        <div style={{ padding: "14px 18px 120px" }}>
          <div style={{ padding: "8px 4px 16px" }}>
            <h2 style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.35 }}>{session.seminarTitle}</h2>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5 }}>{sessionMeta(session)}</div>
          </div>

          {students === null && !studentsError && (
            <p style={{ padding: "18px 4px", fontSize: 13, color: "var(--text-faint)" }}>자녀 정보를 불러오는 중입니다.</p>
          )}

          <ErrorNote message={studentsError} />

          {students && students.length > 0 && (
            <>
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-accent-soft)", color: "var(--mint-700)", fontSize: 12.5, display: "flex", gap: 8, alignItems: "center", lineHeight: 1.45 }}>
                <Check size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
                이 연락처의 자녀 <b>{students.length}명 자동 연결됨</b> — 형제·자매는 하나의 가족 예약으로 묶입니다.
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                {students.map((s, i) => (
                  <div
                    key={s.studentId}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px 16px", borderRadius: "var(--radius-lg)", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)", animation: `ds-pop var(--dur-base) var(--ease-spring) ${i * 70}ms both` }}
                  >
                    <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--violet-100)", color: "var(--violet-900)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{s.name.slice(0, 1)}</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: "block", fontWeight: 800, fontSize: 15.5, color: "var(--text-strong)" }}>{s.name}</span>
                      <span style={{ display: "block", fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>
                        {[publicBranchLabel(s.branch), s.schoolName, s.grade].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <Badge tone="accent" size="sm">자동 연결</Badge>
                  </div>
                ))}
              </div>

              <AttendancePicker value={attendance} onChange={setAttendance} />

              <PrivacyConsent checked={consent} onChange={setConsent} />
            </>
          )}

          {students && students.length === 0 && (
            <div style={{ marginTop: 12, padding: "14px 16px", borderRadius: "var(--radius-md)", background: "var(--surface-accent-soft)", color: "var(--mint-700)", fontSize: 13, lineHeight: 1.6 }}>
              이 캠퍼스에 이 연락처로 연결된 재원생이 없습니다. 자녀가 아직 {BRAND_NAME}에 다니지 않는다면 비재원생 예약을 이용해 주세요.
            </div>
          )}

          {createError && (
            <>
              <ErrorNote message={createError} />
              {createCta && (
                <Button fullWidth onClick={createCta.run} style={{ marginTop: 12 }}>
                  {createCta.label}
                </Button>
              )}
            </>
          )}
        </div>
        <BottomBar>
          {students && students.length === 0 ? (
            <Button size="lg" fullWidth variant="secondary" onClick={reset} iconRight={<ArrowRight size={17} aria-hidden="true" />}>
              처음부터 다시 선택
            </Button>
          ) : (
            <Button size="lg" fullWidth disabled={!students || students.length === 0 || !consent || creating} onClick={() => void create()} iconRight={<ArrowRight size={17} aria-hidden="true" />}>
              {/* 좌석은 참석 학부모 인원 기준 — 자녀 수(students.length)가 아니라 seatCountFor 로 셈 */}
              {creating ? "예약 중…" : students ? `${seatCountFor(attendance)}명 예약하기` : "불러오는 중…"}
            </Button>
          )}
        </BottomBar>
        <FlowToast message={toast} />
      </div>
    );

  // ── 비재원생 필수 정보 폼 ──
  if (step === "guest" && session && branch) {
    const nameOk = guest.name.trim() !== "";
    const schoolOk = guest.schoolName.trim() !== "";
    const gradeOk = guest.grade !== "";
    const formValid = nameOk && schoolOk && gradeOk;
    return (
      <div data-screen-label="모바일 — 비재원생 예약" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        <FlowHeader back={() => { invalidateAuth(); setStep("auth"); }} title="비재원생 예약" />
        <div style={{ padding: "14px 18px 120px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: "8px 4px 2px" }}>
            <h2 style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.35 }}>{session.seminarTitle}</h2>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5 }}>{sessionMeta(session)}</div>
          </div>

          <Input label="학생 이름" value={guest.name} onChange={(v) => setGuest({ ...guest, name: v })} />
          <Input label="학교" value={guest.schoolName} onChange={(v) => setGuest({ ...guest, schoolName: v })} />
          <Select
            label="학년"
            placeholder=""
            required
            options={GUEST_GRADE_OPTIONS.map((g) => ({ value: g.value, label: g.label }))}
            value={guest.grade}
            onChange={(v) => setGuest({ ...guest, grade: v })}
          />

          <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 }}>
            <b>{publicBranchLabel(branch)}</b>로 등록됩니다. 확인된 연락처로 예약이 만들어집니다.
          </div>

          <AttendancePicker value={attendance} onChange={setAttendance} />

          <PrivacyConsent checked={consent} onChange={setConsent} />

          {createError && <ErrorNote message={createError} />}
          {createError && createCta && (
            <Button fullWidth onClick={createCta.run}>
              {createCta.label}
            </Button>
          )}
        </div>
        <BottomBar>
          <Button size="lg" fullWidth disabled={!formValid || !consent || creating} onClick={() => void create()} iconRight={<ArrowRight size={17} aria-hidden="true" />}>
            {/* 재원생과 동일한 좌석(참석 학부모 인원) 기준 CTA — 자녀 수와 무관함 */}
            {creating ? "예약 중…" : `${seatCountFor(attendance)}명 예약하기`}
          </Button>
        </BottomBar>
        <FlowToast message={toast} />
      </div>
    );
  }

  // ── 예약 조회 · 변경 · 취소 ──
  if (step === "manage")
    return <ManageBookingPanel sessions={sessions} onExit={reset} onToast={flash} />;

  // ── 예약 완료 티켓 ──
  if (step === "done" && ticket) return <Ticket ticket={ticket} session={session} onReset={reset} />;

  return null;
}

/**
 * 하단 예약 관리 링크 — 캠퍼스·목록 화면 공용
 */
function ManageLink({ onManage }: { onManage: () => void }) {
  return (
    <div style={{ textAlign: "center", marginTop: 22 }}>
      <button
        type="button"
        onClick={onManage}
        style={{ background: "none", border: "none", fontSize: 13.5, fontWeight: 700, color: "var(--violet-800)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", fontFamily: "var(--font-body)", padding: 8 }}
      >
        이미 예약하셨나요? 예약 조회 · 변경 · 취소
      </button>
    </div>
  );
}

/* ── 참석 학부모 — 정확히 하나 (계약 AttendanceParty) ── */

/**
 * 참석 보호자 선택
 */
function AttendancePicker({
  value,
  onChange,
}: {
  value: AttendanceParty;
  onChange: (next: AttendanceParty) => void;
}) {
  return (
    <fieldset style={{ marginTop: 14, border: "none", padding: 0, margin: "14px 0 0" }}>
      <legend style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-strong)", padding: 0, marginBottom: 8 }}>
        참석 학부모 <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>(한 가지만 선택)</span>
      </legend>
      <div style={{ display: "flex", gap: 8 }}>
        {ATTENDANCE_OPTIONS.map((option) => {
          const on = value === option;
          // 좌석 수는 서버 계약(seatCountFor)이 참석 학부모로만 파생함 — 자녀 수와 무관함
          const seats = seatCountFor(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              // `·` 은 시각용 구분자라 접근성 이름에는 인원을 또렷이 담음
              aria-label={`${ATTENDANCE_PARTY_LABELS[option]} ${seats}명`}
              onClick={() => onChange(option)}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px 0", borderRadius: "var(--radius-md)", border: on ? "1.5px solid var(--violet-800)" : "1px solid var(--border-soft)", background: on ? "var(--surface-brand-soft)" : "var(--surface-card)", color: on ? "var(--violet-800)" : "var(--text-body)", fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-body)" }}
            >
              <span style={{ width: 18, height: 18, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? "var(--violet-900)" : "transparent", border: on ? "1.5px solid var(--violet-900)" : "1.5px solid var(--border-soft)", boxSizing: "border-box" }}>
                {on && <Check size={11} strokeWidth={3} aria-hidden="true" style={{ color: "#fff" }} />}
              </span>
              <span aria-hidden="true">{attendancePartySummary(option)}</span>
            </button>
          );
        })}
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-faint)", lineHeight: 1.55 }}>
        좌석은 참석 학부모 인원만큼만 배정됩니다. 자녀(학생)는 참석 인원에 포함되지 않아 자녀 수만큼 좌석이 늘지 않습니다.
      </p>
    </fieldset>
  );
}

/* ── 개인정보 수집·이용 동의 (필수) — 예약 커밋 게이트. API 본문엔 싣지 않는다 ── */

/**
 * 개인정보 수집·이용 동의. 예약 생성 전 필수
 */
function PrivacyConsent({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        marginTop: 16,
        padding: "14px 16px",
        borderRadius: "var(--radius-md)",
        background: "var(--surface-sunken)",
        border: "1px solid var(--border-hairline)",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label="개인정보 수집·이용에 동의합니다 (필수)"
        style={{ width: 18, height: 18, marginTop: 1, accentColor: "var(--violet-800)", flexShrink: 0 }}
      />
      <span style={{ fontSize: 12.5, color: "var(--text-body)", lineHeight: 1.55 }}>
        <b style={{ color: "var(--text-strong)" }}>[필수] 개인정보 수집·이용 동의</b>
        <span style={{ display: "block", marginTop: 4, color: "var(--text-muted)" }}>
          설명회 예약 확인과 안내 문자 발송을 위해 학부모 연락처와 참석 정보, 학생 정보(이름·학교·학년)를
          수집·이용합니다. 동의하셔야 예약을 진행할 수 있습니다.
        </span>
      </span>
    </label>
  );
}

/* ── OTP 입력 (연락처 → 6자리) — 예약·관리 공용 ── */

/**
 * 인증번호 입력 칸
 */
export function OtpFields({ otp, hint }: { otp: ReturnType<typeof useOtpFlow>; hint: string }) {
  const sent = otp.stage === "code" || otp.stage === "verifying";

  return (
    <div>
      <Input
        label="학부모 연락처"
        placeholder="010-0000-0000"
        value={otp.contact}
        onChange={otp.setContact}
        disabled={sent}
        icon={<Smartphone size={16} aria-hidden="true" />}
        hint={sent ? undefined : hint}
      />

      {!sent && (
        <Button size="lg" fullWidth onClick={() => void otp.sendChallenge()} disabled={!otp.canSend} style={{ marginTop: 16 }}>
          {otp.stage === "sending" ? "인증번호 보내는 중…" : "인증번호 받기"}
        </Button>
      )}

      {sent && (
        <div style={{ marginTop: 16 }}>
          {/* 서버가 201 을 준 뒤에만 이 문구가 뜸 */}
          <p role="status" aria-live="polite" style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--mint-700)", lineHeight: 1.55 }}>
            인증번호 6자리를 문자로 보냈습니다. 5분 안에 입력해 주세요.
          </p>
          <Input
            label="인증번호 6자리"
            placeholder="000000"
            value={otp.code}
            onChange={otp.setCode}
            type="tel"
          />
          <Button size="lg" fullWidth onClick={() => void otp.verify()} disabled={!otp.canVerify} style={{ marginTop: 16 }}>
            {otp.stage === "verifying" ? "확인 중…" : "확인"}
          </Button>
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button
              type="button"
              onClick={otp.restart}
              style={{ background: "none", border: "none", fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", fontFamily: "var(--font-body)", padding: 8 }}
            >
              번호를 잘못 입력했습니다
            </button>
          </div>
        </div>
      )}

      <ErrorNote message={otp.error} />
    </div>
  );
}

/* ── 완료 티켓 ── */

/**
 * 예약 완료 티켓. 입장 QR 포함
 */
function Ticket({
  ticket,
  session,
  onReset,
}: {
  ticket: FreshTicket;
  session: PublicSeminarSession | null;
  onReset: () => void;
}) {
  const { booking } = ticket;

  return (
    <div data-screen-label="모바일 — 예약 완료" style={{ minHeight: "100%", background: "var(--surface-page)", display: "flex", flexDirection: "column" }}>
      <FlowHeader title="예약 완료" />
      <div style={{ flex: 1, padding: "20px 18px 30px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--violet-900)", color: "var(--mint-400)", display: "inline-flex", alignItems: "center", justifyContent: "center", animation: "ds-pop var(--dur-hero) var(--ease-spring) both" }}>
          <Check size={24} strokeWidth={2.6} aria-hidden="true" />
        </span>
        <h2 role="status" aria-live="polite" style={{ fontSize: 23, fontWeight: 800, marginTop: 14, textAlign: "center" }}>
          예약이 확정됐습니다!
        </h2>

        {/* QR 224px 가 390px 폭에 들어가도록 세로로 쌓음 */}
        <div style={{ width: "100%", maxWidth: 340, marginTop: 20, borderRadius: "var(--radius-lg)", background: "var(--surface-card)", boxShadow: "var(--shadow-raised)", overflow: "hidden", animation: "ds-fade-up var(--dur-hero) var(--ease-spring) 200ms both" }}>
          <div style={{ background: "var(--surface-brand)", color: "var(--text-on-brand)", padding: "16px 20px" }}>
            <div style={{ fontSize: 10.5, letterSpacing: "var(--tracking-caps)", color: "var(--mint-400)", fontWeight: 700 }}>{BRAND_NAME_ROMAN} ADMISSION QR</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16.5, marginTop: 4, lineHeight: 1.35 }}>
              {session?.seminarTitle ?? "예약 완료"}
            </div>
          </div>

          <div style={{ padding: "18px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            {ticket.qrToken ? (
              <ReservationQr qrToken={ticket.qrToken} downloadName={BRAND_QR_DOWNLOAD_BASENAME} familyBookingId={booking.familyBookingId} />
            ) : (
              <p role="status" aria-live="polite" style={{ margin: 0, padding: "16px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-accent-soft)", color: "var(--mint-700)", fontSize: 12.5, lineHeight: 1.6, textAlign: "center" }}>
                {ticket.qrNotice}
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 9, width: "100%" }}>
              {/* 공개 화면 표시 마스킹 — API 원본(booking)은 그대로 두고 표시할 때만 가림 */}
              <KV k="참석자명" v={booking.students.map((s) => maskName(s.name)).join(", ")} />
              <KV k="참석 학부모" v={attendancePartySummary(booking.attendanceParty)} />
              {session && <KV k="일시" v={`${fmtSessionCardDateTime(new Date(session.startsAt))} · ${SEMINAR_LOCATION}`} />}
              <KV k="연락처" v={maskPhone(fmtPhone(booking.contact))} />
            </div>
          </div>

          <div style={{ padding: "14px 20px 18px", background: "var(--surface-accent-soft)", display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12.5, color: "var(--mint-700)", lineHeight: 1.55 }}>
            <MessageSquare size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>입장 시 태블릿에 이 QR을 보여 주세요.</span>
          </div>
        </div>

        <Button variant="secondary" onClick={onReset} style={{ marginTop: 18 }}>
          처음으로
        </Button>
      </div>
    </div>
  );
}
