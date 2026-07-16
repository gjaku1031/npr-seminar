/**
 * 입장 QR 패스 (공개, 모바일) — qr-poc verify/[token] 페이지 이식.
 * 예약 확정 문자의 `/q/{token}` 링크가 여는 화면: 학부모가 현장에서 스캐너에 제시하는 QR.
 * 페이지를 여는 것만으로는 입장 처리되지 않는다 — 입장 확정은 스캐너의 체크인 액션이 한다 (명세 §9.2).
 */

import { ReservationQr, type Reservation } from "@/entities/reservation";
import type { Session } from "@/entities/session";
import { fmtDateTime, fmtSessionDate } from "@/shared/lib/format";
import { KV, ResStatusBadge } from "@/shared/ui";

export interface QrPassViewProps {
  reservation: Reservation | null;
  session: Session | null;
}

export function QrPassView({ reservation, session }: QrPassViewProps) {
  if (!reservation || !session) {
    return (
      <Frame>
        <div style={{ width: "100%", maxWidth: 330, borderRadius: "var(--radius-lg)", background: "var(--surface-card)", boxShadow: "var(--shadow-raised)", padding: "34px 24px", textAlign: "center", animation: "ds-fade-up var(--dur-slow) var(--ease-spring) both" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>⚠️</div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: "var(--status-danger)" }}>유효하지 않은 QR</h1>
          <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6 }}>
            링크가 만료됐거나 잘못된 주소예요.
            <br />
            예약 확정 문자의 링크로 다시 접속해 주세요.
          </p>
        </div>
      </Frame>
    );
  }

  const cancelled = reservation.status === "cancelled";
  const entered = reservation.status === "entered";

  return (
    <Frame>
      <div style={{ width: "100%", maxWidth: 330, borderRadius: "var(--radius-lg)", background: "var(--surface-card)", boxShadow: "var(--shadow-raised)", overflow: "hidden", animation: "ds-fade-up var(--dur-slow) var(--ease-spring) both" }}>
        {/* 티켓 헤더 — 완료 티켓(명세 §10.7)과 같은 브랜드 밴드 */}
        <div style={{ background: "var(--surface-brand)", color: "var(--text-on-brand)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: "var(--tracking-caps)", color: "var(--mint-400)", fontWeight: 700 }}>NPR ADMISSION QR</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16.5, marginTop: 4, lineHeight: 1.35 }}>{session.title}</div>
          </div>
          <ResStatusBadge status={reservation.status} size="sm" />
        </div>

        <div style={{ padding: "20px 20px 16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          {cancelled ? (
            <div style={{ width: "100%", borderRadius: "var(--radius-md)", background: "var(--surface-sunken)", padding: "26px 16px", textAlign: "center", fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
              취소된 예약의 QR이에요.
              <br />
              재예약은 예약 페이지에서 진행해 주세요.
            </div>
          ) : (
            <ReservationQr
              qrToken={reservation.qrToken}
              size={216}
              downloadName={`${reservation.name}_${session.title}_QR`}
              showUrl
            />
          )}

          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px", marginTop: 18 }}>
            <KV k="예약 학생명" v={reservation.name} />
            <KV k="예약번호" v={reservation.code} />
            <KV k="일시" v={`${fmtSessionDate(session.date)} ${session.time}`} />
            <KV k="장소" v={session.place} />
            {session.attendField && (
              <KV k="참석 학부모" v={(reservation.reservedBy || "모").split(",").join(" · ")} />
            )}
            <KV k="참석 인원" v={`${reservation.attendCount}명`} />
          </div>
        </div>

        {/* 상태 안내 — 입장 대기/이미 입장/취소 (API 명세 §2.4 상태 구분) */}
        <div
          style={{
            padding: "13px 20px 16px",
            background: entered ? "rgba(245,158,11,0.12)" : cancelled ? "rgba(239,68,68,0.08)" : "var(--surface-accent-soft)",
            fontSize: 12.5,
            lineHeight: 1.6,
            color: entered ? "var(--status-warning)" : cancelled ? "var(--status-danger)" : "var(--mint-700)",
            fontWeight: 600,
          }}
        >
          {entered && reservation.enteredAt
            ? `이미 입장 처리된 QR이에요 — 최초 입장 ${fmtDateTime(reservation.enteredAt)}`
            : cancelled
              ? "이 QR로는 입장할 수 없어요."
              : "설명회 당일 입구 태블릿에 이 QR을 보여주세요. 페이지를 여는 것만으로는 입장 처리되지 않아요."}
        </div>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: "var(--surface-page)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 18px 6px", display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--violet-900)", color: "var(--mint-400)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 12 }}>
          npr
        </span>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: "var(--text-strong)", fontFamily: "var(--font-display)" }}>npr 입시설명회</span>
      </div>
      <div style={{ flex: 1, padding: "14px 18px 34px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start" }}>
        {children}
      </div>
    </div>
  );
}
