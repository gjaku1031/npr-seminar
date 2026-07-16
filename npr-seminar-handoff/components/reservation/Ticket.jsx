import React from 'react';

/* 코드 문자열 기반 결정적 QR 플레이스홀더 (실 QR 연동 전 자리표시) */
function qrCells(code, n = 9) {
  let seed = 0;
  for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) >>> 0;
  const cells = [];
  for (let i = 0; i < n * n; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    cells.push((seed >> 16) % 2 === 0);
  }
  return cells;
}

export function Ticket({
  university = '',
  title = '',
  round = '',
  date = '',
  time = '',
  place = '',
  name = '',
  code = 'A0000',
  stamped = true,
  punchColor = 'var(--surface-page)',
  style,
}) {
  const cells = qrCells(code);
  const Row = ({ k, v }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, letterSpacing: 'var(--tracking-caps)', color: 'var(--text-faint)', fontWeight: 700 }}>{k}</span>
      <span style={{ fontSize: 15, fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{v}</span>
    </div>
  );

  return (
    <div
      style={{
        position: 'relative',
        width: 380,
        maxWidth: '100%',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface-card)',
        boxShadow: 'var(--shadow-raised)',
        fontFamily: 'var(--font-body)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* 헤더 — 네이비 */}
      <div style={{ position: 'relative', background: 'var(--surface-brand)', color: 'var(--text-on-brand)', padding: '22px 26px 20px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(37,99,235,0.14)' }}></div>
        <div style={{ fontSize: 11.5, letterSpacing: 'var(--tracking-caps)', color: 'var(--mint-400)', fontWeight: 700, marginBottom: 6 }}>ADMISSION TICKET</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, letterSpacing: 'var(--tracking-heading)', lineHeight: 1.3 }}>{university}</div>
        <div style={{ fontSize: 13.5, opacity: 0.82, marginTop: 3 }}>{title}{round && <span style={{ color: 'var(--mint-400)', fontWeight: 700 }}> · {round}</span>}</div>
      </div>

      {/* 본문 */}
      <div style={{ position: 'relative', padding: '22px 26px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 12px' }}>
        <Row k="일시" v={`${date} ${time}`} />
        <Row k="장소" v={place} />
        <Row k="예약자" v={name} />
        <Row k="예약번호" v={<span style={{ fontFeatureSettings: '"tnum"', letterSpacing: '0.06em' }}>{code}</span>} />
        {/* 스탬프 */}
        {stamped && (
          <div
            style={{
              position: 'absolute', right: 20, bottom: 14,
              width: 74, height: 74, borderRadius: '50%',
              border: '2.5px solid var(--mint-500)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--mint-600)',
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14,
              background: 'rgba(37,99,235,0.07)',
              animation: 'ds-stamp var(--dur-hero) var(--ease-spring) both',
              animationDelay: '350ms',
              pointerEvents: 'none',
            }}
          >
            <span style={{ textAlign: 'center', lineHeight: 1.25 }}>예약<br />확정</span>
          </div>
        )}
      </div>

      {/* 절취선 */}
      <div style={{ position: 'relative', height: 0, borderTop: '2px dashed var(--gray-3)' }}>
        <span style={{ position: 'absolute', left: -13, top: -13, width: 26, height: 26, borderRadius: '50%', background: punchColor }}></span>
        <span style={{ position: 'absolute', right: -13, top: -13, width: 26, height: 26, borderRadius: '50%', background: punchColor }}></span>
      </div>

      {/* 스텁 — QR + 코드 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 26px 22px', background: 'var(--surface-accent-soft)' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 'var(--radius-xs)', background: '#FFFFFF',
          border: '1px solid var(--mint-200)', padding: 7,
          display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 1, flexShrink: 0,
        }}>
          {cells.map((on, i) => (
            <span key={i} style={{ background: on ? 'var(--violet-950)' : 'transparent', borderRadius: 0.5 }}></span>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--mint-700)', fontWeight: 700, marginBottom: 3 }}>입장 시 제시해 주세요</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>시작 10분 전까지 입장 · 예약번호로 현장 확인 가능</div>
        </div>
      </div>
    </div>
  );
}
