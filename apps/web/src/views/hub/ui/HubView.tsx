"use client";

/**
 * 허브 — 카드 런처 (명세 §3, flows ADMIN-F1-04). 와이어프레임 HubScreen 이식.
 *
 * 데이터는 계약(Nest /api/v1)에서 직접 읽는다.
 *
 * ★ 예약·입장은 **가족 예약 건수**다 (좌석 수가 아니다 — 한 가족이 2석을 쓸 수 있다).
 *   회차를 가리지 않은 전 회차 기준이라 카드 문구도 "전체"라고만 말한다.
 */

import { useRouter } from "next/navigation";
import { useHubSummary } from "@/features/admin-overview";
import { BRANCH_LABELS } from "@/shared/api";
import { fmtSessionDate } from "@/shared/lib/format";
import { Icons, LauncherCard } from "@/shared/ui";

export function HubView() {
  const router = useRouter();
  const go = (path: string) => router.push(path);
  const { summary, loading, error } = useHubSummary();

  /** 아직 모르는 값을 0으로 그리지 않는다 — 0건과 "읽는 중"은 다른 말이다. */
  const stat = (text: string) => (loading ? "불러오는 중…" : error !== null ? "불러오지 못했어요" : text);

  return (
    <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "20px var(--container-pad) 70px" }}>
      <div style={{ padding: "26px 0 4px", animation: "ds-fade-up var(--dur-slow) var(--ease-out) both" }}>
        <div style={{ fontSize: 12.5, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)" }}>NPR ADMISSION BRIEFING</div>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "var(--tracking-display)", marginTop: 8 }}>입시설명회 운영 콘솔</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {(summary?.sessions ?? []).map((option) => {
            const { session, seminarTitle } = option;
            const closed = session.status === "CLOSED" || session.status === "CANCELLED";
            const scope = session.branch === null ? "전체" : BRANCH_LABELS[session.branch];
            return (
              <button
                key={session.seminarSessionId}
                type="button"
                onClick={() => go("/sessions")}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: "var(--radius-pill)", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "var(--text-body)", cursor: "pointer" }}
              >
                {/* 상태 점은 장식이다 — 같은 사실을 옆 텍스트가 이미 말한다. */}
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: closed ? "var(--gray-3)" : "var(--mint-500)" }} />
                {seminarTitle} · {fmtSessionDate(new Date(session.startsAt))} · {scope}
              </button>
            );
          })}
          {/* 학부모 예약 앱은 이제 루트다 — 옛 /reserve 는 여기로 308 이동한다 */}
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: "var(--radius-pill)", background: "var(--surface-brand-soft)", fontSize: 12.5, fontWeight: 700, color: "var(--violet-800)", textDecoration: "none" }}
          >
            <Icons.smartphone size={13} /> 모바일 예약 페이지 열기
          </a>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 30 }}>
        <LauncherCard
          icon={<Icons.users size={19} />}
          title="예약 명단"
          stat={stat(`재원생 ${summary?.studentCount.toLocaleString("ko-KR") ?? 0}명 · 예약 ${summary?.activeBookingCount.toLocaleString("ko-KR") ?? 0}건`)}
          onClick={() => go("/students")}
          tone="brand"
          delay={0}
        />
        {/* 이번 배포에서는 문자 작업을 명시적으로 중단했다 — 가짜 발송 화면으로 보내지 않는다. */}
        <LauncherCard icon={<Icons.message size={18} />} title="문자 발송" stat="이번 배포에서 중단" locked delay={70} />
        <LauncherCard
          icon={<Icons.qr size={18} />}
          title="설명회 운영"
          stat={stat(`회차 ${summary?.sessions.length ?? 0}개 · 입장 ${summary?.checkedInBookingCount.toLocaleString("ko-KR") ?? 0}건`)}
          onClick={() => go("/sessions")}
          delay={140}
        />
        <LauncherCard icon={<Icons.clipboard size={18} />} title="간담회 예약" stat="준비 중" onClick={() => go("/counsel")} delay={210} />
        <LauncherCard icon={<Icons.barChart size={18} />} title="통계" stat="회차별 예약률 · 참석률" onClick={() => go("/stats")} delay={280} />
        <LauncherCard
          icon={<Icons.tablet size={18} />}
          title="QR 스캐너"
          stat={stat(`스캐너 ${summary?.devicesOnline ?? 0}대 온라인`)}
          onClick={() => go("/scanner")}
          delay={350}
        />
      </div>
    </div>
  );
}
