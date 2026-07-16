/* 설명회 상세 + 예약 패널 */
function DetailScreen({ go, params }) {
  const { Badge, Button, Card, IconButton, Tooltip } = window.DesignSystem_179b2a;
  const I = window.DSRIcons;
  const s = window.DSR_DATA.sessions.find((x) => x.id === params.sessionId) || window.DSR_DATA.sessions[0];
  const initial = s.university.replace(/대학교|대학/g, '').slice(0, 2);

  const InfoRow = ({ icon, label, value }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 38, height: 38, borderRadius: 'var(--radius-sm)', background: 'var(--violet-50)', color: 'var(--violet-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-faint)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-strong)' }}>{value}</span>
      </span>
    </div>
  );

  return (
    <div data-screen-label="설명회 상세">
      <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: '28px var(--container-pad) 80px' }}>
        <button onClick={() => go('home')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', padding: 0, animation: 'ds-fade-in var(--dur-base) var(--ease-out) both' }}>
          <I.arrowLeft size={15} /> 설명회 탐색으로
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, marginTop: 18, alignItems: 'start' }}>
          {/* 본문 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card padding="0" style={{ overflow: 'hidden', animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both' }}>
              <div style={{ background: 'var(--surface-brand)', color: 'var(--text-on-brand)', padding: '34px 34px 30px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -70, right: -50, width: 240, height: 240, borderRadius: '50%', background: 'rgba(56,189,248,0.12)' }}></div>
                <div style={{ display: 'flex', gap: 18, alignItems: 'center', position: 'relative' }}>
                  <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-md)', background: 'rgba(248,250,252,0.10)', border: '1px solid rgba(248,250,252,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 21, color: 'var(--mint-400)' }}>{initial}</div>
                  <div>
                    <div style={{ fontSize: 14, color: 'var(--mint-400)', fontWeight: 700 }}>{s.university}</div>
                    <h1 style={{ fontSize: 30, fontWeight: 800, color: 'var(--gray-0)', letterSpacing: 'var(--tracking-heading)', marginTop: 4 }}>{s.title}</h1>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 7, marginTop: 18, position: 'relative' }}>
                  {s.types.map((t) => (
                    <span key={t} style={{ padding: '4px 12px', borderRadius: 'var(--radius-pill)', background: 'rgba(248,250,252,0.12)', fontSize: 12.5, fontWeight: 700, color: 'var(--gray-1)', whiteSpace: 'nowrap' }}>{t}</span>
                  ))}
                </div>
              </div>
              <div style={{ padding: '26px 34px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
                <InfoRow icon={<I.calendar size={17} />} label="일시" value={`${s.date} ${s.time}`} />
                <InfoRow icon={<I.mapPin size={17} />} label="장소" value={s.place} />
                <InfoRow icon={<I.users size={17} />} label="정원" value={`회차당 ${s.seatsTotal}명`} />
              </div>
            </Card>

            <Card style={{ animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 100ms both' }}>
              <h3 style={{ fontSize: 'var(--text-h3)', fontWeight: 700, marginBottom: 12 }}>어떤 설명회인가요</h3>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--text-body)' }}>{s.desc}</p>
            </Card>

            <Card style={{ animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 200ms both' }}>
              <h3 style={{ fontSize: 'var(--text-h3)', fontWeight: 700, marginBottom: 16 }}>회차별 잔여석</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {s.rounds.map((r) => {
                  const full = r.left === 0;
                  const ratio = r.left / r.total;
                  return (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderRadius: 'var(--radius-md)', background: full ? 'var(--surface-sunken)' : 'var(--surface-brand-soft)', opacity: full ? 0.6 : 1 }}>
                      <span style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text-strong)', width: 90 }}>{r.label}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: 'var(--text-muted)', width: 80 }}><I.clock size={14} /> {r.time}</span>
                      <span style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--gray-2)', overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${ratio * 100}%`, background: ratio <= 0.15 ? 'var(--status-danger)' : 'var(--violet-600)', transition: 'width var(--dur-hero) var(--ease-smooth)' }}></span>
                      </span>
                      {full
                        ? <Badge tone="neutral">마감</Badge>
                        : ratio <= 0.15
                        ? <Badge tone="warning" dot>임박 · {r.left}석</Badge>
                        : <Badge tone="brand">{r.left}석 남음</Badge>}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* 예약 패널 */}
          <div style={{ position: 'sticky', top: 84, display: 'flex', flexDirection: 'column', gap: 14, animation: 'ds-slide-in-right var(--dur-slow) var(--ease-out) 150ms both' }}>
            <Card variant="elevated" padding="26px">
              <div style={{ fontSize: 12, letterSpacing: 'var(--tracking-caps)', fontWeight: 700, color: 'var(--text-accent)' }}>RESERVATION</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, color: 'var(--text-strong)', fontFeatureSettings: '"tnum"' }}>{s.seatsLeft}</span>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/ {s.seatsTotal}석 남음</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--gray-2)', overflow: 'hidden', marginTop: 12 }}>
                <div style={{ height: '100%', width: `${(s.seatsLeft / s.seatsTotal) * 100}%`, background: 'linear-gradient(90deg, var(--violet-700), var(--violet-500))', transition: 'width var(--dur-hero) var(--ease-smooth)' }}></div>
              </div>
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Button size="lg" fullWidth disabled={s.closed} onClick={() => go('booking', { sessionId: s.id })} iconRight={<I.arrowRight size={17} />}>
                  {s.closed ? '예약 마감' : '예약하기'}
                </Button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="secondary" fullWidth icon={<I.bell size={15} />}>빈자리 알림</Button>
                  <Tooltip content="링크 복사"><IconButton variant="outline" size="lg" label="공유"><I.share size={17} /></IconButton></Tooltip>
                </div>
              </div>
              <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.55 }}>
                예약은 무료예요. 시작 24시간 전까지 취소할 수 있어요.
              </div>
            </Card>
            <Card variant="accent" padding="18px 20px">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5, color: 'var(--mint-700)', fontWeight: 600 }}>
                <I.graduationCap size={17} /> 같은 대학의 다른 설명회 2건이 예정돼 있어요
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

window.DetailScreen = DetailScreen;
