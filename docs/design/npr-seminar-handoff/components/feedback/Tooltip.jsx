import React, { useState } from 'react';

export function Tooltip({ children, content, side = 'top', style }) {
  const [show, setShow] = useState(false);

  const pos = {
    top: { bottom: 'calc(100% + 8px)', left: '50%', transform: show ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(4px)' },
    bottom: { top: 'calc(100% + 8px)', left: '50%', transform: show ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(-4px)' },
    right: { left: 'calc(100% + 8px)', top: '50%', transform: show ? 'translateY(-50%) translateX(0)' : 'translateY(-50%) translateX(-4px)' },
  }[side] || {};

  return (
    <span
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ position: 'relative', display: 'inline-flex', ...style }}
    >
      {children}
      <span
        style={{
          position: 'absolute',
          ...pos,
          padding: '7px 12px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(16,24,40,0.94)',
          border: '1px solid rgba(255,255,255,0.10)',
          color: 'var(--text-strong)',
          fontSize: 12.5,
          fontWeight: 'var(--weight-medium)',
          fontFamily: 'var(--font-body)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          opacity: show ? 1 : 0,
          transition: 'opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)',
          zIndex: 60,
        }}
      >
        {content}
      </span>
    </span>
  );
}
