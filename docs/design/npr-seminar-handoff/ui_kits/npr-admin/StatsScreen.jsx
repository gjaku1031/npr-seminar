/* 통계 — 설명회 선택 + 캠퍼스 필터, 채널(모바일/수동), 단위별 예약률·참석률 */
function StatsScreen({ store }) {
  const { Card, Select, Tag } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const { sessions, reservations, students, surveyResponses, CAMPUSES } = store;

  const [sessionId, setSessionId] = React.useState(sessions[0]?.id);
  const [campus, setCampus] = React.useState('전체');
  const session = sessions.find((s) => s.id === sessionId) || sessions[0];

  const inCampus = (c) => campus === '전체' || c === campus;
  const rs = reservations.filter((r) => r.sessionId === session.id && inCampus(r.campus));
  const active = rs.filter((r) => r.status !== 'cancelled');
  const entered = active.filter((r) => r.status === 'entered');
  const noShow = active.filter((r) => r.status === 'no_show');
  const attendRate = active.length ? Math.round((entered.length / active.length) * 100) : 0;
  const noShowRate = active.length ? Math.round((noShow.length / active.length) * 100) : 0;

  /* 채널: 모바일(웹앱) / 수동 */
  const chMobile = active.filter((r) => r.source === '웹앱').length;
  const chManual = active.length - chMobile;
  const chTotal = active.length || 1;
  const mobileDeg = (chMobile / chTotal) * 360;

  /* 단위별 예약률·참석률 (전체 포함) */
  const stuIn = students.filter((s) => inCampus(s.campus));
  const UNITS = ['초등', '중등1', '중등2', '중등3', '특목', '고등', '과학'];
  const unitRows = [{ label: '전체', total: stuIn.length, res: active.filter((r) => r.member).length, ent: entered.filter((r) => r.member).length }].concat(
    UNITS.map((u) => {
      const total = stuIn.filter((s) => s.unit === u || (u === '특목' && (s.unit === '예중1' || s.unit === '예고1'))).length;
      const match = (r) => r.member && (r.unit === u || (u === '특목' && (r.unit === '예중1' || r.unit === '예고1')));
      return { label: u === '중등1' ? '중1' : u === '중등2' ? '중2' : u === '중등3' ? '중3' : u, total, res: active.filter(match).length, ent: entered.filter(match).length };
    })
  );

  const avgRating = surveyResponses.filter((v) => v.sessionId === session.id).reduce((a, b, _, arr) => a + b.rating / arr.length, 0);

  const BarPair = ({ row, i }) => {
    const resRate = row.total ? Math.round((row.res / row.total) * 100) : 0;
    const entRate = row.res ? Math.round((row.ent / row.res) * 100) : 0;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 1fr', gap: 14, alignItems: 'center', animation: `ds-fade-up var(--dur-base) var(--ease-out) ${i * 40}ms both` }}>
        <span style={{ fontSize: 12.5, fontWeight: row.label === '전체' ? 800 : 600, color: 'var(--text-strong)' }}>{row.label}</span>
        <span>
          <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-faint)', marginBottom: 3 }}><span>예약률</span><span style={{ fontFeatureSettings: '"tnum"', fontWeight: 700, color: 'var(--violet-800)' }}>{resRate}% <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>({row.res}/{row.total})</span></span></span>
          <span style={{ display: 'block', height: 8, borderRadius: 4, background: 'var(--gray-2)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${resRate}%`, background: 'var(--violet-600)', transition: 'width var(--dur-hero) var(--ease-smooth)' }}></span></span>
        </span>
        <span>
          <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-faint)', marginBottom: 3 }}><span>참석률</span><span style={{ fontFeatureSettings: '"tnum"', fontWeight: 700, color: 'var(--mint-600)' }}>{entRate}% <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>({row.ent}/{row.res})</span></span></span>
          <span style={{ display: 'block', height: 8, borderRadius: 4, background: 'var(--gray-2)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${entRate}%`, background: 'var(--mint-500)', transition: 'width var(--dur-hero) var(--ease-smooth)' }}></span></span>
        </span>
      </div>
    );
  };

  return (
    <div data-screen-label="통계 대시보드">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both' }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 'var(--tracking-caps)', fontWeight: 700, color: 'var(--text-accent)', marginBottom: 6 }}>ANALYTICS</div>
          <h1 style={{ fontSize: 'var(--text-h1)', fontWeight: 800 }}>운영 통계</h1>
        </div>
        <span style={{ flex: 1 }}></span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          <Select options={sessions.map((s) => ({ label: s.title, value: s.id }))} value={sessionId} onChange={setSessionId} style={{ width: 250 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {['전체'].concat(CAMPUSES).map((c) => <Tag key={c} selected={campus === c} onClick={() => setCampus(c)} style={{ height: 34 }}>{c.replace('캠퍼스', '')}</Tag>)}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginTop: 20 }}>
        <StatCard label="전체 인원" value={stuIn.length} suffix="명" tone="neutral" icon={<I.users size={15} />} delay={0} />
        <StatCard label="총 예약" value={active.length} suffix="건" tone="brand" icon={<I.ticket size={15} />} delay={50} />
        <StatCard label="입장 완료" value={entered.length} suffix="명" tone="success" icon={<I.userCheck size={15} />} delay={100} />
        <StatCard label="참석률" value={attendRate} suffix="%" tone="accent" icon={<I.trendingUp size={15} />} delay={150} />
        <StatCard label="노쇼율" value={noShowRate} suffix="%" tone="neutral" icon={<I.alertTriangle size={15} />} delay={200} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14, marginTop: 14, alignItems: 'start' }}>
        {/* 단위별 예약률·참석률 */}
        <Card padding="20px 22px" style={{ animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 200ms both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <I.barChart size={16} style={{ color: 'var(--violet-800)' }} />
            <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-strong)' }}>단위별 예약률 · 참석률</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>예약률 = 예약/단위 인원 · 참석률 = 참석/예약</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {unitRows.map((row, i) => <BarPair key={row.label} row={row} i={i} />)}
          </div>
        </Card>

        {/* 채널별 예약 (모바일/수동) */}
        <Card padding="20px 22px" style={{ animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 260ms both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <I.pieChart size={16} style={{ color: 'var(--mint-600)' }} />
            <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-strong)' }}>채널별 예약</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 120, height: 120, borderRadius: '50%', background: `conic-gradient(var(--violet-600) 0deg ${mobileDeg}deg, var(--mint-500) ${mobileDeg}deg 360deg)`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 74, height: 74, borderRadius: '50%', background: 'var(--surface-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 21, color: 'var(--text-strong)', fontFeatureSettings: '"tnum"', lineHeight: 1, whiteSpace: 'nowrap' }}>{active.length}</span>
                <span style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>건</span>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[['모바일', chMobile, 'var(--violet-600)'], ['수동', chManual, 'var(--mint-500)']].map(([label, n, color]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }}></span>
                  <span style={{ fontSize: 13, color: 'var(--text-body)', flex: 1 }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', fontFeatureSettings: '"tnum"' }}>{n}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-faint)', width: 34, textAlign: 'right', fontFeatureSettings: '"tnum"' }}>{Math.round((n / chTotal) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-hairline)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <I.star size={14} style={{ color: 'var(--mint-500)', fill: 'var(--mint-500)' }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>평균 만족도 <b style={{ color: 'var(--text-strong)' }}>{avgRating ? avgRating.toFixed(1) : '—'}</b></span>
          </div>
        </Card>
      </div>
    </div>
  );
}
window.StatsScreen = StatsScreen;
