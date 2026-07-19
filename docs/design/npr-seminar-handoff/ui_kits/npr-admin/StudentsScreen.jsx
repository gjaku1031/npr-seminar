/* 예약 명단 — 설명회별 재원생 전체 + 비재원생. 11열 테이블 + 예약 드랍다운 + 로그 */
function StudentsScreen({ store }) {
  const { Button, Input, Select, Tag, Card, Badge, Dialog, Toast } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const { students, sessions, reservations, teachers, CAMPUSES, UNIT_TABS, unitMatchesTab, setRosterReservation, addGuest } = store;

  const [sessionId, setSessionId] = React.useState(sessions[0]?.id);
  const [campus, setCampus] = React.useState('송파캠퍼스');
  const [q, setQ] = React.useState('');
  const [unitTab, setUnitTab] = React.useState('전체');
  const [teacherF, setTeacherF] = React.useState('all');
  const [guestOpen, setGuestOpen] = React.useState(false);
  const [guest, setGuest] = React.useState({ name: '', school: '', grade: '', phone: '', campus: CAMPUSES[0], via: '전화예약', who: ['모'] });
  const [toast, setToast] = React.useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const session = sessions.find((s) => s.id === sessionId) || sessions[0];
  const resOf = (stuId) => reservations.find((r) => r.sessionId === session.id && r.studentId === stuId);

  const OPTS = ['-', '예약 (모)', '예약 (부)', '예약 (모,부)', '수동 예약', '예약취소'];
  const optOf = (r) => {
    if (!r) return '-';
    if (r.status === 'cancelled') return '예약취소';
    if (r.reservedBy === '부') return '예약 (부)';
    if (r.reservedBy === '모,부') return '예약 (모,부)';
    if (r.reservedBy === '모') return '예약 (모)';
    return '수동 예약';
  };

  /* 재원생 행 + 비재원생 행 (해당 설명회 예약) */
  const stuRows = students.map((st) => ({ key: st.id, st, r: resOf(st.id), guest: false }));
  const guestRows = reservations.filter((r) => r.sessionId === session.id && !r.member).map((r) => ({ key: r.id, st: null, r, guest: true }));
  const rows = [...stuRows, ...guestRows].filter((row) => {
    const campusV = row.guest ? row.r.campus : row.st.campus;
    if (campus !== '전체' && campusV !== campus) return false;
    if (row.guest) { if (!(unitTab === '전체' || unitTab === '비재원생') || teacherF !== 'all') return false; }
    else {
      if (unitTab === '비재원생') return false;
      if (!unitMatchesTab(row.st.unit, unitTab)) return false;
      if (teacherF !== 'all' && row.st.teacherName !== teacherF) return false;
    }
    const hay = row.guest ? row.r.name + row.r.school + row.r.phone : row.st.name + row.st.school + row.st.motherPhone + row.st.fatherPhone;
    if (q && !hay.includes(q)) return false;
    return true;
  });

  const entryCell = (r) => {
    if (r && r.status === 'entered') return <span style={{ fontSize: 11.5, lineHeight: 1.5, fontFeatureSettings: '"tnum"' }}><b style={{ color: 'var(--status-success)', fontWeight: 700 }}>스캐너 #{r.scannerNo}</b><br /><span style={{ color: 'var(--text-muted)' }}>{r.enteredAt}</span></span>;
    if (r && (r.status === 'reserved' || r.status === 'no_show')) return <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>대기</span>;
    return <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>—</span>;
  };
  const logCell = (r) => {
    const logs = (r && r.logs) || [];
    const last = logs[logs.length - 1];
    if (!last) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
    const history = logs.map((l) => `${l.label}  ${l.at}`).join('\n');
    return (
      <span title={history} style={{ fontSize: 11.5, lineHeight: 1.5, fontFeatureSettings: '"tnum"', cursor: logs.length > 1 ? 'help' : 'default' }}>
        <b style={{ fontWeight: 700, color: 'var(--text-body)' }}>{last.label}</b>{logs.length > 1 && <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface-sunken)', border: '1px solid var(--border-hairline)', borderRadius: 999, padding: '1px 6px' }}>+{logs.length - 1}</span>}<br />
        <span style={{ color: 'var(--text-faint)' }}>{last.at}</span>
      </span>
    );
  };

  const submitGuest = () => {
    if (!guest.name || !guest.phone) return;
    addGuest({ name: guest.name, school: guest.school, grade: guest.grade, phone: guest.phone, campus: guest.campus, reservedBy: guest.who.join(',') }, session.id, guest.via);
    setGuestOpen(false);
    setGuest({ name: '', school: '', grade: '', phone: '', campus: CAMPUSES[0], via: '전화예약', who: ['모'] });
    flash('수동 추가 완료 — ' + guest.via + '로 예약 명단에 추가됐어요');
  };

  const gridCols = '40px 66px 1fr 72px 1fr 52px 72px 126px 118px 128px 1.4fr';
  const toggleGuestWho = (w) => setGuest((g) => { const has = g.who.includes(w); if (has && g.who.length === 1) return g; const next = has ? g.who.filter((x) => x !== w) : g.who.concat(w); return { ...g, who: ['모', '부'].filter((x) => next.includes(x)) }; });

  return (
    <div data-screen-label="예약 명단">
      {/* 상단: 제목(좌) + 설명회 선택·캠퍼스(우측 상단 스택) */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'nowrap', animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both' }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 'var(--tracking-caps)', fontWeight: 700, color: 'var(--text-accent)', marginBottom: 6 }}>RESERVATIONS</div>
          <h1 style={{ fontSize: 'var(--text-h1)', fontWeight: 800, whiteSpace: 'nowrap' }}>예약 명단</h1>
        </div>
        <span style={{ flex: 1 }}></span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
          <Select options={sessions.map((s) => ({ label: `${s.title} · ${s.date}`, value: s.id }))} value={sessionId} onChange={setSessionId} style={{ width: 360, whiteSpace: 'nowrap' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {['전체'].concat(CAMPUSES).map((c) => <Tag key={c} selected={campus === c} onClick={() => setCampus(c)} style={{ height: 34 }}>{c.replace('캠퍼스', '')}</Tag>)}
          </div>
        </div>
      </div>

      {/* 필터: 검색 + 단위 탭 + 담임 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18, flexWrap: 'wrap' }}>
        <Input placeholder="이름·학교·연락처 검색" value={q} onChange={setQ} icon={<I.search size={15} />} style={{ width: 230 }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {UNIT_TABS.concat(['비재원생']).map((t) => <Tag key={t} selected={unitTab === t} onClick={() => setUnitTab(t)}>{t}</Tag>)}
        </div>
        <Select options={[{ label: '담임 전체', value: 'all' }].concat(teachers.map((t) => ({ label: t.name, value: t.name })))} value={teacherF} onChange={setTeacherF} style={{ width: 124 }} />
        <span style={{ flex: 1 }}></span>
        <Button icon={<I.plus size={16} />} onClick={() => setGuestOpen(true)}>수동 추가</Button>
      </div>

      {/* 명단 테이블 */}
      <Card padding="0" style={{ marginTop: 16, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1150 }}>
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 10, padding: '11px 18px', background: 'var(--surface-sunken)', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.02em', alignItems: 'center', textAlign: 'center' }}>
              <span>No</span><span>학번</span><span>학생이름</span><span>반명</span><span>학교</span><span>학년</span><span>담임명</span><span>학부모연락처</span><span>예약</span><span>입장</span><span>로그</span>
            </div>
            {rows.map((row, i) => {
              const st = row.st, r = row.r;
              return (
                <div key={row.key} style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 10, alignItems: 'center', textAlign: 'center', padding: '10px 18px', borderTop: '1px solid var(--border-hairline)', fontSize: 13, color: 'var(--text-body)', background: 'var(--surface-card)', animation: `ds-fade-up var(--dur-base) var(--ease-out) ${Math.min(i, 14) * 18}ms both` }}>
                  <span style={{ color: 'var(--text-faint)', fontFeatureSettings: '"tnum"' }}>{i + 1}</span>
                  <span style={{ fontFeatureSettings: '"tnum"', color: 'var(--text-muted)', fontSize: 12 }}>{row.guest ? '—' : st.no}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{row.guest ? r.name : st.name}</span>
                  <span style={{ color: row.guest ? 'var(--text-faint)' : 'var(--text-body)' }}>{row.guest ? '비재원생' : st.className}</span>
                  <span>{row.guest ? r.school : st.school}</span>
                  <span>{row.guest ? r.grade : st.grade}</span>
                  <span>{row.guest ? <span style={{ color: 'var(--text-faint)' }}>—</span> : st.teacherName}</span>
                  <span style={{ fontFeatureSettings: '"tnum"', fontSize: 11.5, lineHeight: 1.5 }}>
                    {row.guest ? r.phone : <React.Fragment><span style={{ color: 'var(--text-muted)' }}>모 {st.motherPhone}</span><br /><span style={{ color: 'var(--text-faint)' }}>부 {st.fatherPhone}</span></React.Fragment>}
                  </span>
                  <span>
                    {row.guest ? (
                      <Badge tone={r.status === 'cancelled' ? 'danger' : 'brand'} size="sm">{r.status === 'cancelled' ? '예약취소' : r.source}</Badge>
                    ) : (
                      <select value={optOf(r)} onChange={(e) => setRosterReservation(st, session.id, e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-soft)', background: optOf(r) === '-' ? 'var(--surface-card)' : optOf(r) === '예약취소' ? 'var(--status-danger-soft)' : 'var(--surface-brand-soft)', color: optOf(r) === '예약취소' ? 'var(--status-danger)' : 'var(--text-strong)', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center', textAlignLast: 'center' }}>
                        {OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                  </span>
                  <span>{entryCell(r)}</span>
                  <span style={{ fontSize: 11.5 }}>{logCell(r)}</span>
                </div>
              );
            })}
            {rows.length === 0 && <EmptyState>조건에 맞는 명단이 없어요.</EmptyState>}
          </div>
        </div>
      </Card>

      {/* 수동 추가 (비재원생) */}
      <Dialog open={guestOpen} onClose={() => setGuestOpen(false)} title="수동 추가" width={460}
        footer={<React.Fragment><Button variant="ghost" onClick={() => setGuestOpen(false)}>취소</Button><Button onClick={submitGuest} disabled={!guest.name || !guest.phone} icon={<I.plus size={15} />}>추가</Button></React.Fragment>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>반명은 <b>비재원생</b>, 담임은 공란으로 명단에 추가되며 <b>{session.title}</b> 예약으로 등록돼요.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="이름 *" value={guest.name} onChange={(v) => setGuest({ ...guest, name: v })} />
            <Input label="연락처 *" placeholder="010-0000-0000" value={guest.phone} onChange={(v) => setGuest({ ...guest, phone: v })} />
            <Input label="학교" value={guest.school} onChange={(v) => setGuest({ ...guest, school: v })} />
            <Input label="학년" placeholder="예: 중3" value={guest.grade} onChange={(v) => setGuest({ ...guest, grade: v })} />
          </div>
          <Select label="캠퍼스" options={CAMPUSES} value={guest.campus} onChange={(v) => setGuest({ ...guest, campus: v })} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-strong)' }}>참석 학부모 <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>(모·부 복수 선택 가능)</span></span>
            <div style={{ display: 'flex', gap: 8 }}>
              {['모', '부'].map((w) => <Tag key={w} selected={guest.who.includes(w)} onClick={() => toggleGuestWho(w)} style={{ height: 34, minWidth: 64, justifyContent: 'center' }}>{w}</Tag>)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-strong)' }}>예약 경로</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['전화예약', '선생님 예약', '현장 예약'].map((v) => <Tag key={v} selected={guest.via === v} onClick={() => setGuest({ ...guest, via: v })} style={{ height: 34 }}>{v}</Tag>)}
            </div>
          </div>
        </div>
      </Dialog>

      {toast && <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 120 }}><Toast tone="success">{toast}</Toast></div>}
    </div>
  );
}
window.StudentsScreen = StudentsScreen;
