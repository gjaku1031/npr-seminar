/* Lucide 아이콘 (stroke 2 · round cap) — React 인라인 래퍼 */
const Ic = ({ d, size = 16, sw = 2, style, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {children || <path d={d}></path>}
  </svg>
);

const I = {
  search: (p) => <Ic {...p}><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></Ic>,
  calendar: (p) => <Ic {...p}><rect x="3" y="4" width="18" height="18" rx="3"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></Ic>,
  mapPin: (p) => <Ic {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></Ic>,
  clock: (p) => <Ic {...p}><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></Ic>,
  arrowRight: (p) => <Ic {...p}><path d="M5 12h14m-6-6 6 6-6 6"></path></Ic>,
  arrowLeft: (p) => <Ic {...p}><path d="M19 12H5m6 6-6-6 6-6"></path></Ic>,
  check: (p) => <Ic {...p}><path d="M20 6 9 17l-5-5"></path></Ic>,
  users: (p) => <Ic {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path></Ic>,
  ticket: (p) => <Ic {...p}><path d="M2 9a3 3 0 0 1 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path><path d="M13 5v2M13 17v2M13 11v2"></path></Ic>,
  bell: (p) => <Ic {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></Ic>,
  share: (p) => <Ic {...p}><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"></path></Ic>,
  download: (p) => <Ic {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path></Ic>,
  chartBar: (p) => <Ic {...p}><path d="M3 3v16a2 2 0 0 0 2 2h16"></path><path d="M7 16v-5M12 16V8M17 16v-8"></path></Ic>,
  trendUp: (p) => <Ic {...p}><path d="m22 7-8.5 8.5-5-5L2 17"></path><path d="M16 7h6v6"></path></Ic>,
  user: (p) => <Ic {...p}><circle cx="12" cy="8" r="5"></circle><path d="M20 21a8 8 0 0 0-16 0"></path></Ic>,
  x: (p) => <Ic {...p}><path d="M18 6 6 18M6 6l12 12"></path></Ic>,
  sparkle: (p) => <Ic {...p}><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z"></path></Ic>,
  armchair: (p) => <Ic {...p}><path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"></path><path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H7v-2a2 2 0 0 0-4 0Z"></path><path d="M5 18v2M19 18v2"></path></Ic>,
  graduationCap: (p) => <Ic {...p}><path d="M22 10 12 5 2 10l10 5 10-5v6"></path><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"></path></Ic>,
};

window.DSRIcons = I;
