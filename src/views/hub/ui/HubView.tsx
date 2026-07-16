"use client";

/**
 * 허브 — 카드 런처 (명세 §3, flows ADMIN-F1-04). 와이어프레임 HubScreen 이식.
 * 데이터는 page(RSC)가 props로 내려준다 — views는 서버를 모른다 (설계 §5).
 */

import { useRouter } from "next/navigation";
import type { Session } from "@/entities/session";
import { fmtSessionDate } from "@/shared/lib/format";
import { Icons, LauncherCard } from "@/shared/ui";

export interface HubViewProps {
  sessions: Session[];
  studentCount: number;
  /** 유효 예약(취소 제외) 건수 */
  activeCount: number;
  enteredCount: number;
  /** 최근 발송 시각 표기 — 없으면 null */
  lastSmsAt: string | null;
  devicesOn: number;
}

export function HubView({ sessions, studentCount, activeCount, enteredCount, lastSmsAt, devicesOn }: HubViewProps) {
  const router = useRouter();
  const go = (path: string) => router.push(path);

  return (
    <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "20px var(--container-pad) 70px" }}>
      <div style={{ padding: "26px 0 4px", animation: "ds-fade-up var(--dur-slow) var(--ease-out) both" }}>
        <div style={{ fontSize: 12.5, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)" }}>NPR ADMISSION BRIEFING</div>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "var(--tracking-display)", marginTop: 8 }}>입시설명회 운영 콘솔</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {sessions.map((s) => (
            <span
              key={s.id}
              onClick={() => go("/sessions")}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: "var(--radius-pill)", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)", fontSize: 12.5, fontWeight: 600, color: "var(--text-body)", cursor: "pointer" }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.ended ? "var(--gray-3)" : "var(--mint-500)" }} />
              {s.title} · {fmtSessionDate(s.date)} {s.time}
            </span>
          ))}
          <a
            href="/reserve"
            target="_blank"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: "var(--radius-pill)", background: "var(--surface-brand-soft)", fontSize: 12.5, fontWeight: 700, color: "var(--violet-800)", textDecoration: "none" }}
          >
            <Icons.smartphone size={13} /> 모바일 예약 페이지 열기
          </a>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 30 }}>
        <LauncherCard icon={<Icons.users size={19} />} title="예약 명단" stat={`재원생 ${studentCount}명 · 예약 ${activeCount}건`} onClick={() => go("/students")} tone="brand" delay={0} />
        <LauncherCard icon={<Icons.message size={18} />} title="문자 발송" stat={lastSmsAt ? `최근 발송 ${lastSmsAt}` : "발송 이력 없음"} onClick={() => go("/sms")} delay={70} />
        <LauncherCard icon={<Icons.qr size={18} />} title="설명회 운영" stat={`설명회 ${sessions.length}개 · 입장 ${enteredCount}명`} onClick={() => go("/sessions")} delay={140} />
        <LauncherCard icon={<Icons.clipboard size={18} />} title="간담회 예약" stat="준비 중" onClick={() => go("/counsel")} delay={210} />
        <LauncherCard icon={<Icons.barChart size={18} />} title="통계" stat="예약률 · 참석률 · 캠퍼스별" onClick={() => go("/stats")} delay={280} />
        <LauncherCard icon={<Icons.tablet size={18} />} title="QR 스캐너" stat={`스캐너 ${devicesOn}대 ON`} onClick={() => go("/scanner")} delay={350} />
        <LauncherCard icon={<Icons.smartphone size={18} />} title="모바일 프리뷰" stat="테스트 전용 시연" onClick={() => go("/preview")} delay={420} />
      </div>
    </div>
  );
}
