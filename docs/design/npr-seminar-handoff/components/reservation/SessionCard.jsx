import React, { useState } from 'react';

const TYPE_TONE = {
  '수시': { bg: 'var(--violet-100)', fg: 'var(--violet-900)' },
  '정시': { bg: 'var(--status-info-soft)', fg: 'var(--status-info)' },
  '학생부종합': { bg: 'var(--mint-100)', fg: 'var(--mint-700)' },
  '논술': { bg: 'var(--status-warning-soft)', fg: 'var(--status-warning)' },
};

export function SessionCard({
  university = '',
  title = '',
  date = '',
  time = '',
  place = '',
  types = [],
  seatsLeft,
  seatsTotal,
  closed = false,
  onClick,
  style,
}) {
  const [hover, setHover] = useState(false);
  const ratio = seatsTotal ? Math.max(0, Math.min(1, seatsLeft / seatsTotal)) : 1;
  const urgent = !closed && seatsTotal && seatsLeft / seatsTotal <= 0.15;
  const initial = university.replace(/대학교|대학/g, '').slice(0, 2) || '대';

  return (
    <div
      onClick={closed ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 22,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-hairline)',
        boxShadow: hover && !closed ? 'var(--shadow-raised)' : 'var(--shadow-card)',
        transform: hover && !closed ? 'translateY(-5px)' : 'translateY(0)',
        transition: 'transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)',
        cursor: closed ? 'default' : 'pointer',
        opacity: closed ? 0.62 : 1,
        fontFamily: 'var(--font-body)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* 대학 모노그램 */}
        <div
          style={{
            width: 52, height: 52, flexShrink: 0,
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-brand)',
            color: 'var(--mint-400)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17,
            letterSpacing: '-0.02em',
            transform: hover && !closed ? 'rotate(-4deg) scale(1.05)' : 'rotate(0) scale(1)',
            transition: 'transform var(--dur-base) var(--ease-spring)',
          }}
        >
          {initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 'var(--weight-semibold)', color: 'var(--text-accent)', marginBottom: 3 }}>{university}</div>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17.5,
            color: 'var(--text-strong)', letterSpacing: 'var(--tracking-heading)', lineHeight: 1.35,
          }}>{title}</div>
        </div>
        {/* 화살표 */}
        {!closed && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--violet-800)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{
              flexShrink: 0, marginTop: 4,
              opacity: hover ? 1 : 0,
              transform: hover ? 'translateX(0)' : 'translateX(-6px)',
              transition: 'all var(--dur-base) var(--ease-out)',
            }}>
            <path d="M5 12h14m-6-6 6 6-6 6"></path>
          </svg>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {types.map((t) => {
          const tone = TYPE_TONE[t] || { bg: 'var(--surface-sunken)', fg: 'var(--text-muted)' };
          return (
            <span key={t} style={{
              padding: '3px 10px', borderRadius: 'var(--radius-pill)',
              background: tone.bg, color: tone.fg, fontSize: 12, fontWeight: 700,
            }}>{t}</span>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13.5, color: 'var(--text-muted)' }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="3"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>
          {date} {time && <span style={{ color: 'var(--text-faint)' }}>·</span>} {time}
        </span>
        {place && (
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            {place}
          </span>
        )}
      </div>

      {/* 잔여석 게이지 */}
      {seatsTotal != null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
            <span style={{ color: closed ? 'var(--text-faint)' : urgent ? 'var(--status-danger)' : 'var(--text-muted)', fontWeight: 'var(--weight-semibold)' }}>
              {closed ? '예약 마감' : urgent ? '마감 임박' : '잔여석'}
            </span>
            {!closed && (
              <span style={{ color: 'var(--text-strong)', fontWeight: 700, fontFeatureSettings: '"tnum"' }}>
                {seatsLeft}<span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>/{seatsTotal}석</span>
              </span>
            )}
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--gray-2)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              width: `${closed ? 0 : ratio * 100}%`,
              background: urgent ? 'var(--status-danger)' : 'linear-gradient(90deg, var(--violet-700), var(--violet-500))',
              transition: 'width var(--dur-hero) var(--ease-smooth)',
            }}></div>
          </div>
        </div>
      )}
    </div>
  );
}
