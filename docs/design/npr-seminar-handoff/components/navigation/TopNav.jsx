import React, { useState, useRef, useEffect } from 'react';

/* 1a 상단 헤더 탭바 — 허브(런처)와 짝을 이루는 모듈 내비 */
export function TopNav({
  brand = '입시설명회',
  brandBadge = 'npr',
  items = [],
  value,
  onChange,
  onBrandClick,
  right = null,
  sticky = true,
}) {
  const refs = useRef({});
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = refs.current[value];
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, items.length]);

  return (
    <header style={{
      position: sticky ? 'sticky' : 'relative', top: 0, zIndex: 50,
      background: 'rgba(255,255,255,0.85)', backdropFilter: 'var(--blur-veil)',
      borderBottom: '1px solid var(--border-hairline)',
    }}>
      <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: '0 var(--container-pad)', height: 60, display: 'flex', alignItems: 'center', gap: 24 }}>
        <a onClick={onBrandClick} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: onBrandClick ? 'pointer' : 'default', flexShrink: 0 }}>
          <span style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--violet-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11 }}>{brandBadge}</span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16.5, color: 'var(--violet-900)', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{brand}</span>
        </a>
        <nav style={{ position: 'relative', display: 'flex', gap: 2, flex: 1, minWidth: 0, overflowX: 'auto' }}>
          {/* 슬라이딩 활성 필 */}
          <span style={{
            position: 'absolute', top: '50%', height: 36, transform: 'translateY(-50%)',
            left: pill.left, width: pill.width,
            background: 'var(--violet-100)', borderRadius: 'var(--radius-pill)',
            transition: 'left var(--dur-base) var(--ease-spring), width var(--dur-base) var(--ease-spring)',
          }}></span>
          {items.map((it) => {
            const val = it.value ?? it;
            const active = val === value;
            return (
              <a key={val}
                ref={(el) => (refs.current[val] = el)}
                onClick={() => onChange && onChange(val)}
                onMouseEnter={() => setHover(val)}
                onMouseLeave={() => setHover(null)}
                style={{
                  position: 'relative', zIndex: 1,
                  padding: '8px 15px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                  fontSize: 14, fontFamily: 'var(--font-body)',
                  fontWeight: active ? 700 : 500,
                  color: active ? 'var(--violet-900)' : hover === val ? 'var(--text-strong)' : 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  transition: 'color var(--dur-fast) var(--ease-out)',
                }}>
                {it.label ?? it}
              </a>
            );
          })}
        </nav>
        {right}
      </div>
    </header>
  );
}
