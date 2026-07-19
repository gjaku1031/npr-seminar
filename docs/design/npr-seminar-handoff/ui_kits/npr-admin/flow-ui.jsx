/* npr 유저플로우 문서 — 렌더러 (문서형, 세로 스크롤)
   노드 타입: start/screen/action/decision/state/sms/gate/end
   데이터: window.NPR_FLOWS (flow-data.js) */

const NPRFT = {
  start:    { label: '시작', color: 'var(--mint-500)', bg: 'var(--mint-50)', fg: 'var(--mint-700)' },
  screen:   { label: '화면', color: 'var(--violet-700)', bg: 'var(--violet-50)', fg: 'var(--violet-800)' },
  action:   { label: '동작', color: 'var(--gray-3)', bg: 'var(--surface-sunken)', fg: 'var(--text-muted)' },
  decision: { label: '분기', color: 'var(--status-warning)', bg: 'var(--status-warning-soft)', fg: 'var(--status-warning)' },
  state:    { label: '상태', color: 'var(--status-success)', bg: 'var(--status-success-soft)', fg: 'var(--status-success)' },
  sms:      { label: '문자', color: 'var(--status-info)', bg: 'var(--status-info-soft)', fg: 'var(--status-info)' },
  gate:     { label: '잠금', color: 'var(--status-danger)', bg: 'var(--status-danger-soft)', fg: 'var(--status-danger)' },
  end:      { label: '종료', color: 'var(--violet-950)', bg: 'var(--surface-brand-soft)', fg: 'var(--violet-900)' },
};

const nprIdChip = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--text-muted)', background: 'var(--surface-sunken)', border: '1px solid var(--border-hairline)', borderRadius: 5, padding: '2px 6px' };
const nprTypeChip = { fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', borderRadius: 999, padding: '2px 9px' };
const nprMetaChip = (fg, bg) => ({ fontSize: 11, fontWeight: 600, color: fg, background: bg, borderRadius: 6, padding: '3px 8px', display: 'inline-flex', gap: 4, alignItems: 'center' });

function NPRConnector() {
  return <div style={{ width: 2, height: 18, background: 'var(--border-strong)', margin: '7px 0 7px 24px', borderRadius: 2 }}></div>;
}

function NPRNode({ node, last }) {
  const t = NPRFT[node.type] || NPRFT.action;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', borderLeft: `4px solid ${t.color}`, borderRadius: 'var(--radius-md)', padding: '12px 15px', boxShadow: 'var(--shadow-card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={nprIdChip}>{node.id}</span>
          <span style={{ ...nprTypeChip, background: t.bg, color: t.fg }}>{t.label}</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-strong)' }}>{node.title}</span>
        </div>
        {node.note && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.55 }}>{node.note}</div>}
        {(node.state || node.sms || node.gate) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
            {node.state && <span style={nprMetaChip('var(--status-success)', 'var(--status-success-soft)')}>상태 · {node.state}</span>}
            {node.sms && <span style={nprMetaChip('var(--status-info)', 'var(--status-info-soft)')}>문자 · {node.sms}</span>}
            {node.gate && <span style={nprMetaChip('var(--status-danger)', 'var(--status-danger-soft)')}>권한 · {node.gate}</span>}
          </div>
        )}
      </div>
      {node.branches ? (
        <div style={{ display: 'flex', gap: 16, marginTop: 12, marginLeft: 18, flexWrap: 'wrap' }}>
          {node.branches.map((b, bi) => (
            <div key={bi} style={{ flex: '1 1 300px', minWidth: 270, borderLeft: '2px dashed var(--border-strong)', paddingLeft: 16 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800, color: 'var(--status-warning)', background: 'var(--status-warning-soft)', borderRadius: 999, padding: '3px 11px' }}>◇ {b.cond}</div>
              <div style={{ marginTop: 12 }}>{(b.nodes || []).map((n, i) => <NPRNode key={n.id || i} node={n} last={i === (b.nodes.length - 1)} />)}</div>
            </div>
          ))}
        </div>
      ) : (!last && <NPRConnector />)}
    </div>
  );
}

function NPRFlow({ flow }) {
  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, fontWeight: 800, color: '#fff', background: 'var(--violet-800)', borderRadius: 7, padding: '4px 9px' }}>{flow.id}</span>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-strong)' }}>{flow.name}</h3>
        {flow.desc && <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{flow.desc}</span>}
      </div>
      <div>{flow.nodes.map((n, i) => <NPRNode key={n.id || i} node={n} last={i === flow.nodes.length - 1} />)}</div>
    </div>
  );
}

function NPRPersonaCard({ p }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 18, padding: '24px 26px', borderRadius: 'var(--radius-lg)', background: 'var(--surface-brand)', color: 'var(--text-on-brand)', boxShadow: 'var(--shadow-raised)', overflow: 'hidden', position: 'relative' }}>
      <span style={{ position: 'absolute', top: -50, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(56,189,248,0.14)' }}></span>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(56,189,248,0.2)', color: 'var(--mint-400)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18 }}>{p.name[0]}</span>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20 }}>{p.name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--mint-400)', fontWeight: 700 }}>{p.role}</div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: 'var(--tracking-caps)', fontWeight: 700, opacity: 0.6 }}>목표</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 4, opacity: 0.95 }}>{p.goal}</div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: 'var(--tracking-caps)', fontWeight: 700, opacity: 0.6 }}>주요 진입점</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4, opacity: 0.9 }}>{p.entry}</div>
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: 11, letterSpacing: 'var(--tracking-caps)', fontWeight: 700, opacity: 0.6 }}>이용 시나리오</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {p.scenario.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5 }}>
              <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: 'rgba(248,250,252,0.14)', color: 'var(--mint-400)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, marginTop: 1 }}>{i + 1}</span>
              <span style={{ opacity: 0.92 }}>{s}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {p.perms.map((pm) => (
            <span key={pm.label} style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '4px 11px', background: pm.on ? 'rgba(56,189,248,0.18)' : 'rgba(220,38,38,0.22)', color: pm.on ? 'var(--mint-400)' : '#FCA5A5' }}>{pm.on ? '' : '✕ '}{pm.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function NPRLegend() {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '14px 18px', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', boxShadow: 'var(--shadow-card)' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginRight: 4 }}>노드</span>
      {Object.keys(NPRFT).map((k) => (
        <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-body)' }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, background: NPRFT[k].color }}></span>{NPRFT[k].label}
        </span>
      ))}
      <span style={{ width: 1, height: 18, background: 'var(--border-hairline)', margin: '0 4px' }}></span>
      <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>◇ 분기 조건 · 상태/문자/권한 칩은 노드에 표기</span>
    </div>
  );
}

function NPRFlowApp() {
  const D = window.NPR_FLOWS;
  const [active, setActive] = React.useState(D.personas[0].key);
  const persona = D.personas.find((p) => p.key === active);
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 28px 100px' }}>
      <div style={{ fontSize: 12.5, letterSpacing: 'var(--tracking-caps)', fontWeight: 700, color: 'var(--text-accent)' }}>USER FLOW · 권한별</div>
      <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: 'var(--tracking-display)', marginTop: 8 }}>npr 입시설명회 운영 시스템 — 유저플로우</h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6, maxWidth: 720 }}>페르소나별 전체 케이스 흐름. 각 노드는 안정 ID(예: <code style={{ fontFamily: 'ui-monospace, Menlo, monospace', background: 'var(--surface-sunken)', padding: '1px 5px', borderRadius: 4 }}>OWNER-F5-04</code>)로 식별되며, 분기·상태 변화·문자 트리거·권한 잠금을 표기해 E2E 테스트/디버깅에 사용합니다.</p>
      <div style={{ marginTop: 20 }}><NPRLegend /></div>

      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--surface-page)', paddingTop: 18, paddingBottom: 12, marginTop: 26, borderBottom: '1px solid var(--border-hairline)' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {D.personas.map((p) => (
            <button key={p.key} onClick={() => setActive(p.key)} style={{ padding: '9px 16px', borderRadius: 999, border: active === p.key ? '1.5px solid var(--violet-800)' : '1px solid var(--border-soft)', background: active === p.key ? 'var(--violet-800)' : 'var(--surface-card)', color: active === p.key ? '#fff' : 'var(--text-body)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{p.name} <span style={{ opacity: 0.7, fontWeight: 500, fontSize: 12 }}>· {p.flows.length} flows</span></button>
          ))}
        </div>
      </div>

      <div key={persona.key} style={{ marginTop: 26, animation: 'ds-fade-up var(--dur-base) var(--ease-out) both' }}>
        <NPRPersonaCard p={persona} />
        {persona.note && <div style={{ marginTop: 16, padding: '13px 16px', borderRadius: 'var(--radius-md)', background: 'var(--surface-accent-soft)', color: 'var(--mint-700)', fontSize: 13, lineHeight: 1.55 }}>{persona.note}</div>}
        {persona.flows.map((f) => <NPRFlow key={f.id} flow={f} />)}
      </div>
    </div>
  );
}

window.NPRFlowApp = NPRFlowApp;
