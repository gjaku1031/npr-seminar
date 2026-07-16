import React, { useState } from 'react';

export function Tag({ children, selected = false, onClick, onRemove, count, style }) {
  const [hover, setHover] = useState(false);
  const interactive = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 34,
        padding: '0 14px',
        borderRadius: 'var(--radius-pill)',
        border: selected ? '1px solid transparent' : '1px solid var(--border-soft)',
        background: selected ? 'linear-gradient(135deg, var(--violet-800), var(--violet-600))' : hover && interactive ? 'var(--surface-brand-soft)' : 'var(--surface-card)',
        color: selected ? 'var(--text-on-brand)' : 'var(--text-body)',
        boxShadow: selected ? '0 4px 18px rgba(37,99,235,0.35)' : 'none',
        fontSize: 13.5,
        fontWeight: selected ? 'var(--weight-semibold)' : 'var(--weight-medium)',
        fontFamily: 'var(--font-body)',
        cursor: interactive || onRemove ? 'pointer' : 'default',
        transform: selected ? 'scale(1.02)' : 'scale(1)',
        transition: 'all var(--dur-fast) var(--ease-spring)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
      {count != null && (
        <span style={{ fontSize: 11.5, opacity: 0.65, fontWeight: 600 }}>{count}</span>
      )}
      {onRemove && (
        <span
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ display: 'inline-flex', marginRight: -4, opacity: 0.6, lineHeight: 1 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>
        </span>
      )}
    </button>
  );
}
