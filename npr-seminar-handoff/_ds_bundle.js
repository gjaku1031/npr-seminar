/* @ds-bundle: {"format":4,"namespace":"DesignSystem_179b2a","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"LauncherCard","sourcePath":"components/navigation/LauncherCard.jsx"},{"name":"Stepper","sourcePath":"components/navigation/Stepper.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"TopNav","sourcePath":"components/navigation/TopNav.jsx"},{"name":"SessionCard","sourcePath":"components/reservation/SessionCard.jsx"},{"name":"Ticket","sourcePath":"components/reservation/Ticket.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"2322e8ec8a16","components/core/Button.jsx":"b3c17dca0f6b","components/core/Card.jsx":"d53fe00ace10","components/core/IconButton.jsx":"c046f38e3fd7","components/core/Tag.jsx":"02292fbb7f77","components/feedback/Dialog.jsx":"4aa8bae5b305","components/feedback/Toast.jsx":"a068a426e571","components/feedback/Tooltip.jsx":"9e1b5d495c32","components/forms/Checkbox.jsx":"df59234648c4","components/forms/Input.jsx":"1e614c62a39f","components/forms/Radio.jsx":"3e062d56b9e6","components/forms/Select.jsx":"b007513e4431","components/forms/Switch.jsx":"4c8c6791d66d","components/navigation/LauncherCard.jsx":"b47ac4605b45","components/navigation/Stepper.jsx":"5324924e9bee","components/navigation/Tabs.jsx":"b2459da9ce18","components/navigation/TopNav.jsx":"6bd772798fe2","components/reservation/SessionCard.jsx":"ada63a070689","components/reservation/Ticket.jsx":"b6b8a9b4be66","ui_kits/npr-admin/CounselScreen.jsx":"4f52737cc7ac","ui_kits/npr-admin/HubScreen.jsx":"c17dae24fe70","ui_kits/npr-admin/LoginScreen.jsx":"76739106a4fd","ui_kits/npr-admin/ManualReserve.jsx":"48ca448b5e1a","ui_kits/npr-admin/MobileFlow.jsx":"7f8c7cca443c","ui_kits/npr-admin/PhoneScreen.jsx":"1566d1c2acf8","ui_kits/npr-admin/PreviewScreen.jsx":"a171a0487c0c","ui_kits/npr-admin/ScannerScreen.jsx":"3ba7fe82c1f4","ui_kits/npr-admin/SessionsScreen.jsx":"9170fc97d6d8","ui_kits/npr-admin/SmsScreen.jsx":"07d616633444","ui_kits/npr-admin/StatsScreen.jsx":"726bf30de39e","ui_kits/npr-admin/StudentsScreen.jsx":"15556c0040db","ui_kits/npr-admin/data.js":"e142e5ef1cf9","ui_kits/npr-admin/flow-data.js":"165918d1f78d","ui_kits/npr-admin/flow-ui.jsx":"a252be6cb4d0","ui_kits/npr-admin/icons.jsx":"bd6d59342deb","ui_kits/npr-admin/shared.jsx":"7c7e44c0079f","ui_kits/reservation/AdminScreen.jsx":"54bd876bcc0b","ui_kits/reservation/BookingScreen.jsx":"4d8652d351b0","ui_kits/reservation/DetailScreen.jsx":"16bdef047f2a","ui_kits/reservation/HomeScreen.jsx":"b6444ff47074","ui_kits/reservation/MyPageScreen.jsx":"da2777803b41","ui_kits/reservation/TicketScreen.jsx":"03f0e2bee098","ui_kits/reservation/data.js":"87cc434e83e2","ui_kits/reservation/icons.jsx":"46a4d87eeb2a"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DesignSystem_179b2a = window.DesignSystem_179b2a || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
const TONES = {
  brand: {
    bg: 'var(--violet-100)',
    fg: 'var(--violet-900)'
  },
  accent: {
    bg: 'var(--mint-100)',
    fg: 'var(--mint-700)'
  },
  success: {
    bg: 'var(--status-success-soft)',
    fg: 'var(--status-success)'
  },
  warning: {
    bg: 'var(--status-warning-soft)',
    fg: 'var(--status-warning)'
  },
  danger: {
    bg: 'var(--status-danger-soft)',
    fg: 'var(--status-danger)'
  },
  info: {
    bg: 'var(--status-info-soft)',
    fg: 'var(--status-info)'
  },
  neutral: {
    bg: 'var(--surface-sunken)',
    fg: 'var(--text-muted)'
  },
  solid: {
    bg: 'linear-gradient(135deg, var(--violet-700), var(--mint-600))',
    fg: 'var(--text-on-brand)'
  }
};
function Badge({
  children,
  tone = 'brand',
  dot = false,
  size = 'md',
  style
}) {
  const t = TONES[tone] || TONES.brand;
  const sm = size === 'sm';
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: sm ? 20 : 26,
      padding: sm ? '0 8px' : '0 11px',
      borderRadius: 'var(--radius-pill)',
      background: t.bg,
      color: t.fg,
      fontSize: sm ? 11 : 12.5,
      fontWeight: 'var(--weight-semibold)',
      fontFamily: 'var(--font-body)',
      letterSpacing: '0.01em',
      whiteSpace: 'nowrap',
      ...style
    }
  }, dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'currentColor',
      flexShrink: 0
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
const {
  useState
} = React;
const SIZES = {
  sm: {
    height: 36,
    padding: '0 16px',
    fontSize: 13,
    gap: 6,
    radius: 'var(--radius-sm)'
  },
  md: {
    height: 44,
    padding: '0 22px',
    fontSize: 15,
    gap: 8,
    radius: 'var(--radius-md)'
  },
  lg: {
    height: 54,
    padding: '0 30px',
    fontSize: 16,
    gap: 10,
    radius: 'var(--radius-md)'
  }
};
const VARIANTS = {
  primary: {
    base: {
      background: 'linear-gradient(135deg, var(--violet-800), var(--violet-600))',
      color: 'var(--text-on-brand)',
      border: '1px solid transparent'
    },
    hover: {
      background: 'linear-gradient(135deg, var(--violet-700), var(--violet-500))'
    }
  },
  accent: {
    base: {
      background: 'linear-gradient(135deg, var(--mint-600), #4CC9F0)',
      color: 'var(--text-on-accent)',
      border: '1px solid transparent'
    },
    hover: {
      background: 'linear-gradient(135deg, var(--mint-500), #6AD8FF)'
    }
  },
  secondary: {
    base: {
      background: 'var(--surface-card)',
      color: 'var(--text-brand)',
      border: '1px solid var(--border-soft)'
    },
    hover: {
      background: 'var(--surface-brand-soft)',
      border: '1px solid var(--violet-600)'
    }
  },
  ghost: {
    base: {
      background: 'transparent',
      color: 'var(--text-brand)',
      border: '1px solid transparent'
    },
    hover: {
      background: 'var(--violet-50)'
    }
  },
  danger: {
    base: {
      background: 'var(--status-danger)',
      color: '#2E0810',
      border: '1px solid transparent'
    },
    hover: {
      background: '#FF7A93'
    }
  }
};
function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  icon = null,
  iconRight = null,
  onClick,
  type = 'button',
  style
}) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const s = SIZES[size] || SIZES.md;
  const v = VARIANTS[variant] || VARIANTS.primary;
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false),
    style: {
      display: fullWidth ? 'flex' : 'inline-flex',
      width: fullWidth ? '100%' : undefined,
      alignItems: 'center',
      justifyContent: 'center',
      gap: s.gap,
      height: s.height,
      padding: s.padding,
      fontSize: s.fontSize,
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--tracking-body)',
      borderRadius: s.radius,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      transform: press && !disabled ? 'scale(0.955)' : hover && !disabled ? 'translateY(-1.5px)' : 'none',
      boxShadow: hover && !disabled ? variant === 'accent' ? '0 8px 26px rgba(14,165,233,0.35)' : variant === 'danger' ? '0 8px 26px rgba(220,38,38,0.35)' : variant === 'primary' ? '0 8px 28px rgba(37,99,235,0.45)' : 'var(--shadow-card)' : 'none',
      transition: 'all var(--dur-fast) var(--ease-out)',
      whiteSpace: 'nowrap',
      ...v.base,
      ...(hover && !disabled ? v.hover : {}),
      ...style
    }
  }, icon, children, iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
const {
  useState
} = React;
function Card({
  children,
  variant = 'elevated',
  padding = 'var(--card-pad)',
  interactive = false,
  onClick,
  radius = 'var(--radius-lg)',
  style
}) {
  const [hover, setHover] = useState(false);
  const variants = {
    elevated: {
      background: 'var(--surface-card)',
      boxShadow: 'var(--shadow-card)',
      border: '1px solid var(--border-hairline)'
    },
    outline: {
      background: 'var(--surface-card)',
      boxShadow: 'none',
      border: '1px solid var(--border-soft)'
    },
    sunken: {
      background: 'var(--surface-sunken)',
      boxShadow: 'none',
      border: '1px solid transparent'
    },
    brand: {
      background: 'var(--surface-brand)',
      boxShadow: 'var(--shadow-raised)',
      border: '1px solid transparent',
      color: 'var(--text-on-brand)'
    },
    accent: {
      background: 'var(--surface-accent-soft)',
      boxShadow: 'none',
      border: '1px solid var(--mint-200)'
    }
  };
  const v = variants[variant] || variants.elevated;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      borderRadius: radius,
      padding,
      cursor: interactive ? 'pointer' : undefined,
      transform: interactive && hover ? 'translateY(-5px) scale(1.01)' : 'none',
      boxShadow: interactive && hover ? 'var(--shadow-raised), 0 0 0 1px var(--violet-600), 0 0 32px rgba(37,99,235,0.22)' : v.boxShadow,
      transition: 'transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)',
      ...v,
      ...(interactive && hover ? {
        boxShadow: 'var(--shadow-raised), 0 0 0 1px var(--violet-600), 0 0 32px rgba(37,99,235,0.22)',
        transform: 'translateY(-5px) scale(1.01)'
      } : {}),
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
const {
  useState
} = React;
const SIZES = {
  sm: 32,
  md: 40,
  lg: 48
};
function IconButton({
  children,
  variant = 'ghost',
  size = 'md',
  disabled = false,
  onClick,
  label,
  style
}) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const dim = SIZES[size] || SIZES.md;
  const variants = {
    ghost: {
      base: {
        background: 'transparent',
        color: 'var(--text-body)',
        border: '1px solid transparent'
      },
      hover: {
        background: 'var(--violet-50)',
        color: 'var(--text-brand)'
      }
    },
    outline: {
      base: {
        background: 'var(--surface-card)',
        color: 'var(--text-body)',
        border: '1px solid var(--border-soft)'
      },
      hover: {
        border: '1px solid var(--border-strong)',
        color: 'var(--text-brand)'
      }
    },
    solid: {
      base: {
        background: 'var(--interactive-primary)',
        color: 'var(--text-on-brand)',
        border: '1px solid transparent'
      },
      hover: {
        background: 'var(--interactive-primary-hover)'
      }
    }
  };
  const v = variants[variant] || variants.ghost;
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": label,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false),
    style: {
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
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
const {
  useState
} = React;
function Tag({
  children,
  selected = false,
  onClick,
  onRemove,
  count,
  style
}) {
  const [hover, setHover] = useState(false);
  const interactive = !!onClick;
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
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
      ...style
    }
  }, children, count != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      opacity: 0.65,
      fontWeight: 600
    }
  }, count), onRemove && /*#__PURE__*/React.createElement("span", {
    onClick: e => {
      e.stopPropagation();
      onRemove();
    },
    style: {
      display: 'inline-flex',
      marginRight: -4,
      opacity: 0.6,
      lineHeight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.4",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  }))));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
const {
  useEffect
} = React;
function Dialog({
  open = false,
  onClose,
  title,
  children,
  footer,
  width = 440
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    onClick: e => {
      if (e.target === e.currentTarget && onClose) onClose();
    },
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--surface-scrim)',
      backdropFilter: 'blur(8px)',
      animation: 'ds-fade-in var(--dur-base) var(--ease-out) both',
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    style: {
      width,
      maxWidth: '100%',
      maxHeight: '86vh',
      overflowY: 'auto',
      background: 'rgba(255,255,255,0.94)',
      backdropFilter: 'var(--blur-veil)',
      border: '1px solid var(--border-hairline)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-float)',
      padding: 'var(--card-pad-lg)',
      animation: 'ds-pop var(--dur-slow) var(--ease-spring) both',
      fontFamily: 'var(--font-body)'
    }
  }, (title || onClose) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 16
    }
  }, title && /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 'var(--text-h2)',
      color: 'var(--text-strong)',
      letterSpacing: 'var(--tracking-heading)'
    }
  }, title), onClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 34,
      height: 34,
      borderRadius: 'var(--radius-sm)',
      flexShrink: 0,
      background: 'var(--surface-sunken)',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--text-muted)',
      transition: 'background var(--dur-fast) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.4",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-body)',
      fontSize: 15,
      lineHeight: 'var(--leading-body)'
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      justifyContent: 'flex-end',
      marginTop: 28
    }
  }, footer)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const {
  useEffect,
  useState
} = React;
const ICONS = {
  success: /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "17",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  })),
  danger: /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "17",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.4",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 8v4M12 16h.01"
  })),
  info: /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "17",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.4",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 16v-4M12 8h.01"
  }))
};
function Toast({
  open = true,
  tone = 'success',
  children,
  action,
  onAction,
  style
}) {
  const [visible, setVisible] = useState(open);
  useEffect(() => setVisible(open), [open]);
  if (!visible) return null;
  const colors = {
    success: 'var(--status-success)',
    danger: 'var(--status-danger)',
    info: 'var(--violet-800)'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      padding: '13px 18px',
      borderRadius: 'var(--radius-md)',
      background: 'rgba(16,24,40,0.92)',
      backdropFilter: 'var(--blur-veil)',
      border: '1px solid rgba(255,255,255,0.10)',
      color: 'var(--text-strong)',
      boxShadow: 'var(--shadow-float), 0 0 30px rgba(37,99,235,0.20)',
      fontSize: 14.5,
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--weight-medium)',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-spring) both',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 26,
      height: 26,
      borderRadius: '50%',
      flexShrink: 0,
      background: tone === 'success' ? 'var(--mint-500)' : tone === 'danger' ? 'var(--status-danger)' : 'var(--violet-700)',
      color: tone === 'success' ? 'var(--text-on-accent)' : '#FEF2F2'
    }
  }, ICONS[tone] || ICONS.info), children, action && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onAction,
    style: {
      marginLeft: 6,
      padding: '6px 12px',
      borderRadius: 'var(--radius-xs)',
      background: 'rgba(248,250,252,0.12)',
      border: 'none',
      color: 'var(--mint-400)',
      fontSize: 13,
      fontWeight: 700,
      fontFamily: 'var(--font-body)',
      cursor: 'pointer'
    }
  }, action));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
const {
  useState
} = React;
function Tooltip({
  children,
  content,
  side = 'top',
  style
}) {
  const [show, setShow] = useState(false);
  const pos = {
    top: {
      bottom: 'calc(100% + 8px)',
      left: '50%',
      transform: show ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(4px)'
    },
    bottom: {
      top: 'calc(100% + 8px)',
      left: '50%',
      transform: show ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(-4px)'
    },
    right: {
      left: 'calc(100% + 8px)',
      top: '50%',
      transform: show ? 'translateY(-50%) translateX(0)' : 'translateY(-50%) translateX(-4px)'
    }
  }[side] || {};
  return /*#__PURE__*/React.createElement("span", {
    onMouseEnter: () => setShow(true),
    onMouseLeave: () => setShow(false),
    style: {
      position: 'relative',
      display: 'inline-flex',
      ...style
    }
  }, children, /*#__PURE__*/React.createElement("span", {
    style: {
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
      zIndex: 60
    }
  }, content));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
const {
  useState
} = React;
function Checkbox({
  label,
  checked = false,
  onChange,
  disabled = false,
  style
}) {
  const [hover, setHover] = useState(false);
  return /*#__PURE__*/React.createElement("label", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      fontFamily: 'var(--font-body)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked),
    style: {
      position: 'absolute',
      opacity: 0,
      width: 0,
      height: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 22,
      height: 22,
      borderRadius: 7,
      flexShrink: 0,
      background: checked ? 'var(--violet-900)' : 'var(--surface-card)',
      border: checked ? '1.5px solid var(--violet-900)' : hover ? '1.5px solid var(--border-strong)' : '1.5px solid var(--border-soft)',
      transform: checked ? 'scale(1)' : hover ? 'scale(1.06)' : 'scale(1)',
      transition: 'all var(--dur-fast) var(--ease-spring)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#F7F8FA",
    strokeWidth: "3.4",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      strokeDasharray: 24,
      strokeDashoffset: checked ? 0 : 24,
      transition: 'stroke-dashoffset var(--dur-base) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  }))), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14.5,
      color: 'var(--text-body)'
    }
  }, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
const {
  useState
} = React;
function Input({
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
  style
}) {
  const [focus, setFocus] = useState(false);
  const h = size === 'lg' ? 54 : 46;
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      fontFamily: 'var(--font-body)',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 'var(--weight-semibold)',
      color: error ? 'var(--status-danger)' : 'var(--text-strong)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      height: h,
      padding: '0 16px',
      borderRadius: 'var(--radius-md)',
      background: disabled ? 'var(--surface-sunken)' : 'var(--surface-card)',
      border: error ? '1.5px solid var(--status-danger)' : focus ? '1.5px solid var(--violet-800)' : '1px solid var(--border-soft)',
      boxShadow: focus && !error ? 'var(--focus-ring)' : 'none',
      transition: 'border var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)'
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      color: focus ? 'var(--violet-800)' : 'var(--text-faint)',
      transition: 'color var(--dur-fast) var(--ease-out)'
    }
  }, icon), /*#__PURE__*/React.createElement("input", {
    type: type,
    value: value,
    placeholder: placeholder,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.value),
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      minWidth: 0,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontSize: size === 'lg' ? 16 : 15,
      fontFamily: 'var(--font-body)',
      color: 'var(--text-strong)',
      letterSpacing: 'var(--tracking-body)'
    }
  })), (error || hint) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: error ? 'var(--status-danger)' : 'var(--text-muted)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
const {
  useState
} = React;
function Radio({
  label,
  description,
  checked = false,
  onChange,
  disabled = false,
  style
}) {
  const [hover, setHover] = useState(false);
  return /*#__PURE__*/React.createElement("label", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'inline-flex',
      alignItems: description ? 'flex-start' : 'center',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      fontFamily: 'var(--font-body)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    checked: checked,
    disabled: disabled,
    onChange: () => onChange && onChange(),
    style: {
      position: 'absolute',
      opacity: 0,
      width: 0,
      height: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 22,
      height: 22,
      borderRadius: '50%',
      flexShrink: 0,
      marginTop: description ? 1 : 0,
      border: checked ? '1.5px solid var(--violet-900)' : hover ? '1.5px solid var(--border-strong)' : '1.5px solid var(--border-soft)',
      background: 'var(--surface-card)',
      transition: 'border var(--dur-fast) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 11,
      height: 11,
      borderRadius: '50%',
      background: 'var(--violet-900)',
      transform: checked ? 'scale(1)' : 'scale(0)',
      transition: 'transform var(--dur-base) var(--ease-spring)'
    }
  })), (label || description) && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14.5,
      fontWeight: checked ? 'var(--weight-semibold)' : 'var(--weight-regular)',
      color: 'var(--text-strong)'
    }
  }, label), description && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)'
    }
  }, description)));
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
const {
  useState,
  useRef,
  useEffect
} = React;
function Select({
  label,
  options = [],
  value,
  onChange,
  placeholder = '선택',
  disabled = false,
  style
}) {
  const [open, setOpen] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const ref = useRef(null);
  useEffect(() => {
    const close = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const selected = options.find(o => (o.value ?? o) === value);
  const labelOf = o => o == null ? '' : o.label ?? o;
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      position: 'relative',
      fontFamily: 'var(--font-body)',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--text-strong)'
    }
  }, label), /*#__PURE__*/React.createElement("button", {
    type: "button",
    disabled: disabled,
    onClick: () => setOpen(!open),
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      height: 46,
      padding: '0 14px 0 16px',
      borderRadius: 'var(--radius-md)',
      background: disabled ? 'var(--surface-sunken)' : 'var(--surface-card)',
      border: open ? '1.5px solid var(--violet-800)' : '1px solid var(--border-soft)',
      boxShadow: open ? 'var(--focus-ring)' : 'none',
      fontSize: 15,
      fontFamily: 'var(--font-body)',
      color: selected ? 'var(--text-strong)' : 'var(--text-faint)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'border var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)'
    }
  }, labelOf(selected) || placeholder, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      transform: open ? 'rotate(180deg)' : 'rotate(0)',
      transition: 'transform var(--dur-base) var(--ease-spring)',
      color: 'var(--text-muted)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "m6 9 6 6 6-6"
  }))), open && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 'calc(100% + 6px)',
      left: 0,
      right: 0,
      zIndex: 50,
      background: 'var(--surface-card)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-hairline)',
      boxShadow: 'var(--shadow-float)',
      padding: 6,
      maxHeight: 280,
      overflowY: 'auto',
      animation: 'ds-scale-in var(--dur-base) var(--ease-spring) both',
      transformOrigin: 'top center'
    }
  }, options.map((o, i) => {
    const val = o.value ?? o;
    const isSel = val === value;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      onClick: () => {
        onChange && onChange(val);
        setOpen(false);
      },
      onMouseEnter: () => setHoverIdx(i),
      onMouseLeave: () => setHoverIdx(-1),
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        borderRadius: 'var(--radius-xs)',
        fontSize: 14.5,
        cursor: 'pointer',
        background: isSel ? 'var(--violet-50)' : hoverIdx === i ? 'var(--surface-sunken)' : 'transparent',
        color: isSel ? 'var(--violet-900)' : 'var(--text-body)',
        fontWeight: isSel ? 'var(--weight-semibold)' : 'var(--weight-regular)',
        transition: 'background var(--dur-fast) var(--ease-out)'
      }
    }, labelOf(o), isSel && /*#__PURE__*/React.createElement("svg", {
      width: "15",
      height: "15",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2.6",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M20 6 9 17l-5-5"
    })));
  })));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function Switch({
  checked = false,
  onChange,
  label,
  disabled = false,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      fontFamily: 'var(--font-body)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked),
    style: {
      position: 'absolute',
      opacity: 0,
      width: 0,
      height: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      width: 46,
      height: 27,
      borderRadius: 'var(--radius-pill)',
      flexShrink: 0,
      background: checked ? 'var(--violet-900)' : 'var(--ink-200)',
      transition: 'background var(--dur-base) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 3,
      left: 3,
      width: 21,
      height: 21,
      borderRadius: '50%',
      background: '#FFFFFF',
      boxShadow: '0 1px 3px rgba(15,23,42,0.25)',
      transform: checked ? 'translateX(19px)' : 'translateX(0)',
      transition: 'transform var(--dur-base) var(--ease-spring)'
    }
  })), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14.5,
      color: 'var(--text-body)'
    }
  }, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/navigation/LauncherCard.jsx
try { (() => {
const {
  useState
} = React;
/* 2d 카드 런처 허브의 진입 카드 */
function LauncherCard({
  icon = null,
  title = '',
  stat = '',
  tone = 'default',
  onClick,
  locked = false,
  delay = 0,
  style
}) {
  const [hover, setHover] = useState(false);
  const brand = tone === 'brand';
  const active = !!onClick && !locked;
  return /*#__PURE__*/React.createElement("div", {
    onClick: locked ? undefined : onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: 'relative',
      minHeight: 150,
      borderRadius: 'var(--radius-lg)',
      padding: '18px 20px',
      cursor: locked ? 'not-allowed' : onClick ? 'pointer' : 'default',
      opacity: locked ? 0.55 : 1,
      background: brand ? 'var(--surface-brand)' : 'var(--surface-card)',
      color: brand ? 'var(--text-on-brand)' : 'var(--text-strong)',
      border: brand ? '1px solid transparent' : '1px solid var(--border-hairline)',
      boxShadow: hover && active ? 'var(--shadow-raised), 0 0 0 1.5px var(--violet-600), 0 8px 32px rgba(37,99,235,0.18)' : brand ? 'var(--shadow-raised)' : 'var(--shadow-card)',
      transform: hover && active ? 'translateY(-5px) scale(1.015)' : 'none',
      transition: 'all var(--dur-base) var(--ease-spring)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${delay}ms both`,
      fontFamily: 'var(--font-body)',
      ...style
    }
  }, brand && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: -46,
      right: -40,
      width: 150,
      height: 150,
      borderRadius: '50%',
      background: 'rgba(56,189,248,0.14)'
    }
  }), locked && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 16,
      right: 18,
      color: 'var(--text-faint)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "11",
    width: "18",
    height: "11",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 11V7a5 5 0 0 1 10 0v4"
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      width: 38,
      height: 38,
      borderRadius: 'var(--radius-sm)',
      alignItems: 'center',
      justifyContent: 'center',
      background: brand ? 'rgba(248,250,252,0.12)' : 'var(--violet-50)',
      color: brand ? 'var(--mint-400)' : 'var(--violet-800)',
      transform: hover && active ? 'rotate(-5deg) scale(1.08)' : 'none',
      transition: 'transform var(--dur-base) var(--ease-spring)'
    }
  }, icon), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 17
    }
  }, title), stat && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 12,
      marginTop: 3,
      color: brand ? 'rgba(248,250,252,0.65)' : 'var(--text-faint)',
      fontFeatureSettings: '"tnum"'
    }
  }, stat)), !locked && /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "17",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      opacity: hover ? 1 : 0.35,
      transform: hover ? 'translateX(0)' : 'translateX(-5px)',
      transition: 'all var(--dur-base) var(--ease-out)',
      color: brand ? 'var(--mint-400)' : 'var(--violet-800)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14m-6-6 6 6-6 6"
  }))));
}
Object.assign(__ds_scope, { LauncherCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/LauncherCard.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Stepper.jsx
try { (() => {
function Stepper({
  steps = [],
  current = 0,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      fontFamily: 'var(--font-body)',
      ...style
    }
  }, steps.map((label, i) => {
    const done = i < current;
    const active = i === current;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: i
    }, i > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: 2,
        minWidth: 24,
        margin: '0 10px',
        borderRadius: 2,
        background: 'var(--gray-3)',
        position: 'relative',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        inset: 0,
        background: 'var(--violet-800)',
        transform: done || active ? 'scaleX(1)' : 'scaleX(0)',
        transformOrigin: 'left',
        transition: 'transform var(--dur-slow) var(--ease-smooth)'
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: '50%',
        fontSize: 13,
        fontWeight: 700,
        background: done || active ? 'var(--violet-900)' : 'var(--surface-card)',
        color: done || active ? 'var(--text-on-brand)' : 'var(--text-faint)',
        border: done || active ? '1.5px solid var(--violet-900)' : '1.5px solid var(--border-soft)',
        boxShadow: active ? 'var(--shadow-accent-glow)' : 'none',
        animation: active ? 'ds-glow-pulse 2.4s var(--ease-in-out) infinite' : 'none',
        transform: active ? 'scale(1.12)' : 'scale(1)',
        transition: 'all var(--dur-base) var(--ease-spring)'
      }
    }, done ? /*#__PURE__*/React.createElement("svg", {
      width: "13",
      height: "13",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "3.2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M20 6 9 17l-5-5"
    })) : i + 1), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13.5,
        fontWeight: active ? 'var(--weight-bold)' : 'var(--weight-medium)',
        color: active ? 'var(--text-brand)' : done ? 'var(--text-body)' : 'var(--text-faint)',
        transition: 'color var(--dur-base) var(--ease-out)',
        whiteSpace: 'nowrap'
      }
    }, label)));
  }));
}
Object.assign(__ds_scope, { Stepper });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Stepper.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
const {
  useState,
  useRef,
  useEffect
} = React;
function Tabs({
  items = [],
  value,
  onChange,
  variant = 'underline',
  style
}) {
  const refs = useRef({});
  const [indicator, setIndicator] = useState({
    left: 0,
    width: 0
  });
  useEffect(() => {
    const el = refs.current[value];
    if (el) setIndicator({
      left: el.offsetLeft,
      width: el.offsetWidth
    });
  }, [value, items.length]);
  const isPill = variant === 'pill';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      gap: isPill ? 4 : 24,
      padding: isPill ? 4 : 0,
      background: isPill ? 'var(--surface-sunken)' : 'transparent',
      borderRadius: isPill ? 'var(--radius-pill)' : 0,
      borderBottom: isPill ? 'none' : '1px solid var(--border-hairline)',
      fontFamily: 'var(--font-body)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: indicator.left,
      width: indicator.width,
      ...(isPill ? {
        top: 4,
        bottom: 4,
        background: 'var(--surface-card)',
        borderRadius: 'var(--radius-pill)',
        boxShadow: 'var(--shadow-card)'
      } : {
        bottom: -1,
        height: 3,
        background: 'linear-gradient(90deg, var(--violet-700), var(--mint-500))',
        borderRadius: 2
      }),
      transition: 'left var(--dur-base) var(--ease-spring), width var(--dur-base) var(--ease-spring)'
    }
  }), items.map(it => {
    const val = it.value ?? it;
    const active = val === value;
    return /*#__PURE__*/React.createElement("button", {
      key: val,
      ref: el => refs.current[val] = el,
      type: "button",
      onClick: () => onChange && onChange(val),
      style: {
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
        whiteSpace: 'nowrap'
      }
    }, it.label ?? it, it.count != null && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 6,
        fontSize: 12,
        color: active ? 'var(--mint-600)' : 'var(--text-faint)',
        fontWeight: 700
      }
    }, it.count));
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopNav.jsx
try { (() => {
const {
  useState,
  useRef,
  useEffect
} = React;
/* 1a 상단 헤더 탭바 — 허브(런처)와 짝을 이루는 모듈 내비 */
function TopNav({
  brand = '입시설명회',
  brandBadge = 'npr',
  items = [],
  value,
  onChange,
  onBrandClick,
  right = null,
  sticky = true
}) {
  const refs = useRef({});
  const [pill, setPill] = useState({
    left: 0,
    width: 0
  });
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const el = refs.current[value];
    if (el) setPill({
      left: el.offsetLeft,
      width: el.offsetWidth
    });
  }, [value, items.length]);
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: sticky ? 'sticky' : 'relative',
      top: 0,
      zIndex: 50,
      background: 'rgba(255,255,255,0.85)',
      backdropFilter: 'var(--blur-veil)',
      borderBottom: '1px solid var(--border-hairline)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '0 var(--container-pad)',
      height: 60,
      display: 'flex',
      alignItems: 'center',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("a", {
    onClick: onBrandClick,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      cursor: onBrandClick ? 'pointer' : 'default',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28,
      height: 28,
      borderRadius: 9,
      background: 'var(--violet-800)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 11
    }
  }, brandBadge), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 16.5,
      color: 'var(--violet-900)',
      letterSpacing: '-0.02em',
      whiteSpace: 'nowrap'
    }
  }, brand)), /*#__PURE__*/React.createElement("nav", {
    style: {
      position: 'relative',
      display: 'flex',
      gap: 2,
      flex: 1,
      minWidth: 0,
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: '50%',
      height: 36,
      transform: 'translateY(-50%)',
      left: pill.left,
      width: pill.width,
      background: 'var(--violet-100)',
      borderRadius: 'var(--radius-pill)',
      transition: 'left var(--dur-base) var(--ease-spring), width var(--dur-base) var(--ease-spring)'
    }
  }), items.map(it => {
    const val = it.value ?? it;
    const active = val === value;
    return /*#__PURE__*/React.createElement("a", {
      key: val,
      ref: el => refs.current[val] = el,
      onClick: () => onChange && onChange(val),
      onMouseEnter: () => setHover(val),
      onMouseLeave: () => setHover(null),
      style: {
        position: 'relative',
        zIndex: 1,
        padding: '8px 15px',
        borderRadius: 'var(--radius-pill)',
        cursor: 'pointer',
        fontSize: 14,
        fontFamily: 'var(--font-body)',
        fontWeight: active ? 700 : 500,
        color: active ? 'var(--violet-900)' : hover === val ? 'var(--text-strong)' : 'var(--text-muted)',
        whiteSpace: 'nowrap',
        transition: 'color var(--dur-fast) var(--ease-out)'
      }
    }, it.label ?? it);
  })), right));
}
Object.assign(__ds_scope, { TopNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopNav.jsx", error: String((e && e.message) || e) }); }

// components/reservation/SessionCard.jsx
try { (() => {
const {
  useState
} = React;
const TYPE_TONE = {
  '수시': {
    bg: 'var(--violet-100)',
    fg: 'var(--violet-900)'
  },
  '정시': {
    bg: 'var(--status-info-soft)',
    fg: 'var(--status-info)'
  },
  '학생부종합': {
    bg: 'var(--mint-100)',
    fg: 'var(--mint-700)'
  },
  '논술': {
    bg: 'var(--status-warning-soft)',
    fg: 'var(--status-warning)'
  }
};
function SessionCard({
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
  style
}) {
  const [hover, setHover] = useState(false);
  const ratio = seatsTotal ? Math.max(0, Math.min(1, seatsLeft / seatsTotal)) : 1;
  const urgent = !closed && seatsTotal && seatsLeft / seatsTotal <= 0.15;
  const initial = university.replace(/대학교|대학/g, '').slice(0, 2) || '대';
  return /*#__PURE__*/React.createElement("div", {
    onClick: closed ? undefined : onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
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
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 52,
      height: 52,
      flexShrink: 0,
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-brand)',
      color: 'var(--mint-400)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 17,
      letterSpacing: '-0.02em',
      transform: hover && !closed ? 'rotate(-4deg) scale(1.05)' : 'rotate(0) scale(1)',
      transition: 'transform var(--dur-base) var(--ease-spring)'
    }
  }, initial), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--text-accent)',
      marginBottom: 3
    }
  }, university), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 17.5,
      color: 'var(--text-strong)',
      letterSpacing: 'var(--tracking-heading)',
      lineHeight: 1.35
    }
  }, title)), !closed && /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--violet-800)",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      flexShrink: 0,
      marginTop: 4,
      opacity: hover ? 1 : 0,
      transform: hover ? 'translateX(0)' : 'translateX(-6px)',
      transition: 'all var(--dur-base) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14m-6-6 6 6-6 6"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6
    }
  }, types.map(t => {
    const tone = TYPE_TONE[t] || {
      bg: 'var(--surface-sunken)',
      fg: 'var(--text-muted)'
    };
    return /*#__PURE__*/React.createElement("span", {
      key: t,
      style: {
        padding: '3px 10px',
        borderRadius: 'var(--radius-pill)',
        background: tone.bg,
        color: tone.fg,
        fontSize: 12,
        fontWeight: 700
      }
    }, t);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 5,
      fontSize: 13.5,
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "4",
    width: "18",
    height: "18",
    rx: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 2v4M8 2v4M3 10h18"
  })), date, " ", time && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-faint)'
    }
  }, "\xB7"), " ", time), place && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "10",
    r: "3"
  })), place)), seatsTotal != null && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 12.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: closed ? 'var(--text-faint)' : urgent ? 'var(--status-danger)' : 'var(--text-muted)',
      fontWeight: 'var(--weight-semibold)'
    }
  }, closed ? '예약 마감' : urgent ? '마감 임박' : '잔여석'), !closed && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-strong)',
      fontWeight: 700,
      fontFeatureSettings: '"tnum"'
    }
  }, seatsLeft, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-faint)',
      fontWeight: 500
    }
  }, "/", seatsTotal, "\uC11D"))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 6,
      borderRadius: 3,
      background: 'var(--gray-2)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      borderRadius: 3,
      width: `${closed ? 0 : ratio * 100}%`,
      background: urgent ? 'var(--status-danger)' : 'linear-gradient(90deg, var(--violet-700), var(--violet-500))',
      transition: 'width var(--dur-hero) var(--ease-smooth)'
    }
  }))));
}
Object.assign(__ds_scope, { SessionCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/reservation/SessionCard.jsx", error: String((e && e.message) || e) }); }

// components/reservation/Ticket.jsx
try { (() => {
/* 코드 문자열 기반 결정적 QR 플레이스홀더 (실 QR 연동 전 자리표시) */
function qrCells(code, n = 9) {
  let seed = 0;
  for (let i = 0; i < code.length; i++) seed = seed * 31 + code.charCodeAt(i) >>> 0;
  const cells = [];
  for (let i = 0; i < n * n; i++) {
    seed = seed * 1103515245 + 12345 >>> 0;
    cells.push((seed >> 16) % 2 === 0);
  }
  return cells;
}
function Ticket({
  university = '',
  title = '',
  round = '',
  date = '',
  time = '',
  place = '',
  name = '',
  code = 'A0000',
  stamped = true,
  punchColor = 'var(--surface-page)',
  style
}) {
  const cells = qrCells(code);
  const Row = ({
    k,
    v
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      letterSpacing: 'var(--tracking-caps)',
      color: 'var(--text-faint)',
      fontWeight: 700
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--text-strong)'
    }
  }, v));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 380,
      maxWidth: '100%',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--surface-card)',
      boxShadow: 'var(--shadow-raised)',
      fontFamily: 'var(--font-body)',
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      background: 'var(--surface-brand)',
      color: 'var(--text-on-brand)',
      padding: '22px 26px 20px',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -30,
      right: -30,
      width: 140,
      height: 140,
      borderRadius: '50%',
      background: 'rgba(37,99,235,0.14)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      letterSpacing: 'var(--tracking-caps)',
      color: 'var(--mint-400)',
      fontWeight: 700,
      marginBottom: 6
    }
  }, "ADMISSION TICKET"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 20,
      letterSpacing: 'var(--tracking-heading)',
      lineHeight: 1.3
    }
  }, university), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      opacity: 0.82,
      marginTop: 3
    }
  }, title, round && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--mint-400)',
      fontWeight: 700
    }
  }, " \xB7 ", round))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      padding: '22px 26px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px 12px'
    }
  }, /*#__PURE__*/React.createElement(Row, {
    k: "\uC77C\uC2DC",
    v: `${date} ${time}`
  }), /*#__PURE__*/React.createElement(Row, {
    k: "\uC7A5\uC18C",
    v: place
  }), /*#__PURE__*/React.createElement(Row, {
    k: "\uC608\uC57D\uC790",
    v: name
  }), /*#__PURE__*/React.createElement(Row, {
    k: "\uC608\uC57D\uBC88\uD638",
    v: /*#__PURE__*/React.createElement("span", {
      style: {
        fontFeatureSettings: '"tnum"',
        letterSpacing: '0.06em'
      }
    }, code)
  }), stamped && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: 20,
      bottom: 14,
      width: 74,
      height: 74,
      borderRadius: '50%',
      border: '2.5px solid var(--mint-500)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--mint-600)',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 14,
      background: 'rgba(37,99,235,0.07)',
      animation: 'ds-stamp var(--dur-hero) var(--ease-spring) both',
      animationDelay: '350ms',
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'center',
      lineHeight: 1.25
    }
  }, "\uC608\uC57D", /*#__PURE__*/React.createElement("br", null), "\uD655\uC815"))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: 0,
      borderTop: '2px dashed var(--gray-3)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: -13,
      top: -13,
      width: 26,
      height: 26,
      borderRadius: '50%',
      background: punchColor
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: -13,
      top: -13,
      width: 26,
      height: 26,
      borderRadius: '50%',
      background: punchColor
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '18px 26px 22px',
      background: 'var(--surface-accent-soft)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 72,
      height: 72,
      borderRadius: 'var(--radius-xs)',
      background: '#FFFFFF',
      border: '1px solid var(--mint-200)',
      padding: 7,
      display: 'grid',
      gridTemplateColumns: 'repeat(9, 1fr)',
      gap: 1,
      flexShrink: 0
    }
  }, cells.map((on, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      background: on ? 'var(--violet-950)' : 'transparent',
      borderRadius: 0.5
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--mint-700)',
      fontWeight: 700,
      marginBottom: 3
    }
  }, "\uC785\uC7A5 \uC2DC \uC81C\uC2DC\uD574 \uC8FC\uC138\uC694"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      lineHeight: 1.5
    }
  }, "\uC2DC\uC791 10\uBD84 \uC804\uAE4C\uC9C0 \uC785\uC7A5 \xB7 \uC608\uC57D\uBC88\uD638\uB85C \uD604\uC7A5 \uD655\uC778 \uAC00\uB2A5"))));
}
Object.assign(__ds_scope, { Ticket });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/reservation/Ticket.jsx", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/CounselScreen.jsx
try { (() => {
/* 상담 예약 — 설명회 → 개별 상담 전환. 슬롯 그리드(강사×일시) + 신청 목록 */
function CounselScreen({
  store
}) {
  const {
    Card,
    Badge,
    Tag
  } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const {
    counselSlots,
    counselBookings,
    teachers
  } = store;
  const [teacherFilter, setTeacherFilter] = React.useState('all');
  const bookingOf = slotId => counselBookings.find(b => b.slotId === slotId);
  const tName = id => (teachers.find(t => t.id === id) || {}).name || '';
  const usedTeacherIds = [...new Set(counselSlots.map(s => s.teacherId))];
  const shownTeachers = teacherFilter === 'all' ? usedTeacherIds : [teacherFilter];
  const days = [...new Set(counselSlots.map(s => s.date))];
  const total = counselSlots.length;
  const booked = counselSlots.filter(s => s.booked).length;
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uC0C1\uB2F4 \uC608\uC57D"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      color: 'var(--text-accent)',
      marginBottom: 6
    }
  }, "COUNSELING"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--text-h1)',
      fontWeight: 800
    }
  }, "\uC0C1\uB2F4 \uC608\uC57D")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Tag, {
    selected: teacherFilter === 'all',
    onClick: () => setTeacherFilter('all'),
    style: {
      height: 32
    }
  }, "\uC804\uCCB4"), usedTeacherIds.map(tid => /*#__PURE__*/React.createElement(Tag, {
    key: tid,
    selected: teacherFilter === tid,
    onClick: () => setTeacherFilter(tid),
    style: {
      height: 32
    }
  }, tName(tid))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 14,
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "\uC804\uCCB4 \uC2AC\uB86F",
    value: total,
    suffix: "\uAC1C",
    tone: "brand",
    icon: /*#__PURE__*/React.createElement(I.calendar, {
      size: 15
    }),
    delay: 0
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "\uC608\uC57D \uC644\uB8CC",
    value: booked,
    suffix: "\uAC74",
    tone: "success",
    icon: /*#__PURE__*/React.createElement(I.userCheck, {
      size: 15
    }),
    delay: 60
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "\uC794\uC5EC \uC2AC\uB86F",
    value: total - booked,
    suffix: "\uAC1C",
    tone: "accent",
    icon: /*#__PURE__*/React.createElement(I.clock, {
      size: 15
    }),
    delay: 120
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 340px',
      gap: 14,
      marginTop: 14,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, shownTeachers.map((tid, ti) => /*#__PURE__*/React.createElement(Card, {
    key: tid,
    padding: "18px 20px",
    style: {
      animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${ti * 70}ms both`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 800,
      color: 'var(--text-strong)'
    }
  }, tName(tid), " \uAC15\uC0AC")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: `repeat(${days.length}, 1fr)`,
      gap: 12
    }
  }, days.map(d => /*#__PURE__*/React.createElement("div", {
    key: d
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: 'var(--text-muted)',
      marginBottom: 8
    }
  }, d), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 7
    }
  }, counselSlots.filter(s => s.teacherId === tid && s.date === d).map(s => {
    const b = bookingOf(s.id);
    return /*#__PURE__*/React.createElement("div", {
      key: s.id,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 11px',
        borderRadius: 'var(--radius-sm)',
        background: s.booked ? 'var(--surface-brand-soft)' : 'var(--surface-card)',
        border: s.booked ? '1px solid var(--violet-800)' : '1px dashed var(--border-soft)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12.5,
        fontWeight: 700,
        color: s.booked ? 'var(--violet-800)' : 'var(--text-muted)',
        fontFeatureSettings: '"tnum"'
      }
    }, s.time), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }), s.booked ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        color: 'var(--text-strong)',
        fontWeight: 600,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: 62
      }
    }, b ? b.name : '예약') : /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: 'var(--text-faint)'
      }
    }, "\uAC00\uB2A5"));
  })))))))), /*#__PURE__*/React.createElement(Card, {
    padding: "0",
    style: {
      overflow: 'hidden',
      position: 'sticky',
      top: 20,
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 160ms both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '13px 18px',
      borderBottom: '1px solid var(--border-hairline)'
    }
  }, /*#__PURE__*/React.createElement(I.clipboard, {
    size: 15,
    style: {
      color: 'var(--violet-800)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, "\uC0C1\uB2F4 \uC2E0\uCCAD"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-faint)',
      fontFeatureSettings: '"tnum"'
    }
  }, counselBookings.length, "\uAC74")), counselBookings.map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: b.id,
    style: {
      padding: '13px 18px',
      borderTop: i > 0 ? '1px solid var(--border-hairline)' : 'none',
      animation: `ds-fade-up var(--dur-base) var(--ease-out) ${Math.min(i, 8) * 40}ms both`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, b.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--text-faint)'
    }
  }, b.grade), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Badge, {
    tone: "brand",
    size: "sm"
  }, tName(b.teacherId))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginTop: 6,
      fontSize: 12,
      color: 'var(--text-muted)',
      fontFeatureSettings: '"tnum"'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      gap: 4,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(I.calendar, {
    size: 12
  }), b.date, " ", b.time), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      gap: 4,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(I.phone, {
    size: 12
  }), b.phone)))), counselBookings.length === 0 && /*#__PURE__*/React.createElement(EmptyState, null, "\uC544\uC9C1 \uC0C1\uB2F4 \uC2E0\uCCAD\uC774 \uC5C6\uC5B4\uC694."))));
}
window.CounselScreen = CounselScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/CounselScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/HubScreen.jsx
try { (() => {
/* 카드 런처 허브 — 메인 화면 */
function HubScreen({
  store,
  go,
  allowed
}) {
  const {
    LauncherCard
  } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const {
    students,
    sessions,
    reservations,
    smsLogs,
    devices,
    counselBookings
  } = store;
  const can = m => !allowed || allowed.includes(m);
  const s0 = sessions[0];
  const activeRs = sid => reservations.filter(r => r.sessionId === sid && r.status !== 'cancelled');
  const reservedStu = new Set(reservations.filter(r => r.status !== 'cancelled' && r.studentId).map(r => r.studentId));
  const unreserved = students.filter(st => !reservedStu.has(st.id)).length;
  const phoneCnt = reservations.filter(r => r.channel === 'phone' && r.status !== 'cancelled').length;
  const unchecked = s0 ? activeRs(s0.id).filter(r => r.status === 'reserved').length : 0;
  const devOn = devices.filter(d => d.on).length;
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uD5C8\uBE0C \u2014 \uCE74\uB4DC \uB7F0\uCC98",
    style: {
      maxWidth: 980,
      margin: '0 auto',
      padding: '48px var(--container-pad) 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      color: 'var(--text-accent)'
    }
  }, "NPR ADMIN"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--text-display)',
      fontWeight: 800,
      letterSpacing: 'var(--tracking-display)',
      marginTop: 10
    }
  }, "\uBB34\uC5C7\uC744 \uD558\uC2DC\uACA0\uC5B4\uC694?"), s0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 14,
      padding: '8px 16px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--surface-accent-soft)',
      color: 'var(--text-accent)',
      fontSize: 13.5,
      fontWeight: 700,
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 100ms both'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: 'var(--mint-500)',
      animation: 'ds-float 2.2s var(--ease-in-out) infinite'
    }
  }), "\uB2E4\uAC00\uC624\uB294 \uC124\uBA85\uD68C \u2014 ", s0.title, " \xB7 ", s0.date, " ", s0.time, " \xB7 \uBBF8\uCCB4\uD06C ", unchecked, "\uBA85")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 14,
      marginTop: 30
    }
  }, /*#__PURE__*/React.createElement(LauncherCard, {
    icon: /*#__PURE__*/React.createElement(I.users, {
      size: 19
    }),
    title: "\uC7AC\uC6D0\uC0DD \uAD00\uB9AC",
    stat: can('students') ? `${students.length}명 · 미예약 ${unreserved}` : '접근 권한 없음',
    onClick: () => go('students'),
    locked: !can('students'),
    delay: 0
  }), /*#__PURE__*/React.createElement(LauncherCard, {
    icon: /*#__PURE__*/React.createElement(I.phone, {
      size: 18
    }),
    title: "\uC804\uD654\uC608\uC57D",
    stat: can('phone') ? `전화 접수 ${phoneCnt}건` : '접근 권한 없음',
    onClick: () => go('phone'),
    locked: !can('phone'),
    delay: 70
  }), /*#__PURE__*/React.createElement(LauncherCard, {
    icon: /*#__PURE__*/React.createElement(I.message, {
      size: 18
    }),
    title: "\uBB38\uC790 \uBC1C\uC1A1",
    stat: can('sms') ? smsLogs[0] ? `최근 발송 ${smsLogs[0].when}` : '발송 이력 없음' : '접근 권한 없음',
    onClick: () => go('sms'),
    locked: !can('sms'),
    delay: 140
  }), /*#__PURE__*/React.createElement(LauncherCard, {
    icon: /*#__PURE__*/React.createElement(I.qr, {
      size: 18
    }),
    title: "\uC124\uBA85\uD68C \uC6B4\uC601",
    stat: can('sessions') ? `설명회 ${sessions.length}개 진행 중` : '접근 권한 없음',
    onClick: () => go('sessions'),
    locked: !can('sessions'),
    delay: 210
  }), /*#__PURE__*/React.createElement(LauncherCard, {
    icon: /*#__PURE__*/React.createElement(I.clipboard, {
      size: 18
    }),
    title: "\uC0C1\uB2F4 \uC608\uC57D",
    stat: can('counsel') ? `신청 ${(counselBookings || []).length}건` : '접근 권한 없음',
    onClick: () => go('counsel'),
    locked: !can('counsel'),
    delay: 280
  }), /*#__PURE__*/React.createElement(LauncherCard, {
    icon: /*#__PURE__*/React.createElement(I.tablet, {
      size: 18
    }),
    title: "QR \uC2A4\uCE90\uB108",
    stat: can('scanner') ? `기기 ${devOn}대 ON` : '접근 권한 없음',
    onClick: () => go('scanner'),
    locked: !can('scanner'),
    delay: 350
  }), /*#__PURE__*/React.createElement(LauncherCard, {
    icon: /*#__PURE__*/React.createElement(I.smartphone, {
      size: 18
    }),
    title: "\uBAA8\uBC14\uC77C \uD504\uB9AC\uBDF0",
    stat: can('preview') ? '테스트 전용 시연' : '접근 권한 없음',
    onClick: () => go('preview'),
    locked: !can('preview'),
    delay: 420
  }), /*#__PURE__*/React.createElement(LauncherCard, {
    icon: /*#__PURE__*/React.createElement(I.barChart, {
      size: 18
    }),
    title: "\uD1B5\uACC4",
    stat: can('stats') ? '예약 · 참석 · 전환 지표' : '접근 권한 없음',
    onClick: () => go('stats'),
    locked: !can('stats'),
    delay: 490
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      marginTop: 26,
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 450ms both'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "mobile.html",
    target: "_blank",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13.5,
      fontWeight: 700,
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement(I.smartphone, {
    size: 15
  }), " \uD559\uBD80\uBAA8\uC6A9 \uBAA8\uBC14\uC77C \uC608\uC57D \uD398\uC774\uC9C0 \uC5F4\uAE30 \u2192")));
}
window.HubScreen = HubScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/HubScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/LoginScreen.jsx
try { (() => {
/* 운영 콘솔 로그인 — 역할 선택 (데모) */
function LoginScreen({
  onLogin,
  teachers
}) {
  const {
    Button,
    Select
  } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const [role, setRole] = React.useState(null);
  const [tid, setTid] = React.useState(teachers[0].id);
  const roles = [{
    key: 'owner',
    label: '원장',
    desc: '전체 기능 · 통계까지 접근',
    icon: /*#__PURE__*/React.createElement(I.graduationCap, {
      size: 20
    })
  }, {
    key: 'siljang',
    label: '실장',
    desc: '원장과 동일 · 전체 권한',
    icon: /*#__PURE__*/React.createElement(I.userCheck, {
      size: 20
    })
  }, {
    key: 'gangsa',
    label: '강사',
    desc: '재원생 관리·통계 제외 전체',
    icon: /*#__PURE__*/React.createElement(I.users, {
      size: 20
    })
  }];
  const enter = () => {
    if (role === 'gangsa') {
      const t = teachers.find(x => x.id === tid);
      onLogin({
        role: 'gangsa',
        name: t.name,
        teacherId: t.id
      });
    } else onLogin({
      role,
      name: role === 'owner' ? '원장' : '실장'
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uC6B4\uC601 \uCF58\uC194 \uB85C\uADF8\uC778",
    style: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 430,
      background: 'var(--surface-card)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-float)',
      padding: '38px 36px 32px',
      animation: 'ds-pop var(--dur-slow) var(--ease-spring) both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 10,
      background: 'var(--violet-800)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 13
    }
  }, "npr"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 18,
      color: 'var(--violet-900)',
      letterSpacing: '-0.02em'
    }
  }, "\uC785\uC2DC\uC124\uBA85\uD68C")), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 22,
      fontWeight: 800,
      marginTop: 22,
      letterSpacing: 'var(--tracking-heading)'
    }
  }, "\uC6B4\uC601 \uCF58\uC194 \uB85C\uADF8\uC778"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)',
      marginTop: 6,
      lineHeight: 1.55
    }
  }, "\uC5ED\uD560\uC5D0 \uB530\uB77C \uC811\uADFC\uD560 \uC218 \uC788\uB294 \uAE30\uB2A5\uC774 \uB2EC\uB77C\uC838\uC694.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-faint)'
    }
  }, "\uB370\uBAA8 \u2014 \uC5ED\uD560\uC744 \uC120\uD0DD\uD574 \uC785\uC7A5\uD558\uC138\uC694.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      marginTop: 22
    }
  }, roles.map(r => {
    const sel = role === r.key;
    return /*#__PURE__*/React.createElement("div", {
      key: r.key,
      onClick: () => setRole(r.key),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        padding: '14px 16px',
        borderRadius: 'var(--radius-lg)',
        cursor: 'pointer',
        background: sel ? 'var(--surface-brand-soft)' : 'var(--surface-card)',
        border: sel ? '1.5px solid var(--violet-800)' : '1px solid var(--border-hairline)',
        boxShadow: sel ? 'var(--shadow-accent-glow)' : 'var(--shadow-card)',
        transition: 'all var(--dur-fast) var(--ease-out)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 42,
        height: 42,
        borderRadius: 'var(--radius-sm)',
        background: sel ? 'var(--violet-800)' : 'var(--violet-50)',
        color: sel ? '#fff' : 'var(--violet-800)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all var(--dur-fast) var(--ease-out)'
      }
    }, r.icon), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 15,
        fontWeight: 800,
        color: 'var(--text-strong)'
      }
    }, r.label), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        color: 'var(--text-muted)',
        marginTop: 2
      }
    }, r.desc)), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 22,
        height: 22,
        borderRadius: '50%',
        border: sel ? '7px solid var(--violet-900)' : '1.5px solid var(--border-soft)',
        transition: 'all var(--dur-fast) var(--ease-spring)',
        boxSizing: 'border-box',
        flexShrink: 0
      }
    }));
  })), role === 'gangsa' && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      animation: 'ds-fade-up var(--dur-base) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement(Select, {
    label: "\uAC15\uC0AC \uC120\uD0DD",
    options: teachers.map(t => ({
      label: t.name + ' 강사',
      value: t.id
    })),
    value: tid,
    onChange: setTid
  })), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    fullWidth: true,
    disabled: !role,
    onClick: enter,
    iconRight: /*#__PURE__*/React.createElement(I.arrowRight, {
      size: 17
    }),
    style: {
      marginTop: 22
    }
  }, "\uC785\uC7A5\uD558\uAE30")));
}
window.LoginScreen = LoginScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/LoginScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/ManualReserve.jsx
try { (() => {
/* 수동예약 등록 모달 — 재원생(연락처 조회) / 비재원생(직접 입력) */
function ManualReserveDialog({
  open,
  onClose,
  session,
  students,
  reservations,
  addReservation,
  onDone
}) {
  const {
    Dialog,
    Tabs,
    Input,
    Button,
    Select,
    Card,
    Badge
  } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const [tab, setTab] = React.useState('member');
  const [phone, setPhone] = React.useState('');
  const [searched, setSearched] = React.useState(null);
  const [picked, setPicked] = React.useState(null);
  const [attend, setAttend] = React.useState('1명');
  const [guest, setGuest] = React.useState({
    name: '',
    school: '',
    grade: '',
    phone: ''
  });
  React.useEffect(() => {
    if (!open) {
      setPhone('');
      setSearched(null);
      setPicked(null);
      setGuest({
        name: '',
        school: '',
        grade: '',
        phone: ''
      });
      setTab('member');
      setAttend('1명');
    }
  }, [open]);
  const already = stuId => reservations.some(r => r.sessionId === session.id && r.studentId === stuId && r.status !== 'cancelled');
  const search = () => {
    const digits = phone.replace(/\D/g, '');
    setPicked(null);
    setSearched(digits.length < 4 ? [] : students.filter(s => s.parentPhone.replace(/\D/g, '').includes(digits)));
  };
  const submit = () => {
    const attendCount = parseInt(attend) || 1;
    let r;
    if (tab === 'member' && picked) {
      r = addReservation({
        sessionId: session.id,
        studentId: picked.id,
        name: picked.name,
        school: picked.school,
        grade: picked.grade,
        phone: picked.parentPhone,
        channel: 'manual',
        attendCount,
        member: true
      });
    } else {
      r = addReservation({
        sessionId: session.id,
        studentId: null,
        name: guest.name,
        school: guest.school,
        grade: guest.grade,
        phone: guest.phone,
        channel: 'manual',
        attendCount,
        member: false
      });
    }
    onDone(r);
  };
  const canSubmit = tab === 'member' ? !!picked : guest.name && guest.phone;
  return /*#__PURE__*/React.createElement(Dialog, {
    open: open,
    onClose: onClose,
    title: "\uC218\uB3D9\uC608\uC57D \uB4F1\uB85D",
    width: 500,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: onClose
    }, "\uB2EB\uAE30"), /*#__PURE__*/React.createElement(Button, {
      disabled: !canSubmit,
      onClick: submit,
      icon: /*#__PURE__*/React.createElement(I.check, {
        size: 15
      })
    }, "\uC608\uC57D \uB4F1\uB85D"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)',
      marginBottom: 14
    }
  }, session.title, " \xB7 ", session.date, " ", session.time), /*#__PURE__*/React.createElement(Tabs, {
    variant: "pill",
    items: [{
      label: '재원생',
      value: 'member'
    }, {
      label: '비재원생',
      value: 'guest'
    }],
    value: tab,
    onChange: setTab
  }), tab === 'member' && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "\uD559\uBD80\uBAA8 \uC5F0\uB77D\uCC98\uB85C \uC870\uD68C",
    placeholder: "\uBC88\uD638 \uC77C\uBD80 \uC785\uB825 (\uC608: 3200)",
    value: phone,
    onChange: setPhone,
    icon: /*#__PURE__*/React.createElement(I.search, {
      size: 16
    }),
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    onClick: search
  }, "\uC870\uD68C")), searched && searched.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--status-danger)'
    }
  }, "\uC77C\uCE58\uD558\uB294 \uC7AC\uC6D0\uC0DD\uC774 \uC5C6\uC5B4\uC694. \uBC88\uD638\uB97C \uD655\uC778\uD558\uAC70\uB098 \uBE44\uC7AC\uC6D0\uC0DD \uD0ED\uC744 \uC774\uC6A9\uD558\uC138\uC694."), searched && searched.slice(0, 4).map((s, i) => {
    const dup = already(s.id);
    const sel = picked && picked.id === s.id;
    return /*#__PURE__*/React.createElement("div", {
      key: s.id,
      onClick: () => !dup && setPicked(sel ? null : s),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        cursor: dup ? 'not-allowed' : 'pointer',
        opacity: dup ? 0.55 : 1,
        background: sel ? 'var(--surface-brand-soft)' : 'var(--surface-sunken)',
        border: sel ? '1.5px solid var(--violet-800)' : '1px solid transparent',
        transform: sel ? 'scale(1.01)' : 'scale(1)',
        transition: 'all var(--dur-fast) var(--ease-spring)',
        animation: `ds-fade-up var(--dur-base) var(--ease-out) ${i * 60}ms both`
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'var(--violet-100)',
        color: 'var(--violet-900)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: 13,
        flexShrink: 0
      }
    }, s.name[0]), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        fontSize: 14.5,
        color: 'var(--text-strong)'
      }
    }, s.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        color: 'var(--text-muted)'
      }
    }, s.school, " \xB7 ", s.grade, " \xB7 ", s.className)), dup ? /*#__PURE__*/React.createElement(Badge, {
      tone: "neutral",
      size: "sm"
    }, "\uC774\uBBF8 \uC608\uC57D\uB428") : sel ? /*#__PURE__*/React.createElement(Badge, {
      tone: "success",
      dot: true,
      size: "sm"
    }, "\uC120\uD0DD\uB428") : /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        color: 'var(--text-faint)'
      }
    }, "\uC120\uD0DD"));
  })), tab === 'guest' && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "\uD559\uC0DD \uC774\uB984",
    placeholder: "\uC815\uD558\uC724",
    value: guest.name,
    onChange: v => setGuest({
      ...guest,
      name: v
    })
  }), /*#__PURE__*/React.createElement(Input, {
    label: "\uD559\uAD50",
    placeholder: "\uB3D9\uC131\uC911",
    value: guest.school,
    onChange: v => setGuest({
      ...guest,
      school: v
    })
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "\uD559\uB144",
    placeholder: "\uC9113",
    value: guest.grade,
    onChange: v => setGuest({
      ...guest,
      grade: v
    })
  }), /*#__PURE__*/React.createElement(Input, {
    label: "\uD559\uBD80\uBAA8 \uC5F0\uB77D\uCC98",
    placeholder: "010-0000-0000",
    value: guest.phone,
    onChange: v => setGuest({
      ...guest,
      phone: v
    })
  }))), session.attendField && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement(Select, {
    label: "\uCC38\uC11D \uC778\uC6D0",
    options: ['1명', '2명', '3명', '4명'],
    value: attend,
    onChange: setAttend
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      fontSize: 12.5,
      color: 'var(--text-faint)',
      display: 'flex',
      gap: 7,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(I.qr, {
    size: 13
  }), " \uB4F1\uB85D\uACFC \uB3D9\uC2DC\uC5D0 QR\uC774 \uC0DD\uC131\uB418\uACE0, \uC608\uC57D\uC790 \uBC88\uD638\uB85C \uD655\uC815 \uBB38\uC790\uAC00 \uBC1C\uC1A1\uB3FC\uC694."));
}
window.ManualReserveDialog = ManualReserveDialog;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/ManualReserve.jsx", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/MobileFlow.jsx
try { (() => {
/* 모바일 예약 플로우 — 학부모 뷰 (프리뷰·실기기 공용) */
function MobileFlow({
  store,
  compact
}) {
  const {
    Button,
    Input,
    Badge,
    Select
  } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const {
    sessions,
    students,
    reservations,
    addReservation,
    addReservationGroup,
    cancelReservation,
    moveReservation,
    addCounselBooking
  } = store;
  const [step, setStep] = React.useState('list'); // list | verify | guest | done | lookup | manage
  const [sessionId, setSessionId] = React.useState(null);
  const [phone, setPhone] = React.useState('');
  const [searched, setSearched] = React.useState(null);
  const [pickedIds, setPickedIds] = React.useState([]);
  const [attend, setAttend] = React.useState('1명');
  const [guest, setGuest] = React.useState({
    name: '',
    school: '',
    grade: '',
    phone: ''
  });
  const [doneRecs, setDoneRecs] = React.useState(null);
  const [lookupPhone, setLookupPhone] = React.useState('');
  const [lookupCode, setLookupCode] = React.useState('');
  const [lookupErr, setLookupErr] = React.useState(false);
  const [manageId, setManageId] = React.useState(null);
  const [changeOpen, setChangeOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [surveySid, setSurveySid] = React.useState(null);
  const [survey, setSurvey] = React.useState({
    rating: 0,
    q1: '',
    q2: '',
    q3: '',
    comment: ''
  });
  const [counselChosen, setCounselChosen] = React.useState(null);
  const [flash, setFlash] = React.useState(null);
  const session = sessions.find(s => s.id === sessionId);
  const seatsUsed = sid => reservations.filter(r => r.sessionId === sid && r.status !== 'cancelled').length;
  const pickedStudents = (searched || []).filter(s => pickedIds.includes(s.id));
  const managed = reservations.find(r => r.id === manageId);
  const managedSession = managed && sessions.find(s => s.id === managed.sessionId);
  const toast = m => {
    setFlash(m);
    setTimeout(() => setFlash(null), 2600);
  };
  const search = () => {
    const digits = phone.replace(/\D/g, '');
    setPickedIds([]);
    setSearched(digits.length < 4 ? [] : students.filter(s => s.parentPhone.replace(/\D/g, '').includes(digits)));
  };
  const togglePick = id => setPickedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const reset = () => {
    setStep('list');
    setSessionId(null);
    setPhone('');
    setSearched(null);
    setPickedIds([]);
    setGuest({
      name: '',
      school: '',
      grade: '',
      phone: ''
    });
    setDoneRecs(null);
    setAttend('1명');
    setLookupPhone('');
    setLookupCode('');
    setLookupErr(false);
    setManageId(null);
    setSurveySid(null);
    setSurvey({
      rating: 0,
      q1: '',
      q2: '',
      q3: '',
      comment: ''
    });
    setCounselChosen(null);
  };
  const reserve = isMember => {
    const attendCount = parseInt(attend) || 1;
    if (isMember) {
      setDoneRecs(addReservationGroup({
        sessionId
      }, pickedStudents, attendCount));
    } else {
      setDoneRecs([addReservation({
        sessionId,
        studentId: null,
        name: guest.name,
        school: guest.school,
        grade: guest.grade,
        phone: guest.phone,
        channel: 'mobile',
        attendCount,
        member: false
      })]);
    }
    setStep('done');
  };
  const doLookup = () => {
    const digits = lookupPhone.replace(/\D/g, '');
    const code = lookupCode.trim().toUpperCase();
    const hit = reservations.find(r => r.status !== 'cancelled' && digits.length >= 4 && r.phone.replace(/\D/g, '').includes(digits) && (code === '' || r.code.toUpperCase() === code));
    if (hit) {
      setManageId(hit.id);
      setLookupErr(false);
      setStep('manage');
    } else setLookupErr(true);
  };
  const doCancel = () => {
    cancelReservation(managed.id, 'parent');
    setCancelOpen(false);
    toast('예약을 취소했어요 — 취소 확인 문자를 보냈어요');
    setTimeout(reset, 900);
  };
  const doChange = toId => {
    moveReservation(managed.id, toId);
    setChangeOpen(false);
    toast('예약을 변경했어요 — 변경 확정 문자를 보냈어요');
  };
  const Head = ({
    back,
    title
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '14px 18px',
      position: 'sticky',
      top: 0,
      background: 'rgba(248,250,252,0.9)',
      backdropFilter: 'var(--blur-veil)',
      zIndex: 5
    },
    "data-comment-anchor": "391a9d3dc2-div-36-5"
  }, back ? /*#__PURE__*/React.createElement("button", {
    onClick: back,
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--text-strong)',
      display: 'inline-flex',
      padding: 4
    }
  }, /*#__PURE__*/React.createElement(I.arrowLeft, {
    size: 19
  })) : /*#__PURE__*/React.createElement("span", {
    style: {
      width: 26,
      height: 26,
      borderRadius: 8,
      background: 'var(--violet-900)',
      color: 'var(--mint-400)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(I.ticket, {
    size: 14
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 16.5,
      color: 'var(--violet-900)'
    }
  }, title));

  /* ── 설명회 선택 ── */
  if (step === 'list') return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uBAA8\uBC14\uC77C \u2014 \uC124\uBA85\uD68C \uC120\uD0DD",
    style: {
      minHeight: '100%',
      background: 'var(--surface-page)'
    }
  }, /*#__PURE__*/React.createElement(Head, {
    title: "npr \uC785\uC2DC\uC124\uBA85\uD68C"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 18px 30px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 4px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      color: 'var(--text-accent)'
    }
  }, "RESERVATION"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 24,
      fontWeight: 800,
      marginTop: 6,
      lineHeight: 1.3
    }
  }, "\uC124\uBA85\uD68C\uB97C \uC120\uD0DD\uD558\uACE0", /*#__PURE__*/React.createElement("br", null), "\uBC14\uB85C \uC608\uC57D\uD558\uC138\uC694")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, sessions.map((s, i) => {
    const used = seatsUsed(s.id);
    const left = s.capacity - used;
    const full = left <= 0;
    return /*#__PURE__*/React.createElement("div", {
      key: s.id,
      onClick: () => {
        if (!full) {
          setSessionId(s.id);
          setStep('verify');
        }
      },
      style: {
        padding: '18px 20px',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-hairline)',
        boxShadow: 'var(--shadow-card)',
        cursor: full ? 'default' : 'pointer',
        opacity: full ? 0.6 : 1,
        animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${i * 80}ms both`
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 16,
        color: 'var(--text-strong)',
        lineHeight: 1.4
      }
    }, s.title), /*#__PURE__*/React.createElement(I.arrowRight, {
      size: 16,
      style: {
        color: 'var(--violet-800)',
        flexShrink: 0,
        marginTop: 3
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        color: 'var(--text-muted)',
        marginTop: 6,
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        gap: 5,
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement(I.calendar, {
      size: 12
    }), " ", s.date, " ", s.time), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        gap: 5,
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement(I.mapPin, {
      size: 12
    }), " ", s.place), s.notice && /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        gap: 4,
        alignItems: 'center',
        color: 'var(--mint-600)',
        fontWeight: 600
      }
    }, /*#__PURE__*/React.createElement(I.message, {
      size: 12
    }), " \uC548\uB0B4\uBB38")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: 5,
        borderRadius: 3,
        background: 'var(--gray-2)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        height: '100%',
        width: `${used / s.capacity * 100}%`,
        background: left / s.capacity <= 0.15 ? 'var(--status-danger)' : 'var(--violet-600)'
      }
    })), full ? /*#__PURE__*/React.createElement(Badge, {
      tone: "neutral",
      size: "sm"
    }, "\uB9C8\uAC10") : left / s.capacity <= 0.15 ? /*#__PURE__*/React.createElement(Badge, {
      tone: "warning",
      dot: true,
      size: "sm"
    }, "\uC784\uBC15 ", left, "\uC11D") : /*#__PURE__*/React.createElement(Badge, {
      tone: "brand",
      size: "sm"
    }, "\uC794\uC5EC ", left, "\uC11D")));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginTop: 22
    }
  }, /*#__PURE__*/React.createElement("a", {
    onClick: () => {
      setLookupPhone('');
      setLookupCode('');
      setLookupErr(false);
      setStep('lookup');
    },
    style: {
      fontSize: 13.5,
      fontWeight: 700,
      color: 'var(--violet-800)',
      textDecoration: 'underline',
      textUnderlineOffset: 3,
      cursor: 'pointer'
    }
  }, "\uC774\uBBF8 \uC608\uC57D\uD588\uB098\uC694? \uC608\uC57D \uC870\uD68C \xB7 \uBCC0\uACBD \xB7 \uCDE8\uC18C")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("a", {
    onClick: () => {
      setSurveySid(sessions[0].id);
      setSurvey({
        rating: 0,
        q1: '',
        q2: '',
        q3: '',
        comment: ''
      });
      setStep('survey');
    },
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--mint-600)',
      textDecoration: 'underline',
      textUnderlineOffset: 3,
      cursor: 'pointer'
    }
  }, "\uCC38\uC11D\uD558\uC2E0 \uC124\uBA85\uD68C \uB9CC\uC871\uB3C4 \uC124\uBB38"))), flash && /*#__PURE__*/React.createElement("div", {
    style: {
      position: compact ? 'absolute' : 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--violet-900)',
      color: '#fff',
      padding: '11px 18px',
      borderRadius: 'var(--radius-pill)',
      fontSize: 13,
      fontWeight: 600,
      boxShadow: 'var(--shadow-raised)',
      zIndex: 30,
      animation: 'ds-pop var(--dur-base) var(--ease-spring) both'
    }
  }, flash));

  /* ── 예약 조회 (학부모 셀프 변경·취소 진입) ── */
  if (step === 'lookup') return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uBAA8\uBC14\uC77C \u2014 \uC608\uC57D \uC870\uD68C",
    style: {
      minHeight: '100%',
      background: 'var(--surface-page)'
    }
  }, /*#__PURE__*/React.createElement(Head, {
    back: () => setStep('list'),
    title: "\uC608\uC57D \uC870\uD68C"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 18px 30px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 4px 16px'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 21,
      fontWeight: 800,
      lineHeight: 1.35
    }
  }, "\uC608\uC57D\uC744 \uC870\uD68C\uD574\uC694"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      marginTop: 5,
      lineHeight: 1.5
    }
  }, "\uC608\uC57D \uC2DC \uC785\uB825\uD55C ", /*#__PURE__*/React.createElement("b", null, "\uD559\uBD80\uBAA8 \uC5F0\uB77D\uCC98"), "\uB85C \uC870\uD68C\uD558\uC138\uC694. \uBB38\uC790\uB85C \uBC1B\uC740 ", /*#__PURE__*/React.createElement("b", null, "\uC608\uC57D\uBC88\uD638"), "\uB97C \uD568\uAED8 \uC785\uB825\uD558\uBA74 \uC815\uD655\uD574\uC694.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "\uD559\uBD80\uBAA8 \uC5F0\uB77D\uCC98",
    placeholder: "010-0000-0000",
    value: lookupPhone,
    onChange: setLookupPhone,
    icon: /*#__PURE__*/React.createElement(I.smartphone, {
      size: 16
    })
  }), /*#__PURE__*/React.createElement(Input, {
    label: "\uC608\uC57D\uBC88\uD638 (\uC120\uD0DD)",
    placeholder: "NPR-SS1-0000",
    value: lookupCode,
    onChange: setLookupCode,
    icon: /*#__PURE__*/React.createElement(I.ticket, {
      size: 16
    })
  })), lookupErr && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      padding: '12px 14px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--status-danger-soft)',
      color: 'var(--status-danger)',
      fontSize: 13
    }
  }, "\uC77C\uCE58\uD558\uB294 \uC608\uC57D\uC774 \uC5C6\uC5B4\uC694. \uC5F0\uB77D\uCC98\uB97C \uB2E4\uC2DC \uD655\uC778\uD574 \uC8FC\uC138\uC694."), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    fullWidth: true,
    onClick: doLookup,
    disabled: lookupPhone.replace(/\D/g, '').length < 4,
    style: {
      marginTop: 18
    },
    icon: /*#__PURE__*/React.createElement(I.search, {
      size: 16
    })
  }, "\uC608\uC57D \uC870\uD68C\uD558\uAE30")));

  /* ── 예약 관리 (티켓 + 변경/취소) ── */
  if (step === 'manage' && managed) return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uBAA8\uBC14\uC77C \u2014 \uC608\uC57D \uAD00\uB9AC",
    style: {
      minHeight: '100%',
      background: 'var(--surface-page)',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(Head, {
    back: () => setStep('lookup'),
    title: "\uB0B4 \uC608\uC57D"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: '14px 18px 30px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 330,
      borderRadius: 'var(--radius-lg)',
      background: 'var(--surface-card)',
      boxShadow: 'var(--shadow-raised)',
      overflow: 'hidden',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-spring) both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-brand)',
      color: 'var(--text-on-brand)',
      padding: '16px 20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      letterSpacing: 'var(--tracking-caps)',
      color: 'var(--mint-400)',
      fontWeight: 700
    }
  }, "NPR ADMISSION QR"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 16,
      marginTop: 4,
      lineHeight: 1.35
    }
  }, managedSession.title)), /*#__PURE__*/React.createElement(ResStatusBadge, {
    status: managed.status,
    size: "sm"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 20px',
      display: 'flex',
      gap: 16,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(QrBox, {
    code: managed.code,
    size: 104
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 9,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(KV, {
    k: "\uC608\uC57D\uC790",
    v: managed.name
  }), /*#__PURE__*/React.createElement(KV, {
    k: "\uC77C\uC2DC",
    v: `${managedSession.date} ${managedSession.time}`
  }), /*#__PURE__*/React.createElement(KV, {
    k: "\uC608\uC57D\uBC88\uD638",
    v: /*#__PURE__*/React.createElement("span", {
      style: {
        fontFeatureSettings: '"tnum"',
        fontSize: 12.5
      }
    }, managed.code)
  }))), managed.history && managed.history.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 20px 14px',
      fontSize: 11.5,
      color: 'var(--text-faint)',
      display: 'flex',
      gap: 5,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(I.calendar, {
    size: 12
  }), " \uD68C\uCC28 \uBCC0\uACBD ", managed.history.length, "\uD68C \xB7 \uC608\uC57D\uBC88\uD638 \uC720\uC9C0")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginTop: 22,
      width: '100%',
      maxWidth: 330
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    fullWidth: true,
    icon: /*#__PURE__*/React.createElement(I.calendar, {
      size: 15
    }),
    onClick: () => setChangeOpen(true)
  }, "\uC608\uC57D \uBCC0\uACBD"), /*#__PURE__*/React.createElement(Button, {
    variant: "danger",
    fullWidth: true,
    onClick: () => setCancelOpen(true)
  }, "\uC608\uC57D \uCDE8\uC18C"))), changeOpen && /*#__PURE__*/React.createElement("div", {
    onClick: () => setChangeOpen(false),
    style: {
      position: compact ? 'absolute' : 'fixed',
      inset: 0,
      background: 'rgba(15,23,42,0.4)',
      backdropFilter: 'var(--blur-veil)',
      zIndex: 40,
      display: 'flex',
      alignItems: 'flex-end',
      animation: 'ds-fade-in var(--dur-fast) both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: '100%',
      background: 'var(--surface-page)',
      borderRadius: '22px 22px 0 0',
      padding: '10px 18px 26px',
      animation: 'ds-sheet-up var(--dur-base) var(--ease-spring) both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 4,
      borderRadius: 2,
      background: 'var(--gray-3)',
      margin: '6px auto 14px'
    }
  }), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 17,
      fontWeight: 800
    }
  }, "\uB2E4\uB978 \uC124\uBA85\uD68C\uB85C \uBCC0\uACBD"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      marginTop: 4,
      marginBottom: 12
    }
  }, "\uC608\uC57D\uBC88\uD638\uC640 QR\uC740 \uADF8\uB300\uB85C \uC720\uC9C0\uB3FC\uC694."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, sessions.filter(s => s.id !== managed.sessionId).map(s => {
    const left = s.capacity - seatsUsed(s.id);
    const full = left <= 0;
    return /*#__PURE__*/React.createElement("div", {
      key: s.id,
      onClick: () => {
        if (!full) doChange(s.id);
      },
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        borderRadius: 'var(--radius-lg)',
        cursor: full ? 'not-allowed' : 'pointer',
        opacity: full ? 0.5 : 1,
        background: 'var(--surface-card)',
        border: '1px solid var(--border-hairline)',
        boxShadow: 'var(--shadow-card)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        fontSize: 14,
        color: 'var(--text-strong)'
      }
    }, s.title), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--text-faint)',
        marginTop: 2
      }
    }, s.date, " \xB7 ", s.round, " \xB7 ", s.time)), full ? /*#__PURE__*/React.createElement(Badge, {
      tone: "neutral",
      size: "sm"
    }, "\uB9C8\uAC10") : /*#__PURE__*/React.createElement(Badge, {
      tone: left / s.capacity <= 0.15 ? 'warning' : 'brand',
      size: "sm"
    }, "\uC794\uC5EC ", left, "\uC11D"));
  })))), cancelOpen && /*#__PURE__*/React.createElement("div", {
    onClick: () => setCancelOpen(false),
    style: {
      position: compact ? 'absolute' : 'fixed',
      inset: 0,
      background: 'rgba(15,23,42,0.4)',
      backdropFilter: 'var(--blur-veil)',
      zIndex: 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      animation: 'ds-fade-in var(--dur-fast) both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: '100%',
      maxWidth: 320,
      background: 'var(--surface-card)',
      borderRadius: 'var(--radius-lg)',
      padding: '22px 22px 18px',
      boxShadow: 'var(--shadow-raised)',
      animation: 'ds-pop var(--dur-base) var(--ease-spring) both'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 17,
      fontWeight: 800
    }
  }, "\uC608\uC57D\uC744 \uCDE8\uC18C\uD560\uAE4C\uC694?"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)',
      marginTop: 8,
      lineHeight: 1.55
    }
  }, managed.name, " \uD559\uC0DD\uC758 ", managedSession.title, " \uC608\uC57D\uC744 \uCDE8\uC18C\uD574\uC694. \uCDE8\uC18C\uB294 \uC2DC\uC791 24\uC2DC\uAC04 \uC804\uAE4C\uC9C0 \uAC00\uB2A5\uD574\uC694."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    fullWidth: true,
    onClick: () => setCancelOpen(false)
  }, "\uB3CC\uC544\uAC00\uAE30"), /*#__PURE__*/React.createElement(Button, {
    variant: "danger",
    fullWidth: true,
    onClick: doCancel
  }, "\uCDE8\uC18C\uD558\uAE30")))), flash && /*#__PURE__*/React.createElement("div", {
    style: {
      position: compact ? 'absolute' : 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--violet-900)',
      color: '#fff',
      padding: '11px 18px',
      borderRadius: 'var(--radius-pill)',
      fontSize: 13,
      fontWeight: 600,
      boxShadow: 'var(--shadow-raised)',
      zIndex: 50,
      textAlign: 'center',
      animation: 'ds-pop var(--dur-base) var(--ease-spring) both'
    }
  }, flash));

  /* ── 재원생 조회 ── */
  if (step === 'verify') return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uBAA8\uBC14\uC77C \u2014 \uC7AC\uC6D0\uC0DD \uC870\uD68C",
    style: {
      minHeight: '100%',
      background: 'var(--surface-page)'
    }
  }, /*#__PURE__*/React.createElement(Head, {
    back: () => {
      setStep('list');
      setSearched(null);
      setPickedIds([]);
    },
    title: "\uC7AC\uC6D0\uC0DD \uC608\uC57D"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 18px 110px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 4px 16px'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 21,
      fontWeight: 800,
      lineHeight: 1.35
    }
  }, session.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      marginTop: 5
    }
  }, session.date, " ", session.time, " \xB7 ", session.place)), session.notice && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 9,
      alignItems: 'flex-start',
      padding: '12px 14px',
      marginBottom: 16,
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-accent-soft)',
      color: 'var(--mint-700)',
      fontSize: 12.5,
      lineHeight: 1.55
    }
  }, /*#__PURE__*/React.createElement(I.message, {
    size: 15,
    style: {
      flexShrink: 0,
      marginTop: 1
    }
  }), /*#__PURE__*/React.createElement("span", null, session.notice)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "\uD559\uBD80\uBAA8 \uC5F0\uB77D\uCC98\uB85C \uC7AC\uC6D0\uC0DD \uC870\uD68C",
    placeholder: "010-0000-0000",
    value: phone,
    onChange: setPhone,
    icon: /*#__PURE__*/React.createElement(I.smartphone, {
      size: 16
    }),
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    onClick: search
  }, "\uC870\uD68C")), searched && searched.length > 1 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      padding: '10px 14px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-accent-soft)',
      color: 'var(--mint-700)',
      fontSize: 12.5,
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      lineHeight: 1.45
    }
  }, /*#__PURE__*/React.createElement(I.users, {
    size: 15,
    style: {
      flexShrink: 0
    }
  }), " \uD615\uC81C\xB7\uC790\uB9E4\uB97C ", /*#__PURE__*/React.createElement("b", null, "\uD568\uAED8 \uC120\uD0DD"), "\uD558\uBA74 \uC790\uB140\uBCC4\uB85C \uAC01\uAC01 QR\uC774 \uBC1C\uAE09\uB3FC\uC694."), searched && searched.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      padding: '12px 14px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--status-danger-soft)',
      color: 'var(--status-danger)',
      fontSize: 13
    }
  }, "\uC77C\uCE58\uD558\uB294 \uC7AC\uC6D0\uC0DD\uC774 \uC5C6\uC5B4\uC694. \uBC88\uD638\uB97C \uD655\uC778\uD558\uAC70\uB098 \uC544\uB798 \uBE44\uC7AC\uC6D0\uC0DD \uC608\uC57D\uC744 \uC774\uC6A9\uD574 \uC8FC\uC138\uC694."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      marginTop: 14
    }
  }, searched && searched.slice(0, 3).map((s, i) => {
    const sel = pickedIds.includes(s.id);
    return /*#__PURE__*/React.createElement("div", {
      key: s.id,
      onClick: () => togglePick(s.id),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '15px 16px',
        borderRadius: 'var(--radius-lg)',
        cursor: 'pointer',
        background: sel ? 'var(--surface-brand-soft)' : 'var(--surface-card)',
        border: sel ? '1.5px solid var(--violet-800)' : '1px solid var(--border-hairline)',
        boxShadow: sel ? 'var(--shadow-accent-glow)' : 'var(--shadow-card)',
        transform: sel ? 'scale(1.015)' : 'scale(1)',
        transition: 'all var(--dur-base) var(--ease-spring)',
        animation: `ds-pop var(--dur-base) var(--ease-spring) ${i * 70}ms both`
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: 'var(--violet-100)',
        color: 'var(--violet-900)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: 15,
        flexShrink: 0
      }
    }, s.name[0]), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 800,
        fontSize: 15.5,
        color: 'var(--text-strong)'
      }
    }, s.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        color: 'var(--text-muted)',
        marginTop: 2
      }
    }, s.school, " \xB7 ", s.grade)), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 24,
        height: 24,
        borderRadius: 8,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: sel ? 'var(--violet-900)' : 'var(--surface-card)',
        border: sel ? '1.5px solid var(--violet-900)' : '1.5px solid var(--border-soft)',
        transition: 'all var(--dur-fast) var(--ease-spring)',
        boxSizing: 'border-box',
        flexShrink: 0
      }
    }, sel && /*#__PURE__*/React.createElement(I.check, {
      size: 14,
      sw: 3,
      style: {
        color: '#fff'
      }
    })));
  })), pickedIds.length > 0 && session.attendField && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      animation: 'ds-fade-up var(--dur-base) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement(Select, {
    label: pickedIds.length > 1 ? '자녀당 참석 인원' : '참석 인원',
    options: ['1명', '2명', '3명', '4명'],
    value: attend,
    onChange: setAttend
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginTop: 22
    }
  }, /*#__PURE__*/React.createElement("a", {
    onClick: () => setStep('guest'),
    style: {
      fontSize: 13.5,
      fontWeight: 700,
      color: 'var(--mint-600)',
      textDecoration: 'underline',
      textUnderlineOffset: 3,
      cursor: 'pointer'
    }
  }, "\uBE44\uC7AC\uC6D0\uC0DD \uC608\uC57D\uD558\uAE30"))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: compact ? 'absolute' : 'fixed',
      left: 0,
      right: 0,
      bottom: 0,
      padding: '12px 18px 20px',
      background: 'rgba(248,250,252,0.92)',
      backdropFilter: 'var(--blur-veil)',
      borderTop: '1px solid var(--border-hairline)',
      zIndex: 6
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    fullWidth: true,
    disabled: pickedIds.length === 0,
    onClick: () => reserve(true),
    iconRight: /*#__PURE__*/React.createElement(I.arrowRight, {
      size: 17
    })
  }, pickedIds.length === 0 ? '학생을 선택해 주세요' : pickedIds.length === 1 ? `${pickedStudents[0].name} 학생으로 예약하기` : `${pickedIds.length}명 예약하기`)));

  /* ── 비재원생 폼 ── */
  if (step === 'guest') return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uBAA8\uBC14\uC77C \u2014 \uBE44\uC7AC\uC6D0\uC0DD \uC608\uC57D",
    style: {
      minHeight: '100%',
      background: 'var(--surface-page)'
    }
  }, /*#__PURE__*/React.createElement(Head, {
    back: () => setStep('verify'),
    title: "\uBE44\uC7AC\uC6D0\uC0DD \uC608\uC57D"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 18px 110px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 4px 2px'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 21,
      fontWeight: 800,
      lineHeight: 1.35
    }
  }, session.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      marginTop: 5
    }
  }, session.date, " ", session.time, " \xB7 ", session.place)), /*#__PURE__*/React.createElement(Input, {
    label: "\uD559\uC0DD \uC774\uB984",
    placeholder: "\uC815\uD558\uC724",
    value: guest.name,
    onChange: v => setGuest({
      ...guest,
      name: v
    })
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "\uD559\uAD50",
    placeholder: "\uB3D9\uC131\uC911",
    value: guest.school,
    onChange: v => setGuest({
      ...guest,
      school: v
    })
  }), /*#__PURE__*/React.createElement(Input, {
    label: "\uD559\uB144",
    placeholder: "\uC9113",
    value: guest.grade,
    onChange: v => setGuest({
      ...guest,
      grade: v
    })
  })), /*#__PURE__*/React.createElement(Input, {
    label: "\uD559\uBD80\uBAA8 \uC5F0\uB77D\uCC98",
    placeholder: "010-0000-0000",
    value: guest.phone,
    onChange: v => setGuest({
      ...guest,
      phone: v
    }),
    hint: "QR\uC774 \uB2F4\uAE34 \uD655\uC815 \uBB38\uC790\uB97C \uC774 \uBC88\uD638\uB85C \uBCF4\uB0B4\uB4DC\uB824\uC694"
  }), session.attendField && /*#__PURE__*/React.createElement(Select, {
    label: "\uCC38\uC11D \uC778\uC6D0",
    options: ['1명', '2명', '3명', '4명'],
    value: attend,
    onChange: setAttend
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: compact ? 'absolute' : 'fixed',
      left: 0,
      right: 0,
      bottom: 0,
      padding: '12px 18px 20px',
      background: 'rgba(248,250,252,0.92)',
      backdropFilter: 'var(--blur-veil)',
      borderTop: '1px solid var(--border-hairline)',
      zIndex: 6
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    fullWidth: true,
    disabled: !guest.name || !guest.phone,
    onClick: () => reserve(false),
    iconRight: /*#__PURE__*/React.createElement(I.arrowRight, {
      size: 17
    })
  }, "\uC608\uC57D\uD558\uAE30")));

  /* ── 만족도 설문 ── */
  if (step === 'survey' || step === 'surveyDone') {
    const surveySession = sessions.find(s => s.id === surveySid) || sessions[0];
    const RadioRow = ({
      q,
      opts,
      value,
      onPick
    }) => /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 9
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14,
        fontWeight: 700,
        color: 'var(--text-strong)'
      }
    }, q), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap'
      }
    }, opts.map(o => /*#__PURE__*/React.createElement("button", {
      key: o,
      onClick: () => onPick(o),
      style: {
        padding: '9px 14px',
        borderRadius: 'var(--radius-pill)',
        border: value === o ? '1.5px solid var(--violet-800)' : '1px solid var(--border-soft)',
        background: value === o ? 'var(--surface-brand-soft)' : 'var(--surface-card)',
        color: value === o ? 'var(--violet-800)' : 'var(--text-body)',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        transition: 'all var(--dur-fast) var(--ease-out)'
      }
    }, o))));
    if (step === 'surveyDone') return /*#__PURE__*/React.createElement("div", {
      "data-screen-label": "\uBAA8\uBC14\uC77C \u2014 \uC124\uBB38 \uC644\uB8CC",
      style: {
        minHeight: '100%',
        background: 'var(--surface-page)',
        display: 'flex',
        flexDirection: 'column'
      }
    }, /*#__PURE__*/React.createElement(Head, {
      title: "\uC124\uBB38 \uC644\uB8CC"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        padding: '40px 22px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: 'var(--mint-500)',
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'ds-pop var(--dur-hero) var(--ease-spring) both'
      }
    }, /*#__PURE__*/React.createElement(I.check, {
      size: 26,
      sw: 2.6
    })), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 22,
        fontWeight: 800,
        marginTop: 16
      }
    }, "\uC18C\uC911\uD55C \uC758\uACAC \uAC10\uC0AC\uD574\uC694"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 13.5,
        color: 'var(--text-muted)',
        marginTop: 8,
        lineHeight: 1.6
      }
    }, "\uBCF4\uB0B4\uC8FC\uC2E0 \uD53C\uB4DC\uBC31\uC740 \uB2E4\uC74C \uC124\uBA85\uD68C\uB97C", /*#__PURE__*/React.createElement("br", null), "\uB354 \uC798 \uC900\uBE44\uD558\uB294 \uB370 \uD070 \uB3C4\uC6C0\uC774 \uB3FC\uC694."), /*#__PURE__*/React.createElement(Button, {
      onClick: reset,
      style: {
        marginTop: 26
      }
    }, "\uCC98\uC74C\uC73C\uB85C")));
    return /*#__PURE__*/React.createElement("div", {
      "data-screen-label": "\uBAA8\uBC14\uC77C \u2014 \uB9CC\uC871\uB3C4 \uC124\uBB38",
      style: {
        minHeight: '100%',
        background: 'var(--surface-page)'
      }
    }, /*#__PURE__*/React.createElement(Head, {
      back: () => setStep('list'),
      title: "\uB9CC\uC871\uB3C4 \uC124\uBB38"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '14px 18px 120px',
        display: 'flex',
        flexDirection: 'column',
        gap: 22
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '4px 2px'
      }
    }, /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 20,
        fontWeight: 800,
        lineHeight: 1.35
      }
    }, surveySession.title), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        color: 'var(--text-muted)',
        marginTop: 5
      }
    }, "\uC124\uBA85\uD68C\uB294 \uC5B4\uB5BB\uC168\uB098\uC694? \uC7A0\uC2DC\uBA74 \uB3FC\uC694.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'center',
        padding: '18px 0',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-hairline)',
        boxShadow: 'var(--shadow-card)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14,
        fontWeight: 700,
        color: 'var(--text-strong)'
      }
    }, "\uC804\uBC18\uC801\uC778 \uB9CC\uC871\uB3C4"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 6
      }
    }, [1, 2, 3, 4, 5].map(n => /*#__PURE__*/React.createElement("button", {
      key: n,
      onClick: () => setSurvey({
        ...survey,
        rating: n
      }),
      style: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 2,
        transition: 'transform var(--dur-fast) var(--ease-spring)',
        transform: survey.rating === n ? 'scale(1.15)' : 'scale(1)'
      }
    }, /*#__PURE__*/React.createElement(I.star, {
      size: 34,
      style: {
        color: n <= survey.rating ? 'var(--mint-500)' : 'var(--gray-3)',
        fill: n <= survey.rating ? 'var(--mint-500)' : 'none'
      }
    })))), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        color: 'var(--text-faint)',
        minHeight: 16
      }
    }, survey.rating ? ['', '아쉬워요', '보통이에요', '괜첂아요', '좋았어요', '매우 좋았어요'][survey.rating] : '별을 탑해 주세요')), /*#__PURE__*/React.createElement(RadioRow, {
      q: "\uC124\uBA85\uD68C\uAC00 \uC9C4\uD559\uC5D0 \uB3C4\uC6C0\uC774 \uB418\uC5C8\uB098\uC694?",
      opts: ['매우 도움됨', '도움됨', '보통', '아쉬움'],
      value: survey.q1,
      onPick: v => setSurvey({
        ...survey,
        q1: v
      })
    }), /*#__PURE__*/React.createElement(RadioRow, {
      q: "\uC548\uB0B4\uC640 \uC9C4\uD589\uC740 \uC5B4\uB5A0\uC168\uB098\uC694?",
      opts: ['만족', '보통', '아쉬움'],
      value: survey.q2,
      onPick: v => setSurvey({
        ...survey,
        q2: v
      })
    }), /*#__PURE__*/React.createElement(RadioRow, {
      q: "\uB2E4\uC74C \uC124\uBA85\uD68C\uC5D0\uB3C4 \uCC38\uC5EC\uD558\uC2DC\uACA0\uC5B4\uC694?",
      opts: ['네', '미정', '아니오'],
      value: survey.q3,
      onPick: v => setSurvey({
        ...survey,
        q3: v
      })
    }), /*#__PURE__*/React.createElement("label", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14,
        fontWeight: 700,
        color: 'var(--text-strong)'
      }
    }, "\uAC1C\uC120\uD560 \uC810\uC774\uB098 \uD558\uACE0 \uC2F6\uC740 \uB9D0 ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-faint)',
        fontWeight: 500
      }
    }, "(\uC120\uD0DD)")), /*#__PURE__*/React.createElement("textarea", {
      value: survey.comment,
      onChange: e => setSurvey({
        ...survey,
        comment: e.target.value
      }),
      rows: 3,
      placeholder: "\uC790\uC720\uB86D\uAC8C \uC801\uC5B4 \uC8FC\uC138\uC694",
      style: {
        width: '100%',
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-soft)',
        background: 'var(--surface-card)',
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        lineHeight: 1.6,
        color: 'var(--text-strong)',
        resize: 'vertical',
        outline: 'none',
        boxSizing: 'border-box'
      }
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        position: compact ? 'absolute' : 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '12px 18px 20px',
        background: 'rgba(248,250,252,0.92)',
        backdropFilter: 'var(--blur-veil)',
        borderTop: '1px solid var(--border-hairline)',
        zIndex: 6
      }
    }, /*#__PURE__*/React.createElement(Button, {
      size: "lg",
      fullWidth: true,
      disabled: !survey.rating,
      onClick: () => setStep('surveyDone')
    }, "\uC124\uBB38 \uC81C\uCD9C\uD558\uAE30")));
  }

  /* ── 상담 신청 ── */
  if (step === 'counsel' || step === 'counselDone') {
    const who = doneRecs && doneRecs[0] || {};
    const slots = store.counselSlots || [];
    const tchers = store.teachers || [];
    const tName = id => (tchers.find(t => t.id === id) || {}).name || '';
    const usedTeachers = [...new Set(slots.map(s => s.teacherId))];
    const book = slot => {
      addCounselBooking(slot.id, {
        name: who.name,
        grade: who.grade,
        phone: who.phone,
        from: sessionId
      });
      setCounselChosen({
        ...slot,
        teacherName: tName(slot.teacherId)
      });
      setStep('counselDone');
    };
    if (step === 'counselDone') return /*#__PURE__*/React.createElement("div", {
      "data-screen-label": "\uBAA8\uBC14\uC77C \u2014 \uC0C1\uB2F4 \uC2E0\uCCAD \uC644\uB8CC",
      style: {
        minHeight: '100%',
        background: 'var(--surface-page)',
        display: 'flex',
        flexDirection: 'column'
      }
    }, /*#__PURE__*/React.createElement(Head, {
      title: "\uC0C1\uB2F4 \uC2E0\uCCAD \uC644\uB8CC"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        padding: '30px 22px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 54,
        height: 54,
        borderRadius: '50%',
        background: 'var(--violet-900)',
        color: 'var(--mint-400)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'ds-pop var(--dur-hero) var(--ease-spring) both'
      }
    }, /*#__PURE__*/React.createElement(I.check, {
      size: 24,
      sw: 2.6
    })), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 22,
        fontWeight: 800,
        marginTop: 16
      }
    }, "\uC0C1\uB2F4\uC774 \uC2E0\uCCAD\uB410\uC5B4\uC694"), counselChosen && /*#__PURE__*/React.createElement("div", {
      style: {
        width: '100%',
        maxWidth: 300,
        marginTop: 18,
        padding: '16px 20px',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface-card)',
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--border-hairline)',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement(KV, {
      k: "\uC0C1\uB2F4 \uC120\uC0DD\uB2D8",
      v: `${counselChosen.teacherName} 강사`
    }), /*#__PURE__*/React.createElement(KV, {
      k: "\uC77C\uC2DC",
      v: `${counselChosen.date} ${counselChosen.time}`
    })), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 13,
        color: 'var(--text-muted)',
        marginTop: 14,
        lineHeight: 1.6
      }
    }, "\uC0C1\uB2F4 \uD655\uC815 \uBB38\uC790\uB97C \uBC1C\uC1A1\uD574 \uB4DC\uB824\uC694.", /*#__PURE__*/React.createElement("br", null), "\uC804\uC77C \uB9AC\uB9C8\uC778\uB4DC\uB3C4 \uBCF4\uB0B4\uB4DC\uB824\uC694."), /*#__PURE__*/React.createElement(Button, {
      onClick: reset,
      style: {
        marginTop: 24
      }
    }, "\uCC98\uC74C\uC73C\uB85C")));
    return /*#__PURE__*/React.createElement("div", {
      "data-screen-label": "\uBAA8\uBC14\uC77C \u2014 \uC0C1\uB2F4 \uC2E0\uCCAD",
      style: {
        minHeight: '100%',
        background: 'var(--surface-page)'
      }
    }, /*#__PURE__*/React.createElement(Head, {
      back: () => setStep('done'),
      title: "\uAC1C\uBCC4 \uC0C1\uB2F4 \uC2E0\uCCAD"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '14px 18px 30px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '4px 2px 16px'
      }
    }, /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 20,
        fontWeight: 800,
        lineHeight: 1.35
      }
    }, "\uC124\uBA85\uD68C\uC5D0\uC11C \uBABB\uB2E4 \uD55C \uC774\uC57C\uAE30,", /*#__PURE__*/React.createElement("br", null), "\uAC1C\uBCC4 \uC0C1\uB2F4\uC73C\uB85C \uC774\uC5B4\uAC00\uC138\uC694"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        color: 'var(--text-muted)',
        marginTop: 6
      }
    }, "\uC6D0\uD558\uB294 \uC120\uC0DD\uB2D8\uACFC \uC2DC\uAC04\uC744 \uACE8\uB77C \uC8FC\uC138\uC694.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }
    }, usedTeachers.map(tid => {
      const avail = slots.filter(s => s.teacherId === tid && !s.booked);
      return /*#__PURE__*/React.createElement("div", {
        key: tid
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          marginBottom: 10
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'var(--violet-100)',
          color: 'var(--violet-900)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: 13
        }
      }, tName(tid)[0]), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 14.5,
          fontWeight: 800,
          color: 'var(--text-strong)'
        }
      }, tName(tid), " \uAC15\uC0AC")), avail.length === 0 ? /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12.5,
          color: 'var(--text-faint)',
          paddingLeft: 41
        }
      }, "\uAC00\uB2A5\uD55C \uC2DC\uAC04\uC774 \uC5C6\uC5B4\uC694.") : /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          paddingLeft: 41
        }
      }, avail.map(s => /*#__PURE__*/React.createElement("button", {
        key: s.id,
        onClick: () => book(s),
        style: {
          padding: '9px 13px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-soft)',
          background: 'var(--surface-card)',
          cursor: 'pointer',
          fontFamily: 'var(--font-body)',
          textAlign: 'left',
          transition: 'all var(--dur-fast) var(--ease-out)'
        },
        onMouseEnter: e => {
          e.currentTarget.style.borderColor = 'var(--violet-800)';
          e.currentTarget.style.background = 'var(--surface-brand-soft)';
        },
        onMouseLeave: e => {
          e.currentTarget.style.borderColor = 'var(--border-soft)';
          e.currentTarget.style.background = 'var(--surface-card)';
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          color: 'var(--text-faint)'
        }
      }, s.date.replace(/ \(.\)/, '')), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 13.5,
          fontWeight: 700,
          color: 'var(--text-strong)',
          fontFeatureSettings: '"tnum"'
        }
      }, s.time)))));
    }))));
  }

  /* ── 예약 완료 ── */
  const primary = doneRecs && doneRecs[0];
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uBAA8\uBC14\uC77C \u2014 \uC608\uC57D \uC644\uB8CC",
    style: {
      minHeight: '100%',
      background: 'var(--surface-page)',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(Head, {
    title: "\uC608\uC57D \uC644\uB8CC"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: '20px 18px 30px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 54,
      height: 54,
      borderRadius: '50%',
      background: 'var(--violet-900)',
      color: 'var(--mint-400)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: 'ds-pop var(--dur-hero) var(--ease-spring) both'
    }
  }, /*#__PURE__*/React.createElement(I.check, {
    size: 24,
    sw: 2.6
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 23,
      fontWeight: 800,
      marginTop: 14,
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 120ms both'
    }
  }, doneRecs.length > 1 ? `${doneRecs.length}명 예약이 확정됐어요!` : '예약이 확정됐어요!'), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 330,
      marginTop: 20,
      borderRadius: 'var(--radius-lg)',
      background: 'var(--surface-card)',
      boxShadow: 'var(--shadow-raised)',
      overflow: 'hidden',
      animation: 'ds-fade-up var(--dur-hero) var(--ease-spring) 200ms both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-brand)',
      color: 'var(--text-on-brand)',
      padding: '16px 20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      letterSpacing: 'var(--tracking-caps)',
      color: 'var(--mint-400)',
      fontWeight: 700
    }
  }, "NPR ADMISSION QR"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 16.5,
      marginTop: 4,
      lineHeight: 1.35
    }
  }, session.title)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 20px',
      display: 'flex',
      gap: 16,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(QrBox, {
    code: primary.code,
    size: 112,
    style: {
      animation: 'ds-pop var(--dur-slow) var(--ease-spring) 400ms both'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 9,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(KV, {
    k: "\uC608\uC57D\uC790",
    v: primary.name
  }), /*#__PURE__*/React.createElement(KV, {
    k: "\uC77C\uC2DC",
    v: `${session.date} ${session.time}`
  }), session.attendField && /*#__PURE__*/React.createElement(KV, {
    k: "\uCC38\uC11D \uC778\uC6D0",
    v: `${primary.attendCount}명`
  }), /*#__PURE__*/React.createElement(KV, {
    k: "\uC608\uC57D\uBC88\uD638",
    v: /*#__PURE__*/React.createElement("span", {
      style: {
        fontFeatureSettings: '"tnum"',
        fontSize: 12.5,
        letterSpacing: '0.03em'
      }
    }, primary.code)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '2px dashed var(--gray-3)',
      margin: '0 -13px',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 0,
      top: -12,
      width: 24,
      height: 24,
      borderRadius: '50%',
      background: 'var(--surface-page)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 0,
      top: -12,
      width: 24,
      height: 24,
      borderRadius: '50%',
      background: 'var(--surface-page)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 20px 18px',
      background: 'var(--surface-accent-soft)',
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
      fontSize: 12.5,
      color: 'var(--mint-700)',
      lineHeight: 1.55
    }
  }, /*#__PURE__*/React.createElement(I.message, {
    size: 15,
    style: {
      flexShrink: 0,
      marginTop: 2
    }
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", null, primary.phone), "\uB85C QR\uC774 \uB2F4\uAE34 \uBB38\uC790\uB97C \uBC1C\uC1A1\uD588\uC5B4\uC694. \uC785\uC7A5 \uC2DC \uD0DC\uBE14\uB9BF\uC5D0 QR\uC744 \uBCF4\uC5EC\uC8FC\uC138\uC694."))), doneRecs.length > 1 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 330,
      marginTop: 12,
      borderRadius: 'var(--radius-lg)',
      background: 'var(--surface-card)',
      border: '1px solid var(--border-hairline)',
      padding: '14px 18px',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 420ms both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      color: 'var(--text-faint)',
      marginBottom: 8
    }
  }, "\uD568\uAED8 \uC608\uC57D\uB41C \uC790\uB140 ", doneRecs.length, "\uBA85"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, doneRecs.map(r => /*#__PURE__*/React.createElement("div", {
    key: r.id,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 30,
      height: 30,
      borderRadius: '50%',
      background: 'var(--violet-100)',
      color: 'var(--violet-900)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 800,
      fontSize: 12,
      flexShrink: 0
    }
  }, r.name[0]), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 13.5,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, r.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-faint)',
      fontFeatureSettings: '"tnum"'
    }
  }, r.code))))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 330,
      marginTop: 22,
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 460ms both'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setStep('counsel'),
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '14px 16px',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--surface-accent-soft)',
      border: '1px solid var(--mint-200)',
      cursor: 'pointer',
      textAlign: 'left',
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 38,
      height: 38,
      borderRadius: 'var(--radius-sm)',
      background: 'var(--mint-500)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(I.clipboard, {
    size: 18
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 14,
      fontWeight: 800,
      color: 'var(--mint-700)'
    }
  }, "\uAC1C\uBCC4 \uC0C1\uB2F4 \uC2E0\uCCAD\uD558\uAE30"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 12,
      color: 'var(--mint-600)',
      marginTop: 2
    }
  }, "\uC120\uC0DD\uB2D8\uACFC 1:1 \uC0C1\uB2F4 \uC2DC\uAC04\uC744 \uC608\uC57D\uD558\uC138\uC694")), /*#__PURE__*/React.createElement(I.arrowRight, {
    size: 16,
    style: {
      color: 'var(--mint-600)'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginTop: 14,
      width: '100%',
      maxWidth: 330,
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 520ms both'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    fullWidth: true,
    icon: /*#__PURE__*/React.createElement(I.calendar, {
      size: 15
    })
  }, "\uCE98\uB9B0\uB354 \uCD94\uAC00"), /*#__PURE__*/React.createElement(Button, {
    fullWidth: true,
    onClick: reset
  }, "\uCC98\uC74C\uC73C\uB85C"))));
}
window.MobileFlow = MobileFlow;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/MobileFlow.jsx", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/PhoneScreen.jsx
try { (() => {
/* 전화예약/취소 — 설명회별 예약 현황 + 수동예약 등록 + QR/문자 상세 */
function PhoneScreen({
  store
}) {
  const {
    Button,
    Input,
    Select,
    Tag,
    Card,
    Badge,
    Dialog,
    Toast,
    Tabs,
    Radio
  } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const {
    sessions,
    students,
    reservations,
    addReservation,
    cancelReservation,
    moveReservation,
    reissueCode
  } = store;
  const [sessionId, setSessionId] = React.useState(sessions[0]?.id);
  const [chFilter, setChFilter] = React.useState('전체');
  const [selectedId, setSelectedId] = React.useState(null);
  const [cancelTarget, setCancelTarget] = React.useState(null);
  const [manualOpen, setManualOpen] = React.useState(false);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [moveTo, setMoveTo] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const seatsUsed = sid => reservations.filter(r => r.sessionId === sid && r.status !== 'cancelled').length;
  const session = sessions.find(s => s.id === sessionId);
  const rs = reservations.filter(r => r.sessionId === sessionId);
  const phoneRs = rs.filter(r => r.channel === 'phone' && r.status !== 'cancelled');
  const entered = rs.filter(r => r.status === 'entered');
  const unchecked = rs.filter(r => r.status === 'reserved');
  const list = rs.filter(r => {
    if (chFilter === '전화') return r.channel === 'phone';
    if (chFilter === '취소됨') return r.status === 'cancelled';
    if (chFilter === '미체크') return r.status === 'reserved';
    return true;
  });
  const selected = reservations.find(r => r.id === selectedId);
  const flash = m => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };
  const doCancel = () => {
    cancelReservation(cancelTarget.id);
    setCancelTarget(null);
    flash('예약이 취소되었어요 — 취소 안내 문자를 발송했어요');
  };
  const onManualDone = r => {
    setManualOpen(false);
    setSelectedId(r.id);
    flash('예약이 등록됐어요 — QR과 문자를 확인하세요');
  };
  const doReissue = () => {
    reissueCode(selected.id);
    flash(`QR을 재발급했어요 — 새 QR을 ${selected.phone}로 재발송했어요`);
  };
  const doMove = () => {
    const dest = sessions.find(s => s.id === moveTo);
    moveReservation(selected.id, moveTo);
    setMoveOpen(false);
    setMoveTo(null);
    flash(`${dest.title} · ${dest.round}(으)로 변경했어요 — 변경 확정 문자를 발송했어요`);
  };
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uC804\uD654\uC608\uC57D \uAD00\uB9AC"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      color: 'var(--text-accent)',
      marginBottom: 6
    }
  }, "PHONE RESERVATION"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--text-h1)',
      fontWeight: 800
    }
  }, "\uC804\uD654\uC608\uC57D \uAD00\uB9AC")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Select, {
    options: sessions.map(s => ({
      label: `${s.title} · ${s.round}`,
      value: s.id
    })),
    value: sessionId,
    onChange: v => {
      setSessionId(v);
      setSelectedId(null);
    },
    style: {
      width: 320
    }
  }), /*#__PURE__*/React.createElement(Button, {
    icon: /*#__PURE__*/React.createElement(I.plus, {
      size: 16
    }),
    onClick: () => setManualOpen(true)
  }, "\uC218\uB3D9\uC608\uC57D \uB4F1\uB85D"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 14,
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "\uC804\uD654\uC608\uC57D \uC778\uC6D0",
    value: phoneRs.length,
    suffix: "\uAC74",
    tone: "brand",
    icon: /*#__PURE__*/React.createElement(I.phone, {
      size: 15
    }),
    delay: 0,
    onClick: () => setChFilter('전화'),
    active: chFilter === '전화'
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "\uC785\uC7A5 \uC644\uB8CC",
    value: entered.length,
    suffix: "\uBA85",
    tone: "success",
    icon: /*#__PURE__*/React.createElement(I.check, {
      size: 15
    }),
    delay: 60,
    onClick: () => setChFilter('전체')
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "\uBBF8\uCCB4\uD06C",
    value: unchecked.length,
    suffix: "\uBA85",
    tone: "accent",
    icon: /*#__PURE__*/React.createElement(I.clock, {
      size: 15
    }),
    delay: 120,
    onClick: () => setChFilter('미체크'),
    active: chFilter === '미체크'
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "\uCDE8\uC18C",
    value: rs.filter(r => r.status === 'cancelled').length,
    suffix: "\uAC74",
    tone: "danger",
    icon: /*#__PURE__*/React.createElement(I.x, {
      size: 15
    }),
    delay: 180,
    onClick: () => setChFilter('취소됨'),
    active: chFilter === '취소됨'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: selected ? '1fr 360px' : '1fr',
      gap: 14,
      marginTop: 14,
      alignItems: 'start',
      transition: 'grid-template-columns var(--dur-base) var(--ease-smooth)'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "0",
    style: {
      overflow: 'hidden',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 200ms both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '13px 20px',
      borderBottom: '1px solid var(--border-hairline)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, "\uC608\uC57D \uBAA9\uB85D"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-faint)',
      fontFeatureSettings: '"tnum"'
    }
  }, list.length, "\uAC74"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), ['전체', '전화', '미체크', '취소됨'].map(f => /*#__PURE__*/React.createElement(Tag, {
    key: f,
    selected: chFilter === f,
    onClick: () => setChFilter(f),
    style: {
      height: 30
    }
  }, f))), list.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: r.id,
    onClick: () => setSelectedId(r.id === selectedId ? null : r.id),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '13px 20px',
      borderTop: i > 0 ? '1px solid var(--border-hairline)' : 'none',
      cursor: 'pointer',
      background: selectedId === r.id ? 'var(--surface-brand-soft)' : 'var(--surface-card)',
      transition: 'background var(--dur-fast) var(--ease-out)',
      animation: `ds-fade-up var(--dur-base) var(--ease-out) ${Math.min(i, 10) * 35}ms both`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 150
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 14,
      color: 'var(--text-strong)',
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, r.name, " ", !r.member && /*#__PURE__*/React.createElement(Badge, {
    tone: "accent",
    size: "sm"
  }, "\uBE44\uC7AC\uC6D0"), " ", r.groupId && /*#__PURE__*/React.createElement(Badge, {
    tone: "info",
    size: "sm"
  }, "\uD615\uC81C")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-faint)',
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, r.school, " \xB7 ", r.grade, r.history && r.history.length > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-accent)',
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement(I.calendar, {
    size: 10
  }), "\uD68C\uCC28\uBCC0\uACBD"))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)',
      fontFeatureSettings: '"tnum"',
      width: 130
    }
  }, r.phone), /*#__PURE__*/React.createElement(Badge, {
    tone: r.channel === 'phone' ? 'info' : 'neutral',
    size: "sm"
  }, nprChannelLabel[r.channel]), session.attendField && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      fontFeatureSettings: '"tnum"'
    }
  }, r.attendCount, "\uBA85"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(ResStatusBadge, {
    status: r.status,
    size: "sm"
  }), r.status !== 'cancelled' && /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: e => {
      e && e.stopPropagation && e.stopPropagation();
      setCancelTarget(r);
    },
    style: {
      color: 'var(--status-danger)'
    }
  }, "\uCDE8\uC18C"))), list.length === 0 && /*#__PURE__*/React.createElement(EmptyState, null, "\uD574\uB2F9 \uC870\uAC74\uC758 \uC608\uC57D\uC774 \uC5C6\uC5B4\uC694.")), selected && /*#__PURE__*/React.createElement(Card, {
    padding: "22px",
    style: {
      position: 'sticky',
      top: 20,
      animation: 'ds-slide-in-right var(--dur-slow) var(--ease-spring) both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      color: 'var(--text-accent)'
    }
  }, "RESERVATION DETAIL"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setSelectedId(null),
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--text-faint)'
    }
  }, /*#__PURE__*/React.createElement(I.x, {
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      alignItems: 'center',
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement(QrBox, {
    code: selected.code,
    size: 108,
    style: {
      animation: 'ds-pop var(--dur-slow) var(--ease-spring) both'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(KV, {
    k: "\uC608\uC57D\uC790",
    v: `${selected.name} (${selected.grade})`
  }), /*#__PURE__*/React.createElement(KV, {
    k: "\uC608\uC57D\uBC88\uD638",
    v: /*#__PURE__*/React.createElement("span", {
      style: {
        fontFeatureSettings: '"tnum"',
        letterSpacing: '0.04em'
      }
    }, selected.code)
  }), /*#__PURE__*/React.createElement(ResStatusBadge, {
    status: selected.status
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      marginTop: 16,
      paddingTop: 16,
      borderTop: '1px dashed var(--gray-3)'
    }
  }, /*#__PURE__*/React.createElement(KV, {
    k: "\uC5F0\uB77D\uCC98",
    v: selected.phone
  }), /*#__PURE__*/React.createElement(KV, {
    k: "\uCC44\uB110",
    v: nprChannelLabel[selected.channel] + '예약'
  }), /*#__PURE__*/React.createElement(KV, {
    k: "\uC77C\uC2DC",
    v: `${session.date} ${session.time}`
  }), session.attendField && /*#__PURE__*/React.createElement(KV, {
    k: "\uCC38\uC11D \uC778\uC6D0",
    v: `${selected.attendCount}명`
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      padding: '12px 14px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-brand-soft)',
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
      fontSize: 12.5,
      color: 'var(--violet-800)',
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement(I.message, {
    size: 15,
    style: {
      flexShrink: 0,
      marginTop: 1
    }
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", null, selected.phone), "\uB85C QR\uC774 \uB2F4\uAE34 \uC608\uC57D \uD655\uC815 \uBB38\uC790\uB97C \uBC1C\uC1A1\uD588\uC5B4\uC694.")), selected.codeHistory && selected.codeHistory.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 11.5,
      color: 'var(--text-faint)',
      display: 'flex',
      gap: 5,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(I.refresh, {
    size: 12
  }), " QR \uC7AC\uBC1C\uAE09 ", selected.codeHistory.length, "\uD68C \xB7 \uC774\uC804 \uCF54\uB4DC \uBB34\uD6A8"), selected.history && selected.history.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 11.5,
      color: 'var(--text-faint)',
      display: 'flex',
      gap: 5,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(I.calendar, {
    size: 12
  }), " \uD68C\uCC28 \uBCC0\uACBD ", selected.history.length, "\uD68C"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    style: {
      flex: '1 1 45%'
    },
    icon: /*#__PURE__*/React.createElement(I.send, {
      size: 14
    }),
    onClick: () => flash(`${selected.phone}로 문자를 재발송했어요`)
  }, "\uBB38\uC790 \uC7AC\uBC1C\uC1A1"), selected.status !== 'cancelled' && /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    style: {
      flex: '1 1 45%'
    },
    icon: /*#__PURE__*/React.createElement(I.refresh, {
      size: 14
    }),
    onClick: doReissue
  }, "QR \uC7AC\uBC1C\uAE09"), selected.status === 'reserved' && /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    style: {
      flex: '1 1 45%'
    },
    icon: /*#__PURE__*/React.createElement(I.calendar, {
      size: 14
    }),
    onClick: () => {
      setMoveTo(null);
      setMoveOpen(true);
    }
  }, "\uC608\uC57D \uBCC0\uACBD"), selected.status === 'reserved' && /*#__PURE__*/React.createElement(Button, {
    variant: "danger",
    size: "sm",
    style: {
      flex: '1 1 45%'
    },
    onClick: () => setCancelTarget(selected)
  }, "\uC608\uC57D \uCDE8\uC18C")))), /*#__PURE__*/React.createElement(ManualReserveDialog, {
    open: manualOpen,
    onClose: () => setManualOpen(false),
    session: session,
    students: students,
    reservations: reservations,
    addReservation: addReservation,
    onDone: onManualDone
  }), /*#__PURE__*/React.createElement(Dialog, {
    open: moveOpen,
    onClose: () => setMoveOpen(false),
    title: "\uC608\uC57D\uC744 \uC5B4\uB514\uB85C \uC62E\uAE38\uAE4C\uC694?",
    width: 460,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => setMoveOpen(false)
    }, "\uB3CC\uC544\uAC00\uAE30"), /*#__PURE__*/React.createElement(Button, {
      disabled: !moveTo,
      onClick: doMove,
      icon: /*#__PURE__*/React.createElement(I.check, {
        size: 15
      })
    }, "\uC774 \uC124\uBA85\uD68C\uB85C \uBCC0\uACBD"))
  }, selected && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)',
      lineHeight: 1.55
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-strong)'
    }
  }, selected.name), " \uB2D8\uC758 \uC608\uC57D\uC744 \uB2E4\uB978 \uC124\uBA85\uD68C\uB85C \uC774\uB3D9\uD574\uC694. ", /*#__PURE__*/React.createElement("b", null, "\uC608\uC57D\uBC88\uD638\uC640 QR\uC740 \uADF8\uB300\uB85C \uC720\uC9C0"), "\uB418\uBA70, \uBCC0\uACBD \uD655\uC815 \uBB38\uC790\uAC00 \uBC1C\uC1A1\uB3FC\uC694."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      marginTop: 4
    }
  }, sessions.filter(s => s.id !== selected.sessionId).map(s => {
    const left = s.capacity - seatsUsed(s.id);
    const full = left <= 0;
    const sel = moveTo === s.id;
    return /*#__PURE__*/React.createElement("div", {
      key: s.id,
      onClick: () => {
        if (!full) setMoveTo(s.id);
      },
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '13px 15px',
        borderRadius: 'var(--radius-md)',
        cursor: full ? 'not-allowed' : 'pointer',
        opacity: full ? 0.5 : 1,
        background: sel ? 'var(--surface-brand-soft)' : 'var(--surface-card)',
        border: sel ? '1.5px solid var(--violet-800)' : '1px solid var(--border-hairline)',
        transition: 'all var(--dur-fast) var(--ease-out)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        fontSize: 13.5,
        color: 'var(--text-strong)'
      }
    }, s.title), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--text-faint)',
        marginTop: 2
      }
    }, s.date, " \xB7 ", s.round, " \xB7 ", s.time)), full ? /*#__PURE__*/React.createElement(Badge, {
      tone: "neutral",
      size: "sm"
    }, "\uB9C8\uAC10") : /*#__PURE__*/React.createElement(Badge, {
      tone: left / s.capacity <= 0.15 ? 'warning' : 'brand',
      size: "sm"
    }, "\uC794\uC5EC ", left, "\uC11D"));
  })))), /*#__PURE__*/React.createElement(Dialog, {
    open: !!cancelTarget,
    onClose: () => setCancelTarget(null),
    title: "\uC608\uC57D\uC744 \uCDE8\uC18C\uD560\uAE4C\uC694?",
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => setCancelTarget(null)
    }, "\uB3CC\uC544\uAC00\uAE30"), /*#__PURE__*/React.createElement(Button, {
      variant: "danger",
      onClick: doCancel
    }, "\uC608\uC57D \uCDE8\uC18C"))
  }, cancelTarget && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", null, cancelTarget.name), " \uB2D8\uC758 ", session.title, " \uC608\uC57D\uC744 \uCDE8\uC18C\uD569\uB2C8\uB2E4. \uCDE8\uC18C \uC548\uB0B4 \uBB38\uC790\uAC00 \uC790\uB3D9 \uBC1C\uC1A1\uB3FC\uC694.")), toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: 26,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 120
    }
  }, /*#__PURE__*/React.createElement(Toast, {
    tone: "success"
  }, toast)));
}
window.PhoneScreen = PhoneScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/PhoneScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/PreviewScreen.jsx
try { (() => {
/* 모바일예약 프리뷰 — 시연용 학부모 뷰 (테스트 전용) */
function PreviewScreen({
  store
}) {
  const {
    Button,
    Badge
  } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const [resetKey, setResetKey] = React.useState(0);
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uBAA8\uBC14\uC77C\uC608\uC57D \uD504\uB9AC\uBDF0",
    style: {
      display: 'flex',
      flexDirection: 'column',
      minHeight: 'calc(100vh - 92px)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 16,
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      color: 'var(--text-accent)',
      marginBottom: 6
    }
  }, "MOBILE PREVIEW"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--text-h1)',
      fontWeight: 800
    }
  }, "\uBAA8\uBC14\uC77C\uC608\uC57D \uD504\uB9AC\uBDF0"), /*#__PURE__*/React.createElement(Badge, {
    tone: "accent",
    dot: true
  }, "\uD14C\uC2A4\uD2B8 \uC804\uC6A9"), /*#__PURE__*/React.createElement(Badge, {
    tone: "info"
  }, "\uC2E4\uC81C \uBB38\uC790 \uBBF8\uBC1C\uC1A1"))), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: /*#__PURE__*/React.createElement(I.refresh, {
      size: 15
    }),
    onClick: () => setResetKey(resetKey + 1)
  }, "\uD504\uB9AC\uBDF0 \uCD08\uAE30\uD654")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '28px 0 12px',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 150ms both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 370,
      borderRadius: 52,
      background: 'var(--violet-950)',
      padding: 11,
      boxShadow: 'var(--shadow-float)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      borderRadius: 42,
      overflow: 'hidden',
      background: 'var(--surface-page)',
      width: 348,
      height: 754
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 10,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 110,
      height: 26,
      borderRadius: 16,
      background: 'var(--violet-950)',
      zIndex: 20
    }
  }), /*#__PURE__*/React.createElement("div", {
    key: resetKey,
    style: {
      position: 'absolute',
      inset: 0,
      overflowY: 'auto',
      paddingTop: 40
    }
  }, /*#__PURE__*/React.createElement(MobileFlow, {
    store: store,
    compact: true
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      fontSize: 12.5,
      color: 'var(--text-faint)',
      marginTop: 12,
      lineHeight: 1.7
    }
  }, "\uC5EC\uAE30\uC11C \uB9CC\uB4E0 \uC608\uC57D\uC740 \uCF58\uC194 \uB370\uC774\uD130\uC5D0 \uC989\uC2DC \uBC18\uC601 \xB7 \uC7AC\uC6D0\uC0DD \uC870\uD68C\uB294 \uBA85\uB2E8 \uBC88\uD638 \uC77C\uBD80(\uC608: 3200)\uB85C \uAC80\uC0C9", /*#__PURE__*/React.createElement("br", null), "\uC2E4\uAE30\uAE30 \uD654\uBA74\uC740 \uC0AC\uC774\uB4DC\uBC14\uC758 ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-muted)'
    }
  }, "\uBAA8\uBC14\uC77C \uC608\uC57D \uD398\uC774\uC9C0 \uC5F4\uAE30"))));
}
window.PreviewScreen = PreviewScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/PreviewScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/ScannerScreen.jsx
try { (() => {
/* 태블릿 QR 스캐너 — 기기 선택 → 전체화면 스캐너 (목업, 카메라 미사용) */
function ScannerScreen({
  store
}) {
  const {
    Button,
    Input,
    Card,
    Badge,
    Toast
  } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const {
    sessions,
    students,
    reservations,
    checkIn,
    addReservation
  } = store;
  const session = sessions[0];
  const [device, setDevice] = React.useState(null); // 선택된 기기
  const [perm, setPerm] = React.useState('ask'); // ask | granted | denied
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [digits, setDigits] = React.useState('');
  const [scanResult, setScanResult] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const flash = m => {
    setToast(m);
    setTimeout(() => setToast(null), 3200);
  };
  const demoScan = () => {
    const target = reservations.find(r => r.sessionId === session.id && r.status === 'reserved');
    if (!target) {
      flash('미체크 예약이 없어요');
      return;
    }
    checkIn(target.id);
    setScanResult(target);
    setTimeout(() => setScanResult(null), 2600);
  };
  const found = digits.length >= 4 ? students.filter(s => s.parentPhone.replace(/\D/g, '').endsWith(digits.slice(-4))) : [];
  const walkIn = stu => {
    const existing = reservations.find(r => r.sessionId === session.id && r.studentId === stu.id && r.status !== 'cancelled');
    if (existing) {
      checkIn(existing.id);
    } else {
      const r = addReservation({
        sessionId: session.id,
        studentId: stu.id,
        name: stu.name,
        school: stu.school,
        grade: stu.grade,
        phone: stu.parentPhone,
        channel: 'manual',
        attendCount: 1,
        member: true
      });
      checkIn(r.id);
    }
    setSheetOpen(false);
    setDigits('');
    flash(`${stu.name} 님 입장 완료 — 학부모께 입장 완료 문자를 발송했어요`);
  };

  /* ── 기기 선택 뷰 ── */
  if (!device) {
    return /*#__PURE__*/React.createElement("div", {
      "data-screen-label": "QR \uC2A4\uCE90\uB108 \u2014 \uAE30\uAE30 \uC120\uD0DD"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        letterSpacing: 'var(--tracking-caps)',
        fontWeight: 700,
        color: 'var(--text-accent)',
        marginBottom: 6
      }
    }, "QR SCANNER"), /*#__PURE__*/React.createElement("h1", {
      style: {
        fontSize: 'var(--text-h1)',
        fontWeight: 800
      }
    }, "\uD0DC\uBE14\uB9BF \uC2A4\uCE90\uB108"), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '8px 0 0',
        fontSize: 14,
        color: 'var(--text-muted)'
      }
    }, "\uCD5C\uB300 4\uB300\uAE4C\uC9C0 \uB3D9\uC2DC \uBAA8\uB2C8\uD130\uB9C1 \u2014 \uC811\uC18D \uAE30\uAE30\uB97C \uC120\uD0DD\uD558\uBA74 \uC804\uCCB4\uD654\uBA74 \uC2A4\uCE90\uB108\uB85C \uC804\uD658\uB3FC\uC694.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 14,
        marginTop: 24
      }
    }, store.devices.map((d, i) => /*#__PURE__*/React.createElement(Card, {
      key: d.id,
      padding: "22px",
      style: {
        textAlign: 'center',
        animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${i * 80}ms both`,
        opacity: d.on ? 1 : 0.72
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative',
        width: 62,
        height: 62,
        margin: '0 auto',
        borderRadius: 'var(--radius-md)',
        background: d.on ? 'var(--violet-50)' : 'var(--surface-sunken)',
        color: d.on ? 'var(--violet-800)' : 'var(--text-faint)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(I.tablet, {
      size: 28
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        top: -4,
        right: -4,
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: d.on ? 'var(--status-success)' : 'var(--ink-300)',
        border: '2.5px solid var(--surface-card)',
        animation: d.on ? 'ds-float 2.4s var(--ease-in-out) infinite' : 'none'
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 14,
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 16.5,
        color: 'var(--text-strong)'
      }
    }, d.label), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        color: 'var(--text-muted)',
        marginTop: 3
      }
    }, d.model), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'center',
        gap: 8,
        marginTop: 10
      }
    }, d.on ? /*#__PURE__*/React.createElement(Badge, {
      tone: "success",
      dot: true,
      size: "sm"
    }, "\uC2A4\uCE90\uB108 ON") : /*#__PURE__*/React.createElement(Badge, {
      tone: "neutral",
      size: "sm"
    }, "OFF"), /*#__PURE__*/React.createElement(Badge, {
      tone: d.battery < 40 ? 'warning' : 'neutral',
      size: "sm"
    }, d.battery, "%")), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: 'var(--text-faint)',
        marginTop: 8
      }
    }, "\uB9C8\uC9C0\uB9C9 \uD65C\uB3D9 ", d.last), /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      fullWidth: true,
      variant: d.on ? 'primary' : 'secondary',
      style: {
        marginTop: 14
      },
      onClick: () => {
        setDevice(d);
        setPerm('ask');
      }
    }, d.on ? '이 기기로 스캔' : '연결하기')))), /*#__PURE__*/React.createElement(Card, {
      variant: "accent",
      padding: "16px 20px",
      style: {
        marginTop: 18,
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        fontSize: 13.5,
        color: 'var(--mint-700)',
        fontWeight: 600,
        animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 350ms both'
      }
    }, /*#__PURE__*/React.createElement(I.qr, {
      size: 16
    }), " \uC624\uB298 \uC2A4\uCE94 \uB300\uC0C1: ", session.title, " \u2014 \uBBF8\uCCB4\uD06C ", reservations.filter(r => r.sessionId === session.id && r.status === 'reserved').length, "\uBA85"));
  }

  /* ── 전체화면 스캐너 ── */
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "QR \uC2A4\uCE90\uB108 \u2014 \uC2A4\uCE94 \uD654\uBA74",
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 90,
      background: '#0A0F1A',
      display: 'flex',
      flexDirection: 'column',
      animation: 'ds-fade-in var(--dur-base) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '16px 22px',
      color: 'var(--gray-1)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setDevice(null),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      background: 'rgba(248,250,252,0.1)',
      border: 'none',
      color: 'var(--gray-1)',
      fontSize: 13,
      fontWeight: 700,
      cursor: 'pointer',
      fontFamily: 'var(--font-body)',
      padding: '9px 14px',
      borderRadius: 'var(--radius-pill)'
    }
  }, /*#__PURE__*/React.createElement(I.refresh, {
    size: 14
  }), " \uAE30\uAE30 \uBCC0\uACBD"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13.5
    }
  }, /*#__PURE__*/React.createElement(I.tablet, {
    size: 15
  }), " ", device.label, " \xB7 ", device.model, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: 'var(--status-success)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13.5,
      color: 'var(--mint-400)',
      fontWeight: 700
    }
  }, session.title)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, perm === 'ask' && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 380,
      background: 'var(--surface-card)',
      borderRadius: 'var(--radius-xl)',
      padding: 28,
      textAlign: 'center',
      boxShadow: 'var(--shadow-float)',
      animation: 'ds-pop var(--dur-slow) var(--ease-spring) both'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 54,
      height: 54,
      borderRadius: '50%',
      background: 'var(--violet-50)',
      color: 'var(--violet-800)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(I.camera, {
    size: 24
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 19,
      fontWeight: 800,
      marginTop: 14
    }
  }, "\uCE74\uBA54\uB77C \uAD8C\uD55C\uC774 \uD544\uC694\uD574\uC694"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13.5,
      color: 'var(--text-muted)',
      margin: '8px 0 0',
      lineHeight: 1.6
    }
  }, "QR \uC2A4\uCE94\uC744 \uC704\uD574 \uC774 \uD0DC\uBE14\uB9BF\uC758 \uCE74\uBA54\uB77C \uC811\uADFC\uC744 \uD5C8\uC6A9\uD574 \uC8FC\uC138\uC694. \uC601\uC0C1\uC740 \uC800\uC7A5\uB418\uC9C0 \uC54A\uC544\uC694."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    fullWidth: true,
    onClick: () => setDevice(null)
  }, "\uAC70\uBD80"), /*#__PURE__*/React.createElement(Button, {
    fullWidth: true,
    onClick: () => setPerm('granted')
  }, "\uD5C8\uC6A9"))), perm === 'granted' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 320,
      height: 320
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 28,
      boxShadow: '0 0 0 9999px rgba(10,15,26,0.55)',
      background: 'rgba(248,250,252,0.03)'
    }
  }), [{
    t: 0,
    l: 0,
    br: '18px 0 0 0',
    bt: true,
    bl: true
  }, {
    t: 0,
    r: 0,
    br: '0 18px 0 0',
    bt: true,
    brd: true
  }, {
    b: 0,
    l: 0,
    br: '0 0 0 18px',
    bb: true,
    bl: true
  }, {
    b: 0,
    r: 0,
    br: '0 0 18px 0',
    bb: true,
    brd: true
  }].map((c, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      position: 'absolute',
      top: c.t,
      left: c.l,
      right: c.r,
      bottom: c.b,
      width: 46,
      height: 46,
      borderRadius: c.br,
      borderTop: c.bt ? '4px solid var(--mint-500)' : 'none',
      borderBottom: c.bb ? '4px solid var(--mint-500)' : 'none',
      borderLeft: c.bl ? '4px solid var(--mint-500)' : 'none',
      borderRight: c.brd ? '4px solid var(--mint-500)' : 'none'
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "npr-scanline"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 'calc(50% + 190px)',
      left: '50%',
      transform: 'translateX(-50%)',
      color: 'rgba(248,250,252,0.75)',
      fontSize: 14.5,
      whiteSpace: 'nowrap',
      textAlign: 'center'
    }
  }, "\uBB38\uC790\uB85C \uBC1B\uC740 QR\uC744 \uD504\uB808\uC784 \uC548\uC5D0 \uB9DE\uCDB0 \uC8FC\uC138\uC694", /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: demoScan,
    style: {
      padding: '8px 16px',
      borderRadius: 'var(--radius-pill)',
      border: '1px dashed rgba(56,189,248,0.6)',
      background: 'transparent',
      color: 'var(--mint-400)',
      fontSize: 12.5,
      fontWeight: 700,
      cursor: 'pointer',
      fontFamily: 'var(--font-body)'
    }
  }, "\uB370\uBAA8 \u2014 QR \uC778\uC2DD \uC2DC\uBBAC\uB808\uC774\uC158"))), scanResult && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 340,
      background: 'var(--surface-card)',
      borderRadius: 'var(--radius-xl)',
      padding: 26,
      textAlign: 'center',
      boxShadow: 'var(--shadow-float)',
      animation: 'ds-pop var(--dur-slow) var(--ease-spring) both',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 52,
      height: 52,
      borderRadius: '50%',
      background: 'var(--violet-900)',
      color: 'var(--mint-400)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: 'ds-pop var(--dur-hero) var(--ease-spring) both'
    }
  }, /*#__PURE__*/React.createElement(I.check, {
    size: 24,
    sw: 2.6
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 21,
      fontWeight: 800,
      marginTop: 12
    }
  }, scanResult.name, " \uB2D8 \uC785\uC7A5 \uC644\uB8CC"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)',
      marginTop: 5
    }
  }, scanResult.school, " \xB7 ", scanResult.grade, " \xB7 ", scanResult.code), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      fontSize: 12.5,
      color: 'var(--violet-800)',
      background: 'var(--surface-brand-soft)',
      borderRadius: 'var(--radius-sm)',
      padding: '9px 12px',
      display: 'inline-flex',
      gap: 7,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(I.message, {
    size: 13
  }), " \uD559\uBD80\uBAA8\uAED8 \uC785\uC7A5 \uC644\uB8CC \uBB38\uC790 \uBC1C\uC1A1\uB428")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: 26,
      bottom: 26
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    size: "lg",
    icon: /*#__PURE__*/React.createElement(I.logIn, {
      size: 17
    }),
    onClick: () => setSheetOpen(true)
  }, "\uD604\uC7A5 \uC785\uC7A5")), sheetOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(10,15,26,0.5)',
      display: 'flex',
      alignItems: 'flex-end',
      zIndex: 10
    },
    onClick: e => {
      if (e.target === e.currentTarget) setSheetOpen(false);
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxHeight: '72%',
      overflowY: 'auto',
      background: 'var(--surface-page)',
      borderRadius: '28px 28px 0 0',
      padding: '26px 30px 34px',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-spring) both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 5,
      borderRadius: 3,
      background: 'var(--gray-3)',
      margin: '0 auto 18px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 20,
      fontWeight: 800
    }
  }, "\uD604\uC7A5 \uC785\uC7A5 \u2014 \uC7AC\uC6D0\uC0DD \uC870\uD68C"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setSheetOpen(false),
    style: {
      background: 'none',
      border: 'none',
      color: 'var(--text-faint)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(I.x, {
    size: 18
  }))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)',
      margin: '6px 0 14px'
    }
  }, "QR\uC774 \uC5C6\uC5B4\uB3C4 \uC7AC\uC6D0\uC0DD\uC740 \uD559\uBD80\uBAA8 \uC5F0\uB77D\uCC98 \uB4B7\uC790\uB9AC\uB85C \uBC14\uB85C \uC785\uC7A5 \uCC98\uB9AC\uD560 \uC218 \uC788\uC5B4\uC694. (\uBE44\uC7AC\uC6D0\uC0DD\uC740 \uC218\uB3D9\uC608\uC57D \uB4F1\uB85D\uC744 \uC774\uC6A9)"), /*#__PURE__*/React.createElement(Input, {
    placeholder: "\uD559\uBD80\uBAA8 \uC5F0\uB77D\uCC98 \uB4B7\uC790\uB9AC 4\uC790\uB9AC",
    value: digits,
    onChange: v => setDigits(v.replace(/\D/g, '').slice(0, 4)),
    icon: /*#__PURE__*/React.createElement(I.search, {
      size: 17
    }),
    size: "lg"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 10,
      marginTop: 14
    }
  }, found.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.id,
    onClick: () => walkIn(s),
    style: {
      padding: '16px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-card)',
      border: '1px solid var(--border-hairline)',
      boxShadow: 'var(--shadow-card)',
      cursor: 'pointer',
      textAlign: 'center',
      transition: 'all var(--dur-fast) var(--ease-out)',
      animation: `ds-pop var(--dur-base) var(--ease-spring) ${i * 60}ms both`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      height: 40,
      borderRadius: '50%',
      background: 'var(--violet-100)',
      color: 'var(--violet-900)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 800,
      fontSize: 14
    }
  }, s.name[0]), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 800,
      fontSize: 15,
      color: 'var(--text-strong)',
      marginTop: 8
    }
  }, s.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, s.school, " \xB7 ", s.grade), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-faint)',
      marginTop: 2
    }
  }, s.className), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 12,
      fontWeight: 700,
      color: 'var(--violet-800)'
    }
  }, "\uD0ED\uD558\uC5EC \uC785\uC7A5 \uCC98\uB9AC")))), digits.length >= 4 && found.length === 0 && /*#__PURE__*/React.createElement(EmptyState, null, "\uB4B7\uC790\uB9AC ", digits, "\uC640 \uC77C\uCE58\uD558\uB294 \uC7AC\uC6D0\uC0DD\uC774 \uC5C6\uC5B4\uC694."))))), toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: 26,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 120
    }
  }, /*#__PURE__*/React.createElement(Toast, {
    tone: "success"
  }, toast)));
}
window.ScannerScreen = ScannerScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/ScannerScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/SessionsScreen.jsx
try { (() => {
/* 설명회 운영 — QR 운영 대시보드 + 새 설명회 생성/삭제 + 수동 체크인 */
function SessionsScreen({
  store
}) {
  const {
    Button,
    Input,
    Card,
    Badge,
    Dialog,
    Toast,
    Switch,
    Tag,
    Select
  } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const {
    sessions,
    reservations,
    addSession,
    deleteSession,
    checkIn,
    rollbackEntry,
    endSession,
    toggleReminder,
    addSmsLog,
    surveyResponses,
    convertGuest,
    classes,
    students,
    teachers,
    addReservation
  } = store;
  const [selId, setSelId] = React.useState(sessions[0]?.id);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [delOpen, setDelOpen] = React.useState(false);
  const [endOpen, setEndOpen] = React.useState(false);
  const [listFilter, setListFilter] = React.useState('전체');
  const [rollbackTarget, setRollbackTarget] = React.useState(null);
  const [rollbackReason, setRollbackReason] = React.useState('QR 오스캔');
  const [convertTarget, setConvertTarget] = React.useState(null);
  const [convertClass, setConvertClass] = React.useState(null);
  const [printMode, setPrintMode] = React.useState(false);
  const [teacherFilter, setTeacherFilter] = React.useState('all');
  const [classFilter, setClassFilter] = React.useState('all');
  const [toast, setToast] = React.useState(null);
  const [form, setForm] = React.useState({
    title: '',
    date: '',
    round: '1회차',
    place: '',
    capacity: '',
    desc: '',
    descOn: false,
    attendField: false,
    notice: '',
    banner: 'violet'
  });
  const session = sessions.find(s => s.id === selId) || sessions[0];
  const rs = session ? reservations.filter(r => r.sessionId === session.id) : [];
  const entered = rs.filter(r => r.status === 'entered');
  const unchecked = rs.filter(r => r.status === 'reserved');
  const cancelled = rs.filter(r => r.status === 'cancelled');
  const noShow = rs.filter(r => r.status === 'no_show');
  const activeRs = rs.filter(r => r.status !== 'cancelled' && r.status !== 'no_show');
  const occupancy = session ? Math.round(activeRs.length / session.capacity * 100) : 0;

  /* QR 현황 대시보드 — 해당 설명회 기준 재학생 전체 명단 + 비재원생 */
  const clsOf = id => classes.find(c => c.id === id);
  const studentRows = (students || []).map(st => {
    const r = reservations.find(x => x.sessionId === (session && session.id) && x.studentId === st.id);
    return {
      key: 'stu-' + st.id,
      name: st.name,
      school: st.school,
      grade: st.grade,
      className: st.className,
      phone: st.parentPhone,
      code: r ? r.code : null,
      status: r ? r.status : 'none',
      member: true,
      r,
      st,
      teacherId: clsOf(st.classId) ? clsOf(st.classId).teacherId : null,
      classId: st.classId
    };
  });
  const guestRows = rs.filter(r => !r.member).map(r => ({
    key: 'g-' + r.id,
    name: r.name,
    school: r.school,
    grade: r.grade,
    className: '비재원',
    phone: r.phone,
    code: r.code,
    status: r.status,
    member: false,
    r,
    st: null,
    teacherId: null,
    classId: null
  }));
  const matchCat = row => listFilter === '전체' ? row.status !== 'cancelled' : listFilter === '입장' ? row.status === 'entered' : listFilter === '미입장' ? row.status === 'reserved' : listFilter === '미예약' ? row.status === 'none' : listFilter === '노쇼' ? row.status === 'no_show' : listFilter === '취소' ? row.status === 'cancelled' : listFilter === '비재원생' ? row.member === false : true;
  const matchTC = row => {
    if (teacherFilter === 'all' && classFilter === 'all') return true;
    if (row.member === false) return false;
    if (teacherFilter !== 'all' && row.teacherId !== teacherFilter) return false;
    if (classFilter !== 'all' && row.classId !== classFilter) return false;
    return true;
  };
  const roster = [...studentRows, ...guestRows].filter(row => matchCat(row) && matchTC(row));
  const unreservedCount = studentRows.filter(r => r.status === 'none').length;
  const monTeacher = teachers.find(t => t.id === teacherFilter);
  const monRows = teacherFilter === 'all' ? [] : studentRows.filter(r => r.teacherId === teacherFilter);
  const monReserved = monRows.filter(r => r.r && r.r.status !== 'cancelled' && r.r.status !== 'no_show');
  const monEntered = monRows.filter(r => r.status === 'entered');
  const monUnres = monRows.filter(r => r.status === 'none');
  const surveyRs = (surveyResponses || []).filter(r => session && r.sessionId === session.id);
  const avgRating = surveyRs.length ? surveyRs.reduce((a, b) => a + b.rating, 0) / surveyRs.length : 0;
  const respRate = entered.length ? Math.round(surveyRs.length / entered.length * 100) : 0;
  const ratingDist = [5, 4, 3, 2, 1].map(n => ({
    n,
    c: surveyRs.filter(r => r.rating === n).length
  }));
  const flash = m => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };
  const submitCreate = () => {
    const s = addSession({
      title: form.title,
      date: form.date,
      round: form.round,
      time: '10:00',
      place: form.place,
      capacity: parseInt(form.capacity) || 50,
      desc: form.desc,
      attendField: form.attendField,
      notice: form.notice,
      banner: form.banner
    });
    setCreateOpen(false);
    setForm({
      title: '',
      date: '',
      round: '1회차',
      place: '',
      capacity: '',
      desc: '',
      descOn: false,
      attendField: false,
      notice: '',
      banner: 'violet'
    });
    setSelId(s.id);
    flash('설명회가 생성됐어요 — 모바일 예약 화면에 바로 노출됩니다');
  };
  const submitDelete = () => {
    deleteSession(session.id);
    setDelOpen(false);
    setSelId(sessions.find(s => s.id !== session.id)?.id);
    flash('설명회가 삭제됐어요');
  };
  const doCheckIn = r => {
    checkIn(r.id);
    flash(`${r.name} 님 입장 완료 — 입장 안내 문자를 발송했어요`);
  };
  const doInstantReserve = st => {
    addReservation({
      sessionId: session.id,
      studentId: st.id,
      name: st.name,
      school: st.school,
      grade: st.grade,
      phone: st.parentPhone,
      channel: 'manual',
      attendCount: 1,
      member: true
    });
    flash(`${st.name} 님을 즉석 예약 등록했어요`);
  };
  const doRollback = () => {
    rollbackEntry(rollbackTarget.id, rollbackReason);
    const n = rollbackTarget.name;
    setRollbackTarget(null);
    flash(`${n} 님의 입장을 취소했어요 — 미체크로 복귀했습니다`);
  };
  const doEnd = () => {
    const n = unchecked.length;
    endSession(session.id);
    setEndOpen(false);
    flash(`설명회를 종료했어요 — 미입장 ${n}명을 노쇼로 처리했습니다`);
  };
  const doSurvey = () => {
    addSmsLog({
      to: entered.length,
      template: '만족도 설문 요청',
      session: session.title,
      ok: entered.length,
      fail: 0
    });
    flash(`입장 완료 ${entered.length}명에게 설문 링크를 발송했어요`);
  };
  const doReminderNow = rm => {
    addSmsLog({
      to: unchecked.length,
      template: rm.template,
      session: session.title,
      ok: unchecked.length,
      fail: 0,
      auto: true
    });
    flash(`${rm.label}를 미체크 ${unchecked.length}명에게 발송했어요`);
  };
  const doConvert = () => {
    convertGuest(convertTarget, convertClass);
    const n = convertTarget.name;
    setConvertTarget(null);
    flash(`${n} 님을 재원생으로 전환했어요 — 등록 환영 문자를 발송했어요`);
  };
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uC124\uBA85\uD68C \uC6B4\uC601 \uB300\uC2DC\uBCF4\uB4DC"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      color: 'var(--text-accent)',
      marginBottom: 6
    }
  }, "QR OPERATIONS"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--text-h1)',
      fontWeight: 800
    }
  }, "\uC124\uBA85\uD68C \uC6B4\uC601")), /*#__PURE__*/React.createElement(Button, {
    icon: /*#__PURE__*/React.createElement(I.plus, {
      size: 16
    }),
    onClick: () => setCreateOpen(true)
  }, "\uC0C8 \uC124\uBA85\uD68C")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '300px 1fr',
      gap: 14,
      marginTop: 20,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, sessions.map((s, i) => {
    const srs = reservations.filter(r => r.sessionId === s.id && r.status !== 'cancelled');
    const sel = s.id === selId;
    return /*#__PURE__*/React.createElement("div", {
      key: s.id,
      onClick: () => setSelId(s.id),
      style: {
        padding: '16px 18px',
        borderRadius: 'var(--radius-lg)',
        cursor: 'pointer',
        background: sel ? 'var(--surface-brand-soft)' : 'var(--surface-card)',
        color: 'var(--text-body)',
        border: sel ? '1.5px solid var(--violet-800)' : '1px solid var(--border-hairline)',
        boxShadow: sel ? 'var(--shadow-accent-glow)' : 'var(--shadow-card)',
        transform: sel ? 'scale(1.02)' : 'scale(1)',
        transition: 'all var(--dur-base) var(--ease-spring)',
        animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${i * 70}ms both`
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 15,
        color: sel ? 'var(--text-brand)' : 'var(--text-strong)',
        lineHeight: 1.4
      }
    }, s.title), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        marginTop: 5,
        color: 'var(--text-muted)'
      }
    }, s.date, " \xB7 ", s.round, " \xB7 ", s.time), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 10
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: 5,
        borderRadius: 3,
        background: sel ? 'var(--violet-100)' : 'var(--gray-2)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        height: '100%',
        width: `${Math.min(100, srs.length / s.capacity * 100)}%`,
        background: sel ? 'var(--violet-700)' : 'var(--violet-600)',
        transition: 'width var(--dur-hero) var(--ease-smooth)'
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11.5,
        fontWeight: 700,
        fontFeatureSettings: '"tnum"',
        color: sel ? 'var(--text-brand)' : 'var(--text-muted)',
        whiteSpace: 'nowrap',
        flexShrink: 0
      }
    }, srs.length, "/", s.capacity)));
  })), session && /*#__PURE__*/React.createElement("div", {
    key: session.id,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      animation: 'ds-fade-up var(--dur-base) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "20px 24px",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 20,
      fontWeight: 800
    }
  }, session.title), session.attendField && /*#__PURE__*/React.createElement(Badge, {
    tone: "accent",
    size: "sm"
  }, "\uCC38\uC11D \uC778\uC6D0 \uC218\uC9D1"), session.ended && /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral",
    size: "sm"
  }, "\uC885\uB8CC\uB428")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)',
      marginTop: 5,
      display: 'flex',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      gap: 5,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(I.calendar, {
    size: 13
  }), " ", session.date, " ", session.time), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      gap: 5,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(I.mapPin, {
    size: 13
  }), " ", session.place), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      gap: 5,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(I.users, {
    size: 13
  }), " \uC815\uC6D0 ", session.capacity, "\uBA85")), session.desc && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-faint)',
      marginTop: 6
    }
  }, session.desc)), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '0 8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 30,
      color: occupancy >= 90 ? 'var(--status-danger)' : 'var(--violet-800)',
      fontFeatureSettings: '"tnum"',
      whiteSpace: 'nowrap'
    }
  }, occupancy, "%"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-faint)'
    }
  }, "\uC608\uC57D\uB960")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: 9
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: /*#__PURE__*/React.createElement(I.star, {
      size: 14
    }),
    onClick: doSurvey,
    disabled: entered.length === 0
  }, "\uC124\uBB38 \uBCF4\uB0B4\uAE30"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14
    }
  }, !session.ended && /*#__PURE__*/React.createElement("a", {
    onClick: () => setEndOpen(true),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--text-muted)',
      textDecoration: 'underline',
      textUnderlineOffset: 3,
      cursor: 'pointer',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement(I.check, {
    size: 12
  }), " \uC124\uBA85\uD68C \uC885\uB8CC"), /*#__PURE__*/React.createElement("a", {
    onClick: () => setDelOpen(true),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--status-danger)',
      textDecoration: 'underline',
      textUnderlineOffset: 3,
      cursor: 'pointer',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement(I.trash, {
    size: 12
  }), " \uC0AD\uC81C")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "\uCD1D \uC608\uC57D",
    value: activeRs.length,
    suffix: `/ ${session.capacity}`,
    tone: "brand",
    icon: /*#__PURE__*/React.createElement(I.ticket, {
      size: 15
    }),
    delay: 0
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "\uC785\uC7A5 \uC644\uB8CC",
    value: entered.length,
    suffix: "\uBA85",
    tone: "success",
    icon: /*#__PURE__*/React.createElement(I.check, {
      size: 15
    }),
    delay: 50
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "\uBBF8\uCCB4\uD06C",
    value: unchecked.length,
    suffix: "\uBA85",
    tone: "accent",
    icon: /*#__PURE__*/React.createElement(I.clock, {
      size: 15
    }),
    delay: 100
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "\uB178\uC1FC",
    value: noShow.length,
    suffix: "\uBA85",
    tone: "neutral",
    icon: /*#__PURE__*/React.createElement(I.alertTriangle, {
      size: 15
    }),
    delay: 150
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "\uCDE8\uC18C",
    value: cancelled.length,
    suffix: "\uAC74",
    tone: "danger",
    icon: /*#__PURE__*/React.createElement(I.x, {
      size: 15
    }),
    delay: 200
  })), monTeacher && /*#__PURE__*/React.createElement(Card, {
    variant: "brand",
    padding: "16px 22px",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 24,
      animation: 'ds-pop var(--dur-slow) var(--ease-spring) both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      height: 40,
      borderRadius: '50%',
      background: 'rgba(56,189,248,0.18)',
      color: 'var(--mint-400)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 15
    }
  }, monTeacher.name[0]), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 800,
      fontFamily: 'var(--font-display)',
      fontSize: 15.5
    }
  }, monTeacher.name, " \uAC15\uC0AC \uB2F4\uB2F9 \xB7 \uC774 \uC124\uBA85\uD68C"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      opacity: 0.75
    }
  }, classes.filter(c => c.teacherId === teacherFilter).map(c => c.name).join(' · ')))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 22,
      marginLeft: 'auto',
      fontFeatureSettings: '"tnum"'
    }
  }, [['담당 학생', monRows.length], ['예약', monReserved.length], ['입장 완료', monEntered.length], ['미예약', monUnres.length]].map(([k, v], i) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      opacity: 0.7
    }
  }, k), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 21,
      color: i === 2 ? 'var(--mint-400)' : 'var(--gray-0)'
    }
  }, v))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "18px 20px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement(I.bell, {
    size: 15,
    style: {
      color: 'var(--violet-800)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, "\uB9AC\uB9C8\uC778\uB4DC \uC2A4\uCF00\uC904")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-faint)',
      marginBottom: 12
    }
  }, "\uC124\uC815\uD55C \uC2DC\uAC01\uC5D0 \uBBF8\uCCB4\uD06C \uC608\uC57D\uC790\uC5D0\uAC8C \uC790\uB3D9 \uBC1C\uC1A1\uB3FC\uC694."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, (session.reminders || []).map(rm => /*#__PURE__*/React.createElement("div", {
    key: rm.id,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 12px',
      borderRadius: 'var(--radius-md)',
      background: rm.enabled ? 'var(--surface-brand-soft)' : 'var(--surface-sunken)',
      border: '1px solid var(--border-hairline)'
    }
  }, /*#__PURE__*/React.createElement(Switch, {
    checked: rm.enabled,
    onChange: () => toggleReminder(session.id, rm.id)
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, rm.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-muted)',
      fontFeatureSettings: '"tnum"'
    }
  }, rm.time, " \xB7 ", rm.template)), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    icon: /*#__PURE__*/React.createElement(I.send, {
      size: 12
    }),
    onClick: () => doReminderNow(rm),
    disabled: unchecked.length === 0
  }, "\uC9C0\uAE08"))))), /*#__PURE__*/React.createElement(Card, {
    padding: "18px 20px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement(I.star, {
    size: 15,
    style: {
      color: 'var(--mint-600)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, "\uB9CC\uC871\uB3C4 \uC124\uBB38"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--text-faint)',
      fontFeatureSettings: '"tnum"'
    }
  }, "\uC751\uB2F5\uB960 ", respRate, "%")), surveyRs.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 0',
      textAlign: 'center',
      color: 'var(--text-faint)',
      fontSize: 13
    }
  }, "\uC544\uC9C1 \uC751\uB2F5\uC774 \uC5C6\uC5B4\uC694.", /*#__PURE__*/React.createElement("br", null), "\uC885\uB8CC \uD6C4 \uC124\uBB38\uC744 \uBCF4\uB0B4\uBCF4\uC138\uC694.") : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 34,
      color: 'var(--mint-600)',
      fontFeatureSettings: '"tnum"',
      lineHeight: 1
    }
  }, avgRating.toFixed(1)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 1,
      marginTop: 5,
      justifyContent: 'center'
    }
  }, [1, 2, 3, 4, 5].map(n => /*#__PURE__*/React.createElement(I.star, {
    key: n,
    size: 11,
    style: {
      color: n <= Math.round(avgRating) ? 'var(--mint-500)' : 'var(--gray-3)',
      fill: n <= Math.round(avgRating) ? 'var(--mint-500)' : 'none'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--text-faint)',
      marginTop: 4
    }
  }, "\uC751\uB2F5 ", surveyRs.length, "\uAC74")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, ratingDist.map(d => /*#__PURE__*/React.createElement("div", {
    key: d.n,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-faint)',
      width: 20,
      fontFeatureSettings: '"tnum"'
    }
  }, d.n, "\uC810"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      background: 'var(--gray-2)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      height: '100%',
      width: `${surveyRs.length ? d.c / surveyRs.length * 100 : 0}%`,
      background: 'var(--mint-500)',
      transition: 'width var(--dur-hero) var(--ease-smooth)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-muted)',
      width: 14,
      textAlign: 'right',
      fontFeatureSettings: '"tnum"'
    }
  }, d.c))))))), /*#__PURE__*/React.createElement(Card, {
    padding: "0",
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '13px 20px',
      borderBottom: '1px solid var(--border-hairline)',
      display: 'flex',
      flexDirection: 'column',
      gap: 11
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, "\uC124\uBA85\uD68C \uBA85\uB2E8"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-faint)',
      fontFeatureSettings: '"tnum"'
    }
  }, roster.length, "\uBA85 \xB7 \uBBF8\uC608\uC57D ", unreservedCount), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Select, {
    options: [{
      label: '강사 전체',
      value: 'all'
    }].concat(teachers.map(t => ({
      label: t.name + ' 강사',
      value: t.id
    }))),
    value: teacherFilter,
    onChange: setTeacherFilter,
    style: {
      width: 128
    }
  }), /*#__PURE__*/React.createElement(Select, {
    options: [{
      label: '반 전체',
      value: 'all'
    }].concat(classes.map(c => ({
      label: c.name,
      value: c.id
    }))),
    value: classFilter,
    onChange: setClassFilter,
    style: {
      width: 118
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    icon: /*#__PURE__*/React.createElement(I.printer, {
      size: 13
    }),
    onClick: () => setPrintMode(true)
  }, "\uBA85\uB2E8 \uC778\uC1C4")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap'
    }
  }, ['전체', '입장', '미입장', '미예약', '노쇼', '비재원생', '취소'].map(f => /*#__PURE__*/React.createElement(Tag, {
    key: f,
    selected: listFilter === f,
    onClick: () => setListFilter(f),
    style: {
      height: 30
    }
  }, f)))), roster.map((row, i) => /*#__PURE__*/React.createElement("div", {
    key: row.key,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '13px 20px',
      borderTop: i > 0 ? '1px solid var(--border-hairline)' : 'none',
      animation: `ds-fade-up var(--dur-base) var(--ease-out) ${Math.min(i, 12) * 22}ms both`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 160
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 13.5,
      color: 'var(--text-strong)',
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, row.name, " ", !row.member && /*#__PURE__*/React.createElement(Badge, {
    tone: "accent",
    size: "sm"
  }, "\uBE44\uC7AC\uC6D0"), " ", row.r && row.r.groupId && /*#__PURE__*/React.createElement(Badge, {
    tone: "info",
    size: "sm"
  }, "\uD615\uC81C")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-faint)'
    }
  }, row.school, " \xB7 ", row.grade)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      width: 84
    }
  }, row.className), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      fontFeatureSettings: '"tnum"',
      width: 118
    }
  }, row.phone), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--text-faint)',
      fontFeatureSettings: '"tnum"',
      width: 122
    }
  }, row.code || '—'), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), row.status === 'none' ? /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral",
    size: "sm"
  }, "\uBBF8\uC608\uC57D") : /*#__PURE__*/React.createElement(ResStatusBadge, {
    status: row.status,
    size: "sm"
  }), row.status === 'none' && /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: /*#__PURE__*/React.createElement(I.plus, {
      size: 13
    }),
    onClick: () => doInstantReserve(row.st)
  }, "\uC989\uC11D \uC608\uC57D"), row.status === 'reserved' && /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: /*#__PURE__*/React.createElement(I.logIn, {
      size: 13
    }),
    onClick: () => doCheckIn(row.r)
  }, "\uC218\uB3D9 \uCCB4\uD06C\uC778"), row.status === 'entered' && /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    icon: /*#__PURE__*/React.createElement(I.rotateCcw, {
      size: 13
    }),
    onClick: () => {
      setRollbackReason('QR 오스캔');
      setRollbackTarget(row.r);
    },
    style: {
      color: 'var(--text-muted)'
    }
  }, "\uC785\uC7A5 \uCDE8\uC18C"), !row.member && row.status !== 'cancelled' && /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    icon: /*#__PURE__*/React.createElement(I.userCheck, {
      size: 13
    }),
    onClick: () => {
      setConvertClass(classes[0].id);
      setConvertTarget(row.r);
    },
    style: {
      color: 'var(--text-accent)'
    }
  }, "\uC804\uD658"))), roster.length === 0 && /*#__PURE__*/React.createElement(EmptyState, null, "\uD574\uB2F9 \uC870\uAC74\uC758 \uBA85\uB2E8\uC774 \uC5C6\uC5B4\uC694.")))), /*#__PURE__*/React.createElement(Dialog, {
    open: createOpen,
    onClose: () => setCreateOpen(false),
    title: "\uC0C8 \uC124\uBA85\uD68C \uB9CC\uB4E4\uAE30",
    width: 520,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => setCreateOpen(false)
    }, "\uCDE8\uC18C"), /*#__PURE__*/React.createElement(Button, {
      disabled: !form.title || !form.date || !form.place,
      onClick: submitCreate,
      icon: /*#__PURE__*/React.createElement(I.check, {
        size: 15
      })
    }, "\uC0DD\uC131\uD558\uAE30"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "\uC124\uBA85\uD68C\uBA85",
    placeholder: "2027 \uB300\uBE44 \uACE0\uB4F1 \uC785\uC2DC\uC804\uB7B5 \uC124\uBA85\uD68C",
    value: form.title,
    onChange: v => setForm({
      ...form,
      title: v
    })
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.2fr 0.8fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "\uB0A0\uC9DC",
    placeholder: "8\uC6D4 15\uC77C (\uD1A0)",
    value: form.date,
    onChange: v => setForm({
      ...form,
      date: v
    })
  }), /*#__PURE__*/React.createElement(Input, {
    label: "\uD68C\uCC28",
    placeholder: "1\uD68C\uCC28",
    value: form.round,
    onChange: v => setForm({
      ...form,
      round: v
    })
  }), /*#__PURE__*/React.createElement(Input, {
    label: "\uC815\uC6D0",
    placeholder: "100",
    value: form.capacity,
    onChange: v => setForm({
      ...form,
      capacity: v
    })
  })), /*#__PURE__*/React.createElement(Input, {
    label: "\uC7A5\uC18C",
    placeholder: "npr \uBCF8\uAD00 5\uCE35 \uC138\uBBF8\uB098\uD640",
    value: form.place,
    onChange: v => setForm({
      ...form,
      place: v
    })
  }), /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--text-strong)'
    }
  }, "\uC124\uBA85 ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-faint)',
      fontWeight: 500
    }
  }, "(\uC120\uD0DD)")), /*#__PURE__*/React.createElement("textarea", {
    value: form.desc,
    onChange: e => setForm({
      ...form,
      desc: e.target.value
    }),
    rows: 3,
    placeholder: "\uC124\uBA85\uD68C \uC18C\uAC1C\uB97C \uC785\uB825\uD558\uC138\uC694",
    style: {
      width: '100%',
      padding: '12px 16px',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-soft)',
      background: 'var(--surface-card)',
      fontFamily: 'var(--font-body)',
      fontSize: 14,
      lineHeight: 1.6,
      color: 'var(--text-strong)',
      resize: 'vertical',
      outline: 'none',
      boxSizing: 'border-box'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      padding: '14px 16px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-sunken)'
    }
  }, /*#__PURE__*/React.createElement(Switch, {
    label: "\uCC38\uC11D \uC778\uC6D0 \uD544\uB4DC",
    checked: form.attendField,
    onChange: v => setForm({
      ...form,
      attendField: v
    })
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--text-faint)',
      paddingLeft: 56
    }
  }, "\uC608\uC57D \uD654\uBA74\uC5D0\uC11C \uCC38\uC11D \uC778\uC6D0\uC744 \uC120\uD0DD\uBC1B\uC2B5\uB2C8\uB2E4.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      padding: '16px',
      borderRadius: 'var(--radius-md)',
      border: '1px dashed var(--border-soft)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(I.image, {
    size: 15,
    style: {
      color: 'var(--violet-800)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13.5,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, "\uD398\uC774\uC9C0 \uAFB8\uBBF8\uAE30 ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-faint)',
      fontWeight: 500
    }
  }, "(\uBAA8\uBC14\uC77C \uC608\uC57D \uD654\uBA74)"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--text-muted)'
    }
  }, "\uBC30\uB108 \uD14C\uB9C8"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, [['violet', '네이비', 'var(--violet-900)'], ['mint', '스카이', 'var(--mint-500)'], ['slate', '슬레이트', 'var(--violet-950)']].map(([k, lbl, col]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setForm({
      ...form,
      banner: k
    }),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      padding: '7px 12px',
      borderRadius: 'var(--radius-pill)',
      border: form.banner === k ? '1.5px solid var(--violet-800)' : '1px solid var(--border-soft)',
      background: form.banner === k ? 'var(--surface-brand-soft)' : 'var(--surface-card)',
      cursor: 'pointer',
      fontFamily: 'var(--font-body)',
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--text-body)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 14,
      borderRadius: '50%',
      background: col
    }
  }), lbl)))), /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--text-muted)'
    }
  }, "\uC548\uB0B4\uBB38"), /*#__PURE__*/React.createElement("textarea", {
    value: form.notice,
    onChange: e => setForm({
      ...form,
      notice: e.target.value
    }),
    rows: 2,
    placeholder: "\uC608: \uC8FC\uCC28\uB294 \uBCF8\uAD00 \uC9C0\uD558\uB97C \uC774\uC6A9\uD574 \uC8FC\uC138\uC694. \uC790\uB8CC\uC9D1\uC740 \uD604\uC7A5\uC5D0\uC11C \uBC30\uBD80\uD569\uB2C8\uB2E4.",
    style: {
      width: '100%',
      padding: '11px 14px',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-soft)',
      background: 'var(--surface-card)',
      fontFamily: 'var(--font-body)',
      fontSize: 13.5,
      lineHeight: 1.55,
      color: 'var(--text-strong)',
      resize: 'vertical',
      outline: 'none',
      boxSizing: 'border-box'
    }
  }))))), /*#__PURE__*/React.createElement(Dialog, {
    open: delOpen,
    onClose: () => setDelOpen(false),
    title: "\uC124\uBA85\uD68C\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694?",
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => setDelOpen(false)
    }, "\uB3CC\uC544\uAC00\uAE30"), /*#__PURE__*/React.createElement(Button, {
      variant: "danger",
      onClick: submitDelete,
      icon: /*#__PURE__*/React.createElement(I.trash, {
        size: 14
      })
    }, "\uC0AD\uC81C"))
  }, session && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", null, session.title), "\uACFC \uC608\uC57D ", activeRs.length, "\uAC74\uC774 \uD568\uAED8 \uC0AD\uC81C\uB429\uB2C8\uB2E4. \uC608\uC57D\uC790\uC5D0\uAC8C \uCDE8\uC18C \uC548\uB0B4 \uBB38\uC790\uAC00 \uBC1C\uC1A1\uB3FC\uC694.")), /*#__PURE__*/React.createElement(Dialog, {
    open: endOpen,
    onClose: () => setEndOpen(false),
    title: "\uC124\uBA85\uD68C\uB97C \uC885\uB8CC\uD560\uAE4C\uC694?",
    width: 440,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => setEndOpen(false)
    }, "\uB3CC\uC544\uAC00\uAE30"), /*#__PURE__*/React.createElement(Button, {
      onClick: doEnd,
      icon: /*#__PURE__*/React.createElement(I.check, {
        size: 15
      })
    }, "\uC885\uB8CC \uCC98\uB9AC"))
  }, session && /*#__PURE__*/React.createElement("span", {
    style: {
      lineHeight: 1.55
    }
  }, /*#__PURE__*/React.createElement("b", null, session.title), "\uC744 \uC885\uB8CC\uD569\uB2C8\uB2E4. \uC544\uC9C1 ", /*#__PURE__*/React.createElement("b", null, "\uBBF8\uCCB4\uD06C\uC778 ", unchecked.length, "\uBA85"), "\uC740 ", /*#__PURE__*/React.createElement("b", null, "\uB178\uC1FC"), "\uB85C \uC790\uB3D9 \uCC98\uB9AC\uB418\uACE0, \uC7AC\uC6D0\uC0DD \uB178\uC1FC \uD68C\uC218\uC5D0 \uB204\uC801\uB3FC\uC694.")), /*#__PURE__*/React.createElement(Dialog, {
    open: !!rollbackTarget,
    onClose: () => setRollbackTarget(null),
    title: "\uC785\uC7A5\uC744 \uCDE8\uC18C\uD560\uAE4C\uC694?",
    width: 440,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => setRollbackTarget(null)
    }, "\uB3CC\uC544\uAC00\uAE30"), /*#__PURE__*/React.createElement(Button, {
      variant: "danger",
      onClick: doRollback,
      icon: /*#__PURE__*/React.createElement(I.rotateCcw, {
        size: 14
      })
    }, "\uC785\uC7A5 \uCDE8\uC18C"))
  }, rollbackTarget && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13.5,
      color: 'var(--text-muted)',
      lineHeight: 1.55
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-strong)'
    }
  }, rollbackTarget.name), " \uB2D8\uC744 ", /*#__PURE__*/React.createElement("b", null, "\uC785\uC7A5 \uC644\uB8CC \u2192 \uBBF8\uCCB4\uD06C"), "\uB85C \uB418\uB3CC\uB9BD\uB2C8\uB2E4. \uCC98\uB9AC \uC774\uB825\uC740 \uAC10\uC0AC \uB85C\uADF8\uC5D0 \uAE30\uB85D\uB3FC\uC694."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, "\uCDE8\uC18C \uC0AC\uC720"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, ['QR 오스캔', '중복 쳋크인', '본인 미참석', '기타'].map(rz => /*#__PURE__*/React.createElement(Tag, {
    key: rz,
    selected: rollbackReason === rz,
    onClick: () => setRollbackReason(rz),
    style: {
      height: 32
    }
  }, rz)))))), /*#__PURE__*/React.createElement(Dialog, {
    open: !!convertTarget,
    onClose: () => setConvertTarget(null),
    title: "\uC7AC\uC6D0\uC0DD\uC73C\uB85C \uC804\uD658",
    width: 460,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => setConvertTarget(null)
    }, "\uCDE8\uC18C"), /*#__PURE__*/React.createElement(Button, {
      onClick: doConvert,
      icon: /*#__PURE__*/React.createElement(I.userCheck, {
        size: 15
      })
    }, "\uC804\uD658\uD558\uAE30"))
  }, convertTarget && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)',
      lineHeight: 1.55
    }
  }, "\uC124\uBA85\uD68C \uCC38\uC11D\uC790 ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-strong)'
    }
  }, convertTarget.name), " \uB2D8\uC744 \uC7AC\uC6D0\uC0DD \uBA85\uB2E8\uC5D0 \uB4F1\uB85D\uD574\uC694. \uBC18\uC744 \uBC30\uC815\uD558\uBA74 \uC774 \uC608\uC57D\uC774 \uC7AC\uC6D0\uC0DD \uC608\uC57D\uC73C\uB85C \uC5F0\uACB0\uB3FC\uC694."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      padding: '14px 16px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-sunken)'
    }
  }, /*#__PURE__*/React.createElement(KV, {
    k: "\uC774\uB984",
    v: convertTarget.name
  }), /*#__PURE__*/React.createElement(KV, {
    k: "\uC5F0\uB77D\uCC98",
    v: convertTarget.phone
  }), /*#__PURE__*/React.createElement(KV, {
    k: "\uD559\uAD50",
    v: convertTarget.school || '—'
  }), /*#__PURE__*/React.createElement(KV, {
    k: "\uD559\uB144",
    v: convertTarget.grade || '—'
  })), /*#__PURE__*/React.createElement(Select, {
    label: "\uBC30\uC815\uD560 \uBC18",
    options: classes.map(c => ({
      label: c.name,
      value: c.id
    })),
    value: convertClass,
    onChange: setConvertClass
  }))), printMode && session && /*#__PURE__*/React.createElement("div", {
    className: "npr-print-wrap",
    style: {
      position: 'fixed',
      inset: 0,
      background: 'var(--gray-2)',
      zIndex: 200,
      overflow: 'auto',
      padding: '30px 20px'
    }
  }, /*#__PURE__*/React.createElement("style", null, `@media print { body * { visibility: hidden !important; } #npr-print-roster, #npr-print-roster * { visibility: visible !important; } #npr-print-roster { position: absolute !important; left: 0; top: 0; width: 100% !important; box-shadow: none !important; border-radius: 0 !important; } .npr-print-toolbar { display: none !important; } .npr-print-wrap { background: #fff !important; padding: 0 !important; } @page { size: A4; margin: 14mm; } }`), /*#__PURE__*/React.createElement("div", {
    className: "npr-print-toolbar",
    style: {
      maxWidth: 794,
      margin: '0 auto 16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, "\uC778\uC1C4 \uBBF8\uB9AC\uBCF4\uAE30 \xB7 A4 \xB7 \uCD1D ", rs.filter(r => r.status !== 'cancelled').length, "\uBA85"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    onClick: () => setPrintMode(false)
  }, "\uB2EB\uAE30"), /*#__PURE__*/React.createElement(Button, {
    icon: /*#__PURE__*/React.createElement(I.printer, {
      size: 15
    }),
    onClick: () => window.print()
  }, "\uC778\uC1C4\uD558\uAE30"))), /*#__PURE__*/React.createElement("div", {
    id: "npr-print-roster",
    style: {
      maxWidth: 794,
      margin: '0 auto',
      background: '#fff',
      boxShadow: 'var(--shadow-float)',
      padding: '38px 40px',
      color: '#111827',
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      borderBottom: '2px solid #111827',
      paddingBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      letterSpacing: '0.12em',
      fontWeight: 700,
      color: '#6B7280'
    }
  }, "NPR \uC785\uC2DC\uC124\uBA85\uD68C \xB7 \uCC38\uC11D\uC790 \uBA85\uB2E8"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 22,
      marginTop: 6
    }
  }, session.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#4B5563',
      marginTop: 6
    }
  }, session.date, " ", session.time, " \xB7 ", session.round, " \xB7 ", session.place, " \xB7 \uC815\uC6D0 ", session.capacity, "\uBA85")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right',
      fontSize: 12,
      color: '#6B7280'
    }
  }, /*#__PURE__*/React.createElement("div", null, "\uCD1D ", rs.filter(r => r.status !== 'cancelled').length, "\uBA85"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, "\uC778\uC1C4\uC77C 2026-07-15"))), /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      marginTop: 16,
      fontSize: 12.5
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: '#F3F4F6'
    }
  }, ['No', '이름', '학교', '학년', '연락처', '예약번호', '체크', '서명'].map((h, i) => /*#__PURE__*/React.createElement("th", {
    key: h,
    style: {
      textAlign: i > 5 ? 'center' : 'left',
      padding: '9px 10px',
      borderBottom: '1px solid #D1D5DB',
      fontWeight: 700,
      color: '#374151',
      width: i === 6 ? 44 : i === 7 ? 110 : 'auto'
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, rs.filter(r => r.status !== 'cancelled').map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r.id
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '9px 10px',
      borderBottom: '1px solid #E5E7EB',
      color: '#6B7280',
      fontVariantNumeric: 'tabular-nums'
    }
  }, i + 1), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '9px 10px',
      borderBottom: '1px solid #E5E7EB',
      fontWeight: 700
    }
  }, r.name, !r.member && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      color: '#9CA3AF',
      marginLeft: 5
    }
  }, "\uBE44\uC7AC\uC6D0")), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '9px 10px',
      borderBottom: '1px solid #E5E7EB'
    }
  }, r.school), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '9px 10px',
      borderBottom: '1px solid #E5E7EB'
    }
  }, r.grade), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '9px 10px',
      borderBottom: '1px solid #E5E7EB',
      fontVariantNumeric: 'tabular-nums'
    }
  }, r.phone), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '9px 10px',
      borderBottom: '1px solid #E5E7EB',
      fontVariantNumeric: 'tabular-nums',
      color: '#6B7280'
    }
  }, r.code), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '9px 10px',
      borderBottom: '1px solid #E5E7EB',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      width: 16,
      height: 16,
      border: '1.5px solid #9CA3AF',
      borderRadius: 3
    }
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '9px 10px',
      borderBottom: '1px solid #E5E7EB'
    }
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      fontSize: 11.5,
      color: '#9CA3AF',
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\xB7 \uC785\uC7A5 \uC2DC \uCCB4\uD06C\uB780\uC5D0 \uD45C\uC2DC\uD558\uACE0 \uC11C\uBA85\uC744 \uBC1B\uC544 \uC8FC\uC138\uC694."), /*#__PURE__*/React.createElement("span", null, "npr \uC785\uC2DC\uC124\uBA85\uD68C \uC6B4\uC601\uD300")))), toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: 26,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 120
    }
  }, /*#__PURE__*/React.createElement(Toast, {
    tone: "success"
  }, toast)));
}
window.SessionsScreen = SessionsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/SessionsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/SmsScreen.jsx
try { (() => {
/* 문자 발송 — 템플릿 + 실기기 프리뷰 + 발송 로그 */
function SmsScreen({
  store
}) {
  const {
    Button,
    Input,
    Select,
    Tag,
    Card,
    Badge,
    Toast
  } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const {
    sessions,
    reservations,
    smsTemplates,
    smsLogs,
    saveTemplate,
    addTemplate,
    addSmsLog
  } = store;
  const [tplId, setTplId] = React.useState(smsTemplates[0]?.id);
  const [body, setBody] = React.useState(smsTemplates[0]?.body || '');
  const [sessionId, setSessionId] = React.useState(sessions[0]?.id);
  const [group, setGroup] = React.useState('예약자 전체');
  const [toast, setToast] = React.useState(null);
  const [sending, setSending] = React.useState(false);
  const session = sessions.find(s => s.id === sessionId);
  const rs = reservations.filter(r => r.sessionId === sessionId);
  const targets = {
    '예약자 전체': rs.filter(r => r.status !== 'cancelled'),
    '미체크만': rs.filter(r => r.status === 'reserved'),
    '입장 완료': rs.filter(r => r.status === 'entered'),
    '취소자': rs.filter(r => r.status === 'cancelled')
  };
  const targetCount = targets[group].length;
  const pickTpl = t => {
    setTplId(t.id);
    setBody(t.body);
  };
  const vars = ['{학생명}', '{설명회명}', '{일시}', '{장소}', '{QR링크}'];
  const rendered = body.replaceAll('{학생명}', '김수민').replaceAll('{설명회명}', session ? session.title : '').replaceAll('{일시}', session ? `${session.date} ${session.time}` : '').replaceAll('{장소}', session ? session.place : '').replaceAll('{QR링크}', 'npr.kr/q/x8Fk2');
  const bytes = new Blob([body]).size;
  const flash = m => {
    setToast(m);
    setTimeout(() => setToast(null), 3200);
  };
  const doSave = () => {
    saveTemplate(tplId, body);
    flash('템플릿이 저장됐어요');
  };
  const doNew = () => {
    const t = addTemplate('새 템플릿 ' + (smsTemplates.length + 1), body || '[npr] ');
    setTplId(t.id);
    setBody(t.body);
    flash('새 템플릿을 만들었어요');
  };
  const doSend = () => {
    setSending(true);
    setTimeout(() => {
      setSending(false);
      addSmsLog({
        to: targetCount,
        template: (smsTemplates.find(t => t.id === tplId) || {}).name || '직접 작성',
        session: session.title,
        ok: targetCount,
        fail: 0
      });
      flash(`${targetCount}명에게 문자를 발송했어요`);
    }, 900);
  };
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uBB38\uC790 \uBC1C\uC1A1"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      color: 'var(--text-accent)',
      marginBottom: 6
    }
  }, "SMS"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--text-h1)',
      fontWeight: 800
    }
  }, "\uBB38\uC790 \uBC1C\uC1A1")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '230px 1fr 300px',
      gap: 14,
      marginTop: 20,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "14px",
    style: {
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 60ms both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '2px 6px 10px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: 'var(--text-strong)',
      fontFamily: 'var(--font-display)'
    }
  }, "\uD15C\uD50C\uB9BF"), /*#__PURE__*/React.createElement("button", {
    onClick: doNew,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: 'none',
      border: 'none',
      color: 'var(--violet-800)',
      fontSize: 12,
      fontWeight: 700,
      cursor: 'pointer',
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement(I.plus, {
    size: 13
  }), " \uC0DD\uC131")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, smsTemplates.map(t => /*#__PURE__*/React.createElement("div", {
    key: t.id,
    onClick: () => pickTpl(t),
    style: {
      padding: '11px 12px',
      borderRadius: 'var(--radius-sm)',
      cursor: 'pointer',
      background: tplId === t.id ? 'var(--surface-brand-soft)' : 'transparent',
      border: tplId === t.id ? '1.5px solid var(--violet-800)' : '1px solid var(--border-hairline)',
      transition: 'all var(--dur-fast) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, t.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-faint)',
      marginTop: 3,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, t.body.split('\n')[0])))), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    fullWidth: true,
    icon: /*#__PURE__*/React.createElement(I.save, {
      size: 14
    }),
    onClick: doSave,
    style: {
      marginTop: 12
    }
  }, "\uD604\uC7AC \uB0B4\uC6A9 \uC800\uC7A5")), /*#__PURE__*/React.createElement(Card, {
    padding: "20px",
    style: {
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 120ms both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Select, {
    options: sessions.map(s => ({
      label: s.title,
      value: s.id
    })),
    value: sessionId,
    onChange: setSessionId,
    style: {
      flex: 1,
      minWidth: 220
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, Object.keys(targets).map(g => /*#__PURE__*/React.createElement(Tag, {
    key: g,
    selected: group === g,
    onClick: () => setGroup(g),
    count: targets[g].length,
    style: {
      height: 32
    }
  }, g)))), /*#__PURE__*/React.createElement("textarea", {
    value: body,
    onChange: e => setBody(e.target.value),
    rows: 9,
    style: {
      width: '100%',
      marginTop: 14,
      padding: '14px 16px',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-soft)',
      background: 'var(--surface-card)',
      fontFamily: 'var(--font-body)',
      fontSize: 14,
      lineHeight: 1.65,
      color: 'var(--text-strong)',
      resize: 'vertical',
      outline: 'none',
      boxSizing: 'border-box'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-faint)',
      marginRight: 2
    }
  }, "\uBCC0\uC218"), vars.map(v => /*#__PURE__*/React.createElement("button", {
    key: v,
    onClick: () => setBody(body + v),
    style: {
      padding: '4px 10px',
      borderRadius: 'var(--radius-pill)',
      border: '1px dashed var(--mint-500)',
      background: 'var(--mint-50)',
      color: 'var(--mint-700)',
      fontSize: 12,
      fontWeight: 700,
      cursor: 'pointer',
      fontFamily: 'var(--font-body)'
    }
  }, v)), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontSize: 12,
      color: bytes > 90 ? 'var(--status-warning)' : 'var(--text-faint)',
      fontFeatureSettings: '"tnum"'
    }
  }, bytes, " byte \xB7 ", bytes > 90 ? 'LMS' : 'SMS')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 16,
      paddingTop: 16,
      borderTop: '1px solid var(--border-hairline)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, "\uC218\uC2E0 \uB300\uC0C1 ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-strong)',
      fontFeatureSettings: '"tnum"'
    }
  }, targetCount, "\uBA85"), " \xB7 ", group), /*#__PURE__*/React.createElement(Button, {
    disabled: targetCount === 0 || sending || !body.trim(),
    onClick: doSend,
    icon: /*#__PURE__*/React.createElement(I.send, {
      size: 15
    })
  }, sending ? '발송 중…' : '문자 발송'))), /*#__PURE__*/React.createElement("div", {
    style: {
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 180ms both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 280,
      margin: '0 auto',
      borderRadius: 38,
      background: 'var(--violet-950)',
      padding: 10,
      boxShadow: 'var(--shadow-float)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 30,
      background: '#EEF1F5',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 30,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 78,
      height: 18,
      borderRadius: 12,
      background: 'var(--violet-950)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 14px 6px',
      textAlign: 'center',
      borderBottom: '1px solid rgba(15,23,42,0.07)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: '50%',
      background: 'var(--violet-900)',
      color: 'var(--mint-400)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 12
    }
  }, "npr"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--text-strong)',
      marginTop: 4
    }
  }, "npr \uC785\uC2DC\uC124\uBA85\uD68C")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 12px 18px',
      minHeight: 260
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--text-faint)',
      textAlign: 'center',
      marginBottom: 10
    }
  }, "\uC624\uB298 \uC624\uD6C4 2:14"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 200,
      padding: '10px 12px',
      borderRadius: '4px 16px 16px 16px',
      background: '#FFFFFF',
      border: '1px solid rgba(15,23,42,0.08)',
      fontSize: 12,
      lineHeight: 1.6,
      color: 'var(--text-strong)',
      whiteSpace: 'pre-wrap',
      animation: 'ds-pop var(--dur-base) var(--ease-spring) both'
    },
    key: rendered
  }, rendered || '내용을 입력하세요'))))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      fontSize: 11.5,
      color: 'var(--text-faint)',
      marginTop: 8
    }
  }, "\uC218\uC2E0 \uD654\uBA74 \uBBF8\uB9AC\uBCF4\uAE30 \u2014 \uBCC0\uC218\uB294 \uC608\uC2DC \uAC12\uC73C\uB85C \uD45C\uC2DC"))), /*#__PURE__*/React.createElement(Card, {
    padding: "0",
    style: {
      marginTop: 14,
      overflow: 'hidden',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 240ms both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '13px 20px',
      borderBottom: '1px solid var(--border-hairline)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, "\uBC1C\uC1A1 \uB85C\uADF8"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-faint)'
    }
  }, "\uCD5C\uADFC 30\uC77C"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Badge, {
    tone: "success",
    size: "sm"
  }, "\uC131\uACF5\uB960 99.1%")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1.6fr 2fr 0.8fr 0.8fr 0.8fr',
      padding: '10px 20px',
      background: 'var(--surface-sunken)',
      fontSize: 11.5,
      fontWeight: 700,
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\uBC1C\uC1A1 \uC2DC\uAC01"), /*#__PURE__*/React.createElement("span", null, "\uD15C\uD50C\uB9BF"), /*#__PURE__*/React.createElement("span", null, "\uC124\uBA85\uD68C"), /*#__PURE__*/React.createElement("span", null, "\uC218\uC2E0"), /*#__PURE__*/React.createElement("span", null, "\uC131\uACF5"), /*#__PURE__*/React.createElement("span", null, "\uC2E4\uD328")), smsLogs.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: l.id,
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1.6fr 2fr 0.8fr 0.8fr 0.8fr',
      padding: '11px 20px',
      borderTop: '1px solid var(--border-hairline)',
      fontSize: 13,
      color: 'var(--text-body)',
      fontFeatureSettings: '"tnum"',
      animation: `ds-fade-up var(--dur-base) var(--ease-out) ${i * 50}ms both`
    }
  }, /*#__PURE__*/React.createElement("span", null, l.when), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      color: 'var(--text-strong)',
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, l.template, l.auto && /*#__PURE__*/React.createElement(Badge, {
    tone: "info",
    size: "sm"
  }, "\uC790\uB3D9")), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)'
    }
  }, l.session), /*#__PURE__*/React.createElement("span", null, l.to, "\uBA85"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--status-success)',
      fontWeight: 700
    }
  }, l.ok), /*#__PURE__*/React.createElement("span", {
    style: {
      color: l.fail ? 'var(--status-danger)' : 'var(--text-faint)',
      fontWeight: l.fail ? 700 : 400
    }
  }, l.fail)))), toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: 26,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 120
    }
  }, /*#__PURE__*/React.createElement(Toast, {
    tone: "success"
  }, toast)));
}
window.SmsScreen = SmsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/SmsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/StatsScreen.jsx
try { (() => {
/* 통계 대시보드 — 예약·참석·노쇼·전환 지표 + 회차별/채널/시간대 차트 */
function StatsScreen({
  store
}) {
  const {
    Card,
    Badge
  } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const {
    sessions,
    reservations,
    students,
    surveyResponses,
    counselBookings
  } = store;
  const active = reservations.filter(r => r.status !== 'cancelled');
  const entered = active.filter(r => r.status === 'entered');
  const noShow = active.filter(r => r.status === 'no_show');
  const guests = active.filter(r => !r.member);
  const converted = students.filter(s => s.convertedFrom);
  const attendRate = active.length ? Math.round(entered.length / active.length * 100) : 0;
  const noShowRate = active.length ? Math.round(noShow.length / active.length * 100) : 0;
  const convRate = guests.length ? Math.round(converted.length / guests.length * 100) : 0;

  /* 채널 분포 */
  const chData = [{
    key: 'mobile',
    label: '모바일',
    color: 'var(--violet-600)',
    n: active.filter(r => r.channel === 'mobile').length
  }, {
    key: 'phone',
    label: '전화',
    color: 'var(--mint-500)',
    n: active.filter(r => r.channel === 'phone').length
  }, {
    key: 'manual',
    label: '수동',
    color: 'var(--violet-300)',
    n: active.filter(r => r.channel === 'manual').length
  }];
  const chTotal = chData.reduce((a, b) => a + b.n, 0) || 1;
  let acc = 0;
  const stops = chData.map(c => {
    const from = acc / chTotal * 360;
    acc += c.n;
    const to = acc / chTotal * 360;
    return `${c.color} ${from}deg ${to}deg`;
  }).join(', ');

  /* 시간대 추이 (예약 생성 시각 기준) */
  const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const byHour = hours.map(h => active.filter(r => parseInt(r.time, 10) === h).length);
  const maxHour = Math.max(...byHour, 1);
  const W = 620,
    H = 150,
    padX = 10,
    padY = 14;
  const pts = byHour.map((v, i) => {
    const x = padX + i / (hours.length - 1) * (W - padX * 2);
    const y = padY + (1 - v / maxHour) * (H - padY * 2);
    return [x, y];
  });
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${pts[pts.length - 1][0].toFixed(1)} ${H - padY} L ${pts[0][0].toFixed(1)} ${H - padY} Z`;
  const avgRating = surveyResponses && surveyResponses.length ? surveyResponses.reduce((a, b) => a + b.rating, 0) / surveyResponses.length : 0;
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uD1B5\uACC4 \uB300\uC2DC\uBCF4\uB4DC"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      color: 'var(--text-accent)',
      marginBottom: 6
    }
  }, "ANALYTICS"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--text-h1)',
      fontWeight: 800
    }
  }, "\uC6B4\uC601 \uD1B5\uACC4")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 14,
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "\uB204\uC801 \uC608\uC57D",
    value: active.length,
    suffix: "\uAC74",
    tone: "brand",
    icon: /*#__PURE__*/React.createElement(I.ticket, {
      size: 15
    }),
    delay: 0
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "\uCC38\uC11D\uB960",
    value: attendRate,
    suffix: "%",
    tone: "success",
    icon: /*#__PURE__*/React.createElement(I.userCheck, {
      size: 15
    }),
    delay: 60
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "\uB178\uC1FC\uC728",
    value: noShowRate,
    suffix: "%",
    tone: "neutral",
    icon: /*#__PURE__*/React.createElement(I.alertTriangle, {
      size: 15
    }),
    delay: 120
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "\uBE44\uC7AC\uC6D0 \uC804\uD658\uC728",
    value: convRate,
    suffix: "%",
    tone: "accent",
    icon: /*#__PURE__*/React.createElement(I.trendingUp, {
      size: 15
    }),
    delay: 180
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.4fr 1fr',
      gap: 14,
      marginTop: 14,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "20px 22px",
    style: {
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 200ms both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(I.barChart, {
    size: 16,
    style: {
      color: 'var(--violet-800)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14.5,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, "\uD68C\uCC28\uBCC4 \uCC38\uC11D\uB960")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, sessions.map(s => {
    const srs = reservations.filter(r => r.sessionId === s.id && r.status !== 'cancelled');
    const se = srs.filter(r => r.status === 'entered').length;
    const rate = srs.length ? Math.round(se / srs.length * 100) : 0;
    return /*#__PURE__*/React.createElement("div", {
      key: s.id
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--text-strong)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: 320
      }
    }, s.title), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 800,
        color: 'var(--violet-800)',
        fontFeatureSettings: '"tnum"',
        flexShrink: 0,
        marginLeft: 10
      }
    }, rate, "% ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: 'var(--text-faint)',
        fontWeight: 500
      }
    }, "(", se, "/", srs.length, ")"))), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        height: 10,
        borderRadius: 5,
        background: 'var(--gray-2)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        height: '100%',
        width: `${rate}%`,
        borderRadius: 5,
        background: 'linear-gradient(90deg, var(--violet-600), var(--mint-500))',
        transition: 'width var(--dur-hero) var(--ease-smooth)'
      }
    })));
  }))), /*#__PURE__*/React.createElement(Card, {
    padding: "20px 22px",
    style: {
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 260ms both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(I.pieChart, {
    size: 16,
    style: {
      color: 'var(--mint-600)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14.5,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, "\uCC44\uB110\uBCC4 \uC608\uC57D")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 120,
      height: 120,
      borderRadius: '50%',
      background: `conic-gradient(${stops})`,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 74,
      height: 74,
      borderRadius: '50%',
      background: 'var(--surface-card)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 21,
      color: 'var(--text-strong)',
      fontFeatureSettings: '"tnum"',
      lineHeight: 1,
      whiteSpace: 'nowrap'
    }
  }, chTotal), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-faint)',
      marginTop: 2
    }
  }, "\uAC74"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 9
    }
  }, chData.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.key,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: 3,
      background: c.color,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--text-body)',
      flex: 1
    }
  }, c.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--text-strong)',
      fontFeatureSettings: '"tnum"'
    }
  }, c.n), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-faint)',
      width: 34,
      textAlign: 'right',
      fontFeatureSettings: '"tnum"'
    }
  }, Math.round(c.n / chTotal * 100), "%"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18,
      paddingTop: 16,
      borderTop: '1px solid var(--border-hairline)',
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 1
    }
  }, [1, 2, 3, 4, 5].map(n => /*#__PURE__*/React.createElement(I.star, {
    key: n,
    size: 13,
    style: {
      color: n <= Math.round(avgRating) ? 'var(--mint-500)' : 'var(--gray-3)',
      fill: n <= Math.round(avgRating) ? 'var(--mint-500)' : 'none'
    }
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, "\uD3C9\uADE0 \uB9CC\uC871\uB3C4 ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-strong)'
    }
  }, avgRating.toFixed(1))), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Badge, {
    tone: "info",
    size: "sm"
  }, "\uC0C1\uB2F4 ", (counselBookings || []).length, "\uAC74")))), /*#__PURE__*/React.createElement(Card, {
    padding: "20px 22px",
    style: {
      marginTop: 14,
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 320ms both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(I.trendingUp, {
    size: 16,
    style: {
      color: 'var(--violet-800)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14.5,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, "\uC2DC\uAC04\uB300\uBCC4 \uC608\uC57D \uC811\uC218")), /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${W} ${H + 22}`,
    style: {
      width: '100%',
      height: 'auto',
      display: 'block'
    },
    "data-om-raster": true
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "npr-area",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "var(--violet-600)",
    stopOpacity: "0.28"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "var(--violet-600)",
    stopOpacity: "0"
  }))), /*#__PURE__*/React.createElement("path", {
    d: areaPath,
    fill: "url(#npr-area)"
  }), /*#__PURE__*/React.createElement("path", {
    d: linePath,
    fill: "none",
    stroke: "var(--violet-700)",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), pts.map((p, i) => /*#__PURE__*/React.createElement("g", {
    key: i
  }, /*#__PURE__*/React.createElement("circle", {
    cx: p[0],
    cy: p[1],
    r: "3.5",
    fill: "var(--surface-card)",
    stroke: "var(--violet-700)",
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("text", {
    x: p[0],
    y: H + 14,
    textAnchor: "middle",
    fontSize: "10.5",
    fill: "var(--text-faint)",
    fontFamily: "var(--font-body)"
  }, hours[i], "\uC2DC"))))));
}
window.StatsScreen = StatsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/StatsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/StudentsScreen.jsx
try { (() => {
/* 재원생 관리 — 명단 + 필터 + 강사별 예약/입장 모니터링 */
function StudentsScreen({
  store
}) {
  const {
    Button,
    Input,
    Select,
    Tag,
    Card,
    Badge,
    Dialog,
    Toast
  } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  const {
    students,
    classes,
    sessions,
    reservations,
    addStudent
  } = store;
  const [q, setQ] = React.useState('');
  const [level, setLevel] = React.useState('전체');
  const [resFilter, setResFilter] = React.useState('전체');
  const [sessionId, setSessionId] = React.useState(sessions[0]?.id);
  const [addOpen, setAddOpen] = React.useState(false);
  const [excelOpen, setExcelOpen] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    school: '',
    grade: '',
    classId: classes[0].id,
    parentPhone: ''
  });
  const [toast, setToast] = React.useState(null);
  const uploadRows = [{
    name: '서지안',
    school: '가람중',
    grade: '중2',
    cls: '중등부 A',
    phone: '010-5521-7788',
    dup: false
  }, {
    name: '문하준',
    school: '한빛고',
    grade: '고1',
    cls: '고등부 A',
    phone: '010-6642-1193',
    dup: false
  }, {
    name: '김수민',
    school: '가람초',
    grade: '초4',
    cls: '초등부 A',
    phone: '010-3200-6100',
    dup: true
  }, {
    name: '이레아',
    school: '미림중',
    grade: '중3',
    cls: '중등부 B',
    phone: '010-7781-4420',
    dup: false
  }];
  const flash = m => {
    setToast(m);
    setTimeout(() => setToast(null), 3200);
  };
  const resOf = stuId => reservations.find(r => r.sessionId === sessionId && r.studentId === stuId && r.status !== 'cancelled');
  const list = students.filter(s => {
    const cls = classes.find(c => c.id === s.classId);
    if (level !== '전체' && cls.level !== level) return false;
    if (q && !(s.name + s.school + s.parentPhone).includes(q)) return false;
    const r = resOf(s.id);
    if (resFilter === '예약' && !r) return false;
    if (resFilter === '입장' && (!r || r.status !== 'entered')) return false;
    if (resFilter === '미예약' && r) return false;
    return true;
  });
  const submitAdd = () => {
    if (!form.name || !form.parentPhone) return;
    const cls = classes.find(c => c.id === form.classId);
    addStudent({
      ...form,
      className: cls.name
    });
    setAddOpen(false);
    setForm({
      name: '',
      school: '',
      grade: '',
      classId: classes[0].id,
      parentPhone: ''
    });
    setToast(`${form.name} 학생이 명단에 추가됐어요`);
    setTimeout(() => setToast(null), 3000);
  };
  const submitUpload = () => {
    const fresh = uploadRows.filter(r => !r.dup);
    fresh.forEach(r => {
      const cls = classes.find(c => c.name === r.cls) || classes[0];
      addStudent({
        name: r.name,
        school: r.school,
        grade: r.grade,
        classId: cls.id,
        className: cls.name,
        parentPhone: r.phone
      });
    });
    setUploadOpen(false);
    flash(`엑셀 ${uploadRows.length}행 반영 · 신규 ${fresh.length}명 추가 · 중복 ${uploadRows.length - fresh.length}건 병합`);
  };
  const doDownload = () => {
    setExcelOpen(false);
    flash(`현재 명단 ${list.length}명을 엑셀(.xlsx)로 내려받았어요`);
  };
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uC7AC\uC6D0\uC0DD \uAD00\uB9AC"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      color: 'var(--text-accent)',
      marginBottom: 6
    }
  }, "STUDENTS"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--text-h1)',
      fontWeight: 800,
      whiteSpace: 'nowrap'
    }
  }, "\uC7AC\uC6D0\uC0DD \uBA85\uB2E8 ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 17,
      color: 'var(--text-muted)',
      fontWeight: 600,
      whiteSpace: 'nowrap'
    }
  }, "\xB7 ", students.length, "\uBA85"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: /*#__PURE__*/React.createElement(I.fileText, {
      size: 16
    }),
    iconRight: /*#__PURE__*/React.createElement(I.chevronDown, {
      size: 14
    }),
    onClick: () => setExcelOpen(o => !o)
  }, "\uC5D1\uC140"), excelOpen && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    onClick: () => setExcelOpen(false),
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 90
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 44,
      right: 0,
      width: 200,
      background: 'var(--surface-card)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-float)',
      border: '1px solid var(--border-hairline)',
      overflow: 'hidden',
      zIndex: 91,
      animation: 'ds-fade-up var(--dur-fast) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setExcelOpen(false);
      setUploadOpen(true);
    },
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      width: '100%',
      padding: '11px 15px',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: 13.5,
      color: 'var(--text-body)',
      fontFamily: 'var(--font-body)',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement(I.upload, {
    size: 15
  }), " \uC5D1\uC140 \uC5C5\uB85C\uB4DC"), /*#__PURE__*/React.createElement("button", {
    onClick: doDownload,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      width: '100%',
      padding: '11px 15px',
      background: 'none',
      border: 'none',
      borderTop: '1px solid var(--border-hairline)',
      cursor: 'pointer',
      fontSize: 13.5,
      color: 'var(--text-body)',
      fontFamily: 'var(--font-body)',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement(I.download, {
    size: 15
  }), " \uBA85\uB2E8 \uB2E4\uC6B4\uB85C\uB4DC")))), /*#__PURE__*/React.createElement(Button, {
    icon: /*#__PURE__*/React.createElement(I.plus, {
      size: 16
    }),
    onClick: () => setAddOpen(true)
  }, "\uD559\uC0DD \uCD94\uAC00"))), /*#__PURE__*/React.createElement(Card, {
    padding: "16px 18px",
    style: {
      marginTop: 20,
      display: 'flex',
      gap: 12,
      alignItems: 'center',
      flexWrap: 'wrap',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 80ms both'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "\uC774\uB984\xB7\uD559\uAD50\xB7\uC5F0\uB77D\uCC98 \uAC80\uC0C9",
    value: q,
    onChange: setQ,
    icon: /*#__PURE__*/React.createElement(I.search, {
      size: 16
    }),
    style: {
      width: 220
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, ['전체', '초', '중', '고'].map(l => /*#__PURE__*/React.createElement(Tag, {
    key: l,
    selected: level === l,
    onClick: () => setLevel(l)
  }, l === '전체' ? '전체' : l + '등부'))), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Select, {
    options: sessions.map(s => ({
      label: s.title,
      value: s.id
    })),
    value: sessionId,
    onChange: setSessionId,
    style: {
      width: 250
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, ['전체', '예약', '입장', '미예약'].map(f => /*#__PURE__*/React.createElement(Tag, {
    key: f,
    selected: resFilter === f,
    onClick: () => setResFilter(f)
  }, f)))), /*#__PURE__*/React.createElement(Card, {
    padding: "0",
    style: {
      marginTop: 14,
      overflow: 'hidden',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 160ms both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.1fr 1fr 0.6fr 0.9fr 1.2fr 0.8fr 0.8fr 0.7fr',
      padding: '11px 22px',
      background: 'var(--surface-sunken)',
      fontSize: 11.5,
      fontWeight: 700,
      color: 'var(--text-muted)',
      letterSpacing: '0.02em'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\uD559\uC0DD \uC774\uB984"), /*#__PURE__*/React.createElement("span", null, "\uD559\uAD50"), /*#__PURE__*/React.createElement("span", null, "\uD559\uB144"), /*#__PURE__*/React.createElement("span", null, "\uBC18"), /*#__PURE__*/React.createElement("span", null, "\uD559\uBD80\uBAA8 \uC5F0\uB77D\uCC98"), /*#__PURE__*/React.createElement("span", null, "\uC608\uC57D"), /*#__PURE__*/React.createElement("span", null, "\uC785\uC7A5"), /*#__PURE__*/React.createElement("span", null, "\uB178\uC1FC")), list.map((s, i) => {
    const r = resOf(s.id);
    return /*#__PURE__*/React.createElement("div", {
      key: s.id,
      style: {
        display: 'grid',
        gridTemplateColumns: '1.1fr 1fr 0.6fr 0.9fr 1.2fr 0.8fr 0.8fr 0.7fr',
        alignItems: 'center',
        padding: '12px 22px',
        borderTop: '1px solid var(--border-hairline)',
        fontSize: 13.5,
        color: 'var(--text-body)',
        background: 'var(--surface-card)',
        animation: `ds-fade-up var(--dur-base) var(--ease-out) ${Math.min(i, 12) * 35}ms both`
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 700,
        color: 'var(--text-strong)',
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, s.name, s.convertedFrom && /*#__PURE__*/React.createElement(Badge, {
      tone: "accent",
      size: "sm"
    }, "\uC804\uD658")), /*#__PURE__*/React.createElement("span", null, s.school), /*#__PURE__*/React.createElement("span", null, s.grade), /*#__PURE__*/React.createElement("span", null, s.className), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFeatureSettings: '"tnum"'
      }
    }, s.parentPhone), /*#__PURE__*/React.createElement("span", null, r ? /*#__PURE__*/React.createElement(Badge, {
      tone: "brand",
      size: "sm"
    }, "\uC608\uC57D\uB428") : /*#__PURE__*/React.createElement(Badge, {
      tone: "neutral",
      size: "sm"
    }, "\uBBF8\uC608\uC57D")), /*#__PURE__*/React.createElement("span", null, r && r.status === 'entered' ? /*#__PURE__*/React.createElement(Badge, {
      tone: "success",
      dot: true,
      size: "sm"
    }, "\uC785\uC7A5") : r ? /*#__PURE__*/React.createElement(Badge, {
      tone: "warning",
      size: "sm"
    }, "\uB300\uAE30") : /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-faint)',
        fontSize: 12
      }
    }, "\u2014")), /*#__PURE__*/React.createElement("span", null, s.noShowCount ? /*#__PURE__*/React.createElement(Badge, {
      tone: "warning",
      size: "sm"
    }, s.noShowCount, "\uD68C") : /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-faint)',
        fontSize: 12
      }
    }, "\u2014")));
  }), list.length === 0 && /*#__PURE__*/React.createElement(EmptyState, null, "\uC870\uAC74\uC5D0 \uB9DE\uB294 \uC7AC\uC6D0\uC0DD\uC774 \uC5C6\uC5B4\uC694. \uD544\uD130\uB97C \uBC14\uAFD4\uBCF4\uC138\uC694.")), /*#__PURE__*/React.createElement(Dialog, {
    open: addOpen,
    onClose: () => setAddOpen(false),
    title: "\uD559\uC0DD \uCD94\uAC00",
    width: 460,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => setAddOpen(false)
    }, "\uCDE8\uC18C"), /*#__PURE__*/React.createElement(Button, {
      disabled: !form.name || !form.parentPhone,
      onClick: submitAdd,
      icon: /*#__PURE__*/React.createElement(I.plus, {
        size: 15
      })
    }, "\uCD94\uAC00\uD558\uAE30"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "\uD559\uC0DD \uC774\uB984",
    placeholder: "\uAE40\uC218\uBBFC",
    value: form.name,
    onChange: v => setForm({
      ...form,
      name: v
    })
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "\uD559\uAD50",
    placeholder: "\uAC00\uB78C\uC911",
    value: form.school,
    onChange: v => setForm({
      ...form,
      school: v
    })
  }), /*#__PURE__*/React.createElement(Input, {
    label: "\uD559\uB144",
    placeholder: "\uC9112",
    value: form.grade,
    onChange: v => setForm({
      ...form,
      grade: v
    })
  })), /*#__PURE__*/React.createElement(Select, {
    label: "\uBC18",
    options: classes.map(c => ({
      label: c.name,
      value: c.id
    })),
    value: form.classId,
    onChange: v => setForm({
      ...form,
      classId: v
    })
  }), /*#__PURE__*/React.createElement(Input, {
    label: "\uD559\uBD80\uBAA8 \uC5F0\uB77D\uCC98",
    placeholder: "010-0000-0000",
    value: form.parentPhone,
    onChange: v => setForm({
      ...form,
      parentPhone: v
    }),
    hint: "\uC608\uC57D \uC870\uD68C\xB7\uBB38\uC790 \uBC1C\uC1A1\uC5D0 \uC0AC\uC6A9\uB3FC\uC694"
  }))), /*#__PURE__*/React.createElement(Dialog, {
    open: uploadOpen,
    onClose: () => setUploadOpen(false),
    title: "\uC5D1\uC140 \uC5C5\uB85C\uB4DC \u2014 \uB9E4\uD551 \uBBF8\uB9AC\uBCF4\uAE30",
    width: 620,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => setUploadOpen(false)
    }, "\uCDE8\uC18C"), /*#__PURE__*/React.createElement(Button, {
      onClick: submitUpload,
      icon: /*#__PURE__*/React.createElement(I.check, {
        size: 15
      })
    }, "\uBC18\uC601\uD558\uAE30"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '12px 14px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-sunken)',
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement(I.fileText, {
    size: 16,
    style: {
      color: 'var(--violet-800)',
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-strong)'
    }
  }, "\uC7AC\uC6D0\uC0DD_\uBA85\uB2E8.xlsx"), " \xB7 ", uploadRows.length, "\uD589 \uC778\uC2DD\uB428 \xB7 \uC5F4 \uB9E4\uD551: \uC774\uB984 \xB7 \uD559\uAD50 \xB7 \uD559\uB144 \xB7 \uBC18 \xB7 \uC5F0\uB77D\uCC98")), /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-hairline)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 0.6fr 1fr 1.3fr',
      padding: '9px 14px',
      background: 'var(--surface-sunken)',
      fontSize: 11.5,
      fontWeight: 700,
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\uC774\uB984"), /*#__PURE__*/React.createElement("span", null, "\uD559\uAD50"), /*#__PURE__*/React.createElement("span", null, "\uD559\uB144"), /*#__PURE__*/React.createElement("span", null, "\uBC18"), /*#__PURE__*/React.createElement("span", null, "\uC5F0\uB77D\uCC98")), uploadRows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 0.6fr 1fr 1.3fr',
      padding: '10px 14px',
      borderTop: '1px solid var(--border-hairline)',
      fontSize: 13,
      color: 'var(--text-body)',
      background: r.dup ? 'var(--status-warning-soft)' : 'var(--surface-card)',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, r.name), /*#__PURE__*/React.createElement("span", null, r.school), /*#__PURE__*/React.createElement("span", null, r.grade), /*#__PURE__*/React.createElement("span", null, r.cls), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFeatureSettings: '"tnum"',
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, r.phone, r.dup && /*#__PURE__*/React.createElement(Badge, {
    tone: "warning",
    size: "sm"
  }, "\uC911\uBCF5\xB7\uBCD1\uD569"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-faint)'
    }
  }, "\uC5F0\uB77D\uCC98\uAC00 \uAC19\uC740 \uD589\uC740 \uAE30\uC874 \uC7AC\uC6D0\uC0DD\uACFC \uBCD1\uD569\uB3FC\uC694. \uC2E0\uADDC ", uploadRows.filter(r => !r.dup).length, "\uBA85\uC774 \uBA85\uB2E8\uC5D0 \uCD94\uAC00\uB429\uB2C8\uB2E4."))), toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: 26,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 120
    }
  }, /*#__PURE__*/React.createElement(Toast, {
    tone: "success"
  }, toast)));
}
window.StudentsScreen = StudentsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/StudentsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/data.js
try { (() => {
/* npr 입시설명회 운영 콘솔 — 샘플 데이터 (전부 가상) */
(function () {
  const lastNames = ['김', '이', '박', '최', '정', '한', '조', '윤', '장', '임'];
  const firstNames = ['수민', '서연', '지호', '하준', '은우', '지아', '도윤', '시우', '예린', '준서', '민재', '유나', '태윤', '가은', '현우', '소율', '재이', '다온', '루아', '건우'];
  const schools = {
    초: ['가람초', '한빛초', '푸른초'],
    중: ['가람중', '미림중', '동성중'],
    고: ['한빛고', '세종고', '미림여고']
  };
  const classes = [{
    id: 'e1',
    name: '초등부 A',
    level: '초',
    teacherId: 't4'
  }, {
    id: 'm1',
    name: '중등부 A',
    level: '중',
    teacherId: 't1'
  }, {
    id: 'm2',
    name: '중등부 B',
    level: '중',
    teacherId: 't2'
  }, {
    id: 'h1',
    name: '고등부 A',
    level: '고',
    teacherId: 't3'
  }, {
    id: 'h2',
    name: '고등부 B',
    level: '고',
    teacherId: 't2'
  }];
  const teachers = [{
    id: 't1',
    name: '김지훈'
  }, {
    id: 't2',
    name: '박세라'
  }, {
    id: 't3',
    name: '이도현'
  }, {
    id: 't4',
    name: '한유진'
  }];
  const students = [];
  for (let i = 0; i < 40; i++) {
    const cls = classes[i % classes.length];
    const gradeNum = i * 7 % (cls.level === '초' ? 6 : 3) + 1;
    const name = lastNames[i * 3 % 10] + firstNames[(i * 11 + 4) % 20];
    const phone = `010-${String(3200 + i * 37).slice(-4)}-${String(6100 + i * 53).slice(-4)}`;
    students.push({
      id: 'stu' + (i + 1),
      name,
      school: schools[cls.level][i * 5 % 3],
      grade: `${cls.level}${gradeNum}`,
      classId: cls.id,
      className: cls.name,
      parentPhone: phone
    });
  }
  const sessions = [{
    id: 'ss1',
    title: '2027 대비 고등 입시전략 설명회',
    date: '7월 26일 (일)',
    round: '2회차',
    time: '14:00',
    place: 'npr 본관 5층 세미나홀',
    capacity: 120,
    desc: '고1·2 대상 수시/정시 전략과 npr 관리 시스템 소개.',
    attendField: true,
    active: true,
    ended: false,
    reminders: [{
      id: 'rm1',
      label: '전일 리마인드',
      time: 'D-1 18:00',
      template: '전일 리마인드',
      enabled: true
    }, {
      id: 'rm2',
      label: '당일 리마인드',
      time: '당일 -2시간',
      template: '전일 리마인드',
      enabled: false
    }]
  }, {
    id: 'ss2',
    title: '중등 신입생 로드맵 설명회',
    date: '8월 1일 (토)',
    round: '1회차',
    time: '10:30',
    place: 'npr 본관 3층 강의실 A',
    capacity: 60,
    desc: '',
    attendField: false,
    active: true,
    ended: false,
    reminders: [{
      id: 'rm1',
      label: '전일 리마인드',
      time: 'D-1 18:00',
      template: '전일 리마인드',
      enabled: true
    }, {
      id: 'rm2',
      label: '당일 리마인드',
      time: '당일 -2시간',
      template: '전일 리마인드',
      enabled: false
    }]
  }, {
    id: 'ss3',
    title: '초등 고학년 학습 설명회',
    date: '8월 8일 (토)',
    round: '1회차',
    time: '11:00',
    place: 'npr 별관 1층 홀',
    capacity: 40,
    desc: '초4~6 학부모 대상.',
    attendField: true,
    active: true,
    ended: false,
    reminders: [{
      id: 'rm1',
      label: '전일 리마인드',
      time: 'D-1 18:00',
      template: '전일 리마인드',
      enabled: true
    }, {
      id: 'rm2',
      label: '당일 리마인드',
      time: '당일 -2시간',
      template: '전일 리마인드',
      enabled: false
    }]
  }];

  /* 예약: status reserved(미체크) | entered(입장 완료) | cancelled */
  const reservations = [];
  let rid = 1;
  const add = (sessionId, studentIdx, channel, status, attendCount) => {
    const st = students[studentIdx];
    reservations.push({
      id: 'r' + rid,
      code: `NPR-${sessionId.toUpperCase()}-${String(rid).padStart(4, '0')}`,
      sessionId,
      studentId: st.id,
      name: st.name,
      school: st.school,
      grade: st.grade,
      phone: st.parentPhone,
      channel,
      status,
      attendCount: attendCount || 1,
      member: true,
      time: `${9 + rid % 9}:${String(rid * 17 % 60).padStart(2, '0')}`
    });
    rid++;
  };
  // ss1: 재원생 18명 (전화 6, 모바일 12), 입장 7, 취소 2
  for (let i = 0; i < 18; i++) add('ss1', i, i % 3 === 0 ? 'phone' : 'mobile', i < 7 ? 'entered' : i >= 16 ? 'cancelled' : 'reserved', 1 + (i % 3 === 1 ? 1 : 0));
  // ss1 비재원생 4명
  [['정하윤', '동성중', '중3', '010-7741-2210'], ['오지우', '세종고', '고1', '010-8852-3341'], ['남도현', '미림중', '중2', '010-6633-4472'], ['배서아', '한빛고', '고2', '010-5524-5583']].forEach((g, i) => {
    reservations.push({
      id: 'r' + rid,
      code: `NPR-SS1-${String(rid).padStart(4, '0')}`,
      sessionId: 'ss1',
      studentId: null,
      name: g[0],
      school: g[1],
      grade: g[2],
      phone: g[3],
      channel: i % 2 ? 'mobile' : 'phone',
      status: i === 0 ? 'entered' : 'reserved',
      attendCount: 2,
      member: false,
      time: `1${i}:2${i}`
    });
    rid++;
  });
  // ss2: 재원생 9명
  for (let i = 20; i < 29; i++) add('ss2', i, i % 4 === 0 ? 'phone' : 'mobile', i < 23 ? 'entered' : 'reserved');
  // ss3: 6명
  for (let i = 30; i < 36; i++) add('ss3', i, 'mobile', 'reserved', 2);
  const smsTemplates = [{
    id: 'tp1',
    name: '예약 확정 + QR',
    body: '[npr] {학생명} 님, {설명회명} 예약이 확정되었습니다.\n일시: {일시}\n장소: {장소}\n아래 QR로 입장해 주세요.\n{QR링크}'
  }, {
    id: 'tp2',
    name: '입장 완료 안내',
    body: '[npr] {학생명} 님이 {설명회명}에 입장 완료했습니다. 안심하고 기다려 주세요.'
  }, {
    id: 'tp3',
    name: '전일 리마인드',
    body: '[npr] 내일은 {설명회명} 날이에요!\n{일시} · {장소}\nQR을 미리 준비해 주세요. 취소는 이 문자에 회신.'
  }];
  const smsLogs = [{
    id: 'l1',
    when: '오늘 09:12',
    to: 214,
    template: '전일 리마인드',
    session: '2027 대비 고등 입시전략 설명회',
    ok: 212,
    fail: 2
  }, {
    id: 'l2',
    when: '어제 18:40',
    to: 96,
    template: '예약 확정 + QR',
    session: '중등 신입생 로드맵 설명회',
    ok: 96,
    fail: 0
  }, {
    id: 'l3',
    when: '7월 12일 11:05',
    to: 41,
    template: '예약 확정 + QR',
    session: '초등 고학년 학습 설명회',
    ok: 40,
    fail: 1
  }];
  const devices = [{
    id: 'd1',
    label: '입구 A',
    model: 'iPad Pro 11" (4th)',
    on: true,
    battery: 82,
    last: '방금 전'
  }, {
    id: 'd2',
    label: '입구 B',
    model: 'iPad Air 5',
    on: true,
    battery: 64,
    last: '1분 전'
  }, {
    id: 'd3',
    label: '별관 입구',
    model: 'Galaxy Tab S9',
    on: false,
    battery: 31,
    last: '43분 전'
  }, {
    id: 'd4',
    label: '예비',
    model: 'iPad 9',
    on: false,
    battery: 100,
    last: '어제'
  }];

  /* 만족도 설문 응답 시드 (종료된 회차 대상 · 별점 1~5 + 객관식 + 주관식) */
  const surveyResponses = [{
    id: 'sv1',
    sessionId: 'ss1',
    rating: 5,
    helpful: '매우 도움됨',
    again: '네',
    comment: '입시 전략이 구체적이라 좋았어요.'
  }, {
    id: 'sv2',
    sessionId: 'ss1',
    rating: 4,
    helpful: '도움됨',
    again: '네',
    comment: '주차 안내가 조금 아쉬웠습니다.'
  }, {
    id: 'sv3',
    sessionId: 'ss1',
    rating: 5,
    helpful: '매우 도움됨',
    again: '네',
    comment: ''
  }, {
    id: 'sv4',
    sessionId: 'ss1',
    rating: 4,
    helpful: '도움됨',
    again: '보통',
    comment: '자료를 미리 받고 싶어요.'
  }, {
    id: 'sv5',
    sessionId: 'ss1',
    rating: 3,
    helpful: '보통',
    again: '보통',
    comment: ''
  }, {
    id: 'sv6',
    sessionId: 'ss1',
    rating: 5,
    helpful: '매우 도움됨',
    again: '네',
    comment: '상담 연계가 특히 유용했어요.'
  }];

  /* 상담 슬롯 (강사 × 일시) + 신청 시드 */
  const counselSlots = [];
  let csid = 1;
  const cDays = ['7월 28일 (월)', '7월 29일 (화)'];
  const cTimes = ['15:00', '16:00', '17:00', '18:00'];
  ['t3', 't1', 't2'].forEach(tid => {
    cDays.forEach(d => {
      cTimes.forEach(tm => {
        counselSlots.push({
          id: 'cs' + csid++,
          teacherId: tid,
          date: d,
          time: tm,
          booked: false
        });
      });
    });
  });
  const counselBookings = [];
  [['cs1', '김수민', '고1', '010-3200-6100'], ['cs6', '이서연', '고2', '010-3459-6577'], ['cs14', '박도윤', '중3', '010-3644-6789']].forEach((b, i) => {
    const slot = counselSlots.find(s => s.id === b[0]);
    if (slot) {
      slot.booked = true;
      counselBookings.push({
        id: 'cb' + (i + 1),
        slotId: slot.id,
        teacherId: slot.teacherId,
        date: slot.date,
        time: slot.time,
        name: b[1],
        grade: b[2],
        phone: b[3],
        from: 'ss1'
      });
    }
  });
  window.NPR_DATA = {
    teachers,
    classes,
    students,
    sessions,
    reservations,
    smsTemplates,
    smsLogs,
    devices,
    surveyResponses,
    counselSlots,
    counselBookings
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/data.js", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/flow-data.js
try { (() => {
/* npr 유저플로우 데이터 — 권한별 페르소나 흐름 (구조화 · E2E/디버깅용)
   노드: { id, type, title, note?, state?, sms?, gate?, branches?:[{cond, nodes:[]}] }
   type: start | screen | action | decision | state | sms | gate | end
   ID 규칙: <PERSONA>-<FLOW>-<STEP> (예: OWNER-F5-04) */
(function () {
  const OWNER_FLOWS = [{
    id: 'OWNER-F1',
    name: '로그인 & 라우팅',
    desc: '역할 판별 → 허브 → 모듈 이동',
    nodes: [{
      id: 'OWNER-F1-01',
      type: 'start',
      title: '콘솔 접속 (index.html)'
    }, {
      id: 'OWNER-F1-02',
      type: 'screen',
      title: '로그인 화면',
      note: '역할 선택: 원장 / 실장 / 강사. 학부모·학생은 로그인 없이 모바일(mobile.html)만 이용.'
    }, {
      id: 'OWNER-F1-03',
      type: 'action',
      title: '원장 선택 → 입장하기'
    }, {
      id: 'OWNER-F1-04',
      type: 'state',
      title: '로그인 상태 저장',
      state: 'npr-user = owner',
      note: '새로고침 유지. 미인식 역할이면 재로그인.'
    }, {
      id: 'OWNER-F1-05',
      type: 'screen',
      title: '허브 (카드 런처)',
      note: '8개 모듈 카드 전부 활성 + 다가오는 설명회 칩 + 모바일 예약 링크.'
    }, {
      id: 'OWNER-F1-06',
      type: 'decision',
      title: '모듈 진입',
      note: '카드/상단 탭바로 이동. 로고 클릭 시 허브 복귀. npr-route에 라우트 저장.',
      branches: [{
        cond: '재원생 관리',
        nodes: [{
          id: 'OWNER-F1-06a',
          type: 'screen',
          title: '→ F2'
        }]
      }, {
        cond: '설명회 운영',
        nodes: [{
          id: 'OWNER-F1-06b',
          type: 'screen',
          title: '→ F5 (QR 현황 대시보드)'
        }]
      }, {
        cond: '통계',
        nodes: [{
          id: 'OWNER-F1-06c',
          type: 'screen',
          title: '→ F7'
        }]
      }]
    }, {
      id: 'OWNER-F1-07',
      type: 'action',
      title: '아바타 메뉴 → 로그아웃',
      note: '내 정보 / 로그아웃.'
    }, {
      id: 'OWNER-F1-08',
      type: 'end',
      title: '로그인 화면 복귀 (npr-user 삭제)'
    }]
  }, {
    id: 'OWNER-F2',
    name: '재원생 관리 (전체 명단)',
    desc: '원장·실장 전용',
    nodes: [{
      id: 'OWNER-F2-01',
      type: 'screen',
      title: '재원생 명단 진입',
      note: '40명 시드. 필드: 이름(+전환 배지)·학교·학년·반·연락처·예약·입장·노쇼 회수.'
    }, {
      id: 'OWNER-F2-02',
      type: 'action',
      title: '필터',
      note: '검색(이름·학교·연락처) · 부문(초/중/고) · 예약상태(전체/예약/입장/미예약) · 설명회 기준 Select. ※ 강사·반 필터는 F5로 이동.'
    }, {
      id: 'OWNER-F2-03',
      type: 'decision',
      title: '우상단 액션',
      branches: [{
        cond: '학생 추가',
        nodes: [{
          id: 'OWNER-F2-04',
          type: 'screen',
          title: '학생 추가 모달'
        }, {
          id: 'OWNER-F2-05',
          type: 'decision',
          title: '이름·연락처 입력?',
          note: '필수 미입력 시 추가 비활성.',
          branches: [{
            cond: '유효',
            nodes: [{
              id: 'OWNER-F2-06',
              type: 'state',
              title: '명단 최상단 추가',
              state: '+Student',
              sms: ''
            }]
          }]
        }]
      }, {
        cond: '엑셀 업로드',
        nodes: [{
          id: 'OWNER-F2-07',
          type: 'screen',
          title: '매핑 미리보기 모달',
          note: '열 매핑(이름·학교·학년·반·연락처) + 중복 행 하이라이트.'
        }, {
          id: 'OWNER-F2-08',
          type: 'decision',
          title: '연락처 중복?',
          branches: [{
            cond: '중복',
            nodes: [{
              id: 'OWNER-F2-09',
              type: 'state',
              title: '기존 재원생 병합'
            }]
          }, {
            cond: '신규',
            nodes: [{
              id: 'OWNER-F2-10',
              type: 'state',
              title: '명단 추가',
              state: '+Student'
            }]
          }]
        }]
      }, {
        cond: '엑셀 다운로드',
        nodes: [{
          id: 'OWNER-F2-11',
          type: 'action',
          title: '현재 필터 명단 .xlsx 내려받기'
        }]
      }]
    }]
  }, {
    id: 'OWNER-F3',
    name: '전화예약 관리',
    desc: '수동예약 · QR/문자 상세',
    nodes: [{
      id: 'OWNER-F3-01',
      type: 'screen',
      title: '전화예약 진입 + 설명회 선택'
    }, {
      id: 'OWNER-F3-02',
      type: 'action',
      title: '스탯 카드 클릭 = 목록 필터',
      note: '전화예약/입장/미체크/취소.'
    }, {
      id: 'OWNER-F3-03',
      type: 'decision',
      title: '수동예약 등록',
      branches: [{
        cond: '재원생 탭',
        nodes: [{
          id: 'OWNER-F3-04',
          type: 'action',
          title: '연락처(부분) 조회 → 학생 카드 선택',
          note: '이미 예약된 학생은 비활성.'
        }, {
          id: 'OWNER-F3-05',
          type: 'decision',
          title: 'attendField?',
          branches: [{
            cond: 'true',
            nodes: [{
              id: 'OWNER-F3-06',
              type: 'action',
              title: '참석 인원(1~4) 선택'
            }]
          }]
        }, {
          id: 'OWNER-F3-07',
          type: 'state',
          title: '예약 생성 + QR',
          state: '→ reserved',
          sms: '예약 확정 + QR'
        }]
      }, {
        cond: '비재원생 탭',
        nodes: [{
          id: 'OWNER-F3-08',
          type: 'action',
          title: '이름·학교·학년·연락처 입력'
        }, {
          id: 'OWNER-F3-09',
          type: 'state',
          title: '예약 생성(member=false)',
          state: '→ reserved',
          sms: '예약 확정 + QR'
        }]
      }]
    }, {
      id: 'OWNER-F3-10',
      type: 'screen',
      title: '예약 상세 패널 (행 클릭)',
      note: 'QR·예약자·연락처·채널·일시·상태 + 이력(회차 변경/재발급).'
    }, {
      id: 'OWNER-F3-11',
      type: 'decision',
      title: '상세 액션',
      branches: [{
        cond: '문자 재발송',
        nodes: [{
          id: 'OWNER-F3-12',
          type: 'sms',
          title: '확정 문자 재발송',
          sms: '예약 확정 + QR'
        }]
      }, {
        cond: 'QR 재발급',
        nodes: [{
          id: 'OWNER-F3-13',
          type: 'state',
          title: '기존 코드 무효·신규 발급',
          state: 'code → -Rn (codeHistory)',
          sms: '재발급 QR'
        }]
      }, {
        cond: '예약 변경',
        nodes: [{
          id: 'OWNER-F3-14',
          type: 'screen',
          title: '회차 선택 다이얼로그(잔여석)'
        }, {
          id: 'OWNER-F3-15',
          type: 'state',
          title: '설명회 이동 (예약번호·QR 유지)',
          state: 'sessionId 이동 · history[]',
          sms: '변경 확정'
        }]
      }, {
        cond: '예약 취소',
        nodes: [{
          id: 'OWNER-F3-16',
          type: 'decision',
          title: '취소 확인 다이얼로그'
        }, {
          id: 'OWNER-F3-17',
          type: 'state',
          title: '예약 취소',
          state: '→ cancelled (by staff)',
          sms: '취소 안내'
        }]
      }]
    }]
  }, {
    id: 'OWNER-F4',
    name: '문자 발송',
    desc: '템플릿 · 대상 · 로그',
    nodes: [{
      id: 'OWNER-F4-01',
      type: 'screen',
      title: '문자 발송 진입'
    }, {
      id: 'OWNER-F4-02',
      type: 'action',
      title: '템플릿 선택 / 생성 / 저장'
    }, {
      id: 'OWNER-F4-03',
      type: 'action',
      title: '본문 편집 + 변수 칩',
      note: '{학생명}{설명회명}{일시}{장소}{QR링크}. 바이트 카운터(>90 LMS).'
    }, {
      id: 'OWNER-F4-04',
      type: 'action',
      title: '수신 대상 선택',
      note: '설명회 × 대상 그룹(예약자 전체/미체크/입장/취소자) + 인원 카운트.'
    }, {
      id: 'OWNER-F4-05',
      type: 'decision',
      title: '발송 가능?',
      note: '대상 0명·빈 본문이면 비활성.',
      branches: [{
        cond: '가능',
        nodes: [{
          id: 'OWNER-F4-06',
          type: 'state',
          title: '발송 → 로그 추가',
          sms: '선택 템플릿 · 대상 그룹'
        }]
      }]
    }, {
      id: 'OWNER-F4-07',
      type: 'screen',
      title: '발송 로그 대시보드',
      note: '시각/템플릿/설명회/수신/성공/실패 + 자동 배지(리마인드).'
    }]
  }, {
    id: 'OWNER-F5',
    name: '설명회 운영 — QR 현황 대시보드',
    desc: '전체 명단 관리 · 핵심',
    nodes: [{
      id: 'OWNER-F5-01',
      type: 'screen',
      title: '설명회 운영 진입 + 좌측 설명회 선택'
    }, {
      id: 'OWNER-F5-02',
      type: 'action',
      title: '새 설명회 생성',
      note: '명*·날짜*·장소* + 참석 인원 토글 + 페이지 꾸미기(배너 테마·안내문).'
    }, {
      id: 'OWNER-F5-03',
      type: 'state',
      title: '생성 + 자동 선택',
      state: '+Session',
      note: '모바일 예약 화면에 즉시 노출.'
    }, {
      id: 'OWNER-F5-04',
      type: 'screen',
      title: '현황 헤더 + 스탯 5장',
      note: '총예약/입장/미체크/노쇼/취소 + 예약률%. (강사도 열람 가능)'
    }, {
      id: 'OWNER-F5-05',
      type: 'action',
      title: '리마인드 스케줄 토글 / 지금 발송',
      sms: '전일·당일 리마인드 (자동 배지)'
    }, {
      id: 'OWNER-F5-06',
      type: 'action',
      title: '설문 보내기 (입장>0)',
      sms: '만족도 설문 링크'
    }, {
      id: 'OWNER-F5-07',
      type: 'screen',
      title: '설명회 명단 (전체 로스터)',
      note: '재원생 전체 + 비재원생. 강사·반 필터 + 상태 필터(전체/입장/미입장/미예약/노쇼/비재원생/취소). 강사 선택 시 강사 모니터링 카드.'
    }, {
      id: 'OWNER-F5-08',
      type: 'decision',
      title: '명단 행 액션 (상태별)',
      branches: [{
        cond: '미예약 (재학생)',
        nodes: [{
          id: 'OWNER-F5-09',
          type: 'state',
          title: '즉석 예약 등록',
          state: 'none → reserved',
          sms: '예약 확정 + QR'
        }]
      }, {
        cond: '미입장 (reserved)',
        nodes: [{
          id: 'OWNER-F5-10',
          type: 'state',
          title: '수동 체크인',
          state: 'reserved → entered',
          sms: '입장 완료 안내'
        }]
      }, {
        cond: '입장 (entered)',
        nodes: [{
          id: 'OWNER-F5-11',
          type: 'decision',
          title: '입장 취소 → 사유 선택'
        }, {
          id: 'OWNER-F5-12',
          type: 'state',
          title: '미체크 복귀 (감사 기록)',
          state: 'entered → reserved · audit[]'
        }]
      }, {
        cond: '비재원생',
        nodes: [{
          id: 'OWNER-F5-13',
          type: 'screen',
          title: '전환 → 반 배정(프리필)'
        }, {
          id: 'OWNER-F5-14',
          type: 'state',
          title: '재원생 전환',
          state: '+Student · convertedFrom · 예약 연결',
          sms: '등록 환영'
        }]
      }]
    }, {
      id: 'OWNER-F5-15',
      type: 'action',
      title: '명단 인쇄 → A4 로스터(체크·서명란) → 인쇄'
    }, {
      id: 'OWNER-F5-16',
      type: 'decision',
      title: '설명회 종료',
      branches: [{
        cond: '종료 처리',
        nodes: [{
          id: 'OWNER-F5-17',
          type: 'state',
          title: '미체크 일괄 노쇼 + 노쇼 회수 누적',
          state: 'reserved → no_show · Student.noShowCount++',
          sms: '(선택) 종료 안내'
        }]
      }]
    }, {
      id: 'OWNER-F5-18',
      type: 'decision',
      title: '설명회 삭제',
      branches: [{
        cond: '삭제 확인',
        nodes: [{
          id: 'OWNER-F5-19',
          type: 'state',
          title: '세션 + 연동 예약 제거',
          state: '-Session · -Reservation',
          sms: '취소 안내'
        }]
      }]
    }]
  }, {
    id: 'OWNER-F6',
    name: '상담 예약',
    desc: '슬롯 그리드 · 신청 모니터링',
    nodes: [{
      id: 'OWNER-F6-01',
      type: 'screen',
      title: '상담 예약 진입',
      note: '슬롯 그리드(강사×일시) + 신청 목록 + 전체/예약/잔여 스탯.'
    }, {
      id: 'OWNER-F6-02',
      type: 'action',
      title: '강사 필터로 슬롯·신청 슬라이스'
    }, {
      id: 'OWNER-F6-03',
      type: 'end',
      title: '신청 모니터링',
      note: '신청 생성은 학부모 모바일(→ PARENT-P5). 콘솔은 조회·관리.'
    }]
  }, {
    id: 'OWNER-F7',
    name: '통계 대시보드',
    desc: '원장·실장 전용',
    nodes: [{
      id: 'OWNER-F7-01',
      type: 'screen',
      title: '통계 진입'
    }, {
      id: 'OWNER-F7-02',
      type: 'action',
      title: '지표 카드',
      note: '누적 예약 · 참석률 · 노쇼율 · 비재원 전환율.'
    }, {
      id: 'OWNER-F7-03',
      type: 'action',
      title: '차트',
      note: '회차별 참석률 바 · 채널별 도넛 · 시간대 추이 라인 · 평균 만족도.'
    }]
  }, {
    id: 'OWNER-F8',
    name: 'QR 스캐너 (태블릿)',
    desc: '현장 입장 처리',
    nodes: [{
      id: 'OWNER-F8-01',
      type: 'screen',
      title: '기기 모니터링 (최대 4대)',
      note: '설치 위치·기종·ON/OFF·배터리(40%↓ 경고).'
    }, {
      id: 'OWNER-F8-02',
      type: 'decision',
      title: '기기 선택',
      branches: [{
        cond: 'ON — 이 기기로 스캔',
        nodes: [{
          id: 'OWNER-F8-03',
          type: 'screen',
          title: '전체화면 스캐너'
        }]
      }, {
        cond: 'OFF — 연결하기',
        nodes: [{
          id: 'OWNER-F8-04',
          type: 'screen',
          title: '카메라 권한(허용/거부)',
          note: '거부 시 기기 선택 복귀.'
        }]
      }]
    }, {
      id: 'OWNER-F8-05',
      type: 'decision',
      title: 'QR 인식 (데모)',
      branches: [{
        cond: '인식 성공',
        nodes: [{
          id: 'OWNER-F8-06',
          type: 'state',
          title: '미체크 1건 입장 처리',
          state: 'reserved → entered',
          sms: '입장 완료 안내'
        }]
      }]
    }, {
      id: 'OWNER-F8-07',
      type: 'decision',
      title: '현장 입장 (연락처 뒤 4자리)',
      branches: [{
        cond: '재원생·기존 예약',
        nodes: [{
          id: 'OWNER-F8-08',
          type: 'state',
          title: '체크인',
          state: 'reserved → entered',
          sms: '입장 완료'
        }]
      }, {
        cond: '재원생·무예약',
        nodes: [{
          id: 'OWNER-F8-09',
          type: 'state',
          title: '즉석 예약 + 체크인',
          state: '→ entered',
          sms: '입장 완료'
        }]
      }, {
        cond: '비재원생',
        nodes: [{
          id: 'OWNER-F8-10',
          type: 'action',
          title: '수동예약 등록 안내'
        }]
      }]
    }]
  }, {
    id: 'OWNER-F9',
    name: '모바일 프리뷰',
    desc: '테스트 전용',
    nodes: [{
      id: 'OWNER-F9-01',
      type: 'screen',
      title: '폰 프레임 안 MobileFlow 구동',
      note: "'테스트 전용 · 실제 문자 미발송' 배지."
    }, {
      id: 'OWNER-F9-02',
      type: 'state',
      title: '프리뷰 예약이 store 즉시 반영'
    }, {
      id: 'OWNER-F9-03',
      type: 'action',
      title: '초기화 (플로우 처음으로)'
    }]
  }];
  const GANGSA_FLOWS = [{
    id: 'GANGSA-F1',
    name: '로그인 & 권한 게이팅',
    desc: '강사(=직원)',
    nodes: [{
      id: 'GANGSA-F1-01',
      type: 'screen',
      title: '로그인 화면 → 강사 선택',
      note: '강사 이름 선택 후 입장.'
    }, {
      id: 'GANGSA-F1-02',
      type: 'state',
      title: '로그인 상태 저장',
      state: 'npr-user = gangsa'
    }, {
      id: 'GANGSA-F1-03',
      type: 'screen',
      title: '허브',
      note: '재원생 관리 · 통계 카드는 잠금(자물쇠) 표시.',
      gate: '재원생 관리 · 통계 비활성'
    }, {
      id: 'GANGSA-F1-04',
      type: 'decision',
      title: '접근 가능 모듈',
      branches: [{
        cond: '허용',
        nodes: [{
          id: 'GANGSA-F1-05',
          type: 'screen',
          title: '전화예약·문자·설명회 운영·상담·QR 스캐너·프리뷰',
          note: '원장 F3·F4·F5·F6·F8·F9와 동일하게 보기+동작 가능.'
        }]
      }, {
        cond: '차단',
        nodes: [{
          id: 'GANGSA-F1-06',
          type: 'gate',
          title: '재원생 관리 · 통계',
          gate: '탭 미노출'
        }]
      }]
    }]
  }, {
    id: 'GANGSA-G1',
    name: '차단 라우트 접근 시도',
    desc: '권한 잠금 처리',
    nodes: [{
      id: 'GANGSA-G1-01',
      type: 'action',
      title: '재원생 관리 / 통계 URL·라우트 직접 진입 시도'
    }, {
      id: 'GANGSA-G1-02',
      type: 'gate',
      title: '권한 없음',
      gate: 'allowed 미포함'
    }, {
      id: 'GANGSA-G1-03',
      type: 'state',
      title: '허브로 리다이렉트',
      state: 'route → hub'
    }]
  }, {
    id: 'GANGSA-F5',
    name: '설명회 운영 (강사)',
    desc: '원장 F5와 동일 — 전 기능 수행',
    nodes: [{
      id: 'GANGSA-F5-01',
      type: 'screen',
      title: 'QR 현황 대시보드',
      note: '스탯 카드·전체 명단·강사/반 필터 모두 열람. 강사 본인 담당 반 필터로 모니터링 가능.'
    }, {
      id: 'GANGSA-F5-02',
      type: 'action',
      title: '즉석 예약 · 수동 체크인 · 입장 취소 · 전환 · 명단 인쇄 · 종료',
      note: '동작 권한 있음 (→ OWNER-F5 상세 동일).'
    }]
  }];
  const PARENT_FLOWS = [{
    id: 'PARENT-P1',
    name: '설명회 선택',
    desc: '모바일 · 로그인 없음',
    nodes: [{
      id: 'PARENT-P1-01',
      type: 'start',
      title: 'mobile.html 접속',
      note: '로그인 없이 바로 예약.'
    }, {
      id: 'PARENT-P1-02',
      type: 'screen',
      title: '설명회 목록',
      note: '제목·일시·장소·잔여석 게이지 + 안내문 있으면 배지.'
    }, {
      id: 'PARENT-P1-03',
      type: 'decision',
      title: '잔여석 상태',
      branches: [{
        cond: '마감 (0석)',
        nodes: [{
          id: 'PARENT-P1-04',
          type: 'end',
          title: '카드 비활성 (선택 불가)'
        }]
      }, {
        cond: '임박 (≤15%)',
        nodes: [{
          id: 'PARENT-P1-05',
          type: 'screen',
          title: '경고 배지 표시 → 진행'
        }]
      }, {
        cond: '여유',
        nodes: [{
          id: 'PARENT-P1-06',
          type: 'screen',
          title: '→ 재원생 예약 (P2)'
        }]
      }]
    }]
  }, {
    id: 'PARENT-P2',
    name: '재원생 예약 (가족 포함)',
    desc: '단일·다중(형제)',
    nodes: [{
      id: 'PARENT-P2-01',
      type: 'screen',
      title: '재원생 예약 화면',
      note: '설명회 정보 + 안내문(있으면) 콜아웃.'
    }, {
      id: 'PARENT-P2-02',
      type: 'action',
      title: '학부모 연락처 입력 → 조회'
    }, {
      id: 'PARENT-P2-03',
      type: 'decision',
      title: '일치 학생?',
      branches: [{
        cond: '불일치',
        nodes: [{
          id: 'PARENT-P2-04',
          type: 'screen',
          title: '에러 안내 → 비재원생 예약 유도 (P3)'
        }]
      }, {
        cond: '일치',
        nodes: [{
          id: 'PARENT-P2-05',
          type: 'action',
          title: '학생 카드 다중 체크 선택 (최대 3, 형제)'
        }, {
          id: 'PARENT-P2-06',
          type: 'decision',
          title: 'attendField?',
          branches: [{
            cond: 'true',
            nodes: [{
              id: 'PARENT-P2-07',
              type: 'action',
              title: '자녀당 참석 인원 선택'
            }]
          }]
        }, {
          id: 'PARENT-P2-08',
          type: 'decision',
          title: '하단 CTA',
          branches: [{
            cond: '1명',
            nodes: [{
              id: 'PARENT-P2-09',
              type: 'state',
              title: '○○ 학생으로 예약',
              state: '→ reserved',
              sms: '예약 확정 + QR'
            }]
          }, {
            cond: 'N명',
            nodes: [{
              id: 'PARENT-P2-10',
              type: 'state',
              title: 'N명 예약하기 (각자 QR)',
              state: '+N Reservation · groupId',
              sms: '자녀별 개별 확정'
            }]
          }]
        }, {
          id: 'PARENT-P2-11',
          type: 'screen',
          title: '예약 완료 티켓',
          note: 'QR·예약자·일시·예약번호 + (가족 시) 자녀별 목록.'
        }]
      }]
    }]
  }, {
    id: 'PARENT-P3',
    name: '비재원생 예약',
    nodes: [{
      id: 'PARENT-P3-01',
      type: 'action',
      title: "'비재원생 예약하기' 링크"
    }, {
      id: 'PARENT-P3-02',
      type: 'screen',
      title: '폼: 이름*·학교·학년·연락처*'
    }, {
      id: 'PARENT-P3-03',
      type: 'decision',
      title: 'attendField?',
      branches: [{
        cond: 'true',
        nodes: [{
          id: 'PARENT-P3-04',
          type: 'action',
          title: '참석 인원 선택'
        }]
      }]
    }, {
      id: 'PARENT-P3-05',
      type: 'state',
      title: '예약 생성 (member=false)',
      state: '→ reserved',
      sms: '예약 확정 + QR'
    }]
  }, {
    id: 'PARENT-P4',
    name: '예약 조회 · 변경 · 취소',
    desc: '셀프 관리',
    nodes: [{
      id: 'PARENT-P4-01',
      type: 'action',
      title: "목록 하단 '예약 조회 · 변경 · 취소' 링크"
    }, {
      id: 'PARENT-P4-02',
      type: 'screen',
      title: '예약 조회 (연락처 + 예약번호)'
    }, {
      id: 'PARENT-P4-03',
      type: 'decision',
      title: '일치?',
      branches: [{
        cond: '불일치',
        nodes: [{
          id: 'PARENT-P4-04',
          type: 'screen',
          title: '에러 안내'
        }]
      }, {
        cond: '일치',
        nodes: [{
          id: 'PARENT-P4-05',
          type: 'screen',
          title: '내 예약 티켓 (상태·이력)'
        }, {
          id: 'PARENT-P4-06',
          type: 'decision',
          title: '관리 선택',
          branches: [{
            cond: '예약 변경',
            nodes: [{
              id: 'PARENT-P4-07',
              type: 'screen',
              title: '회차 선택 시트(잔여석)'
            }, {
              id: 'PARENT-P4-08',
              type: 'state',
              title: '설명회 이동 (QR 유지)',
              state: 'sessionId 이동 · history[]',
              sms: '변경 확정'
            }]
          }, {
            cond: '예약 취소',
            nodes: [{
              id: 'PARENT-P4-09',
              type: 'decision',
              title: '취소 확인 (시작 24h 전)'
            }, {
              id: 'PARENT-P4-10',
              type: 'state',
              title: '취소',
              state: '→ cancelled (by parent)',
              sms: '취소 확인'
            }]
          }]
        }]
      }]
    }]
  }, {
    id: 'PARENT-P5',
    name: '상담 신청',
    nodes: [{
      id: 'PARENT-P5-01',
      type: 'screen',
      title: "예약 완료 화면 '개별 상담 신청'"
    }, {
      id: 'PARENT-P5-02',
      type: 'screen',
      title: '슬롯 선택 (강사별 가능 시간)'
    }, {
      id: 'PARENT-P5-03',
      type: 'state',
      title: '상담 신청 생성',
      state: '+CounselBooking',
      sms: '상담 확정 · 리마인드'
    }, {
      id: 'PARENT-P5-04',
      type: 'end',
      title: '신청 완료 → 콘솔 상담 목록 반영 (OWNER-F6)'
    }]
  }, {
    id: 'PARENT-P6',
    name: '만족도 설문',
    nodes: [{
      id: 'PARENT-P6-01',
      type: 'screen',
      title: "목록 하단 '만족도 설문' 링크"
    }, {
      id: 'PARENT-P6-02',
      type: 'action',
      title: '별점(1~5) + 객관식 3문항 + 주관식 1'
    }, {
      id: 'PARENT-P6-03',
      type: 'decision',
      title: '제출 가능?',
      note: '별점 미선택 시 비활성.',
      branches: [{
        cond: '가능',
        nodes: [{
          id: 'PARENT-P6-04',
          type: 'state',
          title: '응답 저장',
          state: '+SurveyResponse'
        }, {
          id: 'PARENT-P6-05',
          type: 'end',
          title: '감사 화면'
        }]
      }]
    }]
  }];
  window.NPR_FLOWS = {
    personas: [{
      key: 'owner',
      name: '원장',
      role: '학원 총괄 · 최고 관리자',
      goal: '설명회 전 과정을 한눈에 관리하고 참석·전환 성과를 확인한다.',
      entry: '로그인(원장) → 허브 8개 모듈 전체',
      scenario: ['설명회 기획·생성(페이지 꾸미기 포함)', '예약·현장 입장 현황 점검', '통계로 참석률·전환율 리뷰', '상담 연계·리마인드·설문 운영 총괄'],
      perms: [{
        label: '전체 8모듈',
        on: true
      }, {
        label: '통계',
        on: true
      }, {
        label: '재원생 관리',
        on: true
      }],
      flows: OWNER_FLOWS
    }, {
      key: 'siljang',
      name: '실장',
      role: '운영 실무 총괄 · 원장 대행',
      goal: '원장과 100% 동일 권한으로 일상 운영 전반을 집행한다.',
      entry: '로그인(실장) → 허브 8개 모듈 전체 (원장과 동일)',
      scenario: ['예약 접수·수동예약 등록', '문자 발송·리마인드 운영', '현장 QR 입장·명단 관리', '상담 배정·설문 발송'],
      perms: [{
        label: '원장과 동일',
        on: true
      }, {
        label: '전체 8모듈',
        on: true
      }, {
        label: '통계',
        on: true
      }],
      note: '실장 권한은 원장과 100% 동일합니다. 아래 플로우는 원장(OWNER-*)과 동일한 흐름을 그대로 따릅니다.',
      flows: OWNER_FLOWS
    }, {
      key: 'gangsa',
      name: '강사',
      role: '강의 · 현장 운영 지원 (=직원)',
      goal: '현장 입장·예약·문자·상담 등 운영을 지원한다. 전체 명단·통계는 제외.',
      entry: '로그인(강사) → 허브(재원생 관리·통계 잠금)',
      scenario: ['전화예약 접수·상세 관리', '설명회 명단 확인·현장 체크인', 'QR 스캐너로 입장 처리', '상담 안내·문자 발송'],
      perms: [{
        label: '설명회·전화·문자·상담·QR',
        on: true
      }, {
        label: '재원생 관리',
        on: false
      }, {
        label: '통계',
        on: false
      }],
      note: '강사(=직원)는 재원생 관리(전체 명단)·통계 대시보드만 접근 불가입니다. 그 외 전화예약·문자·설명회 운영·상담·QR 스캐너·프리뷰는 원장과 동일하게 보기+동작 가능 — 아래는 로그인/게이팅과 설명회 운영 델타만 표기하며, 나머지는 OWNER-F3·F4·F6·F8·F9를 그대로 따릅니다.',
      flows: GANGSA_FLOWS
    }, {
      key: 'parent',
      name: '학부모 / 학생',
      role: '설명회 예약자 (모바일)',
      goal: '자녀 설명회를 예약·관리하고 상담을 신청한다.',
      entry: 'mobile.html — 로그인 없음',
      scenario: ['설명회 선택·예약(가족 동시 예약 포함)', '예약 조회·회차 변경·취소', '입장 완료 후 개별 상담 신청', '종료 후 만족도 설문 응답'],
      perms: [{
        label: '모바일 예약',
        on: true
      }, {
        label: '콘솔 접근',
        on: false
      }, {
        label: '로그인',
        on: false
      }],
      flows: PARENT_FLOWS
    }]
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/flow-data.js", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/flow-ui.jsx
try { (() => {
/* npr 유저플로우 문서 — 렌더러 (문서형, 세로 스크롤)
   노드 타입: start/screen/action/decision/state/sms/gate/end
   데이터: window.NPR_FLOWS (flow-data.js) */

const NPRFT = {
  start: {
    label: '시작',
    color: 'var(--mint-500)',
    bg: 'var(--mint-50)',
    fg: 'var(--mint-700)'
  },
  screen: {
    label: '화면',
    color: 'var(--violet-700)',
    bg: 'var(--violet-50)',
    fg: 'var(--violet-800)'
  },
  action: {
    label: '동작',
    color: 'var(--gray-3)',
    bg: 'var(--surface-sunken)',
    fg: 'var(--text-muted)'
  },
  decision: {
    label: '분기',
    color: 'var(--status-warning)',
    bg: 'var(--status-warning-soft)',
    fg: 'var(--status-warning)'
  },
  state: {
    label: '상태',
    color: 'var(--status-success)',
    bg: 'var(--status-success-soft)',
    fg: 'var(--status-success)'
  },
  sms: {
    label: '문자',
    color: 'var(--status-info)',
    bg: 'var(--status-info-soft)',
    fg: 'var(--status-info)'
  },
  gate: {
    label: '잠금',
    color: 'var(--status-danger)',
    bg: 'var(--status-danger-soft)',
    fg: 'var(--status-danger)'
  },
  end: {
    label: '종료',
    color: 'var(--violet-950)',
    bg: 'var(--surface-brand-soft)',
    fg: 'var(--violet-900)'
  }
};
const nprIdChip = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.02em',
  color: 'var(--text-muted)',
  background: 'var(--surface-sunken)',
  border: '1px solid var(--border-hairline)',
  borderRadius: 5,
  padding: '2px 6px'
};
const nprTypeChip = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '0.04em',
  borderRadius: 999,
  padding: '2px 9px'
};
const nprMetaChip = (fg, bg) => ({
  fontSize: 11,
  fontWeight: 600,
  color: fg,
  background: bg,
  borderRadius: 6,
  padding: '3px 8px',
  display: 'inline-flex',
  gap: 4,
  alignItems: 'center'
});
function NPRConnector() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 2,
      height: 18,
      background: 'var(--border-strong)',
      margin: '7px 0 7px 24px',
      borderRadius: 2
    }
  });
}
function NPRNode({
  node,
  last
}) {
  const t = NPRFT[node.type] || NPRFT.action;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-hairline)',
      borderLeft: `4px solid ${t.color}`,
      borderRadius: 'var(--radius-md)',
      padding: '12px 15px',
      boxShadow: 'var(--shadow-card)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: nprIdChip
  }, node.id), /*#__PURE__*/React.createElement("span", {
    style: {
      ...nprTypeChip,
      background: t.bg,
      color: t.fg
    }
  }, t.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 14,
      color: 'var(--text-strong)'
    }
  }, node.title)), node.note && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      marginTop: 6,
      lineHeight: 1.55
    }
  }, node.note), (node.state || node.sms || node.gate) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      marginTop: 9
    }
  }, node.state && /*#__PURE__*/React.createElement("span", {
    style: nprMetaChip('var(--status-success)', 'var(--status-success-soft)')
  }, "\uC0C1\uD0DC \xB7 ", node.state), node.sms && /*#__PURE__*/React.createElement("span", {
    style: nprMetaChip('var(--status-info)', 'var(--status-info-soft)')
  }, "\uBB38\uC790 \xB7 ", node.sms), node.gate && /*#__PURE__*/React.createElement("span", {
    style: nprMetaChip('var(--status-danger)', 'var(--status-danger-soft)')
  }, "\uAD8C\uD55C \xB7 ", node.gate))), node.branches ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      marginTop: 12,
      marginLeft: 18,
      flexWrap: 'wrap'
    }
  }, node.branches.map((b, bi) => /*#__PURE__*/React.createElement("div", {
    key: bi,
    style: {
      flex: '1 1 300px',
      minWidth: 270,
      borderLeft: '2px dashed var(--border-strong)',
      paddingLeft: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 12,
      fontWeight: 800,
      color: 'var(--status-warning)',
      background: 'var(--status-warning-soft)',
      borderRadius: 999,
      padding: '3px 11px'
    }
  }, "\u25C7 ", b.cond), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, (b.nodes || []).map((n, i) => /*#__PURE__*/React.createElement(NPRNode, {
    key: n.id || i,
    node: n,
    last: i === b.nodes.length - 1
  })))))) : !last && /*#__PURE__*/React.createElement(NPRConnector, null));
}
function NPRFlow({
  flow
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 26
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'ui-monospace, Menlo, monospace',
      fontSize: 12,
      fontWeight: 800,
      color: '#fff',
      background: 'var(--violet-800)',
      borderRadius: 7,
      padding: '4px 9px'
    }
  }, flow.id), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 17,
      fontWeight: 800,
      color: 'var(--text-strong)'
    }
  }, flow.name), flow.desc && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-faint)'
    }
  }, flow.desc)), /*#__PURE__*/React.createElement("div", null, flow.nodes.map((n, i) => /*#__PURE__*/React.createElement(NPRNode, {
    key: n.id || i,
    node: n,
    last: i === flow.nodes.length - 1
  }))));
}
function NPRPersonaCard({
  p
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.1fr 1fr',
      gap: 18,
      padding: '24px 26px',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--surface-brand)',
      color: 'var(--text-on-brand)',
      boxShadow: 'var(--shadow-raised)',
      overflow: 'hidden',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: -50,
      right: -40,
      width: 180,
      height: 180,
      borderRadius: '50%',
      background: 'rgba(56,189,248,0.14)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 46,
      height: 46,
      borderRadius: '50%',
      background: 'rgba(56,189,248,0.2)',
      color: 'var(--mint-400)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 18
    }
  }, p.name[0]), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 20
    }
  }, p.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--mint-400)',
      fontWeight: 700
    }
  }, p.role))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      opacity: 0.6
    }
  }, "\uBAA9\uD45C"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      lineHeight: 1.55,
      marginTop: 4,
      opacity: 0.95
    }
  }, p.goal)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      opacity: 0.6
    }
  }, "\uC8FC\uC694 \uC9C4\uC785\uC810"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      lineHeight: 1.5,
      marginTop: 4,
      opacity: 0.9
    }
  }, p.entry))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      opacity: 0.6
    }
  }, "\uC774\uC6A9 \uC2DC\uB098\uB9AC\uC624"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      marginTop: 8
    }
  }, p.scenario.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      gap: 9,
      alignItems: 'flex-start',
      fontSize: 13,
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flexShrink: 0,
      width: 18,
      height: 18,
      borderRadius: '50%',
      background: 'rgba(248,250,252,0.14)',
      color: 'var(--mint-400)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 10.5,
      fontWeight: 800,
      marginTop: 1
    }
  }, i + 1), /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.92
    }
  }, s)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, p.perms.map(pm => /*#__PURE__*/React.createElement("span", {
    key: pm.label,
    style: {
      fontSize: 11.5,
      fontWeight: 700,
      borderRadius: 999,
      padding: '4px 11px',
      background: pm.on ? 'rgba(56,189,248,0.18)' : 'rgba(220,38,38,0.22)',
      color: pm.on ? 'var(--mint-400)' : '#FCA5A5'
    }
  }, pm.on ? '' : '✕ ', pm.label)))));
}
function NPRLegend() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
      alignItems: 'center',
      padding: '14px 18px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-card)',
      border: '1px solid var(--border-hairline)',
      boxShadow: 'var(--shadow-card)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: 'var(--text-muted)',
      marginRight: 4
    }
  }, "\uB178\uB4DC"), Object.keys(NPRFT).map(k => /*#__PURE__*/React.createElement("span", {
    key: k,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 12,
      color: 'var(--text-body)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 11,
      height: 11,
      borderRadius: 3,
      background: NPRFT[k].color
    }
  }), NPRFT[k].label)), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      height: 18,
      background: 'var(--border-hairline)',
      margin: '0 4px'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--text-faint)'
    }
  }, "\u25C7 \uBD84\uAE30 \uC870\uAC74 \xB7 \uC0C1\uD0DC/\uBB38\uC790/\uAD8C\uD55C \uCE69\uC740 \uB178\uB4DC\uC5D0 \uD45C\uAE30"));
}
function NPRFlowApp() {
  const D = window.NPR_FLOWS;
  const [active, setActive] = React.useState(D.personas[0].key);
  const persona = D.personas.find(p => p.key === active);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1120,
      margin: '0 auto',
      padding: '40px 28px 100px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      color: 'var(--text-accent)'
    }
  }, "USER FLOW \xB7 \uAD8C\uD55C\uBCC4"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 34,
      fontWeight: 800,
      letterSpacing: 'var(--tracking-display)',
      marginTop: 8
    }
  }, "npr \uC785\uC2DC\uC124\uBA85\uD68C \uC6B4\uC601 \uC2DC\uC2A4\uD15C \u2014 \uC720\uC800\uD50C\uB85C\uC6B0"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--text-muted)',
      marginTop: 10,
      lineHeight: 1.6,
      maxWidth: 720
    }
  }, "\uD398\uB974\uC18C\uB098\uBCC4 \uC804\uCCB4 \uCF00\uC774\uC2A4 \uD750\uB984. \uAC01 \uB178\uB4DC\uB294 \uC548\uC815 ID(\uC608: ", /*#__PURE__*/React.createElement("code", {
    style: {
      fontFamily: 'ui-monospace, Menlo, monospace',
      background: 'var(--surface-sunken)',
      padding: '1px 5px',
      borderRadius: 4
    }
  }, "OWNER-F5-04"), ")\uB85C \uC2DD\uBCC4\uB418\uBA70, \uBD84\uAE30\xB7\uC0C1\uD0DC \uBCC0\uD654\xB7\uBB38\uC790 \uD2B8\uB9AC\uAC70\xB7\uAD8C\uD55C \uC7A0\uAE08\uC744 \uD45C\uAE30\uD574 E2E \uD14C\uC2A4\uD2B8/\uB514\uBC84\uAE45\uC5D0 \uC0AC\uC6A9\uD569\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(NPRLegend, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 20,
      background: 'var(--surface-page)',
      paddingTop: 18,
      paddingBottom: 12,
      marginTop: 26,
      borderBottom: '1px solid var(--border-hairline)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, D.personas.map(p => /*#__PURE__*/React.createElement("button", {
    key: p.key,
    onClick: () => setActive(p.key),
    style: {
      padding: '9px 16px',
      borderRadius: 999,
      border: active === p.key ? '1.5px solid var(--violet-800)' : '1px solid var(--border-soft)',
      background: active === p.key ? 'var(--violet-800)' : 'var(--surface-card)',
      color: active === p.key ? '#fff' : 'var(--text-body)',
      fontSize: 13.5,
      fontWeight: 700,
      cursor: 'pointer',
      fontFamily: 'var(--font-body)'
    }
  }, p.name, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.7,
      fontWeight: 500,
      fontSize: 12
    }
  }, "\xB7 ", p.flows.length, " flows"))))), /*#__PURE__*/React.createElement("div", {
    key: persona.key,
    style: {
      marginTop: 26,
      animation: 'ds-fade-up var(--dur-base) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement(NPRPersonaCard, {
    p: persona
  }), persona.note && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      padding: '13px 16px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-accent-soft)',
      color: 'var(--mint-700)',
      fontSize: 13,
      lineHeight: 1.55
    }
  }, persona.note), persona.flows.map(f => /*#__PURE__*/React.createElement(NPRFlow, {
    key: f.id,
    flow: f
  }))));
}
window.NPRFlowApp = NPRFlowApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/flow-ui.jsx", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/icons.jsx
try { (() => {
/* npr 콘솔 아이콘 — Lucide 패스 인라인 (stroke 2, round) */
const NIc = ({
  size = 16,
  sw = 2,
  style,
  children
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: sw,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  style: style
}, children);
window.NPRIcons = {
  users: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "7",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
  })),
  phone: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"
  })),
  message: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
  })),
  qr: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "3",
    width: "7",
    height: "7",
    rx: "1"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14",
    y: "3",
    width: "7",
    height: "7",
    rx: "1"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "14",
    width: "7",
    height: "7",
    rx: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 14h3v3M21 14v.01M14 21v.01M21 21v-3h-3"
  })),
  tablet: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("rect", {
    x: "4",
    y: "2",
    width: "16",
    height: "20",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 18h.01"
  })),
  smartphone: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("rect", {
    x: "5",
    y: "2",
    width: "14",
    height: "20",
    rx: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 18h.01"
  })),
  monitor: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "3",
    width: "20",
    height: "14",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 21h8M12 17v4"
  })),
  plus: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M12 5v14M5 12h14"
  })),
  search: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 21-4.3-4.3"
  })),
  filter: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M22 3H2l8 9.46V19l4 2v-8.54Z"
  })),
  trash: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
  })),
  send: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "m22 2-7 20-4-9-9-4Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M22 2 11 13"
  })),
  check: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  })),
  x: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  })),
  arrowLeft: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M19 12H5m6 6-6-6 6-6"
  })),
  arrowRight: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14m-6-6 6 6-6 6"
  })),
  camera: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "13",
    r: "3"
  })),
  calendar: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "4",
    width: "18",
    height: "18",
    rx: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 2v4M8 2v4M3 10h18"
  })),
  mapPin: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "10",
    r: "3"
  })),
  clock: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 7v5l3 2"
  })),
  bell: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10.3 21a1.94 1.94 0 0 0 3.4 0"
  })),
  ticket: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M2 9a3 3 0 0 1 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M13 5v2M13 17v2M13 11v2"
  })),
  refresh: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M3 12a9 9 0 0 1 15-6.7L21 8M21 12a9 9 0 0 1-15 6.7L3 16"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M21 3v5h-5M3 21v-5h5"
  })),
  battery: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "7",
    width: "16",
    height: "10",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M22 11v2"
  })),
  eye: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  })),
  save: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 21v-8H7v8M7 3v5h8"
  })),
  logIn: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"
  })),
  chevronDown: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "m6 9 6 6 6-6"
  })),
  sparkle: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z"
  })),
  graduationCap: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M22 10 12 5 2 10l10 5 10-5v6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 12.5V16a6 3 0 0 0 12 0v-3.5"
  })),
  rotateCcw: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M3 12a9 9 0 1 0 3-6.7L3 8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 3v5h5"
  })),
  edit: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M12 20h9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"
  })),
  star: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z"
  })),
  upload: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 8l-5-5-5 5M12 3v12"
  })),
  download: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 10l5 5 5-5M12 15V3"
  })),
  printer: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "6",
    y: "14",
    width: "12",
    height: "8",
    rx: "1"
  })),
  barChart: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M3 3v18h18"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "7",
    y: "10",
    width: "3",
    height: "7",
    rx: "0.5"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "12",
    y: "6",
    width: "3",
    height: "11",
    rx: "0.5"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "17",
    y: "13",
    width: "3",
    height: "4",
    rx: "0.5"
  })),
  pieChart: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M21.21 15.89A10 10 0 1 1 8 2.83"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M22 12A10 10 0 0 0 12 2v10z"
  })),
  trendingUp: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M22 7 13.5 15.5 8.5 10.5 2 17"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 7h6v6"
  })),
  lock: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "11",
    width: "18",
    height: "11",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 11V7a5 5 0 0 1 10 0v4"
  })),
  logOut: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
  })),
  userCheck: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "7",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m16 11 2 2 4-4"
  })),
  user: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "7",
    r: "4"
  })),
  image: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "3",
    width: "18",
    height: "18",
    rx: "2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "9",
    r: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"
  })),
  clipboard: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("rect", {
    x: "8",
    y: "2",
    width: "8",
    height: "4",
    rx: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
  })),
  alertTriangle: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 9v4M12 17h.01"
  })),
  fileText: p => /*#__PURE__*/React.createElement(NIc, p, /*#__PURE__*/React.createElement("path", {
    d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 2v6h6M16 13H8M16 17H8M10 9H8"
  }))
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/icons.jsx", error: String((e && e.message) || e) }); }

// ui_kits/npr-admin/shared.jsx
try { (() => {
/* npr 콘솔 공용 조각 — QR 플레이스홀더, 상태 배지, 통계 카드, 유틸 */

function nprQrCells(code, n = 11) {
  let seed = 0;
  for (let i = 0; i < code.length; i++) seed = seed * 31 + code.charCodeAt(i) >>> 0;
  const out = [];
  for (let i = 0; i < n * n; i++) {
    seed = seed * 1103515245 + 12345 >>> 0;
    out.push((seed >> 16) % 2 === 0);
  }
  return out;
}

/* QR 이미지 플레이스홀더 (실 QR 연동 전) */
function QrBox({
  code = 'NPR-0000',
  size = 120,
  style
}) {
  const n = 11;
  const cells = nprQrCells(code, n);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      background: '#FFFFFF',
      border: '1px solid var(--mint-200)',
      borderRadius: 'var(--radius-xs)',
      padding: size * 0.08,
      display: 'grid',
      gridTemplateColumns: `repeat(${n}, 1fr)`,
      gap: 1,
      boxSizing: 'border-box',
      flexShrink: 0,
      ...style
    }
  }, cells.map((on, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      background: on ? 'var(--violet-950)' : 'transparent',
      borderRadius: 0.5
    }
  })));
}
function ResStatusBadge({
  status,
  size = 'md'
}) {
  const {
    Badge
  } = window.DesignSystem_179b2a;
  if (status === 'entered') return /*#__PURE__*/React.createElement(Badge, {
    tone: "success",
    dot: true,
    size: size
  }, "\uC785\uC7A5 \uC644\uB8CC");
  if (status === 'cancelled') return /*#__PURE__*/React.createElement(Badge, {
    tone: "danger",
    size: size
  }, "\uCDE8\uC18C\uB428");
  if (status === 'no_show') return /*#__PURE__*/React.createElement(Badge, {
    tone: "warning",
    size: size
  }, "\uB178\uC1FC");
  return /*#__PURE__*/React.createElement(Badge, {
    tone: "warning",
    dot: true,
    size: size
  }, "\uBBF8\uCCB4\uD06C");
}
function StatCard({
  label,
  value,
  suffix,
  tone = 'brand',
  icon,
  delay = 0,
  onClick,
  active
}) {
  const tones = {
    brand: 'var(--violet-800)',
    accent: 'var(--mint-600)',
    danger: 'var(--status-danger)',
    success: 'var(--status-success)',
    neutral: 'var(--text-muted)'
  };
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      background: active ? 'var(--surface-brand-soft)' : 'var(--surface-card)',
      border: active ? '1.5px solid var(--violet-800)' : '1px solid var(--border-hairline)',
      borderRadius: 'var(--radius-lg)',
      padding: '18px 20px',
      boxShadow: 'var(--shadow-card)',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all var(--dur-fast) var(--ease-out)',
      animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${delay}ms both`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12.5,
      color: 'var(--text-muted)',
      fontWeight: 600
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    style: {
      color: tones[tone],
      display: 'inline-flex'
    }
  }, icon), label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 5,
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 30,
      color: tones[tone],
      fontFeatureSettings: '"tnum"'
    }
  }, value), suffix && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-faint)'
    }
  }, suffix)));
}
function EmptyState({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '44px 0',
      textAlign: 'center',
      color: 'var(--text-faint)',
      fontSize: 14,
      animation: 'ds-fade-in var(--dur-base) both'
    }
  }, children);
}

/* 필드 라벨 + 값 (읽기 전용 행) */
function KV({
  k,
  v
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      letterSpacing: 'var(--tracking-caps)',
      color: 'var(--text-faint)',
      fontWeight: 700
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14.5,
      fontWeight: 600,
      color: 'var(--text-strong)'
    }
  }, v));
}
const nprChannelLabel = {
  phone: '전화',
  mobile: '모바일',
  manual: '수동'
};
Object.assign(window, {
  QrBox,
  ResStatusBadge,
  StatCard,
  EmptyState,
  KV,
  nprQrCells,
  nprChannelLabel
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/npr-admin/shared.jsx", error: String((e && e.message) || e) }); }

// ui_kits/reservation/AdminScreen.jsx
try { (() => {
/* 관리자 대시보드 — 대학 입학처용 */
function AdminScreen() {
  const {
    Card,
    Badge,
    Button,
    Tabs,
    Switch
  } = window.DesignSystem_179b2a;
  const I = window.DSRIcons;
  const D = window.DSR_DATA;
  const [range, setRange] = React.useState('week');
  const [open, setOpen] = React.useState(true);
  const useCountUp = (target, dur = 1100) => {
    const [n, setN] = React.useState(0);
    React.useEffect(() => {
      let raf, t0;
      const tick = t => {
        if (!t0) t0 = t;
        const p = Math.min(1, (t - t0) / dur);
        setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [target]);
    return n;
  };
  const total = useCountUp(1284);
  const today = useCountUp(96);
  const waitlist = useCountUp(41);
  const rate = useCountUp(87);
  const Stat = ({
    label,
    value,
    suffix,
    trend,
    delay
  }) => /*#__PURE__*/React.createElement(Card, {
    padding: "22px 24px",
    style: {
      animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${delay}ms both`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      fontWeight: 600
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 6,
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 34,
      color: 'var(--text-strong)',
      fontFeatureSettings: '"tnum"'
    }
  }, value.toLocaleString()), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--text-faint)'
    }
  }, suffix)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      marginTop: 10,
      fontSize: 12,
      fontWeight: 700,
      color: 'var(--status-success)'
    }
  }, /*#__PURE__*/React.createElement(I.trendUp, {
    size: 13
  }), " ", trend, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-faint)',
      fontWeight: 500
    }
  }, "\uC9C0\uB09C\uC8FC \uB300\uBE44")));
  const recent = [{
    name: '김수민',
    type: '수험생',
    session: '수시 입학설명회 · 2회차',
    seat: '나열 7번',
    time: '방금 전',
    status: 'confirmed'
  }, {
    name: '박정호',
    type: '학부모',
    session: '수시 입학설명회 · 3회차',
    seat: '라열 2번',
    time: '4분 전',
    status: 'confirmed'
  }, {
    name: '이서연',
    type: '수험생',
    session: '수시 입학설명회 · 2회차',
    seat: '-',
    time: '11분 전',
    status: 'waiting'
  }, {
    name: '최은우',
    type: '교사',
    session: '교사 초청 전형 설명회',
    seat: '가열 12번',
    time: '23분 전',
    status: 'confirmed'
  }, {
    name: '한지민',
    type: '학부모',
    session: '수시 입학설명회 · 1회차',
    seat: '-',
    time: '31분 전',
    status: 'cancelled'
  }];
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uAD00\uB9AC\uC790 \uB300\uC2DC\uBCF4\uB4DC"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '40px var(--container-pad) 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      color: 'var(--text-accent)',
      marginBottom: 8
    }
  }, "ADMIN \xB7 \uD55C\uAD6D\uB300\uD559\uAD50 \uC785\uD559\uCC98"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--text-h1)',
      fontWeight: 800
    }
  }, "\uC608\uC57D \uD604\uD669")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    variant: "pill",
    items: [{
      label: '오늘',
      value: 'day'
    }, {
      label: '이번 주',
      value: 'week'
    }, {
      label: '전체',
      value: 'all'
    }],
    value: range,
    onChange: setRange
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: /*#__PURE__*/React.createElement(I.download, {
      size: 15
    })
  }, "\uBA85\uB2E8 \uB0B4\uBCF4\uB0B4\uAE30"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 16,
      marginTop: 26
    }
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "\uB204\uC801 \uC608\uC57D",
    value: total,
    suffix: "\uAC74",
    trend: "+12.4%",
    delay: 0
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "\uC624\uB298 \uC2E0\uADDC \uC608\uC57D",
    value: today,
    suffix: "\uAC74",
    trend: "+8.1%",
    delay: 70
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "\uB300\uAE30\uC790",
    value: waitlist,
    suffix: "\uBA85",
    trend: "+5\uBA85",
    delay: 140
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "\uCC38\uC11D\uB960",
    value: rate,
    suffix: "%",
    trend: "+2.3%p",
    delay: 210
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.1fr 1fr',
      gap: 16,
      marginTop: 16,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "24px 26px",
    style: {
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 280ms both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 'var(--text-h3)',
      fontWeight: 700
    }
  }, "\uD68C\uCC28\uBCC4 \uC608\uC57D\uB960 \u2014 \uC218\uC2DC \uC785\uD559\uC124\uBA85\uD68C"), /*#__PURE__*/React.createElement(Switch, {
    label: "\uC608\uC57D \uC811\uC218",
    checked: open,
    onChange: setOpen
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 15
    }
  }, [{
    label: '1회차 · 10:00',
    pct: 100,
    note: '마감'
  }, {
    label: '2회차 · 14:00',
    pct: 87,
    note: '38석 남음'
  }, {
    label: '3회차 · 17:00',
    pct: 60,
    note: '121석 남음'
  }].map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 13,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      color: 'var(--text-strong)'
    }
  }, r.label), /*#__PURE__*/React.createElement("span", {
    style: {
      color: r.pct === 100 ? 'var(--status-danger)' : 'var(--text-muted)',
      fontWeight: 600,
      fontFeatureSettings: '"tnum"'
    }
  }, r.pct, "% \xB7 ", r.note)), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 10,
      borderRadius: 5,
      background: 'var(--gray-2)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      width: `${r.pct}%`,
      borderRadius: 5,
      background: r.pct === 100 ? 'var(--gray-3)' : 'linear-gradient(90deg, var(--violet-800), var(--violet-500))',
      transformOrigin: 'left',
      animation: `ds-grow-x var(--dur-hero) var(--ease-smooth) ${350 + i * 140}ms both`
    }
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18,
      padding: '12px 16px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--mint-50)',
      border: '1px solid var(--mint-200)',
      fontSize: 13,
      color: 'var(--mint-700)',
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(I.bell, {
    size: 15
  }), " 2\uD68C\uCC28\uAC00 90%\uC5D0 \uAC00\uAE4C\uC6CC\uC694 \u2014 \uB300\uAE30 \uC811\uC218 \uC804\uD658\uC744 \uC900\uBE44\uD558\uC138\uC694.")), /*#__PURE__*/React.createElement(Card, {
    padding: "24px 26px",
    style: {
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 350ms both'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 'var(--text-h3)',
      fontWeight: 700,
      marginBottom: 14
    }
  }, "\uC2E4\uC2DC\uAC04 \uC608\uC57D"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column'
    }
  }, recent.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '11px 0',
      borderBottom: i < recent.length - 1 ? '1px solid var(--border-hairline)' : 'none',
      animation: `ds-slide-in-right var(--dur-base) var(--ease-out) ${420 + i * 70}ms both`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 34,
      height: 34,
      borderRadius: '50%',
      background: 'var(--violet-50)',
      color: 'var(--violet-800)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 13,
      fontWeight: 700,
      flexShrink: 0
    }
  }, r.name[0]), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13.5,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, r.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--text-faint)',
      marginLeft: 6
    }
  }, r.type), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-muted)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, r.session, " ", r.seat !== '-' && `· ${r.seat}`)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-faint)',
      flexShrink: 0
    }
  }, r.time), r.status === 'confirmed' && /*#__PURE__*/React.createElement(Badge, {
    tone: "success",
    size: "sm"
  }, "\uD655\uC815"), r.status === 'waiting' && /*#__PURE__*/React.createElement(Badge, {
    tone: "accent",
    size: "sm"
  }, "\uB300\uAE30"), r.status === 'cancelled' && /*#__PURE__*/React.createElement(Badge, {
    tone: "danger",
    size: "sm"
  }, "\uCDE8\uC18C"))))))));
}
window.AdminScreen = AdminScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/reservation/AdminScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/reservation/BookingScreen.jsx
try { (() => {
/* 예약 플로우 — 회차 → 좌석 → 정보 입력 */
function BookingScreen({
  go,
  params
}) {
  const {
    Stepper,
    Button,
    Radio,
    Input,
    Checkbox,
    Card,
    Badge
  } = window.DesignSystem_179b2a;
  const I = window.DSRIcons;
  const s = window.DSR_DATA.sessions.find(x => x.id === params.sessionId) || window.DSR_DATA.sessions[0];
  const [step, setStep] = React.useState(0);
  const [round, setRound] = React.useState(s.rounds.find(r => r.left > 0)?.id);
  const [seat, setSeat] = React.useState(null);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [who, setWho] = React.useState('student');
  const [agree, setAgree] = React.useState(false);
  const ROWS = ['가', '나', '다', '라', '마', '바'];
  const COLS = 14;
  const taken = (r, c) => (r * 7 + c * 13 + s.id.length * 3) % 11 < 4;
  const canNext = step === 0 ? !!round : step === 1 ? !!seat : name && phone && agree;
  const roundObj = s.rounds.find(r => r.id === round);
  const next = () => {
    if (step < 2) setStep(step + 1);else go('ticket', {
      sessionId: s.id,
      round: `${roundObj.label} · ${roundObj.time}`,
      seat,
      name: name || '김수민'
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uC608\uC57D \uD50C\uB85C\uC6B0 \u2014 \uD68C\uCC28/\uC88C\uC11D/\uC815\uBCF4"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 880,
      margin: '0 auto',
      padding: '28px var(--container-pad) 120px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => go('detail', {
      sessionId: s.id
    }),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      background: 'none',
      border: 'none',
      color: 'var(--text-muted)',
      fontSize: 13.5,
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: 'var(--font-body)',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement(I.arrowLeft, {
    size: 15
  }), " ", s.university, " \xB7 ", s.title), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '26px 0 34px',
      display: 'flex',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Stepper, {
    steps: ['회차 선택', '좌석 선택', '정보 입력'],
    current: step,
    style: {
      width: 560
    }
  })), step === 0 && /*#__PURE__*/React.createElement("div", {
    key: "s0",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 'var(--text-h2)',
      fontWeight: 800,
      textAlign: 'center',
      marginBottom: 8
    }
  }, "\uCC38\uC11D\uD560 \uD68C\uCC28\uB97C \uC120\uD0DD\uD558\uC138\uC694"), s.rounds.map((r, i) => {
    const full = r.left === 0;
    const sel = round === r.id;
    return /*#__PURE__*/React.createElement("div", {
      key: r.id,
      onClick: () => !full && setRound(r.id),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '20px 24px',
        borderRadius: 'var(--radius-lg)',
        cursor: full ? 'not-allowed' : 'pointer',
        background: sel ? 'var(--surface-brand-soft)' : 'var(--surface-card)',
        border: sel ? '1.5px solid var(--violet-800)' : '1px solid var(--border-hairline)',
        boxShadow: sel ? 'var(--shadow-accent-glow)' : 'var(--shadow-card)',
        opacity: full ? 0.55 : 1,
        transform: sel ? 'scale(1.01)' : 'scale(1)',
        transition: 'all var(--dur-base) var(--ease-spring)',
        animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${i * 70}ms both`
      }
    }, /*#__PURE__*/React.createElement(Radio, {
      checked: sel,
      onChange: () => !full && setRound(r.id)
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        fontSize: 16.5,
        color: 'var(--text-strong)',
        fontFamily: 'var(--font-display)'
      }
    }, r.label), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13.5,
        color: 'var(--text-muted)',
        marginTop: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement(I.clock, {
      size: 13
    }), " ", s.date, " \xB7 ", r.time, " \uC2DC\uC791")), full ? /*#__PURE__*/React.createElement(Badge, {
      tone: "neutral"
    }, "\uB9C8\uAC10") : r.left / r.total <= 0.15 ? /*#__PURE__*/React.createElement(Badge, {
      tone: "warning",
      dot: true
    }, "\uC784\uBC15 \xB7 ", r.left, "\uC11D") : /*#__PURE__*/React.createElement(Badge, {
      tone: "brand"
    }, r.left, "\uC11D \uB0A8\uC74C"));
  })), step === 1 && /*#__PURE__*/React.createElement("div", {
    key: "s1",
    style: {
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 'var(--text-h2)',
      fontWeight: 800,
      textAlign: 'center',
      marginBottom: 24
    }
  }, "\uC88C\uC11D\uC744 \uC120\uD0DD\uD558\uC138\uC694"), /*#__PURE__*/React.createElement(Card, {
    padding: "32px",
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '72%',
      height: 34,
      borderRadius: '0 0 60px 60px',
      background: 'var(--surface-brand)',
      color: 'var(--mint-400)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11.5,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700
    }
  }, "STAGE"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 7
    }
  }, ROWS.map((row, ri) => /*#__PURE__*/React.createElement("div", {
    key: row,
    style: {
      display: 'flex',
      gap: 7,
      alignItems: 'center',
      animation: `ds-fade-up var(--dur-base) var(--ease-out) ${ri * 50}ms both`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 18,
      fontSize: 11.5,
      color: 'var(--text-faint)',
      fontWeight: 700,
      textAlign: 'center'
    }
  }, row), Array.from({
    length: COLS
  }).map((_, ci) => {
    const id = `${row}열 ${ci + 1}번`;
    const isTaken = taken(ri, ci);
    const sel = seat === id;
    return /*#__PURE__*/React.createElement("button", {
      key: ci,
      disabled: isTaken,
      onClick: () => setSeat(sel ? null : id),
      title: id,
      style: {
        width: 30,
        height: 27,
        borderRadius: '7px 7px 4px 4px',
        border: 'none',
        cursor: isTaken ? 'not-allowed' : 'pointer',
        background: sel ? 'var(--mint-500)' : isTaken ? 'var(--gray-3)' : 'var(--violet-100)',
        boxShadow: sel ? 'var(--shadow-accent-glow)' : 'inset 0 -2.5px 0 ' + (sel ? 'var(--mint-600)' : isTaken ? 'var(--gray-3)' : 'var(--violet-200)'),
        transform: sel ? 'scale(1.18)' : 'scale(1)',
        transition: 'all var(--dur-fast) var(--ease-spring)'
      }
    });
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 18
    }
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 22,
      fontSize: 12.5,
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 13,
      borderRadius: 4,
      background: 'var(--violet-100)',
      boxShadow: 'inset 0 -2px 0 var(--violet-200)'
    }
  }), " \uC120\uD0DD \uAC00\uB2A5"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 13,
      borderRadius: 4,
      background: 'var(--gray-3)'
    }
  }), " \uC608\uC57D\uB428"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 13,
      borderRadius: 4,
      background: 'var(--mint-500)'
    }
  }), " \uB0B4 \uC88C\uC11D")), seat && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 9,
      padding: '10px 18px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--surface-brand)',
      color: 'var(--gray-1)',
      fontSize: 14,
      fontWeight: 700,
      animation: 'ds-pop var(--dur-base) var(--ease-spring) both'
    }
  }, /*#__PURE__*/React.createElement(I.armchair, {
    size: 16
  }), " ", roundObj.label, " \xB7 ", seat))), step === 2 && /*#__PURE__*/React.createElement("div", {
    key: "s2",
    style: {
      maxWidth: 520,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 'var(--text-h2)',
      fontWeight: 800,
      textAlign: 'center',
      marginBottom: 6
    }
  }, "\uC608\uC57D\uC790 \uC815\uBCF4\uB97C \uC785\uB825\uD558\uC138\uC694"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(Radio, {
    label: "\uC218\uD5D8\uC0DD",
    checked: who === 'student',
    onChange: () => setWho('student')
  }), /*#__PURE__*/React.createElement(Radio, {
    label: "\uD559\uBD80\uBAA8",
    checked: who === 'parent',
    onChange: () => setWho('parent')
  }), /*#__PURE__*/React.createElement(Radio, {
    label: "\uAD50\uC0AC",
    checked: who === 'teacher',
    onChange: () => setWho('teacher')
  })), /*#__PURE__*/React.createElement(Input, {
    label: "\uC774\uB984",
    placeholder: "\uAE40\uC218\uBBFC",
    value: name,
    onChange: setName
  }), /*#__PURE__*/React.createElement(Input, {
    label: "\uD734\uB300\uD3F0 \uBC88\uD638",
    placeholder: "010-0000-0000",
    value: phone,
    onChange: setPhone,
    hint: "\uC608\uC57D \uD655\uC815 \uBB38\uC790\uB97C \uBCF4\uB0B4\uB4DC\uB824\uC694"
  }), /*#__PURE__*/React.createElement(Checkbox, {
    label: "\uAC1C\uC778\uC815\uBCF4 \uC218\uC9D1\xB7\uC774\uC6A9\uC5D0 \uB3D9\uC758\uD569\uB2C8\uB2E4 (\uD544\uC218)",
    checked: agree,
    onChange: setAgree
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(248,250,252,0.9)',
      backdropFilter: 'var(--blur-veil)',
      borderTop: '1px solid var(--border-hairline)',
      zIndex: 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 880,
      margin: '0 auto',
      padding: '14px var(--container-pad)',
      display: 'flex',
      gap: 10,
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)',
      whiteSpace: 'nowrap'
    }
  }, roundObj && /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-strong)'
    }
  }, roundObj.label), " ", seat && /*#__PURE__*/React.createElement("span", null, " \xB7 ", seat)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, step > 0 && /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    onClick: () => setStep(step - 1)
  }, "\uC774\uC804"), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    disabled: !canNext,
    onClick: next,
    iconRight: step === 2 ? /*#__PURE__*/React.createElement(I.check, {
      size: 17
    }) : /*#__PURE__*/React.createElement(I.arrowRight, {
      size: 17
    })
  }, step === 2 ? '예약 확정하기' : '다음'))))));
}
window.BookingScreen = BookingScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/reservation/BookingScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/reservation/DetailScreen.jsx
try { (() => {
/* 설명회 상세 + 예약 패널 */
function DetailScreen({
  go,
  params
}) {
  const {
    Badge,
    Button,
    Card,
    IconButton,
    Tooltip
  } = window.DesignSystem_179b2a;
  const I = window.DSRIcons;
  const s = window.DSR_DATA.sessions.find(x => x.id === params.sessionId) || window.DSR_DATA.sessions[0];
  const initial = s.university.replace(/대학교|대학/g, '').slice(0, 2);
  const InfoRow = ({
    icon,
    label,
    value
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 38,
      height: 38,
      borderRadius: 'var(--radius-sm)',
      background: 'var(--violet-50)',
      color: 'var(--violet-800)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, icon), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-faint)',
      fontWeight: 600
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14.5,
      fontWeight: 600,
      color: 'var(--text-strong)'
    }
  }, value)));
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uC124\uBA85\uD68C \uC0C1\uC138"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '28px var(--container-pad) 80px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => go('home'),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      background: 'none',
      border: 'none',
      color: 'var(--text-muted)',
      fontSize: 13.5,
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: 'var(--font-body)',
      padding: 0,
      animation: 'ds-fade-in var(--dur-base) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement(I.arrowLeft, {
    size: 15
  }), " \uC124\uBA85\uD68C \uD0D0\uC0C9\uC73C\uB85C"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      gap: 24,
      marginTop: 18,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "0",
    style: {
      overflow: 'hidden',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-brand)',
      color: 'var(--text-on-brand)',
      padding: '34px 34px 30px',
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -70,
      right: -50,
      width: 240,
      height: 240,
      borderRadius: '50%',
      background: 'rgba(56,189,248,0.12)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 18,
      alignItems: 'center',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      borderRadius: 'var(--radius-md)',
      background: 'rgba(248,250,252,0.10)',
      border: '1px solid rgba(248,250,252,0.18)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 21,
      color: 'var(--mint-400)'
    }
  }, initial), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: 'var(--mint-400)',
      fontWeight: 700
    }
  }, s.university), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 30,
      fontWeight: 800,
      color: 'var(--gray-0)',
      letterSpacing: 'var(--tracking-heading)',
      marginTop: 4
    }
  }, s.title))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 7,
      marginTop: 18,
      position: 'relative'
    }
  }, s.types.map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: {
      padding: '4px 12px',
      borderRadius: 'var(--radius-pill)',
      background: 'rgba(248,250,252,0.12)',
      fontSize: 12.5,
      fontWeight: 700,
      color: 'var(--gray-1)',
      whiteSpace: 'nowrap'
    }
  }, t)))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '26px 34px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(InfoRow, {
    icon: /*#__PURE__*/React.createElement(I.calendar, {
      size: 17
    }),
    label: "\uC77C\uC2DC",
    value: `${s.date} ${s.time}`
  }), /*#__PURE__*/React.createElement(InfoRow, {
    icon: /*#__PURE__*/React.createElement(I.mapPin, {
      size: 17
    }),
    label: "\uC7A5\uC18C",
    value: s.place
  }), /*#__PURE__*/React.createElement(InfoRow, {
    icon: /*#__PURE__*/React.createElement(I.users, {
      size: 17
    }),
    label: "\uC815\uC6D0",
    value: `회차당 ${s.seatsTotal}명`
  }))), /*#__PURE__*/React.createElement(Card, {
    style: {
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 100ms both'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 'var(--text-h3)',
      fontWeight: 700,
      marginBottom: 12
    }
  }, "\uC5B4\uB5A4 \uC124\uBA85\uD68C\uC778\uAC00\uC694"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 15,
      lineHeight: 1.7,
      color: 'var(--text-body)'
    }
  }, s.desc)), /*#__PURE__*/React.createElement(Card, {
    style: {
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 200ms both'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 'var(--text-h3)',
      fontWeight: 700,
      marginBottom: 16
    }
  }, "\uD68C\uCC28\uBCC4 \uC794\uC5EC\uC11D"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, s.rounds.map(r => {
    const full = r.left === 0;
    const ratio = r.left / r.total;
    return /*#__PURE__*/React.createElement("div", {
      key: r.id,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '13px 16px',
        borderRadius: 'var(--radius-md)',
        background: full ? 'var(--surface-sunken)' : 'var(--surface-brand-soft)',
        opacity: full ? 0.6 : 1
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 700,
        fontSize: 14.5,
        color: 'var(--text-strong)',
        width: 90
      }
    }, r.label), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13.5,
        color: 'var(--text-muted)',
        width: 80
      }
    }, /*#__PURE__*/React.createElement(I.clock, {
      size: 14
    }), " ", r.time), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: 6,
        borderRadius: 3,
        background: 'var(--gray-2)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        height: '100%',
        width: `${ratio * 100}%`,
        background: ratio <= 0.15 ? 'var(--status-danger)' : 'var(--violet-600)',
        transition: 'width var(--dur-hero) var(--ease-smooth)'
      }
    })), full ? /*#__PURE__*/React.createElement(Badge, {
      tone: "neutral"
    }, "\uB9C8\uAC10") : ratio <= 0.15 ? /*#__PURE__*/React.createElement(Badge, {
      tone: "warning",
      dot: true
    }, "\uC784\uBC15 \xB7 ", r.left, "\uC11D") : /*#__PURE__*/React.createElement(Badge, {
      tone: "brand"
    }, r.left, "\uC11D \uB0A8\uC74C"));
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'sticky',
      top: 84,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      animation: 'ds-slide-in-right var(--dur-slow) var(--ease-out) 150ms both'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "elevated",
    padding: "26px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      color: 'var(--text-accent)'
    }
  }, "RESERVATION"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 34,
      color: 'var(--text-strong)',
      fontFeatureSettings: '"tnum"'
    }
  }, s.seatsLeft), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: 'var(--text-muted)'
    }
  }, "/ ", s.seatsTotal, "\uC11D \uB0A8\uC74C")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 8,
      borderRadius: 4,
      background: 'var(--gray-2)',
      overflow: 'hidden',
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      width: `${s.seatsLeft / s.seatsTotal * 100}%`,
      background: 'linear-gradient(90deg, var(--violet-700), var(--violet-500))',
      transition: 'width var(--dur-hero) var(--ease-smooth)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    fullWidth: true,
    disabled: s.closed,
    onClick: () => go('booking', {
      sessionId: s.id
    }),
    iconRight: /*#__PURE__*/React.createElement(I.arrowRight, {
      size: 17
    })
  }, s.closed ? '예약 마감' : '예약하기'), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    fullWidth: true,
    icon: /*#__PURE__*/React.createElement(I.bell, {
      size: 15
    })
  }, "\uBE48\uC790\uB9AC \uC54C\uB9BC"), /*#__PURE__*/React.createElement(Tooltip, {
    content: "\uB9C1\uD06C \uBCF5\uC0AC"
  }, /*#__PURE__*/React.createElement(IconButton, {
    variant: "outline",
    size: "lg",
    label: "\uACF5\uC720"
  }, /*#__PURE__*/React.createElement(I.share, {
    size: 17
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      fontSize: 12.5,
      color: 'var(--text-faint)',
      lineHeight: 1.55
    }
  }, "\uC608\uC57D\uC740 \uBB34\uB8CC\uC608\uC694. \uC2DC\uC791 24\uC2DC\uAC04 \uC804\uAE4C\uC9C0 \uCDE8\uC18C\uD560 \uC218 \uC788\uC5B4\uC694.")), /*#__PURE__*/React.createElement(Card, {
    variant: "accent",
    padding: "18px 20px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      fontSize: 13.5,
      color: 'var(--mint-700)',
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement(I.graduationCap, {
    size: 17
  }), " \uAC19\uC740 \uB300\uD559\uC758 \uB2E4\uB978 \uC124\uBA85\uD68C 2\uAC74\uC774 \uC608\uC815\uB3FC \uC788\uC5B4\uC694"))))));
}
window.DetailScreen = DetailScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/reservation/DetailScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/reservation/HomeScreen.jsx
try { (() => {
/* 홈 — 설명회 탐색 */
function HomeScreen({
  go
}) {
  const {
    SessionCard,
    Tag,
    Input,
    Badge
  } = window.DesignSystem_179b2a;
  const I = window.DSRIcons;
  const {
    sessions
  } = window.DSR_DATA;
  const [filter, setFilter] = React.useState('전체');
  const [region, setRegion] = React.useState('전체');
  const [q, setQ] = React.useState('');
  const filters = ['전체', '수시', '정시', '논술', '학생부종합'];
  const regions = ['전체', '서울', '대전', '세종', '부산', '온라인'];
  const list = sessions.filter(s => (filter === '전체' || s.types.includes(filter)) && (region === '전체' || s.region === region) && (q === '' || (s.university + s.title).includes(q)));
  const deadlines = sessions.filter(s => !s.closed && s.seatsLeft / s.seatsTotal <= 0.25);
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uD648 \u2014 \uC124\uBA85\uD68C \uD0D0\uC0C9"
  }, /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--surface-brand)',
      color: 'var(--text-on-brand)',
      overflow: 'hidden',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -120,
      right: -80,
      width: 380,
      height: 380,
      borderRadius: '50%',
      background: 'rgba(56,189,248,0.10)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: -160,
      right: 180,
      width: 260,
      height: 260,
      borderRadius: '50%',
      background: 'rgba(248,250,252,0.05)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '72px var(--container-pad) 64px',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '7px 14px',
      borderRadius: 'var(--radius-pill)',
      background: 'rgba(56,189,248,0.16)',
      color: 'var(--mint-400)',
      fontSize: 13,
      fontWeight: 700,
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement(I.sparkle, {
    size: 14
  }), " 2027\uD559\uB144\uB3C4 \uC124\uBA85\uD68C \uC608\uC57D\uC774 \uC5F4\uB838\uC5B4\uC694"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '22px 0 0',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 'var(--text-display-xl)',
      letterSpacing: 'var(--tracking-display)',
      lineHeight: 'var(--leading-display)',
      color: 'var(--gray-0)',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 90ms both'
    }
  }, "\uC124\uBA85\uD68C, ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--mint-400)'
    }
  }, "\uB193\uCE58\uC9C0 \uC54A\uAC8C.")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '16px 0 0',
      fontSize: 17,
      opacity: 0.78,
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 180ms both'
    }
  }, "\uC804\uAD6D \uB300\uD559 \uC785\uD559\uC124\uBA85\uD68C\uB97C \uD55C \uACF3\uC5D0\uC11C \uCC3E\uACE0, 3\uBC88\uC758 \uD0ED\uC73C\uB85C \uC608\uC57D\uC744 \uB05D\uB0B4\uC138\uC694."), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 560,
      marginTop: 32,
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 270ms both'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    size: "lg",
    placeholder: "\uB300\uD559 \uC774\uB984\uC774\uB098 \uC804\uD615\uC73C\uB85C \uAC80\uC0C9",
    value: q,
    onChange: setQ,
    icon: /*#__PURE__*/React.createElement(I.search, {
      size: 18
    })
  }))), deadlines.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid rgba(248,250,252,0.12)',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      gap: 0,
      animation: 'ds-ticker 26s linear infinite',
      padding: '11px 0'
    }
  }, [0, 1].map(dup => /*#__PURE__*/React.createElement("span", {
    key: dup,
    style: {
      display: 'inline-flex'
    }
  }, deadlines.concat(deadlines).map((s, i) => /*#__PURE__*/React.createElement("span", {
    key: dup + '-' + i,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 28px',
      fontSize: 13,
      color: 'var(--mint-200)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 5,
      height: 5,
      borderRadius: '50%',
      background: 'var(--mint-500)'
    }
  }), s.university, " ", s.title, " \u2014 \uC794\uC5EC ", s.seatsLeft, "\uC11D"))))))), /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '40px var(--container-pad) 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      flexWrap: 'wrap',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      color: 'var(--text-accent)',
      marginBottom: 8
    }
  }, "UPCOMING"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 'var(--text-h1)',
      fontWeight: 800
    }
  }, "\uB2E4\uAC00\uC624\uB294 \uC124\uBA85\uD68C")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, filters.map(f => /*#__PURE__*/React.createElement(Tag, {
    key: f,
    selected: filter === f,
    onClick: () => setFilter(f)
  }, f)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 16,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-faint)',
      marginRight: 4
    }
  }, "\uC9C0\uC5ED"), regions.map(r => /*#__PURE__*/React.createElement("button", {
    key: r,
    onClick: () => setRegion(r),
    style: {
      padding: '5px 12px',
      borderRadius: 'var(--radius-pill)',
      border: 'none',
      cursor: 'pointer',
      background: region === r ? 'var(--mint-100)' : 'transparent',
      color: region === r ? 'var(--mint-700)' : 'var(--text-muted)',
      fontSize: 13,
      fontWeight: region === r ? 700 : 500,
      fontFamily: 'var(--font-body)',
      transition: 'all var(--dur-fast) var(--ease-out)'
    }
  }, r))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 18,
      marginTop: 26
    }
  }, list.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.id,
    style: {
      animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${i * 70}ms both`
    }
  }, /*#__PURE__*/React.createElement(SessionCard, {
    university: s.university,
    title: s.title,
    date: s.date,
    time: s.time,
    place: s.place,
    types: s.types,
    seatsLeft: s.seatsLeft,
    seatsTotal: s.seatsTotal,
    closed: s.closed,
    onClick: () => go('detail', {
      sessionId: s.id
    })
  })))), list.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '64px 0',
      textAlign: 'center',
      color: 'var(--text-faint)',
      animation: 'ds-fade-in var(--dur-base) var(--ease-out) both'
    }
  }, "\uC870\uAC74\uC5D0 \uB9DE\uB294 \uC124\uBA85\uD68C\uAC00 \uC5C6\uC5B4\uC694. \uD544\uD130\uB97C \uBC14\uAFD4\uBCF4\uC138\uC694.")));
}
window.HomeScreen = HomeScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/reservation/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/reservation/MyPageScreen.jsx
try { (() => {
/* 마이페이지 — 예약 관리 */
function MyPageScreen({
  go
}) {
  const {
    Tabs,
    Badge,
    Button,
    Card,
    Dialog,
    Toast,
    Switch
  } = window.DesignSystem_179b2a;
  const I = window.DSRIcons;
  const D = window.DSR_DATA;
  const [tab, setTab] = React.useState('up');
  const [cancelTarget, setCancelTarget] = React.useState(null);
  const [cancelled, setCancelled] = React.useState([]);
  const [toast, setToast] = React.useState(null);
  const [alarm, setAlarm] = React.useState(true);
  const upcoming = D.myReservations.filter(r => !cancelled.includes(r.code));
  const doCancel = () => {
    setCancelled([...cancelled, cancelTarget.code]);
    setCancelTarget(null);
    setToast('예약이 취소되었어요');
    setTimeout(() => setToast(null), 3200);
  };
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uB9C8\uC774\uD398\uC774\uC9C0 \u2014 \uC608\uC57D \uAD00\uB9AC"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 880,
      margin: '0 auto',
      padding: '40px var(--container-pad) 100px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      letterSpacing: 'var(--tracking-caps)',
      fontWeight: 700,
      color: 'var(--text-accent)',
      marginBottom: 8
    }
  }, "MY PAGE"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--text-h1)',
      fontWeight: 800
    }
  }, "\uAE40\uC218\uBBFC \uB2D8\uC758 \uC608\uC57D")), /*#__PURE__*/React.createElement(Switch, {
    label: "\uB9C8\uAC10 \uC784\uBC15 \uC54C\uB9BC",
    checked: alarm,
    onChange: setAlarm
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '26px 0 22px'
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    items: [{
      label: '예정된 설명회',
      value: 'up',
      count: upcoming.length
    }, {
      label: '지난 설명회',
      value: 'past',
      count: D.pastReservations.length
    }, {
      label: '취소됨',
      value: 'cancel',
      count: cancelled.length
    }],
    value: tab,
    onChange: setTab
  })), tab === 'up' && /*#__PURE__*/React.createElement("div", {
    key: "up",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, upcoming.map((r, i) => {
    const s = D.sessions.find(x => x.id === r.sessionId);
    const waiting = r.status === 'waiting';
    return /*#__PURE__*/React.createElement(Card, {
      key: r.code,
      padding: "0",
      style: {
        overflow: 'hidden',
        animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${i * 80}ms both`
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 8,
        background: waiting ? 'var(--mint-500)' : 'var(--violet-800)',
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 18
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 54,
        height: 54,
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-brand)',
        color: 'var(--mint-400)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 17,
        flexShrink: 0
      }
    }, s.university.replace(/대학교|대학/g, '').slice(0, 2)), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 16.5,
        color: 'var(--text-strong)'
      }
    }, s.university), waiting ? /*#__PURE__*/React.createElement(Badge, {
      tone: "accent",
      dot: true
    }, "\uB300\uAE30 3\uBC88") : /*#__PURE__*/React.createElement(Badge, {
      tone: "success",
      dot: true
    }, "\uC608\uC57D \uD655\uC815")), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13.5,
        color: 'var(--text-muted)',
        marginTop: 4
      }
    }, s.title, " \xB7 ", r.round), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        color: 'var(--text-faint)',
        marginTop: 3,
        display: 'flex',
        gap: 14
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5
      }
    }, /*#__PURE__*/React.createElement(I.calendar, {
      size: 12.5
    }), " ", s.date), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5
      }
    }, /*#__PURE__*/React.createElement(I.mapPin, {
      size: 12.5
    }), " ", s.place), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFeatureSettings: '"tnum"',
        letterSpacing: '0.04em'
      }
    }, r.code))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm",
      icon: /*#__PURE__*/React.createElement(I.ticket, {
        size: 14
      }),
      onClick: () => go('ticket', {
        sessionId: s.id,
        round: r.round,
        name: r.name,
        seat: waiting ? null : r.seat
      })
    }, "\uD2F0\uCF13"), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      onClick: () => setCancelTarget(r)
    }, "\uCDE8\uC18C")))));
  }), upcoming.length === 0 && /*#__PURE__*/React.createElement(Card, {
    variant: "sunken",
    style: {
      textAlign: 'center',
      padding: 48,
      color: 'var(--text-faint)'
    }
  }, "\uC608\uC815\uB41C \uC608\uC57D\uC774 \uC5C6\uC5B4\uC694. ", /*#__PURE__*/React.createElement("a", {
    onClick: () => go('home'),
    style: {
      cursor: 'pointer',
      fontWeight: 700
    }
  }, "\uC124\uBA85\uD68C \uB458\uB7EC\uBCF4\uAE30 \u2192"))), tab === 'past' && /*#__PURE__*/React.createElement("div", {
    key: "past",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, D.pastReservations.map((r, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    variant: "outline",
    padding: "18px 24px",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      opacity: 0.75,
      animation: `ds-fade-up var(--dur-base) var(--ease-out) ${i * 70}ms both`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-strong)',
      fontSize: 14.5
    }
  }, r.university), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)',
      fontSize: 13.5,
      marginLeft: 10
    }
  }, r.title)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--text-faint)'
    }
  }, r.date), /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral"
  }, "\uCC38\uC11D \uC644\uB8CC")))), tab === 'cancel' && /*#__PURE__*/React.createElement("div", {
    key: "cancel",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, cancelled.length === 0 ? /*#__PURE__*/React.createElement(Card, {
    variant: "sunken",
    style: {
      textAlign: 'center',
      padding: 48,
      color: 'var(--text-faint)',
      animation: 'ds-fade-in var(--dur-base) both'
    }
  }, "\uCDE8\uC18C\uD55C \uC608\uC57D\uC774 \uC5C6\uC5B4\uC694.") : cancelled.map((code, i) => {
    const r = D.myReservations.find(x => x.code === code);
    const s = D.sessions.find(x => x.id === r.sessionId);
    return /*#__PURE__*/React.createElement(Card, {
      key: code,
      variant: "outline",
      padding: "18px 24px",
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        animation: `ds-fade-up var(--dur-base) var(--ease-out) ${i * 70}ms both`
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        textDecoration: 'line-through',
        color: 'var(--text-faint)',
        fontSize: 14.5
      }
    }, s.university, " \xB7 ", s.title), /*#__PURE__*/React.createElement(Badge, {
      tone: "danger"
    }, "\uCDE8\uC18C\uB428"));
  }))), /*#__PURE__*/React.createElement(Dialog, {
    open: !!cancelTarget,
    onClose: () => setCancelTarget(null),
    title: "\uC608\uC57D\uC744 \uCDE8\uC18C\uD560\uAE4C\uC694?",
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => setCancelTarget(null)
    }, "\uB3CC\uC544\uAC00\uAE30"), /*#__PURE__*/React.createElement(Button, {
      variant: "danger",
      onClick: doCancel
    }, "\uC608\uC57D \uCDE8\uC18C"))
  }, "\uCDE8\uC18C \uD6C4\uC5D0\uB294 \uC794\uC5EC\uC11D \uC0C1\uD669\uC5D0 \uB530\uB77C \uC7AC\uC608\uC57D\uC774 \uC5B4\uB824\uC6B8 \uC218 \uC788\uC5B4\uC694."), toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: 28,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 120
    }
  }, /*#__PURE__*/React.createElement(Toast, {
    tone: "danger"
  }, toast)));
}
window.MyPageScreen = MyPageScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/reservation/MyPageScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/reservation/TicketScreen.jsx
try { (() => {
/* 예약 완료 — 티켓 발급 */
function TicketScreen({
  go,
  params
}) {
  const {
    Ticket,
    Button
  } = window.DesignSystem_179b2a;
  const I = window.DSRIcons;
  const s = window.DSR_DATA.sessions.find(x => x.id === params.sessionId) || window.DSR_DATA.sessions[0];
  const code = `${s.id.toUpperCase()}-${s.date.replace(/\D/g, '').padStart(4, '0')}-${String((params.name || '김수민').length * 47).padStart(4, '0')}`;
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "\uC608\uC57D \uC644\uB8CC \uD2F0\uCF13",
    style: {
      minHeight: 'calc(100vh - 65px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px var(--container-pad)',
      position: 'relative',
      overflow: 'hidden'
    }
  }, [{
    l: '16%',
    t: '22%',
    d: '0s',
    s: 8
  }, {
    l: '80%',
    t: '18%',
    d: '0.6s',
    s: 6
  }, {
    l: '12%',
    t: '70%',
    d: '1.2s',
    s: 5
  }, {
    l: '86%',
    t: '64%',
    d: '0.3s',
    s: 9
  }, {
    l: '68%',
    t: '82%',
    d: '0.9s',
    s: 5
  }, {
    l: '28%',
    t: '86%',
    d: '1.5s',
    s: 7
  }].map((p, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      position: 'absolute',
      left: p.l,
      top: p.t,
      width: p.s,
      height: p.s,
      borderRadius: '50%',
      background: 'var(--mint-400)',
      opacity: 0.5,
      animation: `ds-float 4.5s var(--ease-in-out) ${p.d} infinite`
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginBottom: 28,
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 58,
      height: 58,
      borderRadius: '50%',
      background: 'var(--violet-900)',
      color: 'var(--mint-400)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto 16px',
      animation: 'ds-pop var(--dur-hero) var(--ease-spring) both'
    }
  }, /*#__PURE__*/React.createElement(I.check, {
    size: 26,
    sw: 2.6
  })), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--text-display)',
      fontWeight: 800,
      letterSpacing: 'var(--tracking-display)'
    }
  }, "\uC608\uC57D\uC774 \uD655\uC815\uB410\uC5B4\uC694!"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 0',
      fontSize: 15.5,
      color: 'var(--text-muted)'
    }
  }, "\uD2F0\uCF13\uC744 \uBB38\uC790\uC640 \uC774\uBA54\uC77C\uB85C\uB3C4 \uBCF4\uB0B4\uB4DC\uB838\uC5B4\uC694.")), /*#__PURE__*/React.createElement("div", {
    style: {
      animation: 'ds-fade-up var(--dur-hero) var(--ease-spring) 200ms both'
    }
  }, /*#__PURE__*/React.createElement(Ticket, {
    university: s.university,
    title: s.title,
    round: params.round,
    date: s.date,
    time: (params.round || '').split(' · ')[1] || s.time,
    place: s.place.split(' · ').pop() + (params.seat ? '' : ''),
    name: params.name || '김수민',
    code: code
  })), params.seat && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '9px 16px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--mint-100)',
      color: 'var(--mint-700)',
      fontSize: 13.5,
      fontWeight: 700,
      animation: 'ds-pop var(--dur-slow) var(--ease-spring) 700ms both'
    }
  }, /*#__PURE__*/React.createElement(I.armchair, {
    size: 15
  }), " \uB0B4 \uC88C\uC11D \u2014 ", params.seat), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginTop: 30,
      animation: 'ds-fade-up var(--dur-slow) var(--ease-out) 500ms both'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: /*#__PURE__*/React.createElement(I.calendar, {
      size: 16
    })
  }, "\uCE98\uB9B0\uB354\uC5D0 \uCD94\uAC00"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: /*#__PURE__*/React.createElement(I.download, {
      size: 16
    })
  }, "\uD2F0\uCF13 \uC800\uC7A5"), /*#__PURE__*/React.createElement(Button, {
    onClick: () => go('mypage'),
    iconRight: /*#__PURE__*/React.createElement(I.arrowRight, {
      size: 16
    })
  }, "\uB0B4 \uC608\uC57D \uBCF4\uAE30"))));
}
window.TicketScreen = TicketScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/reservation/TicketScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/reservation/data.js
try { (() => {
/* 대입설명회 UI kit — 샘플 데이터 */
window.DSR_DATA = {
  sessions: [{
    id: 'ku',
    university: '한국대학교',
    title: '2027학년도 수시 입학설명회',
    types: ['수시', '학생부종합'],
    date: '7월 24일 (금)',
    time: '14:00',
    place: '서울 · 대강당',
    region: '서울',
    seatsLeft: 38,
    seatsTotal: 300,
    desc: '2027학년도 수시 전형의 주요 변경 사항과 학생부종합전형 평가 기준을 입학사정관이 직접 안내합니다. 설명회 후 단과대학별 개별 상담 부스가 운영됩니다.',
    rounds: [{
      id: 'r1',
      label: '1회차',
      time: '10:00',
      left: 0,
      total: 300
    }, {
      id: 'r2',
      label: '2회차',
      time: '14:00',
      left: 38,
      total: 300
    }, {
      id: 'r3',
      label: '3회차',
      time: '17:00',
      left: 121,
      total: 300
    }]
  }, {
    id: 'mirim',
    university: '미림대학교',
    title: '정시 전형 안내 및 입시 Q&A',
    types: ['정시'],
    date: '8월 2일 (일)',
    time: '10:00',
    place: '온라인 생중계',
    region: '온라인',
    seatsLeft: 512,
    seatsTotal: 1000,
    desc: '정시 전형 지원 전략과 최근 3개년 입시 결과를 공개합니다. 실시간 채팅으로 질문을 받아요.',
    rounds: [{
      id: 'r1',
      label: '1회차',
      time: '10:00',
      left: 512,
      total: 1000
    }, {
      id: 'r2',
      label: '2회차',
      time: '15:00',
      left: 866,
      total: 1000
    }]
  }, {
    id: 'hanbit',
    university: '한빛대학교',
    title: '논술전형 대비 특강 · 기출 해설',
    types: ['논술', '수시'],
    date: '8월 9일 (일)',
    time: '13:00',
    place: '대전 · 국제회의실',
    region: '대전',
    seatsLeft: 14,
    seatsTotal: 180,
    desc: '최근 3개년 논술 기출을 출제위원 관점에서 해설합니다. 계열별(인문/자연) 분반으로 진행돼요.',
    rounds: [{
      id: 'r1',
      label: '인문계열',
      time: '13:00',
      left: 14,
      total: 180
    }, {
      id: 'r2',
      label: '자연계열',
      time: '16:00',
      left: 27,
      total: 180
    }]
  }, {
    id: 'sejong',
    university: '세종과학대학교',
    title: '첨단학과 신설 안내 · 캠퍼스 투어',
    types: ['수시', '정시'],
    date: '8월 16일 (일)',
    time: '11:00',
    place: '세종 · 본관 로비 집결',
    region: '세종',
    seatsLeft: 96,
    seatsTotal: 120,
    desc: '반도체·AI 신설 학과 소개와 함께 재학생이 직접 안내하는 캠퍼스 투어가 포함된 설명회입니다.',
    rounds: [{
      id: 'r1',
      label: '오전',
      time: '11:00',
      left: 96,
      total: 120
    }, {
      id: 'r2',
      label: '오후',
      time: '14:30',
      left: 44,
      total: 120
    }]
  }, {
    id: 'gaon',
    university: '가온대학교',
    title: '학부모 대상 입시 로드맵 설명회',
    types: ['수시'],
    date: '8월 23일 (일)',
    time: '10:30',
    place: '부산 · 컨벤션홀',
    region: '부산',
    seatsLeft: 0,
    seatsTotal: 250,
    closed: true,
    desc: '고1·2 학부모를 위한 장기 입시 전략. 이번 회차는 마감되었어요.',
    rounds: [{
      id: 'r1',
      label: '단일 회차',
      time: '10:30',
      left: 0,
      total: 250
    }]
  }, {
    id: 'dasan',
    university: '다산대학교',
    title: '교사 초청 전형 설명회',
    types: ['수시', '정시'],
    date: '8월 30일 (일)',
    time: '15:00',
    place: '서울 · 교육관 201호',
    region: '서울',
    seatsLeft: 61,
    seatsTotal: 80,
    desc: '진학지도 교사를 위한 심화 세션. 전형별 평가 루브릭과 학교생활기록부 반영 방식을 다룹니다.',
    rounds: [{
      id: 'r1',
      label: '단일 회차',
      time: '15:00',
      left: 61,
      total: 80
    }]
  }],
  myReservations: [{
    sessionId: 'ku',
    round: '2회차 · 14:00',
    code: 'KU-0724-0138',
    name: '김수민',
    status: 'confirmed',
    seat: '나열 7번'
  }, {
    sessionId: 'hanbit',
    round: '인문계열 · 13:00',
    code: 'HB-0809-0042',
    name: '김수민',
    status: 'waiting',
    seat: '대기 3번'
  }],
  pastReservations: [{
    university: '미림대학교',
    title: '전공 탐색 오픈캠퍼스',
    date: '5월 31일',
    status: 'done'
  }, {
    university: '한국대학교',
    title: '고3 대상 모의 면접 특강',
    date: '4월 12일',
    status: 'done'
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/reservation/data.js", error: String((e && e.message) || e) }); }

// ui_kits/reservation/icons.jsx
try { (() => {
/* Lucide 아이콘 (stroke 2 · round cap) — React 인라인 래퍼 */
const Ic = ({
  d,
  size = 16,
  sw = 2,
  style,
  children
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: sw,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  style: style
}, children || /*#__PURE__*/React.createElement("path", {
  d: d
}));
const I = {
  search: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 21-4.3-4.3"
  })),
  calendar: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "4",
    width: "18",
    height: "18",
    rx: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 2v4M8 2v4M3 10h18"
  })),
  mapPin: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("path", {
    d: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "10",
    r: "3"
  })),
  clock: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 7v5l3 2"
  })),
  arrowRight: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14m-6-6 6 6-6 6"
  })),
  arrowLeft: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("path", {
    d: "M19 12H5m6 6-6-6 6-6"
  })),
  check: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  })),
  users: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("path", {
    d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "7",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
  })),
  ticket: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("path", {
    d: "M2 9a3 3 0 0 1 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M13 5v2M13 17v2M13 11v2"
  })),
  bell: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("path", {
    d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10.3 21a1.94 1.94 0 0 0 3.4 0"
  })),
  share: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("circle", {
    cx: "18",
    cy: "5",
    r: "3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "12",
    r: "3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "18",
    cy: "19",
    r: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"
  })),
  download: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("path", {
    d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
  })),
  chartBar: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("path", {
    d: "M3 3v16a2 2 0 0 0 2 2h16"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 16v-5M12 16V8M17 16v-8"
  })),
  trendUp: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("path", {
    d: "m22 7-8.5 8.5-5-5L2 17"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 7h6v6"
  })),
  user: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "8",
    r: "5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M20 21a8 8 0 0 0-16 0"
  })),
  x: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  })),
  sparkle: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("path", {
    d: "M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z"
  })),
  armchair: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("path", {
    d: "M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H7v-2a2 2 0 0 0-4 0Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5 18v2M19 18v2"
  })),
  graduationCap: p => /*#__PURE__*/React.createElement(Ic, p, /*#__PURE__*/React.createElement("path", {
    d: "M22 10 12 5 2 10l10 5 10-5v6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 12.5V16a6 3 0 0 0 12 0v-3.5"
  }))
};
window.DSRIcons = I;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/reservation/icons.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.LauncherCard = __ds_scope.LauncherCard;

__ds_ns.Stepper = __ds_scope.Stepper;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.TopNav = __ds_scope.TopNav;

__ds_ns.SessionCard = __ds_scope.SessionCard;

__ds_ns.Ticket = __ds_scope.Ticket;

})();
