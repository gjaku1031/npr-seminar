import { reservationRate, type Session, type SessionStats } from "@/entities/session";
import { reservationStatusLabel, reservationChannelLabel, type Reservation } from "@/entities/reservation";
import { CreateSessionForm } from "@/features/create-session";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

export interface SessionsViewProps {
  sessions: Array<{ session: Session; stats: SessionStats }>;
  selected: { session: Session; stats: SessionStats } | null;
  reservations: Reservation[];
}

/**
 * 설명회 운영 — QR 현황 대시보드 (명세 §7).
 * 데이터는 page(RSC)가 props로 내려준다 (설계 §5).
 *
 * 범위: 조회·생성 뼈대. 행 액션(체크인·롤백·전환)과 상세 패널은 액션이 준비돼 있고
 * UI 배선은 화면 구현 단계에서 채운다 (features/check-in · manage-reservation · manage-student).
 */
export function SessionsView({ sessions, selected, reservations }: SessionsViewProps) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-ink">설명회 운영</h1>
        <p className="mt-1 text-sm text-muted">QR 현황 대시보드 · 예약·입장 관리</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* 설명회 목록 (명세 §7.1) */}
        <aside className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">설명회 ({sessions.length})</h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-faint">등록된 설명회가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map(({ session, stats }) => {
                const rate = reservationRate(stats.active, session.capacity);
                const isSelected = selected?.session.id === session.id;
                return (
                  <li key={session.id}>
                    <a
                      href={`/sessions?id=${session.id}`}
                      className={`block rounded-sm border p-3 transition-shadow hover:shadow-card ${
                        isSelected ? "border-brand bg-brand-soft" : "border-hairline bg-card"
                      }`}
                    >
                      <p className="font-medium text-ink">{session.title}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {dateFormat.format(session.date)} {session.time} · {session.round}회차
                      </p>
                      <p className="mt-2 text-xs">
                        <span className={rate >= 90 ? "text-danger" : "text-muted"}>
                          {stats.active}/{session.capacity} ({rate}%)
                        </span>
                        {session.ended && <span className="ml-2 text-faint">종료됨</span>}
                      </p>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <div className="space-y-6">
          {selected && (
            <>
              {/* 현황 체크 카드 5장 (명세 §7.4) */}
              <section>
                <h2 className="mb-3 text-lg font-semibold text-ink">
                  {selected.session.title}
                  {selected.session.attendField && (
                    <span className="ml-2 align-middle text-xs text-accent">참석 인원 수집</span>
                  )}
                </h2>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <StatCard label="총 예약" value={`${selected.stats.active}/${selected.session.capacity}`} />
                  <StatCard label="입장 완료" value={selected.stats.entered} />
                  <StatCard label="미체크" value={selected.stats.reserved} />
                  <StatCard label="노쇼" value={selected.stats.noShow} />
                  <StatCard label="취소" value={selected.stats.cancelled} />
                </dl>
              </section>

              {/* 참석자 목록 (명세 §7.5) */}
              <section>
                <h3 className="mb-3 text-sm font-semibold text-muted">참석자 ({reservations.length})</h3>
                {reservations.length === 0 ? (
                  <p className="text-sm text-faint">예약이 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-hairline bg-card">
                    <table className="w-full text-sm">
                      <thead className="border-b border-hairline text-left text-muted">
                        <tr>
                          <th className="p-3 font-medium">이름</th>
                          <th className="p-3 font-medium">학교·학년</th>
                          <th className="p-3 font-medium">연락처</th>
                          <th className="p-3 font-medium">채널</th>
                          <th className="p-3 font-medium">예약번호</th>
                          <th className="p-3 font-medium">상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reservations.map((r) => (
                          <tr key={r.id} className="border-b border-hairline last:border-0">
                            <td className="p-3">
                              {r.name}
                              {!r.member && <span className="ml-1 text-xs text-accent">비재원</span>}
                              {r.groupId && <span className="ml-1 text-xs text-muted">형제</span>}
                            </td>
                            <td className="p-3 text-muted">
                              {r.school} {r.grade}
                            </td>
                            <td className="p-3 text-muted">{r.phone}</td>
                            <td className="p-3 text-muted">{reservationChannelLabel[r.channel]}</td>
                            <td className="p-3 font-mono text-xs text-muted">{r.code}</td>
                            <td className="p-3">{reservationStatusLabel[r.status]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          {/* 새 설명회 생성 (명세 §7.2) */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-muted">새 설명회</h3>
            <CreateSessionForm />
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-sm border border-hairline bg-card p-3 shadow-card">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-ink">{value}</dd>
    </div>
  );
}
