/* 홈 — 설명회 탐색 */
function HomeScreen({ go }) {
  const { SessionCard, Tag, Input, Badge } = window.DesignSystem_179b2a;
  const I = window.DSRIcons;
  const { sessions } = window.DSR_DATA;
  const [filter, setFilter] = React.useState('전체');
  const [region, setRegion] = React.useState('전체');
  const [q, setQ] = React.useState('');

  const filters = ['전체', '수시', '정시', '논술', '학생부종합'];
  const regions = ['전체', '서울', '대전', '세종', '부산', '온라인'];

  const list = sessions.filter((s) =>
    (filter === '전체' || s.types.includes(filter)) &&
    (region === '전체' || s.region === region) &&
    (q === '' || (s.university + s.title).includes(q))
  );

  const deadlines = sessions.filter((s) => !s.closed && s.seatsLeft / s.seatsTotal <= 0.25);

  return (
    <div data-screen-label="홈 — 설명회 탐색">
      {/* 히어로 */}
      <section style={{ background: 'var(--surface-brand)', color: 'var(--text-on-brand)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', top: -120, right: -80, width: 380, height: 380, borderRadius: '50%', background: 'rgba(56,189,248,0.10)' }}></div>
        <div style={{ position: 'absolute', bottom: -160, right: 180, width: 260, height: 260, borderRadius: '50%', background: 'rgba(248,250,252,0.05)' }}></div>
        <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: '72px var(--container-pad) 64px', position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 'var(--radius-pill)', background: 'rgba(56,189,248,0.16)', color: 'var(--mint-400)', fontSize: 13, fontWeight: 700, animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both' }}>
            <I.sparkle size={14} /> 2027학년도 설명회 예약이 열렸어요
          </div>
          <h1 style={{ margin: '22px 0 0', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-display-xl)', letterSpacing: 'var(--tracking-display)', lineHeight: 'var(--leading-display)', color: 'var(--gray-0)', animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 90ms both' }}>
            설명회, <span style={{ color: 'var(--mint-400)' }}>놓치지 않게.</span>
          </h1>
          <p style={{ margin: '16px 0 0', fontSize: 17, opacity: 0.78, animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 180ms both' }}>
            전국 대학 입학설명회를 한 곳에서 찾고, 3번의 탭으로 예약을 끝내세요.
          </p>
          <div style={{ maxWidth: 560, marginTop: 32, animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 270ms both' }}>
            <Input size="lg" placeholder="대학 이름이나 전형으로 검색" value={q} onChange={setQ} icon={<I.search size={18} />} />
          </div>
        </div>
        {/* 마감 임박 티커 */}
        {deadlines.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(248,250,252,0.12)', overflow: 'hidden', whiteSpace: 'nowrap', position: 'relative' }}>
            <div style={{ display: 'inline-flex', gap: 0, animation: 'ds-ticker 26s linear infinite', padding: '11px 0' }}>
              {[0, 1].map((dup) => (
                <span key={dup} style={{ display: 'inline-flex' }}>
                  {deadlines.concat(deadlines).map((s, i) => (
                    <span key={dup + '-' + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 28px', fontSize: 13, color: 'var(--mint-200)' }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--mint-500)' }}></span>
                      {s.university} {s.title} — 잔여 {s.seatsLeft}석
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 필터 + 목록 */}
      <section style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: '40px var(--container-pad) 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 'var(--tracking-caps)', fontWeight: 700, color: 'var(--text-accent)', marginBottom: 8 }}>UPCOMING</div>
            <h2 style={{ fontSize: 'var(--text-h1)', fontWeight: 800 }}>다가오는 설명회</h2>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {filters.map((f) => (
              <Tag key={f} selected={filter === f} onClick={() => setFilter(f)}>{f}</Tag>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-faint)', marginRight: 4 }}>지역</span>
          {regions.map((r) => (
            <button key={r} onClick={() => setRegion(r)} style={{
              padding: '5px 12px', borderRadius: 'var(--radius-pill)', border: 'none', cursor: 'pointer',
              background: region === r ? 'var(--mint-100)' : 'transparent',
              color: region === r ? 'var(--mint-700)' : 'var(--text-muted)',
              fontSize: 13, fontWeight: region === r ? 700 : 500, fontFamily: 'var(--font-body)',
              transition: 'all var(--dur-fast) var(--ease-out)',
            }}>{r}</button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 26 }}>
          {list.map((s, i) => (
            <div key={s.id} style={{ animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${i * 70}ms both` }}>
              <SessionCard
                university={s.university} title={s.title} date={s.date} time={s.time} place={s.place}
                types={s.types} seatsLeft={s.seatsLeft} seatsTotal={s.seatsTotal} closed={s.closed}
                onClick={() => go('detail', { sessionId: s.id })}
              />
            </div>
          ))}
        </div>
        {list.length === 0 && (
          <div style={{ padding: '64px 0', textAlign: 'center', color: 'var(--text-faint)', animation: 'ds-fade-in var(--dur-base) var(--ease-out) both' }}>
            조건에 맞는 설명회가 없어요. 필터를 바꿔보세요.
          </div>
        )}
      </section>
    </div>
  );
}

window.HomeScreen = HomeScreen;
