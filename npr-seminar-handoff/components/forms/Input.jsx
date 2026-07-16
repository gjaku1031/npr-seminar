import React, { useState } from 'react';

export function Input({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  hint,
  error,
  icon = null,
  disabled = false,
  size = 'md',
  style,
}) {
  const [focus, setFocus] = useState(false);
  const h = size === 'lg' ? 54 : 46;

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7, fontFamily: 'var(--font-body)', ...style }}>
      {label && (
        <span style={{ fontSize: 13, fontWeight: 'var(--weight-semibold)', color: error ? 'var(--status-danger)' : 'var(--text-strong)' }}>
          {label}
        </span>
      )}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: h,
          padding: '0 16px',
          borderRadius: 'var(--radius-md)',
          background: disabled ? 'var(--surface-sunken)' : 'var(--surface-card)',
          border: error
            ? '1.5px solid var(--status-danger)'
            : focus
            ? '1.5px solid var(--violet-800)'
            : '1px solid var(--border-soft)',
          boxShadow: focus && !error ? 'var(--focus-ring)' : 'none',
          transition: 'border var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
        }}
      >
        {icon && <span style={{ display: 'inline-flex', color: focus ? 'var(--violet-800)' : 'var(--text-faint)', transition: 'color var(--dur-fast) var(--ease-out)' }}>{icon}</span>}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange && onChange(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: size === 'lg' ? 16 : 15,
            fontFamily: 'var(--font-body)',
            color: 'var(--text-strong)',
            letterSpacing: 'var(--tracking-body)',
          }}
        />
      </span>
      {(error || hint) && (
        <span style={{ fontSize: 12.5, color: error ? 'var(--status-danger)' : 'var(--text-muted)' }}>
          {error || hint}
        </span>
      )}
    </label>
  );
}
