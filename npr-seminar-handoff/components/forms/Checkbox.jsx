import React, { useState } from 'react';

export function Checkbox({ label, checked = false, onChange, disabled = false, style }) {
  const [hover, setHover] = useState(false);
  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, fontFamily: 'var(--font-body)', ...style }}
    >
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange && onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: 7, flexShrink: 0,
          background: checked ? 'var(--violet-900)' : 'var(--surface-card)',
          border: checked ? '1.5px solid var(--violet-900)' : hover ? '1.5px solid var(--border-strong)' : '1.5px solid var(--border-soft)',
          transform: checked ? 'scale(1)' : hover ? 'scale(1.06)' : 'scale(1)',
          transition: 'all var(--dur-fast) var(--ease-spring)',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F7F8FA" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"
          style={{
            strokeDasharray: 24, strokeDashoffset: checked ? 0 : 24,
            transition: 'stroke-dashoffset var(--dur-base) var(--ease-out)',
          }}>
          <path d="M20 6 9 17l-5-5"></path>
        </svg>
      </span>
      {label && <span style={{ fontSize: 14.5, color: 'var(--text-body)' }}>{label}</span>}
    </label>
  );
}
