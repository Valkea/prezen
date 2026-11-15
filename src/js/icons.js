/* PrezEn · icons: a small offline line-icon set (24×24, stroke = currentColor), used both in slides and in the UI.
 * More icons can be searched online (Iconify) from the editor; picked icons are stored inline in the doc. */
(function (PZ) {
  'use strict';

  const c = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
  const p = (d) => `<path d="${d}"/>`;
  const r = (x, y, w, h, rx) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rx ? ` rx="${rx}"` : ''}/>`;

  // Icons offered in the "Icons" picker (category → name → inner markup)
  PZ.ICON_SET = {
    Essentials: {
      check: p('M20 6 9 17l-5-5'), x: p('M18 6 6 18M6 6l12 12'), plus: p('M12 5v14M5 12h14'), minus: p('M5 12h14'),
      'check-circle': p('M22 11.08V12a10 10 0 1 1-5.93-9.14') + p('M22 4 12 14.01l-3-3'),
      'x-circle': c(12, 12, 10) + p('m15 9-6 6M9 9l6 6'),
      info: c(12, 12, 10) + p('M12 16v-4M12 8h.01'), help: c(12, 12, 10) + p('M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01'),
      alert: p('M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z') + p('M12 9v4M12 17h.01'),
      star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
      heart: p('M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'),
      smile: c(12, 12, 10) + p('M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01'),
      zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
      flag: p('M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z') + p('M4 22v-7'),
      target: c(12, 12, 10) + c(12, 12, 6) + c(12, 12, 2),
      award: c(12, 8, 7) + p('M8.21 13.89 7 23l5-3 5 3-1.21-9.12'),
      bulb: p('M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.74V17h8v-2.26A7 7 0 0 0 12 2z'),
      eye: p('M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z') + c(12, 12, 3),
      bell: p('M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9') + p('M13.73 21a2 2 0 0 1-3.46 0'),
      quote: p('M3 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2H4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 0-1 1.03V20c0 1 0 1 1 1z') + p('M15 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2h-4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z'),
    },
    Arrows: {
      'arrow-right': p('M5 12h14M12 5l7 7-7 7'), 'arrow-left': p('M19 12H5M12 19l-7-7 7-7'),
      'arrow-up': p('M12 19V5M5 12l7-7 7 7'), 'arrow-down': p('M12 5v14M19 12l-7 7-7-7'),
      'chevron-right': p('m9 18 6-6-6-6'), 'chevron-left': p('m15 18-6-6 6-6'), 'chevron-up': p('m18 15-6-6-6 6'), 'chevron-down': p('m6 9 6 6 6-6'),
      'trending-up': p('M23 6l-9.5 9.5-5-5L1 18') + p('M17 6h6v6'), 'trending-down': p('M23 18l-9.5-9.5-5 5L1 6') + p('M17 18h6v-6'),
      refresh: p('M23 4v6h-6M1 20v-6h6') + p('M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15'),
      'external-link': p('M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3'),
    },
    People: {
      user: p('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2') + c(12, 7, 4),
      users: p('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2') + c(9, 7, 4) + p('M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'),
      message: p('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'),
      mail: r(2, 4, 20, 16, 2) + p('m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'),
      share: c(18, 5, 3) + c(6, 12, 3) + c(18, 19, 3) + p('M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98'),
      home: p('M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z') + p('M9 22V12h6v10'),
      'map-pin': p('M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z') + c(12, 10, 3),
      globe: c(12, 12, 10) + p('M2 12h20') + p('M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'),
    },
    Business: {
      'bar-chart': p('M12 20V10M18 20V4M6 20v-4'), 'pie-chart': p('M21.21 15.89A10 10 0 1 1 8 2.83') + p('M22 12A10 10 0 0 0 12 2v10z'),
      activity: p('M22 12h-4l-3 9L9 3l-3 9H2'),
      briefcase: r(2, 7, 20, 14, 2) + p('M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'),
      dollar: p('M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'),
      cart: c(9, 21, 1) + c(20, 21, 1) + p('M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6'),
      calendar: r(3, 4, 18, 18, 2) + p('M16 2v4M8 2v4M3 10h18'), clock: c(12, 12, 10) + p('M12 6v6l4 2'),
      'file-text': p('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z') + p('M14 2v6h6M16 13H8M16 17H8M10 9H8'),
      folder: p('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'),
      layers: p('M12 2 2 7l10 5 10-5-10-5z') + p('M2 17l10 5 10-5M2 12l10 5 10-5'),
      book: p('M4 19.5A2.5 2.5 0 0 1 6.5 17H20') + p('M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'),
    },
    Tech: {
      code: p('M16 18l6-6-6-6M8 6l-6 6 6 6'), cpu: r(4, 4, 16, 16, 2) + r(9, 9, 6, 6) + p('M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3'),
      database: '<ellipse cx="12" cy="5" rx="9" ry="3"/>' + p('M21 12c0 1.66-4 3-9 3s-9-1.34-9-3') + p('M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5'),
      cloud: p('M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z'), lock: r(3, 11, 18, 11, 2) + p('M7 11V7a5 5 0 0 1 10 0v4'),
      unlock: r(3, 11, 18, 11, 2) + p('M7 11V7a5 5 0 0 1 9.9-1'), link: p('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71') + p('M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'),
      search: c(11, 11, 8) + p('m21 21-4.3-4.3'), settings: p('M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6'),
      monitor: r(2, 3, 20, 14, 2) + p('M8 21h8M12 17v4'), phone: r(5, 2, 14, 20, 2) + p('M12 18h.01'),
      wifi: p('M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01'),
    },
    Nature: {
      sun: c(12, 12, 5) + p('M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42'),
      moon: p('M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'), droplet: p('M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z'),
      leaf: p('M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z') + p('M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12'),
      mountain: p('m8 3 4 8 5-5 5 15H2L8 3z'), camera: p('M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z') + c(12, 13, 4),
      image: r(3, 3, 18, 18, 2) + c(8.5, 8.5, 1.5) + p('M21 15l-5-5L5 21'), music: p('M9 18V5l12-2v13') + c(6, 18, 3) + c(18, 16, 3),
      play: '<polygon points="5 3 19 12 5 21 5 3"/>', gift: r(3, 8, 18, 4, 1) + p('M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7') + p('M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5'),
    },
  };

  // UI-only icons (toolbar etc.)
  const UI = {
    undo: p('M3 7v6h6') + p('M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'), redo: p('M21 7v6h-6') + p('M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7'),
    type: p('M4 7V4h16v3M9 20h6M12 4v16'), shapes: r(3, 3, 8, 8, 1) + c(17, 7, 4) + p('M12 21l4-7 4 7z'), trash: p('M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'),
    copy: r(9, 9, 13, 13, 2) + p('M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'), sparkles: p('M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z') + p('M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z'),
    download: p('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3'), upload: p('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12'),
    save: p('M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z') + p('M17 21v-8H7v8M7 3v5h8'),
    'folder-open': p('M6 14l1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2'),
    grid: r(3, 3, 7, 7) + r(14, 3, 7, 7) + r(14, 14, 7, 7) + r(3, 14, 7, 7), maximize: p('M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3'),
    bold: p('M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z') + p('M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z'), italic: p('M19 4h-9M14 20H5M15 4 9 20'),
    underline: p('M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3M4 21h16'), strike: p('M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16'),
    'align-left': p('M17 10H3M21 6H3M21 14H3M17 18H3'), 'align-center': p('M18 10H6M21 6H3M21 14H3M18 18H6'), 'align-right': p('M21 10H7M21 6H3M21 14H3M21 18H7'), 'align-justify': p('M21 10H3M21 6H3M21 14H3M21 18H3'),
    'valign-top': p('M4 3h16M12 7v14M8 11l4-4 4 4'), 'valign-middle': p('M4 12h16M12 3v5M12 16v5M9 5l3 3 3-3M9 19l3-3 3 3'), 'valign-bottom': p('M4 21h16M12 3v14M8 13l4 4 4-4'),
    list: p('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'), 'list-ordered': p('M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1'),
    'bring-front': r(8, 8, 13, 13, 2) + p('M4 16V5a1 1 0 0 1 1-1h11'), 'send-back': r(3, 3, 13, 13, 2) + p('M20 8v11a1 1 0 0 1-1 1H8'),
    'eye-off': p('M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22'),
    'file-plus': p('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z') + p('M14 2v6h6M12 18v-6M9 15h6'),
    menu: p('M3 12h18M3 6h18M3 18h18'), more: c(12, 12, 1) + c(19, 12, 1) + c(5, 12, 1), pdf: p('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z') + p('M14 2v6h6') + p('M8 13h2a1.5 1.5 0 0 1 0 3H8v-3zM8 16v2M14 13v5M14 13h2M14 15.5h1.5'),
    notes: r(4, 3, 16, 18, 2) + p('M8 8h8M8 12h8M8 16h5'), 'align-h': p('M12 2v20M5 7h14v4H5zM8 14h8v4H8z'), 'align-v': p('M2 12h20M7 5v14h4V5zM14 8v8h4V8z'),
    exit: p('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'), library: p('M4 19.5A2.5 2.5 0 0 1 6.5 17H20') + p('M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'),
    keyboard: r(2, 4, 20, 16, 2) + p('M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10'),
    zoom: c(11, 11, 8) + p('m21 21-4.3-4.3M11 8v6M8 11h6'), sliders: p('M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6'),
  };

  const ALL = {};
  for (const cat of Object.values(PZ.ICON_SET)) Object.assign(ALL, cat);
  Object.assign(ALL, UI);

  /** Full SVG markup of a built-in icon. */
  PZ.iconSvg = function (name) {
    const inner = ALL[name];
    if (!inner) return '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  };

  /** A UI icon as a DOM node (trusted internal markup). */
  PZ.icon = function (name, cls) {
    const s = PZ.h('span', { class: 'pz-ico' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });
    s.innerHTML = PZ.iconSvg(name);
    return s;
  };
})(window.PZ = window.PZ || {});
