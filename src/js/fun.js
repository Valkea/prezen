/* PrezEn · fun: the "fun pack" for younger audiences: big explosions, a parade of turtles, confetti, hearts,
 * bubbles, a rocket… Slide transitions and element animations whose keyframes are drawn over by a particle scene.
 *
 * A scene draws on its own layer above the slides (transition) or above the slide's elements (element) with the
 * Web Animations API. Sprites are inline SVG written here, so they look the same on every system and offline.
 * Scenes are pure decoration: they never hold the presentation's content and clean up after themselves.
 *
 * ctx = { layer, w, h (slide size), D (duration ms), delay, easing (CSS), anims: [], box: {x, y, w, h} (element), doc }
 */
(function (PZ) {
  'use strict';

  const R = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const CONFETTI = ['#ff4d6d', '#ffb703', '#2ec4b6', '#5b5bf0', '#ff7ac6', '#8ac926', '#00b4d8', '#ffd60a'];
  const FIRE = ['#fff3b0', '#ffd23f', '#ff9f1c', '#ff5d2a', '#e63946'];
  const DEBRIS = FIRE.concat(['#7a4b2a', '#5a5a66']);
  const HEARTS = ['#ff4d6d', '#ff7ac6', '#ff8fab', '#e63946', '#ffb3c6'];
  const GLITTER = ['#ffd60a', '#ffffff', '#ffe58a', '#7cd4ff', '#ff9de2'];
  const RAINBOW = ['#ff3b3b', '#ff8c1a', '#ffd60a', '#3ecf5a', '#2f9bff', '#5b5bf0', '#b35cff'];
  const SHELLS = ['#3ecf5a', '#2ec4b6', '#ff9f1c', '#b35cff', '#ff7ac6', '#2f9bff', '#8ac926'];

  // ---------------------------------------------------------------- sprites
  const svg = (vb, body) => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">${body}</svg>`;
  const ART = {
    heart: (c) => svg('0 0 32 30', `<path fill="${c}" d="M16 29C16 29 1 19.6 1 9.6A7.6 7.6 0 0 1 16 6.4 7.6 7.6 0 0 1 31 9.6C31 19.6 16 29 16 29Z"/>` +
      '<ellipse cx="9" cy="10" rx="3.2" ry="2" fill="#fff" opacity=".55" transform="rotate(-35 9 10)"/>'),
    star: (c) => svg('0 0 24 24', `<path fill="${c}" d="M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.6l-6.4 3.5L7 14l-5.3-5 7.2-.9z"/>`),
    sparkle: (c) => svg('0 0 24 24', `<path fill="${c}" d="M12 0C12.8 7.4 16.6 11.2 24 12 16.6 12.8 12.8 16.6 12 24 11.2 16.6 7.4 12.8 0 12 7.4 11.2 11.2 7.4 12 0Z"/>`),
    /** Turtle walking right (130 × 90), legs in .pz-leg-f / .pz-leg-b for the waddle, optional party hat. */
    turtle: (shell, hat) => svg('0 0 130 90',
      '<g class="pz-leg-b"><ellipse cx="34" cy="71" rx="10" ry="8" fill="#43a656"/><ellipse cx="84" cy="71" rx="10" ry="8" fill="#43a656"/></g>' +
      '<path d="M16 57 3 63l13 4Z" fill="#5cc26a"/>' +
      `<path d="M16 62C16 30 38 14 60 14s42 16 42 48Z" fill="${shell}"/>` +
      '<path d="M44 27l16-6 16 6v16l-16 6-16-6Z" fill="#fff" opacity=".22"/><circle cx="30" cy="45" r="6" fill="#fff" opacity=".18"/><circle cx="90" cy="45" r="6" fill="#fff" opacity=".18"/>' +
      `<rect x="12" y="57" width="94" height="10" rx="5" fill="${shell}"/><rect x="12" y="57" width="94" height="10" rx="5" fill="#000" opacity=".16"/>` +
      '<g class="pz-leg-f"><ellipse cx="44" cy="73" rx="10" ry="8" fill="#6fd47d"/><ellipse cx="94" cy="73" rx="10" ry="8" fill="#6fd47d"/></g>' +
      '<ellipse cx="98" cy="54" rx="11" ry="9" fill="#6fd47d"/><circle cx="108" cy="45" r="16" fill="#6fd47d"/>' +
      '<circle cx="113" cy="40" r="4.2" fill="#1d2433"/><circle cx="114.4" cy="38.6" r="1.5" fill="#fff"/>' +
      '<path d="M109 51q5 4 10-1" stroke="#1d2433" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="104" cy="49" r="3.2" fill="#ff8fab" opacity=".75"/>' +
      (hat ? '<path d="M100 32 108 6l10 25Z" fill="#ff4d6d"/><path d="M103 24l10-3M105 16l7-2" stroke="#ffd60a" stroke-width="3"/><circle cx="108" cy="6" r="4" fill="#ffd60a"/>' : '')),
    /** Rocket pointing up (60 × 140): body ends at y 104, the flame (.pz-flame) below. */
    rocket: () => svg('0 0 60 140',
      '<g class="pz-flame"><path d="M17 102q13 46 26 0Z" fill="#ff9f1c"/><path d="M23 102q7 28 14 0Z" fill="#fff3b0"/></g>' +
      '<path d="M15 66 2 104l16-8ZM45 66l13 38-16-8Z" fill="#e63946"/>' +
      '<path d="M30 4c16 18 18 50 16 98H14c-2-48 0-80 16-98Z" fill="#f1f3f8"/>' +
      '<path d="M30 4c8 9 12 18 14 27H16c2-9 6-18 14-27Z" fill="#e63946"/>' +
      '<circle cx="30" cy="54" r="9" fill="#2f9bff" stroke="#5b6b8c" stroke-width="3.5"/><circle cx="27" cy="51" r="2.6" fill="#fff" opacity=".8"/>' +
      '<rect x="14" y="92" width="32" height="11" rx="3" fill="#5b6b8c"/><path d="M28 78h4v26h-4z" fill="#c1121f"/>'),
    /** Comic "BOOM!" burst (200 × 140). */
    boom: () => {
      const burst = (rx, ry, spikes, jag) => {
        let d = '';
        for (let i = 0; i < spikes * 2; i++) {
          const a = (i / (spikes * 2)) * Math.PI * 2, r = i % 2 ? 1 - jag * R(0.6, 1) : 1;
          d += (i ? 'L' : 'M') + (100 + Math.cos(a) * rx * r).toFixed(1) + ' ' + (70 + Math.sin(a) * ry * r).toFixed(1);
        }
        return d + 'Z';
      };
      return svg('0 0 200 140', `<path d="${burst(98, 68, 14, 0.32)}" fill="#e63946"/><path d="${burst(86, 58, 14, 0.3)}" fill="#ffd60a"/><path d="${burst(62, 40, 12, 0.22)}" fill="#fff3b0"/>` +
        '<text x="100" y="86" text-anchor="middle" font-family="Impact, \'Arial Black\', \'Segoe UI Black\', sans-serif" font-weight="900" font-size="46" fill="#e63946" stroke="#7a1020" stroke-width="2" transform="rotate(-6 100 70)">BOOM!</text>');
    },
    /** Paint splat (100 × 100): a wobbly blob and a few droplets. */
    splat: (c) => {
      const n = 18, pts = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, r = Math.random() < 0.3 ? R(40, 46) : R(31, 37); pts.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]); }
      const mid = (a, b) => [((a[0] + b[0]) / 2).toFixed(1), ((a[1] + b[1]) / 2).toFixed(1)];
      let d = 'M' + mid(pts[n - 1], pts[0]).join(' ');
      for (let i = 0; i < n; i++) d += 'Q' + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1) + ' ' + mid(pts[i], pts[(i + 1) % n]).join(' ');
      let drops = '';
      for (let i = 0; i < 6; i++) { const a = R(0, Math.PI * 2), r = R(44, 49); drops += `<circle cx="${(50 + Math.cos(a) * r).toFixed(1)}" cy="${(50 + Math.sin(a) * r).toFixed(1)}" r="${R(1.5, 3.5).toFixed(1)}"/>`; }
      return svg('0 0 100 100', `<g fill="${c}"><path d="${d}Z"/>${drops}</g><ellipse cx="40" cy="38" rx="12" ry="7" fill="#fff" opacity=".18" transform="rotate(-30 40 38)"/>`);
    },
  };

  // ---------------------------------------------------------------- particle helpers
  /** A particle box (w × h) on the scene layer; css: extra inline styles. */
  function part(c, html, w, h, css) {
    const n = document.createElement('div');
    n.className = 'pz-fx-p';
    n.style.width = w + 'px'; n.style.height = h + 'px';
    if (css) Object.assign(n.style, css);
    if (html) n.innerHTML = html;
    n._hw = w / 2; n._hh = h / 2;
    c.layer.appendChild(n);
    return n;
  }
  /** Keyframe with the particle's centre at (x, y). o: { r (deg), s (scale), o (opacity), t (extra transform), at (offset), e (easing) } */
  function at(n, x, y, o) {
    o = o || {};
    const k = { transform: `translate(${(x - n._hw).toFixed(1)}px, ${(y - n._hh).toFixed(1)}px) rotate(${(o.r || 0).toFixed(1)}deg) scale(${o.s == null ? 1 : o.s.toFixed(3)})${o.t || ''}`, opacity: o.o == null ? 1 : clamp01(o.o) };
    if (o.at != null) k.offset = clamp01(o.at);
    if (o.e) k.easing = o.e;
    return k;
  }
  /** Animate a particle (linear, whole scene duration unless told otherwise). Hidden (CSS) before its delay. */
  function play(c, n, frames, o) {
    o = o || {};
    const a = n.animate(frames, Object.assign({ duration: c.D, easing: 'linear', fill: 'forwards' }, o, { delay: c.delay + (o.delay || 0) }));
    c.anims.push(a);
    return a;
  }
  /** Points of a thrown particle: from (x, y) at (vx, vy) px/s, gravity g px/s², air drag k /s, during T s → n + 1 points. */
  function flight(x, y, vx, vy, g, drag, T, n) {
    const pts = [[x, y]], sub = 6, dt = T / n / sub;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < sub; j++) { vx -= vx * drag * dt; vy += (g - vy * drag) * dt; x += vx * dt; y += vy * dt; }
      pts.push([x, y]);
    }
    return pts;
  }
  /** Smoke / cloud puff: soft grey-white disc. */
  const puff = (c, size, tone) => part(c, '', size, size, { borderRadius: '50%',
    background: tone === 'dark' ? 'radial-gradient(circle, rgba(70,70,82,.85) 0%, rgba(80,80,92,.6) 40%, rgba(90,90,100,0) 70%)'
      : 'radial-gradient(circle, rgba(255,255,255,.98) 0%, rgba(232,235,242,.92) 42%, rgba(210,215,226,0) 70%)' });
  /** Burst of thrown bits from (cx, cy). o: { n, size, speed, up, g, colors, stars, T (ms), delay, k } */
  function debris(c, cx, cy, o) {
    const n = 8;
    for (let i = 0; i < o.n; i++) {
      const sz = R(0.5, 1.5) * o.size, star = Math.random() < (o.stars || 0);
      const p = part(c, star ? ART.star(pick(o.colors)) : '', sz, star ? sz : sz * R(0.7, 1.3), star ? null : { background: pick(o.colors), borderRadius: Math.random() < 0.6 ? '50%' : '3px' });
      const a = R(0, Math.PI * 2), sp = R(0.35, 1) * o.speed;
      const pts = flight(cx, cy, Math.cos(a) * sp * 1.25, Math.sin(a) * sp - o.up, o.g, 1.4, o.T / 1000, n);
      const spin = R(-600, 600), shrink = R(0.3, 0.7);
      play(c, p, pts.map(([x, y], j) => at(p, x, y, { r: (spin * j) / n, s: 1 - (shrink * j) / n, o: j > n - 3 ? (n - j) / 2 : 1 })), { delay: o.delay, duration: o.T });
    }
  }
  /** Expanding shock ring. */
  function ring(c, cx, cy, size, color, delay, T, grow) {
    const r = part(c, '', size, size, { borderRadius: '50%', border: Math.max(3, size * 0.09) + 'px solid ' + color, boxSizing: 'border-box' });
    play(c, r, [at(r, cx, cy, { s: 0.1 }), at(r, cx, cy, { s: grow, o: 0 })], { delay, duration: T, easing: 'cubic-bezier(.1,.7,.3,1)' });
  }
  /** Waddling turtle crossing from x0 to x1 at height y (the walk follows `easing`; legs and body bob on their own). */
  function turtle(c, x0, x1, y, tw, o) {
    o = o || {};
    const th = (tw * 90) / 130, n = part(c, ART.turtle(pick(SHELLS), Math.random() < 0.22), tw, th);
    const flip = x1 < x0 ? ' scaleX(-1)' : '';
    const frames = o.frames || [at(n, x0, y, { t: flip }), at(n, x1, y, { t: flip })];
    play(c, n, frames, { easing: o.easing || 'linear', fill: 'both', duration: o.T || c.D, delay: o.delay || 0 });
    const T = o.T || c.D, per = R(320, 420);
    const it = { duration: per, iterations: T / per, delay: c.delay + (o.delay || 0) };
    const sv = n.firstChild, legF = n.querySelector('.pz-leg-f'), legB = n.querySelector('.pz-leg-b');
    c.anims.push(sv.animate([{ transform: 'translateY(0) rotate(-3deg)' }, { transform: 'translateY(-6%) rotate(3deg)' }, { transform: 'translateY(0) rotate(-3deg)' }], it));
    if (legF && legF.animate) c.anims.push(legF.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-4px)' }], it));
    if (legB && legB.animate) c.anims.push(legB.animate([{ transform: 'translateX(4px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }], it));
    return n;
  }
  /** Rising heart / bubble from (x, y) to height y1 with a sway; o.popAt (step 1-7 of 8): bursts there instead. */
  function rise(c, n, x, y, y1, o) {
    const steps = 8, ph = R(0, Math.PI * 2), end = o.popAt || steps, fr = [];
    const pos = (f) => [x + Math.sin(ph + f * 5) * o.amp, y + (y1 - y) * f];
    for (let j = 0; j <= end; j++) {
      const f = j / steps, [px, py] = pos(f);
      fr.push(at(n, px, py, { r: Math.sin(ph + f * 5) * (o.tilt || 0), s: j === 0 ? o.s0 || 0.5 : 1, o: j === 0 || j === steps ? 0 : 1, at: f }));
    }
    if (o.popAt) { const f = end / steps, [px, py] = pos(f); fr.push(at(n, px, py, { s: 1.6, o: 0, at: f + 0.06 }), at(n, px, py, { s: 1.6, o: 0, at: 1 })); }
    play(c, n, fr, { delay: o.delay, duration: o.T });
  }

  // ---------------------------------------------------------------- scenes
  const S = (id, kind, name, run) => { PZ.SCENES[id] = { id, kind, name, run }; };

  S('boom', 'transition', 'Explosion', (c) => {
    const { w, h, D } = c, k = h / 1080, cx = w / 2, cy = h / 2, T0 = 0.3, rest = (1 - T0) * D;
    const fl = part(c, '', w, h, { background: 'radial-gradient(circle at 50% 50%, #fff 0%, #fff7c2 22%, rgba(255,190,60,.9) 50%, rgba(255,120,40,.35) 70%, rgba(255,120,40,0) 85%)' });
    play(c, fl, [at(fl, cx, cy, { o: 0 }), at(fl, cx, cy, { o: 0, at: T0 }), at(fl, cx, cy, { o: 1, s: 1.4, at: T0 + 0.05 }), at(fl, cx, cy, { o: 0.9, s: 1.5, at: T0 + 0.13 }), at(fl, cx, cy, { o: 0, s: 1.6, at: 0.72 }), at(fl, cx, cy, { o: 0, s: 1.6 })], { fill: 'both' });
    ring(c, cx, cy, 260 * k, 'rgba(255,236,170,.95)', T0 * D, 0.45 * D, 10);
    ring(c, cx, cy, 200 * k, 'rgba(255,140,40,.9)', T0 * D + 80, 0.45 * D, 8);
    for (let i = 0; i < 12; i++) {
      const p = puff(c, R(180, 340) * k, 'dark'), a = R(0, Math.PI * 2), d = R(150, 420) * k;
      play(c, p, [at(p, cx + Math.cos(a) * 40 * k, cy + Math.sin(a) * 40 * k, { s: 0.3, o: 0.9 }), at(p, cx + Math.cos(a) * d, cy + Math.sin(a) * d - R(40, 180) * k, { s: R(1.8, 2.8), o: 0 })],
        { delay: (T0 + 0.03) * D, duration: 0.62 * D, easing: 'ease-out' });
    }
    debris(c, cx, cy, { n: 48, size: 30 * k, speed: 1900 * k, up: 300 * k, g: 1500 * k, colors: DEBRIS, stars: 0.3, T: rest, delay: T0 * D });
    const bh = 0.5 * h, bw = (bh * 200) / 140, b = part(c, ART.boom(), bw, bh);
    play(c, b, [at(b, cx, cy, { s: 0, o: 0 }), at(b, cx, cy, { s: 0, o: 0, at: T0 + 0.01 }), at(b, cx, cy, { s: 1.2, r: -8, at: T0 + 0.07 }), at(b, cx, cy, { s: 0.95, r: 4, at: T0 + 0.13 }),
      at(b, cx, cy, { s: 1, at: T0 + 0.2 }), at(b, cx, cy, { s: 1.05, at: 0.62 }), at(b, cx, cy, { s: 1.4, o: 0, at: 0.74 }), at(b, cx, cy, { s: 1.4, o: 0 })], { fill: 'both' });
  });

  // The incoming slide's clip edge runs 11% of the width behind the lead turtle, which walks from -5% to 130% (see fun-turtles).
  S('turtles', 'transition', 'Turtle parade', (c) => {
    const { w, h } = c, tw = w * 0.085, th = (tw * 90) / 130, lanes = Math.max(3, Math.round(h / (th * 1.3)));
    for (let l = 0; l < lanes; l++) {
      const count = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const back = ((i + R(0, 0.6)) / count) * 0.2 * w, s = R(0.8, 1.1);
        const y = ((l + 0.5) * h) / lanes + R(-0.15, 0.15) * th;
        turtle(c, -0.05 * w - back, 1.3 * w - back, y, tw * s, { easing: c.easing });
      }
    }
  });

  S('confetti', 'transition', 'Confetti', (c) => {
    const { w, h, D } = c, k = h / 1080;
    for (let i = 0; i < 140; i++) {
      const left = i % 2 === 0, t0 = R(0, 0.2) * D, T = D - t0, sz = R(16, 30) * k;
      const p = part(c, '', sz, sz * R(1.3, 2.1), { background: pick(CONFETTI), borderRadius: Math.random() < 0.3 ? '50%' : '3px' });
      const pts = flight(left ? -10 * k : w + 10 * k, h + 10 * k, (left ? 1 : -1) * R(0.15, 0.8) * w, -R(1.3, 2.4) * h, 2.6 * h, 1.5, T / 1000, 10);
      const spin = R(-720, 720), flip = R(2, 6) * 180;
      play(c, p, pts.map(([x, y], j) => at(p, x, y, { r: (spin * j) / 10, t: ` rotateX(${((flip * j) / 10).toFixed(0)}deg)`, o: j === 10 ? 0 : 1 })), { delay: t0, duration: T });
    }
  });

  S('hearts', 'transition', 'Hearts', (c) => {
    const { w, h, D } = c, k = h / 1080;
    for (let i = 0; i < 36; i++) {
      const sz = R(50, 130) * k, T = R(0.55, 0.8) * D, n = part(c, ART.heart(pick(HEARTS)), sz, (sz * 30) / 32);
      rise(c, n, R(0, w), h + sz, -sz, { amp: R(30, 90) * k, tilt: 15, T, delay: R(0, D - T) });
    }
  });

  // The band's back edge is the incoming slide's clip edge: it goes from -35% to 100% of the width (see fun-rainbow).
  S('rainbow', 'transition', 'Rainbow', (c) => {
    const { w, h } = c, k = h / 1080, B = 0.35 * w, stripes = RAINBOW.slice().reverse();
    const band = part(c, '', B, h, { background: `linear-gradient(90deg, ${stripes.map((col, i) => `${col} ${((i / 7) * 100).toFixed(2)}% ${(((i + 1) / 7) * 100).toFixed(2)}%`).join(', ')})`, boxShadow: `0 0 ${50 * k}px rgba(255,255,255,.8)` });
    play(c, band, [at(band, -B / 2, h / 2), at(band, w + B / 2, h / 2)], { easing: c.easing, fill: 'both' });
    for (let i = 0; i < 26; i++) {
      const sz = R(30, 70) * k, n = part(c, ART.sparkle(pick(GLITTER)), sz, sz), dx = R(0, B), y = R(0, h), steps = 10, ph = R(0, 6);
      const fr = [];
      for (let j = 0; j <= steps; j++) { const f = j / steps; fr.push(at(n, -B + dx + f * (w + B), y, { s: Math.abs(Math.sin(ph + f * 9)), r: f * 180 })); }
      play(c, n, fr, { easing: c.easing, fill: 'both' });
    }
  });

  S('bubbles', 'transition', 'Bubbles', (c) => {
    const { w, h, D } = c, k = h / 1080;
    for (let i = 0; i < 70; i++) {
      const sz = R(40, 230) * k, T = R(0.5, 0.75) * D;
      const n = part(c, '', sz, sz, { borderRadius: '50%', border: Math.max(2, 3 * k) + 'px solid rgba(255,255,255,.85)', boxShadow: `inset 0 0 ${12 * k}px rgba(255,255,255,.55), 0 0 ${6 * k}px rgba(80,160,255,.3)`,
        background: 'radial-gradient(circle at 32% 30%, rgba(255,255,255,.95) 0 7%, rgba(255,255,255,0) 9%), radial-gradient(circle at 50% 50%, rgba(140,210,255,.12) 55%, rgba(120,200,255,.45) 100%)' });
      rise(c, n, R(-0.05, 1.05) * w, h + sz / 2, -sz / 2, { amp: R(10, 40) * k, s0: 0.6, T, delay: R(0, D - T), popAt: Math.random() < 0.4 ? Math.floor(R(4, 7)) : 0 });
    }
  });

  S('warp', 'transition', 'Stars (warp)', (c) => {
    const { w, h, D } = c, k = h / 1080, cx = w / 2, cy = h / 2;
    const sky = part(c, '', w, h, { background: 'radial-gradient(circle at 50% 50%, rgba(20,16,60,.25) 0%, rgba(12,10,40,.92) 75%)' });
    play(c, sky, [at(sky, cx, cy, { o: 0 }), at(sky, cx, cy, { o: 1, at: 0.25 }), at(sky, cx, cy, { o: 1, at: 0.6 }), at(sky, cx, cy, { o: 0 })], { fill: 'both' });
    for (let i = 0; i < 110; i++) {
      const a = R(0, Math.PI * 2), deg = (a * 180) / Math.PI + 90, r0 = R(0, 0.08) * w, r1 = R(0.75, 1.05) * w, T = R(0.3, 0.5) * D;
      const len = R(4, 10), sz = R(8, 16) * k, col = pick(['#ffffff', '#cfe8ff', '#ffe58a', '#ffd1f3']);
      const n = part(c, '', sz, sz * len, { borderRadius: sz + 'px', background: `linear-gradient(to bottom, ${col}, rgba(255,255,255,0))` });
      play(c, n, [at(n, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, { r: deg, s: 0.2, o: 0 }), at(n, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, { r: deg, s: 1.6, o: 1 })],
        { delay: R(0.05, 0.45) * D, duration: T, easing: 'cubic-bezier(.55,0,1,.45)' });
    }
  });

  // Rocket body bottom = the incoming slide's clip edge: from 133% of the height down to -12% (see fun-rocket).
  S('rocket', 'transition', 'Rocket', (c) => {
    const { w, h } = c, k = h / 1080, Hs = 0.45 * h, Ws = (Hs * 60) / 140, cx = w / 2, edge = (p) => 1.3345 * h - p * 1.45 * h;
    const n = part(c, ART.rocket(), Ws, Hs), dy = Hs * (0.5 - 104 / 140);
    play(c, n, [at(n, cx, edge(0) + dy), at(n, cx, edge(1) + dy)], { easing: c.easing, fill: 'both' });
    const fl = n.querySelector('.pz-flame');
    if (fl && fl.animate) c.anims.push(fl.animate([{ transform: 'scaleY(.8)' }, { transform: 'scaleY(1.2)' }, { transform: 'scaleY(.8)' }], { duration: 140, iterations: c.D / 140 }));
    const cloud = (x, y, x2, p, size) => {
      const q = puff(c, size);
      play(c, q, [at(q, x, y, { s: 0.2, o: 0 }), at(q, x, y, { s: 0.2, o: 0, at: p }), at(q, x, y, { s: 1, o: 0.95, at: p + 0.04 }), at(q, x2, y - R(0, 60) * k, { s: R(1.6, 2.4), o: 0, at: Math.min(1, p + 0.4) })].concat(p + 0.4 < 1 ? [at(q, x2, y, { o: 0 })] : []),
        { easing: c.easing, fill: 'both' });
    };
    for (let i = 0; i < 30; i++) { // trail: each puff appears as the rocket passes its height
      const y = R(-0.05, 1.05) * h, p = clamp01((1.3345 * h - y) / (1.45 * h)) - 0.03, x = cx + R(-0.04, 0.04) * w;
      if (p > 0 && p < 0.95) cloud(x, y, x + R(-0.12, 0.12) * w, p, R(140, 260) * k);
    }
    for (let i = 0; i < 12; i++) { const x = cx + R(-0.06, 0.06) * w; cloud(x, h, x + R(-0.35, 0.35) * w, R(0.18, 0.26), R(180, 320) * k); } // launch pad
  });

  S('paint', 'transition', 'Paint splash', (c) => {
    const { w, h, doc } = c, M = Math.max(w, h), th = (doc && doc.theme) || {};
    const cols = [th.accent, th.accent2].filter(Boolean).concat(CONFETTI);
    const splat = (x, y, size, col, t0, t1) => {
      const n = part(c, ART.splat(col), size, size), r = R(-40, 40);
      play(c, n, [at(n, x, y, { s: 0.05, o: 0, r }), at(n, x, y, { s: 0.05, o: 0, r, at: t0 }), at(n, x, y, { s: 1.08, r, at: t0 + 0.07 }), at(n, x, y, { s: 1, r, at: t0 + 0.1 }),
        at(n, x, y, { s: 1, r, at: t1 }), at(n, x, y, { s: 1.06, o: 0, r, at: t1 + 0.2 }), at(n, x, y, { s: 1.06, o: 0, r })], { fill: 'both' });
    };
    for (let i = 0; i < 7; i++) splat(R(0.1, 0.9) * w, R(0.1, 0.9) * h, R(0.5, 0.8) * M, pick(cols), 0.03 + i * 0.05, R(0.56, 0.66));
    splat(w / 2, h / 2, 2.4 * M, cols[0] || '#5b5bf0', 0.4, 0.58); // the last one covers the whole slide while they swap
  });

  // ---- element scenes (around ctx.box)
  const sizeK = (c) => Math.max(0.6, Math.min(1.6, Math.sqrt(c.box.w * c.box.h) / 400)) * (c.h / 1080);
  const centre = (c) => [c.box.x + c.box.w / 2, c.box.y + c.box.h / 2];

  S('confetti-burst', 'element', 'Confetti burst', (c) => {
    const [cx, cy] = centre(c), k = sizeK(c), T = Math.max(1300, c.D * 1.8);
    debris(c, cx, cy, { n: 50, size: 18 * k, speed: 1200 * k, up: 500 * k, g: 1700 * k, colors: CONFETTI, stars: 0.15, T, delay: c.D * 0.45 });
  });

  S('sparkles', 'element', 'Sparkles', (c) => {
    const b = c.box, k = sizeK(c), T = Math.max(1200, c.D);
    for (let i = 0; i < 16; i++) {
      const side = Math.floor(R(0, 4)), f = R(-0.05, 1.05), pad = R(-0.05, 0.12);
      const x = side < 2 ? b.x + f * b.w : side === 2 ? b.x - pad * b.w : b.x + b.w + pad * b.w;
      const y = side === 0 ? b.y - pad * b.h : side === 1 ? b.y + b.h + pad * b.h : b.y + f * b.h;
      const sz = R(28, 64) * k, n = part(c, ART.sparkle(pick(GLITTER)), sz, sz), d = R(0.35, 0.6) * T;
      play(c, n, [at(n, x, y, { s: 0, o: 0 }), at(n, x, y, { s: 1, r: 90, at: 0.5 }), at(n, x, y, { s: 0, r: 180, o: 0 })], { delay: R(0, T - d), duration: d, easing: 'ease-in-out' });
    }
  });

  S('hearts-pop', 'element', 'Hearts', (c) => {
    const b = c.box, k = sizeK(c), T = Math.max(1400, c.D * 1.2);
    for (let i = 0; i < 10; i++) {
      const sz = R(36, 80) * k, d = R(0.6, 0.9) * T, n = part(c, ART.heart(pick(HEARTS)), sz, (sz * 30) / 32), y = b.y + b.h * 0.3;
      rise(c, n, b.x + R(0.15, 0.85) * b.w, y, y - R(180, 380) * k, { amp: R(15, 40) * k, tilt: 12, T: d, delay: R(0, T - d) });
    }
  });

  S('explode', 'element', 'Explosion', (c) => {
    const [cx, cy] = centre(c), k = sizeK(c), t0 = c.D * 0.15, T = Math.max(1100, c.D * 1.3);
    ring(c, cx, cy, 160 * k, 'rgba(255,214,10,.95)', t0, T * 0.5, 6);
    const fl = part(c, '', 380 * k, 380 * k, { borderRadius: '50%', background: 'radial-gradient(circle, #fff 0%, #fff3b0 30%, rgba(255,159,28,.8) 55%, rgba(255,93,42,0) 72%)' });
    play(c, fl, [at(fl, cx, cy, { s: 0.2 }), at(fl, cx, cy, { s: 1.3, at: 0.3 }), at(fl, cx, cy, { s: 1.6, o: 0 })], { delay: t0, duration: T * 0.6 });
    for (let i = 0; i < 7; i++) {
      const p = puff(c, R(100, 200) * k, 'dark'), a = R(0, Math.PI * 2), d = R(60, 200) * k;
      play(c, p, [at(p, cx, cy, { s: 0.3, o: 0.8 }), at(p, cx + Math.cos(a) * d, cy + Math.sin(a) * d - 60 * k, { s: 2, o: 0 })], { delay: t0 + 60, duration: T * 0.7, easing: 'ease-out' });
    }
    debris(c, cx, cy, { n: 40, size: 20 * k, speed: 1500 * k, up: 300 * k, g: 1500 * k, colors: DEBRIS, stars: 0.3, T, delay: t0 });
  });

  S('poof', 'element', 'Smoke puffs', (c) => {
    const b = c.box, [cx, cy] = centre(c), k = sizeK(c), t0 = c.D * 0.3, T = Math.max(900, c.D * 1.1);
    for (let i = 0; i < 14; i++) {
      const p = puff(c, R(110, 220) * k), x = b.x + R(0.1, 0.9) * b.w, y = b.y + R(0.1, 0.9) * b.h;
      play(c, p, [at(p, x, y, { s: 0.2, o: 0 }), at(p, x, y, { s: 1, o: 1, at: 0.25 }), at(p, x + (x - cx) * 0.6, y + (y - cy) * 0.6 - 40 * k, { s: R(1.5, 2.2), o: 0 })], { delay: t0 + R(0, 120), duration: T, easing: 'ease-out' });
    }
    for (let i = 0; i < 6; i++) {
      const sz = R(24, 44) * k, n = part(c, ART.star(pick(GLITTER)), sz, sz), a = R(0, Math.PI * 2), d = R(0.5, 0.9) * Math.max(b.w, b.h);
      play(c, n, [at(n, cx, cy, { s: 0, o: 0 }), at(n, cx + Math.cos(a) * d, cy + Math.sin(a) * d, { s: 1, r: 160, at: 0.6 }), at(n, cx + Math.cos(a) * d * 1.1, cy + Math.sin(a) * d * 1.1, { s: 0, r: 240, o: 0 })], { delay: t0, duration: T, easing: 'ease-out' });
    }
  });

  S('smoke', 'element', 'Rocket smoke', (c) => {
    const b = c.box, k = sizeK(c), bottom = b.y + b.h;
    for (let i = 0; i < 18; i++) {
      const p = puff(c, R(90, 200) * k), x = b.x + R(0.25, 0.75) * b.w, dir = Math.random() < 0.5 ? -1 : 1, t = R(0, 0.55);
      play(c, p, [at(p, x, bottom, { s: 0.2, o: 0 }), at(p, x, bottom, { s: 1, o: 0.95, at: 0.15 }), at(p, x + dir * R(0.3, 0.9) * b.w, bottom - R(0, 40) * k, { s: R(1.6, 2.6), o: 0 })], { delay: t * c.D, duration: c.D * 0.7, easing: 'ease-out' });
    }
  });

  S('turtle-trio', 'element', 'Turtles', (c) => {
    const b = c.box, k = c.h / 1080, tw = Math.max(80 * k, Math.min(200 * k, b.w * 0.18)), th = (tw * 90) / 130, y = b.y + b.h + th * 0.25, T = Math.max(2400, c.D);
    for (let i = 0; i < 3; i++) {
      const x0 = b.x - tw, x1 = b.x + b.w + tw, delay = i * T * 0.12, d = T - delay, s = 1 - i * 0.12, n = { _hw: (tw * s) / 2, _hh: (th * s) / 2 };
      turtle(c, x0, x1, y, tw * s, { T: d, delay, frames: [at(n, x0, y, { o: 0 }), at(n, x0 + (x1 - x0) * 0.12, y, { at: 0.12 }), at(n, x0 + (x1 - x0) * 0.88, y, { at: 0.88 }), at(n, x1, y, { o: 0 })] });
    }
  });

  // ---------------------------------------------------------------- effects (listed when the fun pack is on)
  const L = PZ.EFFECTS;
  const free = (id) => { if (L[id]) throw new Error('fun.js: duplicate effect id ' + id); return id; };
  const T = (id, name, scene, def) => { L[free(id)] = Object.assign({ id, name, kind: 'transition', builtin: true, fun: true, scene, inTop: true, in: [], out: [] }, def); };
  const A = (kind, id, name, scene, frames, def) => { L[free(id)] = Object.assign({ id, name, kind, builtin: true, fun: true, frames }, scene ? { scene } : null, def); };
  const CLIP_ALL = 'inset(0% 0% 0% 0%)';

  T('fun-boom', 'Big explosion', 'boom', { duration: 1600, easing: 'linear',
    out: [{}, { offset: 0.06, x: -0.6 }, { offset: 0.12, x: 0.6, y: 0.4 }, { offset: 0.18, x: -0.6, y: -0.4 }, { offset: 0.24, x: 0.6 }, { offset: 0.3, scale: 1.03 }, { offset: 0.34, scale: 1.08, opacity: 0 }, { scale: 1.08, opacity: 0 }],
    in: [{ opacity: 0, scale: 1.3, blur: 14 }, { offset: 0.34, opacity: 0, scale: 1.3, blur: 14 }, { offset: 0.42, scale: 1.2, blur: 8 }, { offset: 0.75, scale: 0.98 }, {}] });
  T('fun-turtles', 'Turtle parade', 'turtles', { duration: 3000, easing: 'linear',
    in: [{ clip: 'inset(0% 100% 0% 0%)' }, { offset: 0.119, clip: 'inset(0% 100% 0% 0%)' }, { offset: 0.859, clip: CLIP_ALL }, { clip: CLIP_ALL }] });
  T('fun-confetti', 'Confetti party', 'confetti', { duration: 2000, easing: 'linear', in: [{ opacity: 0 }, { offset: 0.25, opacity: 0 }, { offset: 0.6 }, {}] });
  T('fun-hearts', 'Floating hearts', 'hearts', { duration: 2000, easing: 'linear', in: [{ opacity: 0, scale: 0.96 }, { offset: 0.3, opacity: 0, scale: 0.96 }, { offset: 0.7 }, {}] });
  T('fun-rainbow', 'Rainbow wipe', 'rainbow', { duration: 1500, easing: 'ease-in-out',
    in: [{ clip: 'inset(0% 100% 0% 0%)' }, { offset: 0.2593, clip: 'inset(0% 100% 0% 0%)' }, { clip: CLIP_ALL }] });
  T('fun-bubbles', 'Bubbles', 'bubbles', { duration: 2000, easing: 'linear', in: [{ opacity: 0 }, { offset: 0.4, opacity: 0 }, { offset: 0.62 }, {}] });
  T('fun-warp', 'Warp speed', 'warp', { duration: 1500, easing: 'ease-in-out',
    in: [{ scale: 0.15, opacity: 0 }, { offset: 0.45, scale: 0.15, opacity: 0 }, {}], out: [{}, { offset: 0.5, scale: 2.5, opacity: 0 }, { scale: 2.5, opacity: 0 }] });
  T('fun-rocket', 'Rocket launch', 'rocket', { duration: 2200, easing: 'ease-in',
    in: [{ clip: 'inset(100% 0% 0% 0%)' }, { offset: 0.2307, clip: 'inset(100% 0% 0% 0%)' }, { offset: 0.92, clip: CLIP_ALL }, { clip: CLIP_ALL }] });
  T('fun-paint', 'Paint splash', 'paint', { duration: 1800, easing: 'linear', in: [{ opacity: 0 }, { offset: 0.5, opacity: 0 }, { offset: 0.52 }, {}] });

  A('in', 'fun-confetti-pop', 'Confetti pop', 'confetti-burst', [{ scale: 0, opacity: 0 }, { offset: 0.65, scale: 1.15, opacity: 1 }, {}], { duration: 700, easing: 'ease-out' });
  A('in', 'fun-boing', 'Boing!', null, [{ y: -30, opacity: 0, scaleX: 0.8, scaleY: 1.3, easing: 'ease-in' }, { offset: 0.5, opacity: 1 }, { offset: 0.6, scaleX: 1.3, scaleY: 0.7 },
    { offset: 0.75, y: -4, scaleX: 0.9, scaleY: 1.1 }, { offset: 0.88, scaleX: 1.05, scaleY: 0.95 }, {}], { duration: 1100, easing: 'linear', origin: '50% 100%' });
  A('in', 'fun-sparkle-in', 'Sparkle in', 'sparkles', [{ scale: 0.6, opacity: 0, blur: 8 }, {}], { duration: 900, easing: 'expo-out' });
  A('emph', 'fun-jelly', 'Jelly', null, [{}, { offset: 0.3, scaleX: 1.25, scaleY: 0.75 }, { offset: 0.4, scaleX: 0.75, scaleY: 1.25 }, { offset: 0.5, scaleX: 1.15, scaleY: 0.85 },
    { offset: 0.65, scaleX: 0.95, scaleY: 1.05 }, { offset: 0.75, scaleX: 1.05, scaleY: 0.95 }, {}], { duration: 900, easing: 'linear' });
  A('emph', 'fun-tada', 'Tada!', 'sparkles', [{}, { offset: 0.1, scale: 0.9, rotate: -3 }, { offset: 0.2, scale: 0.9, rotate: -3 }, { offset: 0.3, scale: 1.1, rotate: 3 }, { offset: 0.4, scale: 1.1, rotate: -3 },
    { offset: 0.5, scale: 1.1, rotate: 3 }, { offset: 0.6, scale: 1.1, rotate: -3 }, { offset: 0.7, scale: 1.1, rotate: 3 }, { offset: 0.8, scale: 1.1, rotate: -3 }, { offset: 0.9, scale: 1.1, rotate: 3 }, {}], { duration: 1100, easing: 'linear' });
  A('emph', 'fun-heartbeat', 'Heartbeat', 'hearts-pop', [{}, { offset: 0.14, scale: 1.25 }, { offset: 0.28 }, { offset: 0.42, scale: 1.25 }, { offset: 0.7 }, {}], { duration: 1300, easing: 'ease-in-out' });
  A('emph', 'fun-turtle-escort', 'Turtle escort', 'turtle-trio', [{}, { offset: 0.25, y: -1 }, { offset: 0.5 }, { offset: 0.75, y: -1 }, {}], { duration: 2600, easing: 'ease-in-out' });
  A('out', 'fun-explode', 'Explode', 'explode', [{}, { offset: 0.15, scale: 0.9 }, { offset: 0.3, scale: 1.4, opacity: 0, blur: 6 }, { scale: 1.4, opacity: 0, blur: 6 }], { duration: 1000, easing: 'linear' });
  A('out', 'fun-poof', 'Poof!', 'poof', [{}, { offset: 0.4, scale: 1.08 }, { scale: 0.2, opacity: 0 }], { duration: 800, easing: 'ease-in' });
  A('out', 'fun-blast-off', 'Blast off', 'smoke', [{}, { offset: 0.08, x: -0.3 }, { offset: 0.16, x: 0.3 }, { offset: 0.24, x: -0.3 }, { offset: 0.32, x: 0.3 }, { offset: 0.4, easing: 'ease-in' }, { y: -110 }],
    { duration: 1400, easing: 'linear' });
})(window.PZ = window.PZ || {});
