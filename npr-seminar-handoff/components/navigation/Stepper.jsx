import React from 'react';

export function Stepper({ steps = [], current = 0, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', fontFamily: 'var(--font-body)', ...style }}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <span style={{ flex: 1, height: 2, minWidth: 24, margin: '0 10px', borderRadius: 2, background: 'var(--gray-3)', position: 'relative', overflow: 'hidden' }}>
                <span style={{
                  position: 'absolute', inset: 0, background: 'var(--violet-800)',
                  transform: done || active ? 'scaleX(1)' : 'scaleX(0)',
                  transformOrigin: 'left',
                  transition: 'transform var(--dur-slow) var(--ease-smooth)',
                }}></span>
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: '50%',
                  fontSize: 13, fontWeight: 700,
                  background: done || active ? 'var(--violet-900)' : 'var(--surface-card)',
                  color: done || active ? 'var(--text-on-brand)' : 'var(--text-faint)',
                  border: done || active ? '1.5px solid var(--violet-900)' : '1.5px solid var(--border-soft)',
                  boxShadow: active ? 'var(--shadow-accent-glow)' : 'none',
                  animation: active ? 'ds-glow-pulse 2.4s var(--ease-in-out) infinite' : 'none',
                  transform: active ? 'scale(1.12)' : 'scale(1)',
                  transition: 'all var(--dur-base) var(--ease-spring)',
                }}
              >
                {done ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
                ) : (
                  i + 1
                )}
              </span>
              <span style={{
                fontSize: 13.5,
                fontWeight: active ? 'var(--weight-bold)' : 'var(--weight-medium)',
                color: active ? 'var(--text-brand)' : done ? 'var(--text-body)' : 'var(--text-faint)',
                transition: 'color var(--dur-base) var(--ease-out)',
                whiteSpace: 'nowrap',
              }}>{label}</span>
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}
