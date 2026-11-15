/* PrezEn · editor/ui: small UI kit (modals, menus, popovers, form fields). */
(function (PZ) {
  'use strict';
  const h = PZ.h, t = PZ.t;
  const ui = (PZ.ui = {});

  /** Modal dialog. Returns {el, body, close}. */
  ui.modal = function (o) {
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); if (o.onClose) o.onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const body = h('div', { class: 'ui-modal-body' });
    const foot = h('div', { class: 'ui-modal-foot' });
    const box = h('div', { class: 'ui-modal' + (o.wide ? ' ui-wide' : '') + (o.cls ? ' ' + o.cls : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title },
      h('div', { class: 'ui-modal-head' }, h('h2', { text: o.title }), h('button', { class: 'ui-icon-btn', 'aria-label': t('Close'), onClick: close }, PZ.icon('x'))),
      body, foot);
    const back = h('div', { class: 'ui-backdrop', onMousedown: (e) => { if (e.target === back) close(); } }, box);
    (o.buttons || []).forEach((b) => foot.appendChild(h('button', { class: 'ui-btn' + (b.primary ? ' ui-primary' : '') + (b.danger ? ' ui-danger' : ''), text: b.label, onClick: () => b.run(close) })));
    if (!o.buttons || !o.buttons.length) foot.remove();
    if (o.content) body.append(...[].concat(o.content).filter(Boolean));
    document.body.appendChild(back);
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => { const f = box.querySelector('[autofocus], input, textarea, select, button.ui-primary'); if (f) f.focus(); }, 30);
    return { el: box, body, foot, close };
  };

  ui.confirm = (title, text, okLabel, danger) => new Promise((resolve) => {
    let ok = false;
    ui.modal({ title, content: h('p', { text }), onClose: () => resolve(ok),
      buttons: [{ label: t('Cancel'), run: (c) => c() }, { label: okLabel || t('OK'), primary: !danger, danger, run: (c) => { ok = true; c(); } }] });
  });

  ui.prompt = (title, label, value) => new Promise((resolve) => {
    let out = null;
    const input = h('input', { class: 'ui-input', value: value || '', autofocus: true, onKeydown: (e) => { if (e.key === 'Enter') { out = input.value; m.close(); } } });
    const m = ui.modal({ title, content: [h('label', { class: 'ui-label', text: label }), input], onClose: () => resolve(out),
      buttons: [{ label: t('Cancel'), run: (c) => c() }, { label: t('OK'), primary: true, run: (c) => { out = input.value; c(); } }] });
  });

  let openPop = null;
  /** Popover anchored to an element; closes on outside click / Escape. */
  ui.popover = function (anchor, content, o) {
    o = o || {};
    if (openPop) openPop.close();
    const pop = h('div', { class: 'ui-pop' + (o.cls ? ' ' + o.cls : '') }, content);
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = o.align === 'right' ? r.right - pw : r.left, y = r.bottom + 6;
    if (o.at) { x = o.at.x; y = o.at.y; }
    x = PZ.clamp(x, 8, window.innerWidth - pw - 8);
    if (y + ph > window.innerHeight - 8) y = Math.max(8, (o.at ? o.at.y : r.top - 6) - ph);
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
    const close = () => {
      if (!pop.isConnected) return;
      pop.remove(); document.removeEventListener('pointerdown', out, true); document.removeEventListener('keydown', key, true);
      if (openPop && openPop.pop === pop) openPop = null;
      if (o.onClose) o.onClose();
    };
    const out = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    setTimeout(() => { document.addEventListener('pointerdown', out, true); document.addEventListener('keydown', key, true); });
    openPop = { pop, close };
    return openPop;
  };

  /** Menu: items = [{label, icon, kbd, run, disabled, danger} | '-' | {header}] */
  ui.menu = function (anchor, items, o) {
    const list = h('div', { class: 'ui-menu', role: 'menu' });
    let pop;
    for (const it of items) {
      if (!it) continue;
      if (it === '-') { list.appendChild(h('div', { class: 'ui-menu-sep' })); continue; }
      if (it.header) { list.appendChild(h('div', { class: 'ui-menu-head', text: it.header })); continue; }
      list.appendChild(h('button', { class: 'ui-menu-item' + (it.danger ? ' ui-danger-text' : ''), role: 'menuitem', disabled: !!it.disabled,
        onClick: () => { pop.close(); it.run(); } }, it.icon ? PZ.icon(it.icon) : h('span', { class: 'pz-ico' }), h('span', { class: 'ui-menu-label', text: it.label }), it.kbd ? h('kbd', { text: it.kbd }) : null));
    }
    pop = ui.popover(anchor, list, o);
    const first = list.querySelector('button:not([disabled])');
    if (first) first.focus();
    list.addEventListener('keydown', (e) => {
      const btns = PZ.$$('button:not([disabled])', list);
      const i = btns.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
    });
    return pop;
  };

  // ---------------------------------------------------------------- fields (all call onChange(value, done) — done=false while dragging/typing)

  ui.row = (label, ...controls) => h('div', { class: 'ui-row' }, label ? h('label', { class: 'ui-row-label', text: label }) : null, h('div', { class: 'ui-row-ctl' }, controls));

  /** Collapsible section. title is the English text: translated here, and its open/closed state is kept across languages. */
  ui.section = function (title, content, o) {
    o = o || {};
    const key = 'prezen:sec:' + title;
    let closed = false;
    try { closed = localStorage.getItem(key) === '1'; } catch (e) { /* ignore */ }
    const sec = h('section', { class: 'ui-sec' + (closed ? ' ui-closed' : '') },
      h('button', { class: 'ui-sec-head', onClick: () => { sec.classList.toggle('ui-closed'); try { localStorage.setItem(key, sec.classList.contains('ui-closed') ? '1' : '0'); } catch (e) { /* ignore */ } } },
        h('span', { text: t(title) }), o.extra || null, PZ.icon('chevron-down', 'ui-sec-chev')),
      h('div', { class: 'ui-sec-body' }, content));
    return sec;
  };

  ui.number = function (value, onChange, o) {
    o = o || {};
    const input = h('input', { class: 'ui-num', type: 'number', value: PZ.round(value, o.decimals == null ? 1 : o.decimals), step: o.step || 1, min: o.min, max: o.max, title: o.title || '' });
    const clampV = (v) => PZ.clamp(v, o.min == null ? -1e9 : o.min, o.max == null ? 1e9 : o.max);
    input.addEventListener('input', () => { const v = parseFloat(input.value); if (isFinite(v)) onChange(clampV(v), false); });
    input.addEventListener('change', () => { const v = parseFloat(input.value); if (isFinite(v)) onChange(clampV(v), true); });
    const wrap = h('div', { class: 'ui-num-wrap' + (o.label ? ' ui-has-label' : '') });
    if (o.label) {
      // drag the little label to scrub the value
      const lab = h('span', { class: 'ui-num-label', text: o.label, title: t('Drag to change') });
      lab.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const x0 = e.clientX, v0 = parseFloat(input.value) || 0;
        lab.setPointerCapture(e.pointerId);
        const move = (ev) => { const v = clampV(PZ.round(v0 + (ev.clientX - x0) * (o.step || 1), o.decimals == null ? 1 : o.decimals)); input.value = v; onChange(v, false); };
        const up = () => { lab.removeEventListener('pointermove', move); lab.removeEventListener('pointerup', up); onChange(parseFloat(input.value) || 0, true); };
        lab.addEventListener('pointermove', move);
        lab.addEventListener('pointerup', up);
      });
      wrap.appendChild(lab);
    }
    wrap.appendChild(input);
    if (o.unit) wrap.appendChild(h('span', { class: 'ui-unit', text: o.unit }));
    return wrap;
  };

  ui.slider = function (value, onChange, o) {
    const out = h('span', { class: 'ui-slider-val', text: fmt(value) });
    function fmt(v) { return o.fmt ? o.fmt(v) : String(PZ.round(v, 2)); }
    const input = h('input', { class: 'ui-slider', type: 'range', min: o.min, max: o.max, step: o.step || 1, value });
    input.addEventListener('input', () => { out.textContent = fmt(+input.value); onChange(+input.value, false); });
    input.addEventListener('change', () => onChange(+input.value, true));
    return h('div', { class: 'ui-slider-wrap' }, input, out);
  };

  ui.select = function (value, options, onChange, o) {
    const sel = h('select', { class: 'ui-select' + (o && o.cls ? ' ' + o.cls : ''), title: (o && o.title) || '' });
    const add = (parent, opt) => parent.appendChild(h('option', { value: opt.value, text: opt.label, selected: opt.value === value }));
    for (const opt of options) {
      if (opt.group) { const g = h('optgroup', { label: opt.group }); opt.options.forEach((x) => add(g, x)); sel.appendChild(g); } else add(sel, opt);
    }
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value, true));
    return sel;
  };

  /**
   * Dropdown like ui.select, but drawn by us so options can be previewed: hovering or arrowing onto an
   * option calls o.onPreview(value); leaving the list or closing without a pick calls o.onPreview(null).
   * o.optStyle(value) styles an option label (e.g. its own font); o.onOpen runs before the list shows;
   * o.previewDelay (ms) waits for the pointer to settle before previewing.
   */
  ui.pick = function (value, options, onChange, o) {
    o = o || {};
    const flat = [];
    options.forEach((x) => (x.group ? x.options : [x]).forEach((y) => flat.push(y)));
    const labelOf = (v) => { const f = flat.find((x) => x.value === v); return f ? f.label : ''; };
    const lab = h('span', { class: 'ui-pick-label', text: labelOf(value), style: o.optStyle ? o.optStyle(value) : null });
    const btn = h('button', { class: 'ui-select ui-pick' + (o.cls ? ' ' + o.cls : ''), type: 'button', title: o.title || '', 'aria-haspopup': 'listbox', onMousedown: (e) => e.preventDefault() },
      lab, PZ.icon('chevron-down'));
    let pop = null;
    btn.addEventListener('click', () => {
      if (pop && pop.pop.isConnected) { pop.close(); return; }
      open();
    });
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); open(); } });

    function open() {
      if (o.onOpen) o.onOpen();
      const list = h('div', { class: 'ui-menu ui-pick-list', role: 'listbox', style: { minWidth: Math.max(200, btn.offsetWidth) + 'px' } });
      let timer = 0, shown = null, quiet = true;
      const preview = (v) => {
        clearTimeout(timer);
        if (!o.onPreview || v === shown) return;
        const go = () => { shown = v; o.onPreview(v); };
        if (v != null && o.previewDelay) timer = setTimeout(go, o.previewDelay); else go();
      };
      const item = (opt) => {
        const b = h('button', { class: 'ui-menu-item ui-pick-item' + (opt.value === value ? ' ui-on' : ''), role: 'option', 'aria-selected': String(opt.value === value), dataset: { v: opt.value },
          onClick: () => {
            pop.close(); // ends the preview first, then the pick is applied for real
            if (opt.value !== value) { value = opt.value; lab.textContent = opt.label; if (o.optStyle) Object.assign(lab.style, o.optStyle(value)); }
            onChange(opt.value, true);
          } },
          h('span', { class: 'ui-menu-label', text: opt.label, style: o.optStyle ? o.optStyle(opt.value) : null }));
        b.addEventListener('mouseenter', () => {
          quiet = false;
          if (document.activeElement === b) preview(opt.value); else b.focus({ preventScroll: true });
        });
        b.addEventListener('focus', () => { if (!quiet) preview(opt.value); });
        return b;
      };
      for (const x of options) {
        if (x.group) { list.appendChild(h('div', { class: 'ui-menu-head', text: x.group })); x.options.forEach((y) => list.appendChild(item(y))); } else list.appendChild(item(x));
      }
      list.addEventListener('mouseleave', () => { if (list.contains(document.activeElement)) btn.focus({ preventScroll: true }); preview(null); });
      list.addEventListener('keydown', (e) => {
        e.stopPropagation(); // keep the editor's shortcuts (arrows move elements, Enter edits) out of the list
        const btns = PZ.$$('.ui-pick-item', list);
        const i = btns.indexOf(document.activeElement);
        let j = -1;
        if (e.key === 'ArrowDown') j = Math.min(btns.length - 1, i + 1);
        else if (e.key === 'ArrowUp') j = Math.max(0, i - 1);
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = btns.length - 1;
        else if (e.key === 'Tab') { e.preventDefault(); pop.close(); btn.focus(); return; }
        else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          const ch = e.key.toLowerCase();
          const order = btns.slice(i + 1).concat(btns.slice(0, i + 1));
          const hit = order.find((b) => b.textContent.trim().replace(/^★\s*/, '').toLowerCase().startsWith(ch));
          if (hit) j = btns.indexOf(hit);
        }
        if (j < 0) return;
        e.preventDefault();
        quiet = false;
        btns[j].focus();
        btns[j].scrollIntoView({ block: 'nearest' });
      });
      pop = ui.popover(btn, list, { cls: 'ui-pick-pop', onClose: () => {
        clearTimeout(timer);
        if (shown != null && o.onPreview) { shown = null; o.onPreview(null); } // undo the preview
        if (btn.isConnected && (document.activeElement === document.body || !document.activeElement)) btn.focus({ preventScroll: true });
      } });
      const cur = list.querySelector('.ui-pick-item.ui-on') || list.querySelector('.ui-pick-item');
      if (cur) { cur.focus({ preventScroll: true }); cur.scrollIntoView({ block: 'center' }); }
    }
    return btn;
  };

  ui.toggle = function (value, onChange, label) {
    const input = h('input', { type: 'checkbox', checked: !!value });
    input.addEventListener('change', () => onChange(input.checked, true));
    return h('label', { class: 'ui-toggle' }, input, h('span', { class: 'ui-toggle-track' }), label ? h('span', { class: 'ui-toggle-label', text: label }) : null);
  };

  ui.seg = function (value, options, onChange) {
    const wrap = h('div', { class: 'ui-seg', role: 'group' });
    for (const opt of options) {
      wrap.appendChild(h('button', { class: 'ui-seg-btn' + (opt.value === value ? ' ui-on' : ''), title: opt.title || opt.label || '', 'aria-pressed': String(opt.value === value),
        onMousedown: (e) => e.preventDefault(), onClick: () => { PZ.$$('.ui-seg-btn', wrap).forEach((b) => { b.classList.remove('ui-on'); b.setAttribute('aria-pressed', 'false'); }); const b = wrap.children[options.indexOf(opt)]; b.classList.add('ui-on'); b.setAttribute('aria-pressed', 'true'); onChange(opt.value, true); } },
        opt.icon ? PZ.icon(opt.icon) : null, opt.icon && !opt.showLabel ? null : h('span', { text: opt.label })));
    }
    return wrap;
  };

  ui.iconBtn = (icon, title, run, o) => h('button', { class: 'ui-icon-btn' + (o && o.on ? ' ui-on' : '') + (o && o.cls ? ' ' + o.cls : ''), title, 'aria-label': title, onMousedown: (e) => { if (!(o && o.focus)) e.preventDefault(); }, onClick: run }, PZ.icon(icon));

  ui.SWATCHES = ['#1d2433', '#5c6577', '#ffffff', '#f5f6fa', '#5b5bf0', '#7c8cff', '#00b3a4', '#22c55e', '#facc15', '#ff9f1c', '#ff6b6b', '#e64980', '#9b5de5', '#0ea5e9', '#000000'];

  /** Colour field: swatch button opening a palette + native picker + text input. allowNone adds "none". */
  ui.color = function (value, onChange, o) {
    o = o || {};
    const sw = h('span', { class: 'ui-swatch-fill' });
    const paint = (v) => { sw.style.background = v || 'transparent'; sw.classList.toggle('ui-none', !v); };
    paint(value);
    const btn = h('button', { class: 'ui-swatch', title: o.title || t('Colour'), onMousedown: (e) => e.preventDefault() }, sw);
    btn.addEventListener('click', () => {
      const native = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value) ? value : '#5b5bf0' });
      const text = h('input', { class: 'ui-input ui-mono', value: value || '', placeholder: t('none') });
      const set = (v, done) => { if (v && !PZ.isColor(v)) return; value = v; paint(v); onChange(v, done); };
      native.addEventListener('input', () => { text.value = native.value; set(native.value, false); });
      native.addEventListener('change', () => set(native.value, true));
      text.addEventListener('change', () => set(text.value.trim(), true));
      const grid = h('div', { class: 'ui-swatches' }, (o.palette || []).concat(ui.SWATCHES).filter((v, i, a) => a.indexOf(v) === i).map((c) =>
        h('button', { class: 'ui-swatch-pick', style: { background: c }, title: c, onMousedown: (e) => e.preventDefault(), onClick: () => { text.value = c; set(c, true); } })));
      ui.popover(btn, h('div', { class: 'ui-color-pop' }, grid,
        h('div', { class: 'ui-color-row' }, native, text, o.allowNone ? h('button', { class: 'ui-btn ui-small', text: t('None'), onMousedown: (e) => e.preventDefault(), onClick: () => { text.value = ''; set('', true); } }) : null)));
    });
    return btn;
  };

  ui.textarea = function (value, onChange, o) {
    const t = h('textarea', { class: 'ui-textarea', rows: (o && o.rows) || 4, placeholder: (o && o.placeholder) || '' });
    t.value = value || '';
    t.addEventListener('input', () => onChange(t.value, false));
    t.addEventListener('change', () => onChange(t.value, true));
    return t;
  };

  ui.text = function (value, onChange, o) {
    const t = h('input', { class: 'ui-input' + (o && o.mono ? ' ui-mono' : ''), value: value || '', placeholder: (o && o.placeholder) || '' });
    t.addEventListener('input', () => onChange(t.value, false));
    t.addEventListener('change', () => onChange(t.value, true));
    return t;
  };

  ui.tabs = function (tabs, active, onPick) {
    const bar = h('div', { class: 'ui-tabs', role: 'tablist' });
    const body = h('div', { class: 'ui-tab-body' });
    const show = (id) => {
      PZ.$$('.ui-tab', bar).forEach((b) => b.classList.toggle('ui-on', b.dataset.id === id));
      body.textContent = '';
      const t = tabs.find((x) => x.id === id);
      body.append(...[].concat(t.render()).filter(Boolean));
      if (onPick) onPick(id);
    };
    tabs.forEach((t) => bar.appendChild(h('button', { class: 'ui-tab', role: 'tab', dataset: { id: t.id }, onClick: () => show(t.id) }, t.icon ? PZ.icon(t.icon) : null, h('span', { text: t.label }))));
    show(active || tabs[0].id);
    return { el: h('div', { class: 'ui-tabs-wrap' }, bar, body), show };
  };

  ui.copy = async function (text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const t = h('textarea', { style: 'position:fixed;left:-9999px' }); t.value = text; document.body.appendChild(t); t.select();
      const ok = document.execCommand('copy'); t.remove(); return ok;
    }
  };
})(window.PZ = window.PZ || {});
