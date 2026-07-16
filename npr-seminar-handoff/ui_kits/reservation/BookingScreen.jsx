/* 예약 플로우 — 회차 → 좌석 → 정보 입력 */
function BookingScreen({ go, params }) {
  const { Stepper, Button, Radio, Input, Checkbox, Card, Badge } = window.DesignSystem_179b2a;
  const I = window.DSRIcons;
  const s = window.DSR_DATA.sessions.find((x) => x.id === params.sessionId) || window.DSR_DATA.sessions[0];
  const [step, setStep] = React.useState(0);
  const [round, setRound] = React.useState(s.rounds.find((r) => r.left > 0)?.id);
  const [seat, setSeat] = React.useState(null);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [who, setWho] = React.useState('student');
  const [agree, setAgree] = React.useState(false);

  const ROWS = ['가', '나', '다', '라', '마', '바'];
  const COLS = 14;
  const taken = (r, c) => ((r * 7 + c * 13 + s.id.length * 3) % 11) < 4;

  const canNext = step === 0 ? !!round : step === 1 ? !!seat : name && phone && agree;
  const roundObj = s.rounds.find((r) => r.id === round);

  const next = () => {
    if (step < 2) setStep(step + 1);
    else go('ticket', { sessionId: s.id, round: `${roundObj.label} · ${roundObj.time}`, seat, name: name || '김수민' });
  };

  return (
    <div data-screen-label="예약 플로우 — 회차/좌석/정보">
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '28px var(--container-pad) 120px' }}>
        <button onClick={() => go('detail', { sessionId: s.id })} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', padding: 0 }}>
          <I.arrowLeft size={15} /> {s.university} · {s.title}
        </button>

        <div style={{ margin: '26px 0 34px', display: 'flex', justifyContent: 'center' }}>
          <Stepper steps={['회차 선택', '좌석 선택', '정보 입력']} current={step} style={{ width: 560 }} />
        </div>

        {/* STEP 1 — 회차 */}
        {step === 0 && (
          <div key="s0" style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both' }}>
            <h2 style={{ fontSize: 'var(--text-h2)', fontWeight: 800, textAlign: 'center', marginBottom: 8 }}>참석할 회차를 선택하세요</h2>
            {s.rounds.map((r, i) => {
              const full = r.left === 0;
              const sel = round === r.id;
              return (
                <div key={r.id}
                  onClick={() => !full && setRound(r.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '20px 24px',
                    borderRadius: 'var(--radius-lg)', cursor: full ? 'not-allowed' : 'pointer',
                    background: sel ? 'var(--surface-brand-soft)' : 'var(--surface-card)',
                    border: sel ? '1.5px solid var(--violet-800)' : '1px solid var(--border-hairline)',
                    boxShadow: sel ? 'var(--shadow-accent-glow)' : 'var(--shadow-card)',
                    opacity: full ? 0.55 : 1,
                    transform: sel ? 'scale(1.01)' : 'scale(1)',
                    transition: 'all var(--dur-base) var(--ease-spring)',
                    animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${i * 70}ms both`,
                  }}>
                  <Radio checked={sel} onChange={() => !full && setRound(r.id)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 16.5, color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>{r.label}</div>
                    <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}><I.clock size={13} /> {s.date} · {r.time} 시작</div>
                  </div>
                  {full ? <Badge tone="neutral">마감</Badge> : r.left / r.total <= 0.15 ? <Badge tone="warning" dot>임박 · {r.left}석</Badge> : <Badge tone="brand">{r.left}석 남음</Badge>}
                </div>
              );
            })}
          </div>
        )}

        {/* STEP 2 — 좌석 */}
        {step === 1 && (
          <div key="s1" style={{ animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both' }}>
            <h2 style={{ fontSize: 'var(--text-h2)', fontWeight: 800, textAlign: 'center', marginBottom: 24 }}>좌석을 선택하세요</h2>
            <Card padding="32px" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
              <div style={{ width: '72%', height: 34, borderRadius: '0 0 60px 60px', background: 'var(--surface-brand)', color: 'var(--mint-400)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, letterSpacing: 'var(--tracking-caps)', fontWeight: 700 }}>STAGE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {ROWS.map((row, ri) => (
                  <div key={row} style={{ display: 'flex', gap: 7, alignItems: 'center', animation: `ds-fade-up var(--dur-base) var(--ease-out) ${ri * 50}ms both` }}>
                    <span style={{ width: 18, fontSize: 11.5, color: 'var(--text-faint)', fontWeight: 700, textAlign: 'center' }}>{row}</span>
                    {Array.from({ length: COLS }).map((_, ci) => {
                      const id = `${row}열 ${ci + 1}번`;
                      const isTaken = taken(ri, ci);
                      const sel = seat === id;
                      return (
                        <button key={ci} disabled={isTaken} onClick={() => setSeat(sel ? null : id)}
                          title={id}
                          style={{
                            width: 30, height: 27, borderRadius: '7px 7px 4px 4px', border: 'none', cursor: isTaken ? 'not-allowed' : 'pointer',
                            background: sel ? 'var(--mint-500)' : isTaken ? 'var(--gray-3)' : 'var(--violet-100)',
                            boxShadow: sel ? 'var(--shadow-accent-glow)' : 'inset 0 -2.5px 0 ' + (sel ? 'var(--mint-600)' : isTaken ? 'var(--gray-3)' : 'var(--violet-200)'),
                            transform: sel ? 'scale(1.18)' : 'scale(1)',
                            transition: 'all var(--dur-fast) var(--ease-spring)',
                          }}></button>
                      );
                    })}
                    <span style={{ width: 18 }}></span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 22, fontSize: 12.5, color: 'var(--text-muted)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 14, height: 13, borderRadius: 4, background: 'var(--violet-100)', boxShadow: 'inset 0 -2px 0 var(--violet-200)' }}></span> 선택 가능</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 14, height: 13, borderRadius: 4, background: 'var(--gray-3)' }}></span> 예약됨</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 14, height: 13, borderRadius: 4, background: 'var(--mint-500)' }}></span> 내 좌석</span>
              </div>
              {seat && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '10px 18px', borderRadius: 'var(--radius-pill)', background: 'var(--surface-brand)', color: 'var(--gray-1)', fontSize: 14, fontWeight: 700, animation: 'ds-pop var(--dur-base) var(--ease-spring) both' }}>
                  <I.armchair size={16} /> {roundObj.label} · {seat}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* STEP 3 — 정보 */}
        {step === 2 && (
          <div key="s2" style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18, animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both' }}>
            <h2 style={{ fontSize: 'var(--text-h2)', fontWeight: 800, textAlign: 'center', marginBottom: 6 }}>예약자 정보를 입력하세요</h2>
            <div style={{ display: 'flex', gap: 18 }}>
              <Radio label="수험생" checked={who === 'student'} onChange={() => setWho('student')} />
              <Radio label="학부모" checked={who === 'parent'} onChange={() => setWho('parent')} />
              <Radio label="교사" checked={who === 'teacher'} onChange={() => setWho('teacher')} />
            </div>
            <Input label="이름" placeholder="김수민" value={name} onChange={setName} />
            <Input label="휴대폰 번호" placeholder="010-0000-0000" value={phone} onChange={setPhone} hint="예약 확정 문자를 보내드려요" />
            <Checkbox label="개인정보 수집·이용에 동의합니다 (필수)" checked={agree} onChange={setAgree} />
          </div>
        )}

        {/* 하단 내비게이션 */}
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'rgba(248,250,252,0.9)', backdropFilter: 'var(--blur-veil)', borderTop: '1px solid var(--border-hairline)', zIndex: 40 }}>
          <div style={{ maxWidth: 880, margin: '0 auto', padding: '14px var(--container-pad)', display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {roundObj && <b style={{ color: 'var(--text-strong)' }}>{roundObj.label}</b>} {seat && <span> · {seat}</span>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}>이전</Button>}
              <Button size="lg" disabled={!canNext} onClick={next} iconRight={step === 2 ? <I.check size={17} /> : <I.arrowRight size={17} />}>
                {step === 2 ? '예약 확정하기' : '다음'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.BookingScreen = BookingScreen;
