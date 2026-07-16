/* 관리자 대시보드 — 대학 입학처용 */
function AdminScreen() {
  const { Card, Badge, Button, Tabs, Switch } = window.DesignSystem_179b2a;
  const I = window.DSRIcons;
  const D = window.DSR_DATA;
  const [range, setRange] = React.useState('week');
  const [open, setOpen] = React.useState(true);

  const useCountUp = (target, dur = 1100) => {
    const [n, setN] = React.useState(0);
    React.useEffect(() => {
      let raf, t0;
      const tick = (t) => {
        if (!t0) t0 = t;
        const p = Math.min(1, (t - t0) / dur);
        setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [target]);
    return n;
  };

  const total = useCountUp(1284);
  const today = useCountUp(96);
  const waitlist = useCountUp(41);
  const rate = useCountUp(87);

  const Stat = ({ label, value, suffix, trend, delay }) => (
    <Card padding="22px 24px" style={{ animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${delay}ms both` }}>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, color: 'var(--text-strong)', fontFeatureSettings: '"tnum"' }}>{value.toLocaleString()}</span>
        <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>{suffix}</span>
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 10, fontSize: 12, fontWeight: 700, color: 'var(--status-success)' }}>
        <I.trendUp size={13} /> {trend} <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>지난주 대비</span>
      </div>
    </Card>
  );

  const recent = [
    { name: '김수민', type: '수험생', session: '수시 입학설명회 · 2회차', seat: '나열 7번', time: '방금 전', status: 'confirmed' },
    { name: '박정호', type: '학부모', session: '수시 입학설명회 · 3회차', seat: '라열 2번', time: '4분 전', status: 'confirmed' },
    { name: '이서연', type: '수험생', session: '수시 입학설명회 · 2회차', seat: '-', time: '11분 전', status: 'waiting' },
    { name: '최은우', type: '교사', session: '교사 초청 전형 설명회', seat: '가열 12번', time: '23분 전', status: 'confirmed' },
    { name: '한지민', type: '학부모', session: '수시 입학설명회 · 1회차', seat: '-', time: '31분 전', status: 'cancelled' },
  ];

  return (
    <div data-screen-label="관리자 대시보드">
      <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: '40px var(--container-pad) 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both' }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 'var(--tracking-caps)', fontWeight: 700, color: 'var(--text-accent)', marginBottom: 8 }}>ADMIN · 한국대학교 입학처</div>
            <h1 style={{ fontSize: 'var(--text-h1)', fontWeight: 800 }}>예약 현황</h1>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Tabs variant="pill" items={[{ label: '오늘', value: 'day' }, { label: '이번 주', value: 'week' }, { label: '전체', value: 'all' }]} value={range} onChange={setRange} />
            <Button variant="secondary" icon={<I.download size={15} />}>명단 내보내기</Button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 26 }}>
          <Stat label="누적 예약" value={total} suffix="건" trend="+12.4%" delay={0} />
          <Stat label="오늘 신규 예약" value={today} suffix="건" trend="+8.1%" delay={70} />
          <Stat label="대기자" value={waitlist} suffix="명" trend="+5명" delay={140} />
          <Stat label="참석률" value={rate} suffix="%" trend="+2.3%p" delay={210} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, marginTop: 16, alignItems: 'start' }}>
          {/* 회차별 예약률 */}
          <Card padding="24px 26px" style={{ animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 280ms both' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: 'var(--text-h3)', fontWeight: 700 }}>회차별 예약률 — 수시 입학설명회</h3>
              <Switch label="예약 접수" checked={open} onChange={setOpen} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              {[
                { label: '1회차 · 10:00', pct: 100, note: '마감' },
                { label: '2회차 · 14:00', pct: 87, note: '38석 남음' },
                { label: '3회차 · 17:00', pct: 60, note: '121석 남음' },
              ].map((r, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{r.label}</span>
                    <span style={{ color: r.pct === 100 ? 'var(--status-danger)' : 'var(--text-muted)', fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{r.pct}% · {r.note}</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 5, background: 'var(--gray-2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${r.pct}%`, borderRadius: 5, background: r.pct === 100 ? 'var(--gray-3)' : 'linear-gradient(90deg, var(--violet-800), var(--violet-500))', transformOrigin: 'left', animation: `ds-grow-x var(--dur-hero) var(--ease-smooth) ${350 + i * 140}ms both` }}></div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 18, padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--mint-50)', border: '1px solid var(--mint-200)', fontSize: 13, color: 'var(--mint-700)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <I.bell size={15} /> 2회차가 90%에 가까워요 — 대기 접수 전환을 준비하세요.
            </div>
          </Card>

          {/* 실시간 예약 */}
          <Card padding="24px 26px" style={{ animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 350ms both' }}>
            <h3 style={{ fontSize: 'var(--text-h3)', fontWeight: 700, marginBottom: 14 }}>실시간 예약</h3>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recent.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < recent.length - 1 ? '1px solid var(--border-hairline)' : 'none', animation: `ds-slide-in-right var(--dur-base) var(--ease-out) ${420 + i * 70}ms both` }}>
                  <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--violet-50)', color: 'var(--violet-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{r.name[0]}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>{r.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 6 }}>{r.type}</span>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.session} {r.seat !== '-' && `· ${r.seat}`}</div>
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-faint)', flexShrink: 0 }}>{r.time}</span>
                  {r.status === 'confirmed' && <Badge tone="success" size="sm">확정</Badge>}
                  {r.status === 'waiting' && <Badge tone="accent" size="sm">대기</Badge>}
                  {r.status === 'cancelled' && <Badge tone="danger" size="sm">취소</Badge>}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

window.AdminScreen = AdminScreen;
