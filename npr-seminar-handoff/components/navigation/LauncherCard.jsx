import React, { useState } from 'react';

/* 2d 카드 런처 허브의 진입 카드 */
export function LauncherCard({
  icon = null,
  title = '',
  stat = '',
  tone = 'default',
  onClick,
  locked = false,
  delay = 0,
  style,
}) {
  const [hover, setHover] = useState(false);
  const brand = tone === 'brand';
  const active = !!onClick && !locked;
  return (
    <div
      onClick={locked ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        minHeight: 150,
        borderRadius: 'var(--radius-lg)',
        padding: '18px 20px',
        cursor: locked ? 'not-allowed' : onClick ? 'pointer' : 'default',
        opacity: locked ? 0.55 : 1,
        background: brand ? 'var(--surface-brand)' : 'var(--surface-card)',
        color: brand ? 'var(--text-on-brand)' : 'var(--text-strong)',
        border: brand ? '1px solid transparent' : '1px solid var(--border-hairline)',
        boxShadow: (hover && active) ? 'var(--shadow-raised), 0 0 0 1.5px var(--violet-600), 0 8px 32px rgba(37,99,235,0.18)' : brand ? 'var(--shadow-raised)' : 'var(--shadow-card)',
        transform: (hover && active) ? 'translateY(-5px) scale(1.015)' : 'none',
        transition: 'all var(--dur-base) var(--ease-spring)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${delay}ms both`,
        fontFamily: 'var(--font-body)',
        ...style,
      }}
    >
      {brand && <span style={{ position: 'absolute', top: -46, right: -40, width: 150, height: 150, borderRadius: '50%', background: 'rgba(56,189,248,0.14)' }}></span>}
      {locked && (
        <span style={{ position: 'absolute', top: 16, right: 18, color: 'var(--text-faint)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        </span>
      )}
      <span style={{ display: 'inline-flex', width: 38, height: 38, borderRadius: 'var(--radius-sm)', alignItems: 'center', justifyContent: 'center', background: brand ? 'rgba(248,250,252,0.12)' : 'var(--violet-50)', color: brand ? 'var(--mint-400)' : 'var(--violet-800)', transform: (hover && active) ? 'rotate(-5deg) scale(1.08)' : 'none', transition: 'transform var(--dur-base) var(--ease-spring)' }}>{icon}</span>
      <span style={{ flex: 1 }}></span>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span>
          <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17 }}>{title}</span>
          {stat && <span style={{ display: 'block', fontSize: 12, marginTop: 3, color: brand ? 'rgba(248,250,252,0.65)' : 'var(--text-faint)', fontFeatureSettings: '"tnum"' }}>{stat}</span>}
        </span>
        {!locked && <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: hover ? 1 : 0.35, transform: hover ? 'translateX(0)' : 'translateX(-5px)', transition: 'all var(--dur-base) var(--ease-out)', color: brand ? 'var(--mint-400)' : 'var(--violet-800)', flexShrink: 0 }}>
          <path d="M5 12h14m-6-6 6 6-6 6"></path>
        </svg>}
      </span>
    </div>
  );
}
