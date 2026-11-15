/* PrezEn · shapes: vector shapes drawn at their real size (so strokes never stretch). */
(function (PZ) {
  'use strict';

  const f = (n) => Math.round(n * 100) / 100;
  const poly = (pts) => 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join(' L') + ' Z';
  // points given in a unit box, mapped to (x, y, w, h)
  const unit = (pts) => (x, y, w, h) => poly(pts.map((p) => [x + p[0] * w, y + p[1] * h]));
  const regular = (n, rot) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = rot + (i * 2 * Math.PI) / n;
      pts.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]);
    }
    return unit(pts);
  };
  const star = (n, inner) => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / n;
      const r = i % 2 ? inner : 0.5;
      pts.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a) + (n === 5 ? 0.04 : 0)]);
    }
    return unit(pts);
  };
  const ellipse = (x, y, w, h) => {
    const rx = w / 2, ry = h / 2, cx = x + rx, cy = y + ry;
    return `M${f(cx - rx)} ${f(cy)} A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)} A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)} Z`;
  };
  const roundRect = (x, y, w, h, r) => {
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    if (!r) return poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
    return `M${f(x + r)} ${f(y)} H${f(x + w - r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)} V${f(y + h - r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)} H${f(x + r)} A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)} V${f(y + r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)} Z`;
  };

  /** Each shape: name, path(x, y, w, h, el) for filled shapes, or line:true for stroke-only shapes. */
  PZ.SHAPES = {
    rect: { name: 'Rectangle', path: (x, y, w, h, el) => roundRect(x, y, w, h, el.radius) },
    rounded: { name: 'Rounded', path: (x, y, w, h, el) => roundRect(x, y, w, h, el.radius || Math.min(w, h) * 0.2) },
    ellipse: { name: 'Ellipse', path: ellipse },
    triangle: { name: 'Triangle', path: unit([[0.5, 0], [1, 1], [0, 1]]) },
    'right-triangle': { name: 'Right triangle', path: unit([[0, 0], [1, 1], [0, 1]]) },
    diamond: { name: 'Diamond', path: unit([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]) },
    pentagon: { name: 'Pentagon', path: regular(5, -Math.PI / 2) },
    hexagon: { name: 'Hexagon', path: unit([[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]]) },
    octagon: { name: 'Octagon', path: unit([[0.29, 0], [0.71, 0], [1, 0.29], [1, 0.71], [0.71, 1], [0.29, 1], [0, 0.71], [0, 0.29]]) },
    parallelogram: { name: 'Parallelogram', path: unit([[0.2, 0], [1, 0], [0.8, 1], [0, 1]]) },
    trapezoid: { name: 'Trapezoid', path: unit([[0.2, 0], [0.8, 0], [1, 1], [0, 1]]) },
    star: { name: 'Star', path: star(5, 0.2) },
    star6: { name: 'Star 6', path: star(6, 0.28) },
    burst: { name: 'Burst', path: star(12, 0.38) },
    heart: {
      name: 'Heart', path: (x, y, w, h) => {
        const X = (u) => f(x + u * w), Y = (v) => f(y + v * h);
        return `M${X(0.5)} ${Y(0.24)} C${X(0.5)} ${Y(0.1)} ${X(0.38)} ${Y(0)} ${X(0.25)} ${Y(0)} C${X(0.1)} ${Y(0)} ${X(0)} ${Y(0.12)} ${X(0)} ${Y(0.29)} C${X(0)} ${Y(0.56)} ${X(0.3)} ${Y(0.76)} ${X(0.5)} ${Y(1)} C${X(0.7)} ${Y(0.76)} ${X(1)} ${Y(0.56)} ${X(1)} ${Y(0.29)} C${X(1)} ${Y(0.12)} ${X(0.9)} ${Y(0)} ${X(0.75)} ${Y(0)} C${X(0.62)} ${Y(0)} ${X(0.5)} ${Y(0.1)} ${X(0.5)} ${Y(0.24)} Z`;
      },
    },
    'arrow-block': {
      name: 'Block arrow', path: (x, y, w, h) => {
        const hd = Math.min(w * 0.45, h * 0.9);
        return poly([[x, y + h * 0.28], [x + w - hd, y + h * 0.28], [x + w - hd, y], [x + w, y + h / 2], [x + w - hd, y + h], [x + w - hd, y + h * 0.72], [x, y + h * 0.72]]);
      },
    },
    chevron: {
      name: 'Chevron', path: (x, y, w, h) => {
        const d = Math.min(w * 0.4, h * 0.5);
        return poly([[x, y], [x + w - d, y], [x + w, y + h / 2], [x + w - d, y + h], [x, y + h], [x + d, y + h / 2]]);
      },
    },
    plus: {
      name: 'Plus', path: (x, y, w, h) => {
        const t = Math.min(w, h) / 3, cx = x + w / 2, cy = y + h / 2;
        return poly([[cx - t / 2, y], [cx + t / 2, y], [cx + t / 2, cy - t / 2], [x + w, cy - t / 2], [x + w, cy + t / 2], [cx + t / 2, cy + t / 2], [cx + t / 2, y + h], [cx - t / 2, y + h], [cx - t / 2, cy + t / 2], [x, cy + t / 2], [x, cy - t / 2], [cx - t / 2, cy - t / 2]]);
      },
    },
    ring: {
      name: 'Ring', evenodd: true, path: (x, y, w, h) => {
        const t = Math.min(w, h) * 0.22;
        return ellipse(x, y, w, h) + ' ' + ellipse(x + t, y + t, w - 2 * t, h - 2 * t);
      },
    },
    bubble: {
      name: 'Speech bubble', path: (x, y, w, h) => {
        const bh = h * 0.78, r = Math.min(w, bh) * 0.18;
        const X = (v) => f(v), Y = (v) => f(v);
        return `M${X(x + r)} ${Y(y)} H${X(x + w - r)} A${f(r)} ${f(r)} 0 0 1 ${X(x + w)} ${Y(y + r)} V${Y(y + bh - r)} A${f(r)} ${f(r)} 0 0 1 ${X(x + w - r)} ${Y(y + bh)} H${X(x + w * 0.38)} L${X(x + w * 0.14)} ${Y(y + h)} L${X(x + w * 0.2)} ${Y(y + bh)} H${X(x + r)} A${f(r)} ${f(r)} 0 0 1 ${X(x)} ${Y(y + bh - r)} V${Y(y + r)} A${f(r)} ${f(r)} 0 0 1 ${X(x + r)} ${Y(y)} Z`;
      },
    },
    cloud: {
      name: 'Cloud', path: (x, y, w, h) => {
        const X = (u) => f(x + u * w), Y = (v) => f(y + v * h);
        return `M${X(0.25)} ${Y(0.9)} C${X(0.08)} ${Y(0.9)} ${X(0)} ${Y(0.76)} ${X(0)} ${Y(0.64)} C${X(0)} ${Y(0.5)} ${X(0.1)} ${Y(0.4)} ${X(0.22)} ${Y(0.4)} C${X(0.24)} ${Y(0.2)} ${X(0.38)} ${Y(0.08)} ${X(0.54)} ${Y(0.08)} C${X(0.7)} ${Y(0.08)} ${X(0.8)} ${Y(0.2)} ${X(0.82)} ${Y(0.34)} C${X(0.93)} ${Y(0.36)} ${X(1)} ${Y(0.48)} ${X(1)} ${Y(0.62)} C${X(1)} ${Y(0.78)} ${X(0.9)} ${Y(0.9)} ${X(0.76)} ${Y(0.9)} Z`;
      },
    },
    line: { name: 'Line', line: true },
    arrow: { name: 'Arrow', line: true, head: 'end' },
    'arrow-double': { name: 'Double arrow', line: true, head: 'both' },
  };

  let gradSeq = 0; // gradient ids must be unique per rendering (thumbnails and stage show the same slide)

  /** Build the <svg> of a shape element (DOM API only: values are numbers or validated colours). */
  PZ.shapeSvg = function (el) {
    const def = PZ.SHAPES[el.shape] || PZ.SHAPES.rect;
    const w = el.w, h = el.h;
    const svg = PZ.h('svg:svg', { class: 'pz-shape-svg', viewBox: `0 0 ${f(w)} ${f(h)}`, width: '100%', height: '100%', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const sw = el.sw || 0;
    const dash = el.dash === 'dash' ? `${sw * 3} ${sw * 2}` : el.dash === 'dot' ? `0.1 ${sw * 2}` : '';
    if (def.line) {
      const color = el.stroke || el.fill || '#1d2433';
      const lw = Math.max(1, sw || 6);
      const head = Math.max(lw * 3.2, 14);
      const y = h / 2;
      const x1 = def.head === 'both' ? head * 0.9 : 0, x2 = def.head ? w - head * 0.9 : w;
      svg.appendChild(PZ.h('svg:line', { x1: f(x1), y1: f(y), x2: f(Math.max(x1, x2)), y2: f(y), stroke: color, 'stroke-width': lw,
        'stroke-linecap': el.dash === 'dot' ? 'round' : 'butt', 'stroke-dasharray': el.dash === 'dash' ? `${lw * 3} ${lw * 2}` : el.dash === 'dot' ? `0.1 ${lw * 2}` : null }));
      const tri = (tip, dir) => PZ.h('svg:path', { d: poly([[tip, y], [tip - dir * head, y - head * 0.6], [tip - dir * head, y + head * 0.6]]), fill: color });
      if (def.head) svg.appendChild(tri(w, 1));
      if (def.head === 'both') svg.appendChild(tri(0, -1));
      return svg;
    }
    const inset = sw / 2;
    const d = def.path(inset, inset, Math.max(1, w - sw), Math.max(1, h - sw), el);
    let fill = el.fill || 'none';
    if (el.fill && el.fill2) {
      const gid = 'pzg' + (++gradSeq);
      const a = ((el.gangle || 0) - 90) * Math.PI / 180;
      const grad = PZ.h('svg:linearGradient', { id: gid, x1: f(0.5 - Math.cos(a) / 2), y1: f(0.5 - Math.sin(a) / 2), x2: f(0.5 + Math.cos(a) / 2), y2: f(0.5 + Math.sin(a) / 2) },
        PZ.h('svg:stop', { offset: '0', 'stop-color': el.fill }), PZ.h('svg:stop', { offset: '1', 'stop-color': el.fill2 }));
      svg.appendChild(PZ.h('svg:defs', null, grad));
      fill = `url(#${gid})`;
    }
    svg.appendChild(PZ.h('svg:path', { d, fill, 'fill-rule': def.evenodd ? 'evenodd' : null, stroke: sw && el.stroke ? el.stroke : 'none',
      'stroke-width': sw || null, 'stroke-dasharray': dash || null, 'stroke-linejoin': 'round', 'stroke-linecap': el.dash === 'dot' ? 'round' : null }));
    return svg;
  };
})(window.PZ = window.PZ || {});
