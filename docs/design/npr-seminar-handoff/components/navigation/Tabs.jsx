import React, { useState, useRef, useEffect } from 'react';

export function Tabs({ items = [], value, onChange, variant = 'underline', style }) {
  const refs = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const el = refs.current[value];
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, items.length]);

  const isPill = variant === 'pill';

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        gap: isPill ? 4 : 24,
        padding: isPill ? 4 : 0,
        background: isPill ? 'var(--surface-sunken)' : 'transparent',
        borderRadius: isPill ? 'var(--radius-pill)' : 0,
        borderBottom: isPill ? 'none' : '1px solid var(--border-hairline)',
        fontFamily: 'var(--font-body)',
        ...style,
      }}
    >
      {/* moving indicator */}
      <span
        style={{
          position: 'absolute',
          left: indicator.left,
          width: indicator.width,
          ...(isPill
            ? { top: 4, bottom: 4, background: 'var(--surface-card)', borderRadius: 'var(--radius-pill)', boxShadow: 'var(--shadow-card)' }
            : { bottom: -1, height: 3, background: 'linear-gradient(90deg, var(--violet-700), var(--mint-500))', borderRadius: 2 }),
          transition: 'left var(--dur-base) var(--ease-spring), width var(--dur-base) var(--ease-spring)',
        }}
      ></span>
      {items.map((it) => {
        const val = it.value ?? it;
        const active = val === value;
        return (
          <button
            key={val}
            ref={(el) => (refs.current[val] = el)}
            type="button"
            onClick={() => onChange && onChange(val)}
            style={{
              position: 'relative',
              zIndex: 1,
              padding: isPill ? '8px 18px' : '12px 2px',
              background: 'transparent',
              border: 'none',
              fontSize: 14.5,
              fontFamily: 'var(--font-body)',
              fontWeight: active ? 'var(--weight-bold)' : 'var(--weight-medium)',
              color: active ? 'var(--text-brand)' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'color var(--dur-fast) var(--ease-out)',
              whiteSpace: 'nowrap',
            }}
          >
            {it.label ?? it}
            {it.count != null && (
              <span style={{ marginLeft: 6, fontSize: 12, color: active ? 'var(--mint-600)' : 'var(--text-faint)', fontWeight: 700 }}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
