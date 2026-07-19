/* 예약 완료 — 티켓 발급 */
function TicketScreen({ go, params }) {
  const { Ticket, Button } = window.DesignSystem_179b2a;
  const I = window.DSRIcons;
  const s = window.DSR_DATA.sessions.find((x) => x.id === params.sessionId) || window.DSR_DATA.sessions[0];
  const code = `${s.id.toUpperCase()}-${s.date.replace(/\D/g, '').padStart(4, '0')}-${String((params.name || '김수민').length * 47).padStart(4, '0')}`;

  return (
    <div data-screen-label="예약 완료 티켓" style={{ minHeight: 'calc(100vh - 65px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px var(--container-pad)', position: 'relative', overflow: 'hidden' }}>
      {/* 잔잔한 블루 파티클 */}
      {[
        { l: '16%', t: '22%', d: '0s', s: 8 }, { l: '80%', t: '18%', d: '0.6s', s: 6 }, { l: '12%', t: '70%', d: '1.2s', s: 5 },
        { l: '86%', t: '64%', d: '0.3s', s: 9 }, { l: '68%', t: '82%', d: '0.9s', s: 5 }, { l: '28%', t: '86%', d: '1.5s', s: 7 },
      ].map((p, i) => (
        <span key={i} style={{ position: 'absolute', left: p.l, top: p.t, width: p.s, height: p.s, borderRadius: '50%', background: 'var(--mint-400)', opacity: 0.5, animation: `ds-float 4.5s var(--ease-in-out) ${p.d} infinite` }}></span>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: 28, animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both' }}>
          <div style={{ width: 58, height: 58, borderRadius: '50%', background: 'var(--violet-900)', color: 'var(--mint-400)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', animation: 'ds-pop var(--dur-hero) var(--ease-spring) both' }}>
            <I.check size={26} sw={2.6} />
          </div>
          <h1 style={{ fontSize: 'var(--text-display)', fontWeight: 800, letterSpacing: 'var(--tracking-display)' }}>예약이 확정됐어요!</h1>
          <p style={{ margin: '10px 0 0', fontSize: 15.5, color: 'var(--text-muted)' }}>티켓을 문자와 이메일로도 보내드렸어요.</p>
        </div>

        <div style={{ animation: 'ds-fade-up var(--dur-hero) var(--ease-spring) 200ms both' }}>
          <Ticket
            university={s.university} title={s.title} round={params.round}
            date={s.date} time={(params.round || '').split(' · ')[1] || s.time}
            place={s.place.split(' · ').pop() + (params.seat ? '' : '')}
            name={params.name || '김수민'}
            code={code}
          />
        </div>
        {params.seat && (
          <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 'var(--radius-pill)', background: 'var(--mint-100)', color: 'var(--mint-700)', fontSize: 13.5, fontWeight: 700, animation: 'ds-pop var(--dur-slow) var(--ease-spring) 700ms both' }}>
            <I.armchair size={15} /> 내 좌석 — {params.seat}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 30, animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 500ms both' }}>
          <Button variant="secondary" icon={<I.calendar size={16} />}>캘린더에 추가</Button>
          <Button variant="secondary" icon={<I.download size={16} />}>티켓 저장</Button>
          <Button onClick={() => go('mypage')} iconRight={<I.arrowRight size={16} />}>내 예약 보기</Button>
        </div>
      </div>
    </div>
  );
}

window.TicketScreen = TicketScreen;
