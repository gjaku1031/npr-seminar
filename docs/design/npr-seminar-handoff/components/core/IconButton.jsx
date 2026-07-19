import React, { useState } from 'react';

const SIZES = { sm: 32, md: 40, lg: 48 };

export function IconButton({
  children,
  variant = 'ghost',
  size = 'md',
  disabled = false,
  onClick,
  label,
  style,
}) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const dim = SIZES[size] || SIZES.md;

  const variants = {
    ghost: {
      base: { background: 'transparent', color: 'var(--text-body)', border: '1px solid transparent' },
      hover: { background: 'var(--violet-50)', color: 'var(--text-brand)' },
    },
    outline: {
      base: { background: 'var(--surface-card)', color: 'var(--text-body)', border: '1px solid var(--border-soft)' },
      hover: { border: '1px solid var(--border-strong)', color: 'var(--text-brand)' },
    },
    solid: {
      base: { background: 'var(--interactive-primary)', color: 'var(--text-on-brand)', border: '1px solid transparent' },
      hover: { background: 'var(--interactive-primary-hover)' },
    },
  };
  const v = variants[variant] || variants.ghost;

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: dim,
        height: dim,
        borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transform: press && !disabled ? 'scale(0.92)' : 'scale(1)',
        transition: 'all var(--dur-fast) var(--ease-out)',
        ...v.base,
        ...(hover && !disabled ? v.hover : {}),
        ...style,
      }}
    >
      {children}
    </button>
  );
}
