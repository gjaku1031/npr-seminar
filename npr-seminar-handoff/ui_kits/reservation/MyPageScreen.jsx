/* 마이페이지 — 예약 관리 */
function MyPageScreen({ go }) {
  const { Tabs, Badge, Button, Card, Dialog, Toast, Switch } = window.DesignSystem_179b2a;
  const I = window.DSRIcons;
  const D = window.DSR_DATA;
  const [tab, setTab] = React.useState('up');
  const [cancelTarget, setCancelTarget] = React.useState(null);
  const [cancelled, setCancelled] = React.useState([]);
  const [toast, setToast] = React.useState(null);
  const [alarm, setAlarm] = React.useState(true);

  const upcoming = D.myReservations.filter((r) => !cancelled.includes(r.code));
  const doCancel = () => {
    setCancelled([...cancelled, cancelTarget.code]);
    setCancelTarget(null);
    setToast('예약이 취소되었어요');
    setTimeout(() => setToast(null), 3200);
  };

  return (
    <div data-screen-label="마이페이지 — 예약 관리">
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '40px var(--container-pad) 100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both' }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 'var(--tracking-caps)', fontWeight: 700, color: 'var(--text-accent)', marginBottom: 8 }}>MY PAGE</div>
            <h1 style={{ fontSize: 'var(--text-h1)', fontWeight: 800 }}>김수민 님의 예약</h1>
          </div>
          <Switch label="마감 임박 알림" checked={alarm} onChange={setAlarm} />
        </div>

        <div style={{ margin: '26px 0 22px' }}>
          <Tabs
            items={[
              { label: '예정된 설명회', value: 'up', count: upcoming.length },
              { label: '지난 설명회', value: 'past', count: D.pastReservations.length },
              { label: '취소됨', value: 'cancel', count: cancelled.length },
            ]}
            value={tab} onChange={setTab}
          />
        </div>

        {tab === 'up' && (
          <div key="up" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {upcoming.map((r, i) => {
              const s = D.sessions.find((x) => x.id === r.sessionId);
              const waiting = r.status === 'waiting';
              return (
                <Card key={r.code} padding="0" style={{ overflow: 'hidden', animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${i * 80}ms both` }}>
                  <div style={{ display: 'flex' }}>
                    <div style={{ width: 8, background: waiting ? 'var(--mint-500)' : 'var(--violet-800)', flexShrink: 0 }}></div>
                    <div style={{ flex: 1, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 18 }}>
                      <div style={{ width: 54, height: 54, borderRadius: 'var(--radius-md)', background: 'var(--surface-brand)', color: 'var(--mint-400)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, flexShrink: 0 }}>
                        {s.university.replace(/대학교|대학/g, '').slice(0, 2)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16.5, color: 'var(--text-strong)' }}>{s.university}</span>
                          {waiting ? <Badge tone="accent" dot>대기 3번</Badge> : <Badge tone="success" dot>예약 확정</Badge>}
                        </div>
                        <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 4 }}>{s.title} · {r.round}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 3, display: 'flex', gap: 14 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><I.calendar size={12.5} /> {s.date}</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><I.mapPin size={12.5} /> {s.place}</span>
                          <span style={{ fontFeatureSettings: '"tnum"', letterSpacing: '0.04em' }}>{r.code}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <Button variant="secondary" size="sm" icon={<I.ticket size={14} />} onClick={() => go('ticket', { sessionId: s.id, round: r.round, name: r.name, seat: waiting ? null : r.seat })}>티켓</Button>
                        <Button variant="ghost" size="sm" onClick={() => setCancelTarget(r)}>취소</Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
            {upcoming.length === 0 && (
              <Card variant="sunken" style={{ textAlign: 'center', padding: 48, color: 'var(--text-faint)' }}>
                예정된 예약이 없어요. <a onClick={() => go('home')} style={{ cursor: 'pointer', fontWeight: 700 }}>설명회 둘러보기 →</a>
              </Card>
            )}
          </div>
        )}

        {tab === 'past' && (
          <div key="past" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {D.pastReservations.map((r, i) => (
              <Card key={i} variant="outline" padding="18px 24px" style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: 0.75, animation: `ds-fade-up var(--dur-base) var(--ease-out) ${i * 70}ms both` }}>
                <span style={{ flex: 1 }}>
                  <b style={{ color: 'var(--text-strong)', fontSize: 14.5 }}>{r.university}</b>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13.5, marginLeft: 10 }}>{r.title}</span>
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>{r.date}</span>
                <Badge tone="neutral">참석 완료</Badge>
              </Card>
            ))}
          </div>
        )}

        {tab === 'cancel' && (
          <div key="cancel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cancelled.length === 0
              ? <Card variant="sunken" style={{ textAlign: 'center', padding: 48, color: 'var(--text-faint)', animation: 'ds-fade-in var(--dur-base) both' }}>취소한 예약이 없어요.</Card>
              : cancelled.map((code, i) => {
                  const r = D.myReservations.find((x) => x.code === code);
                  const s = D.sessions.find((x) => x.id === r.sessionId);
                  return (
                    <Card key={code} variant="outline" padding="18px 24px" style={{ display: 'flex', alignItems: 'center', gap: 16, animation: `ds-fade-up var(--dur-base) var(--ease-out) ${i * 70}ms both` }}>
                      <span style={{ flex: 1, textDecoration: 'line-through', color: 'var(--text-faint)', fontSize: 14.5 }}>{s.university} · {s.title}</span>
                      <Badge tone="danger">취소됨</Badge>
                    </Card>
                  );
                })}
          </div>
        )}
      </div>

      <Dialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="예약을 취소할까요?"
        footer={
          <React.Fragment>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>돌아가기</Button>
            <Button variant="danger" onClick={doCancel}>예약 취소</Button>
          </React.Fragment>
        }
      >
        취소 후에는 잔여석 상황에 따라 재예약이 어려울 수 있어요.
      </Dialog>

      {toast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 120 }}>
          <Toast tone="danger">{toast}</Toast>
        </div>
      )}
    </div>
  );
}

window.MyPageScreen = MyPageScreen;
