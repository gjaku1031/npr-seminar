/* 문자 발송 — 템플릿 + 실기기 프리뷰 + 발송 로그 */
function SmsScreen({ store }) {
  const { Button, Input, Select, Tag, Card, Badge, Toast } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const { sessions, reservations, smsTemplates, smsLogs, saveTemplate, addTemplate, deleteTemplate, addSmsLog, CAMPUSES } = store;

  const [tplId, setTplId] = React.useState(smsTemplates[0]?.id);
  const [body, setBody] = React.useState(smsTemplates[0]?.body || '');
  const [sessionId, setSessionId] = React.useState(sessions[0]?.id);
  const [group, setGroup] = React.useState('예약자 전체');
  const [campus, setCampus] = React.useState('송파캠퍼스');
  const [toast, setToast] = React.useState(null);
  const [sending, setSending] = React.useState(false);

  const CINFO = window.NPR_DATA.CAMPUS_INFO || {};
  const cinfo = CINFO[campus] || {};
  const session = sessions.find((s) => s.id === sessionId);
  const rs = reservations.filter((r) => r.sessionId === sessionId && r.campus === campus);
  const targets = { '예약자 전체': rs.filter((r) => r.status !== 'cancelled'), '미체크만': rs.filter((r) => r.status === 'reserved'), '입장 완료': rs.filter((r) => r.status === 'entered'), '취소자': rs.filter((r) => r.status === 'cancelled') };
  const targetCount = targets[group].length;

  const pickTpl = (t) => { setTplId(t.id); setBody(t.body); };
  const vars = ['{학생명}', '{설명회명}', '{일시}', '{장소}', '{QR링크}', '{문의전화}'];
  const rendered = body
    .replaceAll('{학생명}', '김수민').replaceAll('{설명회명}', session ? session.title : '')
    .replaceAll('{일시}', session ? `${session.date} ${session.time}` : '').replaceAll('{장소}', session ? session.place : '')
    .replaceAll('{QR링크}', 'npr.kr/q/x8Fk2').replaceAll('{문의전화}', cinfo.inquiry || '');
  const bytes = new Blob([body]).size;

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3200); };
  const doSave = () => { saveTemplate(tplId, body); flash('템플릿이 저장됐어요'); };
  const doNew = () => { const t = addTemplate('새 템플릿 ' + (smsTemplates.length + 1), body || '[npr] '); setTplId(t.id); setBody(t.body); flash('새 템플릿을 만들었어요'); };
  const doSend = () => {
    setSending(true);
    setTimeout(() => {
      setSending(false);
      addSmsLog({ to: targetCount, template: (smsTemplates.find((t) => t.id === tplId) || {}).name || '직접 작성', session: session.title, campus, ok: targetCount, fail: 0 });
      flash(`${campus} ${targetCount}명에게 발신번호 ${cinfo.sender}로 문자를 발송했어요`);
    }, 900);
  };

  return (
    <div data-screen-label="문자 발송">
      <div style={{ animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both' }}>
        <div style={{ fontSize: 12, letterSpacing: 'var(--tracking-caps)', fontWeight: 700, color: 'var(--text-accent)', marginBottom: 6 }}>SMS</div>
        <h1 style={{ fontSize: 'var(--text-h1)', fontWeight: 800 }}>문자 발송</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr 300px', gap: 14, marginTop: 20, alignItems: 'start' }}>
        {/* 템플릿 목록 */}
        <Card padding="14px" style={{ animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 60ms both' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 6px 10px' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>템플릿</span>
            <button onClick={doNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--violet-800)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}><I.plus size={13} /> 생성</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {smsTemplates.map((t) => (
              <div key={t.id} onClick={() => pickTpl(t)} style={{ position: 'relative', padding: '11px 30px 11px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: tplId === t.id ? 'var(--surface-brand-soft)' : 'transparent', border: tplId === t.id ? '1.5px solid var(--violet-800)' : '1px solid var(--border-hairline)', transition: 'all var(--dur-fast) var(--ease-out)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{t.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.body.split('\n')[0]}</div>
                <button title="템플릿 삭제" onClick={(e) => { e.stopPropagation(); if (smsTemplates.length <= 1) { flash('마지막 템플릿은 삭제할 수 없어요'); return; } deleteTemplate(t.id); if (tplId === t.id) { const nx = smsTemplates.find((x) => x.id !== t.id); if (nx) { setTplId(nx.id); setBody(nx.body); } } flash('템플릿을 삭제했어요'); }}
                  style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-faint)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><I.x size={12} /></button>
              </div>
            ))}
          </div>
          <Button variant="secondary" size="sm" fullWidth icon={<I.save size={14} />} onClick={doSave} style={{ marginTop: 12 }}>현재 내용 저장</Button>
        </Card>

        {/* 작성 영역 */}
        <Card padding="20px" style={{ animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 120ms both' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select options={sessions.map((s) => ({ label: s.title, value: s.id }))} value={sessionId} onChange={setSessionId} style={{ flex: 1, minWidth: 220 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              {Object.keys(targets).map((g) => <Tag key={g} selected={group === g} onClick={() => setGroup(g)} count={targets[g].length} style={{ height: 32 }}>{g}</Tag>)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-faint)', marginRight: 2 }}>캠퍼스</span>
            {CAMPUSES.map((c) => <Tag key={c} selected={campus === c} onClick={() => setCampus(c)} style={{ height: 30 }}>{c.replace('캠퍼스', '')}</Tag>)}
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--surface-sunken)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-pill)', padding: '5px 11px', fontFeatureSettings: '"tnum"' }}>
              <I.phone size={11} /> 발신·문의 <b style={{ color: 'var(--text-strong)' }}>{cinfo.sender}</b>
            </span>
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9}
            style={{ width: '100%', marginTop: 14, padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-soft)', background: 'var(--surface-card)', fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.65, color: 'var(--text-strong)', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-faint)', marginRight: 2 }}>변수</span>
            {vars.map((v) => (
              <button key={v} onClick={() => setBody(body + v)} style={{ padding: '4px 10px', borderRadius: 'var(--radius-pill)', border: '1px dashed var(--mint-500)', background: 'var(--mint-50)', color: 'var(--mint-700)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{v}</button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: bytes > 90 ? 'var(--status-warning)' : 'var(--text-faint)', fontFeatureSettings: '"tnum"' }}>{bytes} byte · {bytes > 90 ? 'LMS' : 'SMS'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-hairline)' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>수신 대상 <b style={{ color: 'var(--text-strong)', fontFeatureSettings: '"tnum"' }}>{targetCount}명</b> · {campus} · {group}</span>
            <Button disabled={targetCount === 0 || sending || !body.trim()} onClick={doSend} icon={<I.send size={15} />}>{sending ? '발송 중…' : '문자 발송'}</Button>
          </div>
        </Card>

        {/* 모바일 프리뷰 */}
        <div style={{ animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 180ms both' }}>
          <div style={{ width: 280, margin: '0 auto', borderRadius: 38, background: 'var(--violet-950)', padding: 10, boxShadow: 'var(--shadow-float)' }}>
            <div style={{ borderRadius: 30, background: '#EEF1F5', overflow: 'hidden' }}>
              <div style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 78, height: 18, borderRadius: 12, background: 'var(--violet-950)' }}></span></div>
              <div style={{ padding: '8px 14px 6px', textAlign: 'center', borderBottom: '1px solid rgba(15,23,42,0.07)' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--violet-900)', color: 'var(--mint-400)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12 }}>npr</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-strong)', marginTop: 4 }}>npr 입시설명회</div>
              </div>
              <div style={{ padding: '14px 12px 18px', minHeight: 260 }}>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: 'center', marginBottom: 10 }}>오늘 오후 2:14</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                  <div style={{ maxWidth: 200, padding: '10px 12px', borderRadius: '4px 16px 16px 16px', background: '#FFFFFF', border: '1px solid rgba(15,23,42,0.08)', fontSize: 12, lineHeight: 1.6, color: 'var(--text-strong)', whiteSpace: 'pre-wrap', animation: 'ds-pop var(--dur-base) var(--ease-spring) both' }} key={rendered}>{rendered || '내용을 입력하세요'}</div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-faint)', marginTop: 8 }}>수신 화면 미리보기 — 변수는 예시 값으로 표시</div>
        </div>
      </div>

      {/* 발송 로그 */}
      <Card padding="0" style={{ marginTop: 14, overflow: 'hidden', animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 240ms both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 20px', borderBottom: '1px solid var(--border-hairline)' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>발송 로그</span>
          <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>최근 30일</span>
          <span style={{ flex: 1 }}></span>
          <Badge tone="success" size="sm">성공률 99.1%</Badge>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.5fr 1.8fr 0.8fr 0.7fr 0.7fr 0.7fr', padding: '10px 20px', background: 'var(--surface-sunken)', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>
          <span>발송 시각</span><span>템플릿</span><span>설명회</span><span>캠퍼스</span><span>수신</span><span>성공</span><span>실패</span>
        </div>
        {smsLogs.map((l, i) => (
          <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.5fr 1.8fr 0.8fr 0.7fr 0.7fr 0.7fr', padding: '11px 20px', borderTop: '1px solid var(--border-hairline)', fontSize: 13, color: 'var(--text-body)', fontFeatureSettings: '"tnum"', animation: `ds-fade-up var(--dur-base) var(--ease-out) ${i * 50}ms both` }}>
          <span>{l.when}</span><span style={{ fontWeight: 600, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: 6 }}>{l.template}{l.auto && <Badge tone="info" size="sm">자동</Badge>}</span><span style={{ color: 'var(--text-muted)' }}>{l.session}</span><span>{(l.campus || '전체').replace('캠퍼스', '')}</span><span>{l.to}명</span><span style={{ color: 'var(--status-success)', fontWeight: 700 }}>{l.ok}</span><span style={{ color: l.fail ? 'var(--status-danger)' : 'var(--text-faint)', fontWeight: l.fail ? 700 : 400 }}>{l.fail}</span>
          </div>
        ))}
      </Card>

      {toast && <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 120 }}><Toast tone="success">{toast}</Toast></div>}
    </div>
  );
}
window.SmsScreen = SmsScreen;
