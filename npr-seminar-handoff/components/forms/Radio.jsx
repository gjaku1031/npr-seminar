import React, { useState } from 'react';

export function Radio({ label, description, checked = false, onChange, disabled = false, style }) {
  const [hover, setHover] = useState(false);
  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'inline-flex', alignItems: description ? 'flex-start' : 'center', gap: 10, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, fontFamily: 'var(--font-body)', ...style }}
    >
      <input type="radio" checked={checked} disabled={disabled} onChange={() => onChange && onChange()} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: description ? 1 : 0,
          border: checked ? '1.5px solid var(--violet-900)' : hover ? '1.5px solid var(--border-strong)' : '1.5px solid var(--border-soft)',
          background: 'var(--surface-card)',
          transition: 'border var(--dur-fast) var(--ease-out)',
        }}
      >
        <span style={{
          width: 11, height: 11, borderRadius: '50%', background: 'var(--violet-900)',
          transform: checked ? 'scale(1)' : 'scale(0)',
          transition: 'transform var(--dur-base) var(--ease-spring)',
        }}></span>
      </span>
      {(label || description) && (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {label && <span style={{ fontSize: 14.5, fontWeight: checked ? 'var(--weight-semibold)' : 'var(--weight-regular)', color: 'var(--text-strong)' }}>{label}</span>}
          {description && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{description}</span>}
        </span>
      )}
    </label>
  );
}
