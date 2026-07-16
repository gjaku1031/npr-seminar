import { isFull, isNearlyFull, remainingSeats, type Session, type SessionStats } from "@/entities/session";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

export interface ReserveViewProps {
  sessions: Array<{ session: Session; stats: SessionStats }>;
}

/**
 * 학부모 모바일 예약 — 설명회 선택 (명세 §10.1, flows PARENT-P1).
 * 로그인 없는 공개 화면. 잔여석 게이지: 임박(15%↓) 경고 / 마감 시 비활성.
 *
 * 범위: 설명회 선택 화면까지. 재원생 조회·가족 선택·비재원 폼·완료 티켓(P2~P6)은
 * 액션(features/create-reservation)이 준비돼 있고 화면 구현 단계에서 채운다.
 */
export function ReserveView({ sessions }: ReserveViewProps) {
  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <header className="mb-6">
        <p className="text-lg font-bold text-ink">npr</p>
        <h1 className="mt-2 text-xl font-bold text-ink">입시설명회 예약</h1>
        <p className="mt-1 text-sm text-muted">참석하실 설명회를 선택하세요.</p>
      </header>

      {sessions.length === 0 ? (
        <p className="text-sm text-faint">예약 가능한 설명회가 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {sessions.map(({ session, stats }) => {
            const full = isFull(stats.active, session.capacity);
            const nearly = isNearlyFull(stats.active, session.capacity);
            const left = remainingSeats(stats.active, session.capacity);

            return (
              <li key={session.id}>
                <article
                  className={`rounded-md border p-4 shadow-card ${
                    full ? "border-hairline bg-sunken opacity-60" : "border-hairline bg-card"
                  }`}
                >
                  <h2 className="font-semibold text-ink">{session.title}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {dateFormat.format(session.date)} {session.time} · {session.place}
                  </p>
                  {session.notice && <p className="mt-2 text-xs text-muted">{session.notice}</p>}

                  <p className="mt-3 text-sm">
                    {full ? (
                      <span className="text-faint">마감되었습니다</span>
                    ) : (
                      <span className={nearly ? "text-warning" : "text-muted"}>
                        잔여 {left}석 {nearly && "· 마감 임박"}
                      </span>
                    )}
                  </p>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
