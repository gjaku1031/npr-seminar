/* 카드 런처 허브 — 메인 화면 (단일 관리자) */
function HubScreen({ store, go }) {
  const { LauncherCard, Badge } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const { students, sessions, reservations, smsLogs, devices } = store;

  const active = reservations.filter((r) => r.status !== 'cancelled');
  const entered = active.filter((r) => r.status === 'entered');
  const devOn = devices.filter((d) => d.on).length;

  return (
    <div data-screen-label="허브 — 카드 런처" style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: '20px var(--container-pad) 70px' }}>
      <div style={{ padding: '26px 0 4px', animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both' }}>
        <div style={{ fontSize: 12.5, letterSpacing: 'var(--tracking-caps)', fontWeight: 700, color: 'var(--text-accent)' }}>NPR ADMISSION BRIEFING</div>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: 'var(--tracking-display)', marginTop: 8 }}>입시설명회 운영 콘솔</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {sessions.map((s) => (
            <span key={s.id} onClick={() => go('sessions')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 'var(--radius-pill)', background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', boxShadow: 'var(--shadow-card)', fontSize: 12.5, fontWeight: 600, color: 'var(--text-body)', cursor: 'pointer' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.ended ? 'var(--gray-3)' : 'var(--mint-500)' }}></span>
              {s.title} · {s.date} {s.time}
            </span>
          ))}
          <a href="mobile.html" target="_blank" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--radius-pill)', background: 'var(--surface-brand-soft)', fontSize: 12.5, fontWeight: 700, color: 'var(--violet-800)', textDecoration: 'none' }}><I.smartphone size={13} /> 모바일 예약 페이지 열기</a>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 30 }}>
        <LauncherCard icon={<I.users size={19} />} title="예약 명단" stat={`재원생 ${students.length}명 · 예약 ${active.length}건`} onClick={() => go('students')} tone="brand" delay={0} />
        <LauncherCard icon={<I.message size={18} />} title="문자 발송" stat={smsLogs[0] ? `최근 발송 ${smsLogs[0].when}` : '발송 이력 없음'} onClick={() => go('sms')} delay={70} />
        <LauncherCard icon={<I.qr size={18} />} title="설명회 운영" stat={`설명회 ${sessions.length}개 · 입장 ${entered.length}명`} onClick={() => go('sessions')} delay={140} />
        <LauncherCard icon={<I.clipboard size={18} />} title="간담회 예약" stat="준비 중" onClick={() => go('counsel')} delay={210} />
        <LauncherCard icon={<I.barChart size={18} />} title="통계" stat="예약률 · 참석률 · 캠퍼스별" onClick={() => go('stats')} delay={280} />
        <LauncherCard icon={<I.tablet size={18} />} title="QR 스캐너" stat={`스캐너 ${devOn}대 ON`} onClick={() => go('scanner')} delay={350} />
        <LauncherCard icon={<I.smartphone size={18} />} title="모바일 프리뷰" stat="테스트 전용 시연" onClick={() => go('preview')} delay={420} />
      </div>
    </div>
  );
}
window.HubScreen = HubScreen;
