/* 설명회 운영 — 현황 + 만족도 설문 관리·결과 (명단은 '예약 명단' 탭으로 이동) */
function SessionsScreen({ store }) {
  const { Button, Input, Card, Badge, Dialog, Toast, Switch, Tag } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const { sessions, reservations, surveyResponses, addSession, deleteSession, endSession, addSmsLog, updateSurveySms } = store;

  const [selId, setSelId] = React.useState(sessions[0]?.id);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [delOpen, setDelOpen] = React.useState(false);
  const [endOpen, setEndOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [sending, setSending] = React.useState(false);
  const [form, setForm] = React.useState({ title: '', date: '', round: '1회차', place: '', capacity: '', desc: '', attendField: false, notice: '', banner: 'violet' });
  /* 좌측 사이드바 폭 드래그 조절 */
  const [sideW, setSideW] = React.useState(300);
  const startDrag = (e) => { e.preventDefault(); const sx = e.clientX, sw = sideW; const mv = (ev) => setSideW(Math.max(190, Math.min(460, sw + ev.clientX - sx))); const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); };

  const session = sessions.find((s) => s.id === selId) || sessions[0];
  const rs = session ? reservations.filter((r) => r.sessionId === session.id) : [];
  const entered = rs.filter((r) => r.status === 'entered');
  const unchecked = rs.filter((r) => r.status === 'reserved');
  const cancelled = rs.filter((r) => r.status === 'cancelled');
  const noShow = rs.filter((r) => r.status === 'no_show');
  const activeRs = rs.filter((r) => r.status !== 'cancelled' && r.status !== 'no_show');
  const occupancy = session ? Math.round((activeRs.length / session.capacity) * 100) : 0;

  const surveyRs = (surveyResponses || []).filter((v) => session && v.sessionId === session.id);
  const avgRating = surveyRs.length ? (surveyRs.reduce((a, b) => a + b.rating, 0) / surveyRs.length) : 0;
  const respRate = entered.length ? Math.round((surveyRs.length / entered.length) * 100) : 0;

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3000); };
  const submitCreate = () => {
    const s = addSession({ title: form.title, date: form.date, round: form.round, time: '10:00', place: form.place, capacity: parseInt(form.capacity) || 50, desc: form.desc, attendField: form.attendField, notice: form.notice, banner: form.banner });
    setCreateOpen(false);
    setForm({ title: '', date: '', round: '1회차', place: '', capacity: '', desc: '', attendField: false, notice: '', banner: 'violet' });
    setSelId(s.id);
    flash('설명회가 생성됐어요 — 모바일 예약 화면에 바로 노출됩니다');
  };
  const submitDelete = () => { deleteSession(session.id); setDelOpen(false); setSelId(sessions.find((s) => s.id !== session.id)?.id); flash('설명회가 삭제됐어요'); };
  const doEnd = () => { const n = unchecked.length; endSession(session.id); setEndOpen(false); flash(`설명회를 종료했어요 — 미입장 ${n}명은 내부 노쇼로 집계됩니다`); };
  const doSurveySend = () => {
    setSending(true);
    setTimeout(() => {
      setSending(false);
      addSmsLog({ to: entered.length, template: '만족도 설문 요청', session: session.title, campus: '전체', ok: entered.length, fail: 0 });
      flash(`참석(입장 완료) 학부모 ${entered.length}명에게 설문 URL을 발송했어요`);
    }, 800);
  };
  const smsBytes = new Blob([session ? session.surveySms || '' : '']).size;

  return (
    <div data-screen-label="설명회 운영 대시보드">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both' }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 'var(--tracking-caps)', fontWeight: 700, color: 'var(--text-accent)', marginBottom: 6 }}>QR OPERATIONS</div>
          <h1 style={{ fontSize: 'var(--text-h1)', fontWeight: 800 }}>설명회 운영</h1>
        </div>
        <Button icon={<I.plus size={16} />} onClick={() => setCreateOpen(true)}>새 설명회</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `${sideW}px 14px 1fr`, marginTop: 20, alignItems: 'start' }}>
        {/* 설명회 목록 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sessions.map((s, i) => {
            const srs = reservations.filter((r) => r.sessionId === s.id && r.status !== 'cancelled');
            const sel = s.id === selId;
            return (
              <div key={s.id} onClick={() => setSelId(s.id)} style={{ padding: '16px 18px', borderRadius: 'var(--radius-lg)', cursor: 'pointer', background: sel ? 'var(--surface-brand-soft)' : 'var(--surface-card)', color: 'var(--text-body)', border: sel ? '1.5px solid var(--violet-800)' : '1px solid var(--border-hairline)', boxShadow: sel ? 'var(--shadow-accent-glow)' : 'var(--shadow-card)', transform: sel ? 'scale(1.02)' : 'scale(1)', transition: 'all var(--dur-base) var(--ease-spring)', animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${i * 70}ms both` }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: sel ? 'var(--text-brand)' : 'var(--text-strong)', lineHeight: 1.4 }}>{s.title}</div>
                <div style={{ fontSize: 12, marginTop: 5, color: 'var(--text-muted)' }}>{s.date} · {s.round} · {s.time}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <span style={{ flex: 1, height: 5, borderRadius: 3, background: sel ? 'var(--violet-100)' : 'var(--gray-2)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.min(100, (srs.length / s.capacity) * 100)}%`, background: sel ? 'var(--violet-700)' : 'var(--violet-600)', transition: 'width var(--dur-hero) var(--ease-smooth)' }}></span>
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, fontFeatureSettings: '"tnum"', color: sel ? 'var(--text-brand)' : 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{srs.length}/{s.capacity}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 폭 조절 핸들 */}
        <div onMouseDown={startDrag} title="드래그하여 폭 조절" style={{ cursor: 'col-resize', alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 4, height: 52, borderRadius: 2, background: 'var(--gray-3)' }}></span>
        </div>

        {/* 선택 설명회 대시보드 */}
        {session && (
          <div key={session.id} style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'ds-fade-up var(--dur-base) var(--ease-out) both' }}>
            <Card padding="20px 24px" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 800 }}>{session.title}</h2>
                  {session.attendField && <Badge tone="accent" size="sm">참석 인원 수집</Badge>}
                  {session.ended && <Badge tone="neutral" size="sm">종료됨</Badge>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 5, display: 'flex', gap: 14 }}>
                  <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><I.calendar size={13} /> {session.date} {session.time}</span>
                  <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><I.mapPin size={13} /> {session.place}</span>
                  <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><I.users size={13} /> 정원 {session.capacity}명</span>
                </div>
                {session.desc && <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 6 }}>{session.desc}</div>}
              </div>
              <div style={{ textAlign: 'center', padding: '0 8px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: occupancy >= 90 ? 'var(--status-danger)' : 'var(--violet-800)', fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' }}>{occupancy}%</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>예약률</div>
              </div>
              <div style={{ display: 'flex', gap: 14 }}>
                {!session.ended && <a onClick={() => setEndOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer', whiteSpace: 'nowrap' }}><I.check size={12} /> 설명회 종료</a>}
                <a onClick={() => setDelOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600, color: 'var(--status-danger)', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer', whiteSpace: 'nowrap' }}><I.trash size={12} /> 삭제</a>
              </div>
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <StatCard label="총 예약" value={activeRs.length} suffix={`/ ${session.capacity}`} tone="brand" icon={<I.ticket size={15} />} delay={0} />
              <StatCard label="입장 완료" value={entered.length} suffix="명" tone="success" icon={<I.check size={15} />} delay={50} />
              <StatCard label="미체크" value={unchecked.length} suffix="명" tone="accent" icon={<I.clock size={15} />} delay={100} />
              <StatCard label="취소" value={cancelled.length} suffix="건" tone="danger" icon={<I.x size={15} />} delay={150} />
            </div>

            {/* 만족도 설문 보내기 — 문자 내용 편집 + 참석 학부모 대상 */}
            <Card padding="18px 20px">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <I.star size={15} style={{ color: 'var(--mint-600)' }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>만족도 설문 보내기</span>
                <span style={{ flex: 1 }}></span>
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>대상: 참석(입장 완료) 학부모 <b style={{ color: 'var(--text-strong)', fontFeatureSettings: '"tnum"' }}>{entered.length}명</b></span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4, marginBottom: 10 }}>학부모님이 문자 속 URL로 들어가 <b>별점 · 후기 · 사진</b>을 남깁니다. 문자 내용은 여기서 수정해요.</div>
              <textarea value={session.surveySms || ''} onChange={(e) => updateSurveySms(session.id, e.target.value)} rows={3}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-soft)', background: 'var(--surface-card)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-strong)', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>변수</span>
                {['{학생명}', '{설명회명}', '{설문링크}'].map((v) => (
                  <button key={v} onClick={() => updateSurveySms(session.id, (session.surveySms || '') + v)} style={{ padding: '4px 10px', borderRadius: 'var(--radius-pill)', border: '1px dashed var(--mint-500)', background: 'var(--mint-50)', color: 'var(--mint-700)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{v}</button>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: smsBytes > 90 ? 'var(--status-warning)' : 'var(--text-faint)', fontFeatureSettings: '"tnum"' }}>{smsBytes} byte · {smsBytes > 90 ? 'LMS' : 'SMS'}</span>
                <Button size="sm" icon={<I.send size={14} />} disabled={entered.length === 0 || sending} onClick={doSurveySend}>{sending ? '발송 중…' : '설문 보내기'}</Button>
              </div>
            </Card>

            {/* 만족도 결과 — 캠퍼스·단위·학생·반·담임·HP·별점·후기·사진 */}
            <Card padding="0" style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 20px', borderBottom: '1px solid var(--border-hairline)' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>만족도 설문 결과</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-faint)', fontFeatureSettings: '"tnum"' }}>{surveyRs.length}건 · 응답률 {respRate}%</span>
                <span style={{ flex: 1 }}></span>
                {surveyRs.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, color: 'var(--mint-600)' }}><I.star size={13} style={{ fill: 'var(--mint-500)', color: 'var(--mint-500)' }} /> 평균 {avgRating.toFixed(1)}</span>}
                <Button variant="ghost" size="sm" icon={<I.download size={13} />} disabled={surveyRs.length === 0} onClick={() => flash(`설문 결과 ${surveyRs.length}건을 엑셀(.xlsx)로 저장했어요 — 첨부 사진 파일 포함`)}>엑셀 저장</Button>
              </div>
              {surveyRs.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>아직 응답이 없어요. 설명회 종료 후 설문을 보내보세요.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: 980 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 52px 72px 66px 66px 118px 92px 1.6fr 112px', gap: 10, padding: '10px 20px', background: 'var(--surface-sunken)', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>
                      <span>캠퍼스</span><span>단위명</span><span>학생명</span><span>반명</span><span>담임명</span><span>학부모HP</span><span>별점</span><span>후기</span><span>사진첨부</span>
                    </div>
                    {surveyRs.map((v, i) => (
                      <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '80px 52px 72px 66px 66px 118px 92px 1.6fr 112px', gap: 10, alignItems: 'center', padding: '11px 20px', borderTop: '1px solid var(--border-hairline)', fontSize: 12.5, color: 'var(--text-body)', animation: `ds-fade-up var(--dur-base) var(--ease-out) ${Math.min(i, 10) * 30}ms both` }}>
                        <span>{(v.campus || '').replace('캠퍼스', '')}</span>
                        <span>{v.unit === '중등1' ? '중1' : v.unit === '중등2' ? '중2' : v.unit === '중등3' ? '중3' : v.unit || '—'}</span>
                        <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{v.student}</span>
                        <span>{v.className}</span>
                        <span>{v.teacherName || '—'}</span>
                        <span style={{ fontFeatureSettings: '"tnum"', fontSize: 11.5 }}>{v.phone}</span>
                        <span style={{ display: 'flex', gap: 1 }}>{[1, 2, 3, 4, 5].map((n) => <I.star key={n} size={11} style={{ color: n <= v.rating ? 'var(--mint-500)' : 'var(--gray-3)', fill: n <= v.rating ? 'var(--mint-500)' : 'none' }} />)}</span>
                        <span title={v.comment || ''} style={{ color: v.comment ? 'var(--text-body)' : 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: v.comment && v.comment.length > 20 ? 'help' : 'default' }}>{v.comment || '—'}</span>
                        <span>{v.photo ? <a href="#" onClick={(e) => { e.preventDefault(); flash(`${v.photoName || '사진.jpg'} 다운로드를 시작했어요`); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--violet-800)', textDecoration: 'underline', textUnderlineOffset: 2 }}><I.download size={11} />{v.photoName || '사진.jpg'}</a> : <span style={{ color: 'var(--text-faint)' }}>—</span>}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* 새 설명회 생성 */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="새 설명회 만들기" width={520}
        footer={<React.Fragment><Button variant="ghost" onClick={() => setCreateOpen(false)}>취소</Button><Button disabled={!form.title || !form.date || !form.place} onClick={submitCreate} icon={<I.check size={15} />}>생성하기</Button></React.Fragment>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="설명회명" placeholder="2027 대입설명회" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
            <Input label="날짜" placeholder="8월 21일 (금)" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
            <Input label="회차" placeholder="1회차" value={form.round} onChange={(v) => setForm({ ...form, round: v })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,0.9fr)', gap: 12 }}>
            <Input label="장소" placeholder="송파 교통회관 2층 대강당" value={form.place} onChange={(v) => setForm({ ...form, place: v })} />
            <Input label="정원" placeholder="800" value={form.capacity} onChange={(v) => setForm({ ...form, capacity: v })} />
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>설명 <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>(선택)</span></span>
            <textarea value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} rows={3} placeholder="설명회 소개를 입력하세요"
              style={{ width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-soft)', background: 'var(--surface-card)', fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.6, color: 'var(--text-strong)', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)' }}>
            <Switch label="참석 인원 필드" checked={form.attendField} onChange={(v) => setForm({ ...form, attendField: v })} />
            <span style={{ fontSize: 12, color: 'var(--text-faint)', paddingLeft: 56 }}>예약 화면에서 참석 인원을 선택받습니다.</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <I.image size={15} style={{ color: 'var(--violet-800)' }} />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>페이지 꾸미기 <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>(모바일 예약 화면)</span></span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>배너 테마</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['violet', '네이비', 'var(--violet-900)'], ['mint', '스카이', 'var(--mint-500)'], ['slate', '슬레이트', 'var(--violet-950)']].map(([k, lbl, col]) => (
                  <button key={k} onClick={() => setForm({ ...form, banner: k })} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 'var(--radius-pill)', border: form.banner === k ? '1.5px solid var(--violet-800)' : '1px solid var(--border-soft)', background: form.banner === k ? 'var(--surface-brand-soft)' : 'var(--surface-card)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--text-body)' }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: col }}></span>{lbl}
                  </button>
                ))}
              </div>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>안내문</span>
              <textarea value={form.notice} onChange={(e) => setForm({ ...form, notice: e.target.value })} rows={2} placeholder="예: 주차는 본관 지하를 이용해 주세요."
                style={{ width: '100%', padding: '11px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-soft)', background: 'var(--surface-card)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-strong)', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
            </label>
          </div>
        </div>
      </Dialog>

      {/* 삭제 확인 */}
      <Dialog open={delOpen} onClose={() => setDelOpen(false)} title="설명회를 삭제할까요?"
        footer={<React.Fragment><Button variant="ghost" onClick={() => setDelOpen(false)}>돌아가기</Button><Button variant="danger" onClick={submitDelete} icon={<I.trash size={14} />}>삭제</Button></React.Fragment>}>
        {session && <span><b>{session.title}</b>과 예약 {activeRs.length}건이 함께 삭제됩니다. 예약자에게 취소 안내 문자가 발송돼요.</span>}
      </Dialog>

      {/* 설명회 종료 */}
      <Dialog open={endOpen} onClose={() => setEndOpen(false)} title="설명회를 종료할까요?" width={440}
        footer={<React.Fragment><Button variant="ghost" onClick={() => setEndOpen(false)}>돌아가기</Button><Button onClick={doEnd} icon={<I.check size={15} />}>종료 처리</Button></React.Fragment>}>
        {session && <span style={{ lineHeight: 1.55 }}><b>{session.title}</b>을 종료합니다. 미입장 <b>{unchecked.length}명</b>은 내부 노쇼로 집계돼요(명단에는 표시되지 않음). 종료 후 참석 학부모에게 설문을 보낼 수 있어요.</span>}
      </Dialog>

      {toast && <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 120 }}><Toast tone="success">{toast}</Toast></div>}
    </div>
  );
}
window.SessionsScreen = SessionsScreen;
