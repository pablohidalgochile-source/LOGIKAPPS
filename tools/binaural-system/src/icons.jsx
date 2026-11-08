import React from 'react';
/* ============================================================
   NANOOK RESET — Iconos (line icons, estilo lucide)
   ============================================================ */
const Ic = ({ d, paths, size = 18, sw = 1.7, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {d && <path d={d} />}
    {paths}
  </svg>
);

const Icon = {
  today:   (p) => <Ic {...p} paths={<><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></>} />,
  checkin: (p) => <Ic {...p} paths={<><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>} />,
  streak:  (p) => <Ic {...p} d="M12 2c1 4-2 5-2 8a3 3 0 0 0 6 0c0-1-.5-2-1-3 2 1 4 3 4 6a7 7 0 1 1-14 0c0-4 4-6 4-9 1 .5 2 .5 3-2z" />,
  project: (p) => <Ic {...p} paths={<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5M8 14h8M8 17h5"/></>} />,
  pantry:  (p) => <Ic {...p} paths={<><path d="M5 8h14l-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8z"/><path d="M9 8V5a3 3 0 0 1 6 0v3"/></>} />,
  atlas:   (p) => <Ic {...p} paths={<><circle cx="12" cy="5" r="2.4"/><path d="M12 7.4V14M12 14l-4 6M12 14l4 6M7 10l5 1 5-1"/></>} />,
  book:    (p) => <Ic {...p} paths={<><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M4 19a2 2 0 0 0 2 2h13"/></>} />,
  calendar:(p) => <Ic {...p} paths={<><rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></>} />,
  insight: (p) => <Ic {...p} paths={<><path d="M3 17l5-6 4 3 5-7 4 5"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="14" r="1"/><circle cx="17" cy="7" r="1"/></>} />,
  settings:(p) => <Ic {...p} paths={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7.7 1.6 1.6 0 0 0-1.5 1.1H12a2 2 0 0 1-2-2 1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-.7-2.7 1.6 1.6 0 0 0-1.1-1.5V12a2 2 0 0 1 2-2 1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 6.7 4.3l.1.1a1.6 1.6 0 0 0 2.7-.7H12a2 2 0 0 1 2 2 1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 .7 2.7H21a2 2 0 0 1 0 2.8z"/></>} />,
  plus:    (p) => <Ic {...p} d="M12 5v14M5 12h14" />,
  arrow:   (p) => <Ic {...p} d="M5 12h14M13 6l6 6-6 6" />,
  back:    (p) => <Ic {...p} d="M19 12H5M11 6l-6 6 6 6" />,
  check:   (p) => <Ic {...p} d="M5 12l5 5L20 6" />,
  bolt:    (p) => <Ic {...p} d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />,
  moon:    (p) => <Ic {...p} d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z" />,
  sun:     (p) => <Ic {...p} paths={<><circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v3M12 19.5v3M4.2 4.2l2 2M17.8 17.8l2 2M1.5 12h3M19.5 12h3M4.2 19.8l2-2M17.8 6.2l2-2"/></>} />,
  brain:   (p) => <Ic {...p} d="M9.5 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V16a3 3 0 0 0 4 2.8M14.5 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V16a3 3 0 0 1-4 2.8M12 4.5v15" />,
  drop:    (p) => <Ic {...p} d="M12 3s6 6.4 6 10.5a6 6 0 0 1-12 0C6 9.4 12 3 12 3z" />,
  flame:   (p) => <Ic {...p} d="M12 2c1 4-2 5-2 8a3 3 0 0 0 6 0c0-1-.5-2-1-3 2 1 4 3 4 6a7 7 0 1 1-14 0c0-4 4-6 4-9 1 .5 2 .5 3-2z" />,
  sleep:   (p) => <Ic {...p} d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z" />,
  edit:    (p) => <Ic {...p} paths={<><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></>} />,
  trash:   (p) => <Ic {...p} d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />,
  warn:    (p) => <Ic {...p} paths={<><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></>} />,
  cart:    (p) => <Ic {...p} paths={<><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2.2l2.3 12.5a1.5 1.5 0 0 0 1.5 1.2h8.5a1.5 1.5 0 0 0 1.5-1.2L21 7H5"/></>} />,
  clock:   (p) => <Ic {...p} paths={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>} />,
  eye:     (p) => <Ic {...p} paths={<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.6"/></>} />,
  walk:    (p) => <Ic {...p} d="M13 4a1.5 1.5 0 1 0 0-.01M11 8l3 2 2-1M11 8l-1 5 3 2 1 5M10 13l-3 2-1 4" />,
  pen:     (p) => <Ic {...p} d="M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-1.5M2 21l4-1 9.5-9.5-3-3L3 17l-1 4z" />,
  flask:   (p) => <Ic {...p} d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3M7.5 14h9" />,
  star:    (p) => <Ic {...p} d="M12 3l2.6 5.6L21 9.4l-4.5 4.3L17.6 21 12 17.7 6.4 21l1.1-7.3L3 9.4l6.4-.8L12 3z" />,
  cosmos:  (p) => <Ic {...p} paths={<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/><circle cx="12" cy="12" r="9" strokeDasharray="2 3" opacity=".4"/></>} />,
  binaural:(p) => <Ic {...p} paths={<><circle cx="12" cy="12" r="2"/><path d="M7 12a5 5 0 0 0 10 0M4 12a8 8 0 0 0 16 0M2 12a10 10 0 0 0 20 0"/></>} />,
  image:   (p) => <Ic {...p} paths={<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></>} />,
  close:   (p) => <Ic {...p} d="M6 6l12 12M18 6L6 18" />,
  search:  (p) => <Ic {...p} paths={<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>} />,
  mic:     (p) => <Ic {...p} paths={<><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 19v3M9 22h6"/></>} />,
  sparkle: (p) => <Ic {...p} paths={<><path d="M12 3l1.6 4 4 1.6-4 1.6L12 14l-1.6-3.8L6 8.6l4-1.6L12 3z"/><path d="M5 17l.8 2 2 .8-2 .8L5 22.4l-.8-1.8-2-.8 2-.8L5 17z"/><path d="M19 13l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8L19 13z"/></>} />,
  mirror:  (p) => <Ic {...p} paths={<><ellipse cx="12" cy="9" rx="6" ry="8"/><path d="M12 17v5M8 22h8M6 9h12" strokeOpacity=".4"/></>} />,
  sinc:    (p) => <Ic {...p} paths={<><path d="M17 3l4 4-4 4"/><path d="M3 11V9a8 8 0 0 1 14.9-4M7 21l-4-4 4-4"/><path d="M21 13v2a8 8 0 0 1-14.9 4"/></>} />,
  carta:   (p) => <Ic {...p} paths={<><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8l10 6 10-6"/></>} />,
  oracle:  (p) => <Ic {...p} paths={<><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18M12 3a9 9 0 0 0 0 18M3 12h18" strokeOpacity=".5"/><circle cx="12" cy="12" r="3"/></>} />,
  timeline:(p) => <Ic {...p} paths={<><path d="M3 6h18M3 12h18M3 18h18"/><circle cx="7" cy="6" r="2" fill="currentColor"/><circle cx="14" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/></>} />,
};

window.Icon = Icon;
window.Ic = Ic;

export { Icon };
