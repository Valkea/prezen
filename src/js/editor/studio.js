/* PrezEn · editor/studio: browse the effect library, preview it, and design custom transitions & animations
 * (keyframes for the incoming / outgoing slide or for an element). Custom effects are saved in the presentation. */
(function (PZ) {
  'use strict';
  const h = PZ.h, E = PZ.ed, ui = PZ.ui, t = PZ.t;
  const ST = (PZ.edStudio = {});
  const ORIGINS = [['0% 0%', '↖'], ['50% 0%', '↑'], ['100% 0%', '↗'], ['0% 50%', '←'], ['50% 50%', '•'], ['100% 50%', '→'], ['0% 100%', '↙'], ['50% 100%', '↓'], ['100% 100%', '↘']];

  function sampleSlides() {
    const d = E.doc;
    const cur = E.slide();
    const prev = E.doc.slides[E.cur - 1];
    if (prev) return [prev, cur];
    const a = { bg: { type: 'gradient', color: '#1d2433', color2: '#3b3f8f', angle: 135 }, els: [PZ.make.text(d, { x: d.w * 0.1, y: d.h * 0.4, w: d.w * 0.8, h: d.h * 0.2, html: t('Slide A'), style: { size: d.h * 0.12, bold: true, color: '#ffffff', align: 'center' } })] };
    return [PZ.normalizeSlide(a, d.theme), cur];
  }

  function sampleElementSlide() {
    const d = E.doc;
    return PZ.normalizeSlide({ bg: { type: 'color', color: '#f5f6fa' }, els: [
      PZ.make.shape(d, { id: 'pz-demo', x: d.w * 0.32, y: d.h * 0.3, w: d.w * 0.36, h: d.h * 0.4, radius: 40, html: t('Animated'), style: { size: d.h * 0.07, bold: true } }),
    ] }, d.theme);
  }

  ST.open = function (o) {
    o = o || {};
    let fx = null; // effect shown (built-in object or working copy of a custom one)
    let isCustom = false;
    let kind = 'transition';
    let loop = true, loopTimer = 0;
    // what this slide (or the selected element) uses now: shown selected on open and marked in the list
    const inUse = () => (kind === 'transition' ? E.slide().transition.effect : ((E.one() || {}).anim || {}).effect);
    const one = E.one();
    const want = o.select || (one && one.anim ? one.anim.effect : E.slide().transition.effect);
    const sel = want && PZ.getEffect(E.doc, want);
    if (sel) { kind = sel.kind; }

    const listEl = h('div', { class: 'st-list' });
    const kindTabs = h('div', { class: 'ui-seg st-kinds' });
    const preview = h('div', { class: 'st-preview' });
    const editor = h('div', { class: 'st-editor' });
    const title = h('div', { class: 'st-title' });

    // ---- preview
    let k = 1;
    function stageBox() {
      preview.textContent = '';
      const w = Math.min(560, (preview.parentElement && preview.parentElement.clientWidth - 24) || 560);
      k = w / E.doc.w;
      const box = h('div', { class: 'st-stage', style: { width: w + 'px', height: E.doc.h * k + 'px' } });
      const inner = h('div', { class: 'st-inner', style: { width: E.doc.w + 'px', height: E.doc.h + 'px', transform: `scale(${k})` } });
      box.appendChild(inner);
      preview.appendChild(box);
      return inner;
    }
    function play() {
      clearTimeout(loopTimer);
      if (!fx) return;
      const inner = stageBox();
      let done;
      if (fx.kind === 'transition') {
        const [a, b] = sampleSlides();
        const out = h('div', { class: 'pz-layer' }, PZ.renderSlide(E.doc, a, 'play'));
        const inn = h('div', { class: 'pz-layer' }, PZ.renderSlide(E.doc, b, 'play'));
        inner.append(out, inn);
        const r = PZ.runTransition({ inLayer: inn, outLayer: out, effect: fx, w: E.doc.w, h: E.doc.h, perspective: inner, duration: use.duration, easing: use.easing });
        done = r.finished.then(() => out.remove());
      } else {
        const slide = sampleElementSlide();
        const s = PZ.renderSlide(E.doc, slide, 'play');
        inner.appendChild(s);
        const node = s.querySelector('.pz-el');
        const a = PZ.animate(node, fx.frames, { w: E.doc.w, h: E.doc.h, origin: fx.origin, duration: use.duration, easing: use.easing || fx.easing || 'smooth' });
        done = a ? a.finished.catch(() => {}).then(() => a.cancel()) : Promise.resolve();
      }
      done.then(() => { if (loop && m.el.isConnected) loopTimer = setTimeout(play, 900); });
    }
    const replay = PZ.debounce(play, 250);

    // ---- library list
    function renderList() {
      listEl.textContent = '';
      const builtins = Object.values(PZ.EFFECTS).filter((e) => e.kind === kind);
      const custom = Object.values(E.doc.effects || {}).filter((e) => e.kind === kind);
      if (custom.length) listEl.appendChild(h('div', { class: 'st-list-head', text: t('Your effects') }));
      custom.forEach((e) => listEl.appendChild(row(e, true)));
      listEl.appendChild(h('div', { class: 'st-list-head', text: t('Library') }));
      builtins.forEach((e) => listEl.appendChild(row(e, false)));
      listEl.appendChild(h('button', { class: 'ui-btn ui-small st-new', onClick: () => createFrom(null) }, PZ.icon('plus'), h('span', { text: t('New blank effect') })));
    }
    function row(e, custom) {
      const used = e.id === inUse();
      return h('button', { class: 'st-item' + (fx && fx.id === e.id ? ' on' : ''), onClick: () => pick(e, custom) }, custom ? PZ.icon('star') : null, h('span', { text: PZ.fxName(e) }),
        used ? h('small', { class: 'st-used', title: kind === 'transition' ? t('Used on this slide') : t('Used by the selected element') }, PZ.icon('check'), t('Current')) : null);
    }
    function pick(e, custom) {
      isCustom = custom;
      fx = custom ? PZ.clone(e) : e;
      initUse();
      renderList();
      renderEditor();
      play();
    }
    function createFrom(base) {
      const id = 'custom-' + PZ.uid();
      const blank = kind === 'transition' ? { in: [{ opacity: 0, scale: 0.9 }, {}], out: [{}, { opacity: 0 }], inTop: true } : { frames: [{ opacity: 0, y: 3 }, {}] };
      const src = base ? PZ.clone(base) : Object.assign({ name: t('My effect'), duration: 700 }, blank);
      delete src.builtin;
      const e = PZ.normalizeEffect(Object.assign(src, { id, kind, name: base ? t('{name} (custom)', { name: PZ.fxName(base) }) : kind === 'transition' ? t('My transition') : t('My animation') }));
      E.commit('New effect', (d) => { d.effects[id] = e; }, { refresh: 'inspector' });
      pick(E.doc.effects[id], true);
    }

    // ---- how the shown effect is used here (same settings as the side panel), for built-in and custom effects alike.
    // While the effect is the one this slide / the selected element uses, changes apply right away; otherwise they are
    // what the preview plays and what the "Use…" buttons apply.
    let use = { duration: 700, easing: '', trigger: 'click', delay: 0 };
    const target = () => (kind === 'transition' ? E.slide().transition : (E.one() || {}).anim);
    const applied = () => !!fx && fx.id === inUse();
    const defDuration = (e) => (e.kind === 'transition' ? (e.duration != null ? e.duration || 0 : 700) : e.duration || 600);
    function initUse() {
      const cur = target();
      if (cur && cur.effect === fx.id) use = { duration: cur.duration, easing: cur.easing || '', trigger: cur.trigger || 'click', delay: cur.delay || 0 };
      // like the side panel: a new transition takes the effect's timing; a new animation keeps the element's start, delay and easing
      else use = { duration: defDuration(fx), easing: kind === 'transition' ? '' : (cur && cur.easing) || '', trigger: (cur && cur.trigger) || 'click', delay: (cur && cur.delay) || 0 };
    }
    function setUse(key, v, done) {
      use[key] = v;
      if (applied()) {
        const label = kind === 'transition' ? 'Transition' : { duration: 'Animation duration', easing: 'Animation easing', trigger: 'Animation start', delay: 'Animation delay' }[key];
        E.update(label, () => { target()[key] = v; }, { merge: true, refresh: 'stage thumb' + (done ? ' inspector' : '') });
      }
      if (key !== 'delay' && key !== 'trigger') replay();
    }
    const useBox = h('div', { class: 'st-use' });
    function renderUse() {
      useBox.textContent = '';
      const isTr = fx.kind === 'transition';
      const one = E.one();
      const on = applied();
      useBox.appendChild(h('div', { class: 'st-use-head' },
        h('b', { text: isTr ? (E.cur > 0 ? t('Transition from slide {a} to {b}', { a: E.cur, b: E.cur + 1 }) : t('Transition into this slide')) : one ? t('On the selected element') : t('Timing') }),
        h('small', { class: 'st-use-state' + (on ? ' on' : ''), text: on ? t('In use: changes apply right away') : isTr || one ? t('Not used yet: preview only') : t('Preview only') })));
      if (!isTr && one) useBox.appendChild(ui.row(t('Start'), ui.seg(use.trigger, [{ value: 'click', label: t('On click') }, { value: 'with', label: t('With prev.') }, { value: 'after', label: t('After prev.') }], (v) => { setUse('trigger', v, true); renderUse(); })));
      useBox.appendChild(ui.row(t('Duration'), ui.slider(use.duration, (v, done) => setUse('duration', v, done), { min: 100, max: isTr ? 3000 : 5000, step: 50, fmt: (v) => (v / 1000).toFixed(2) + ' s' })));
      if (!isTr && one) useBox.appendChild(ui.row(t('Delay'), ui.slider(use.delay, (v, done) => setUse('delay', v, done), { min: 0, max: 5000, step: 50, fmt: (v) => (v / 1000).toFixed(2) + ' s' })));
      useBox.appendChild(ui.row(t('Easing'), ui.select(use.easing, [{ value: '', label: t('Effect default') }].concat(PZ.EASINGS.map((e) => ({ value: e.id, label: t(e.name) }))), (v) => setUse('easing', v, true))));
      const actions = h('div', { class: 'ui-btn-row' });
      const timing = () => ({ effect: fx.id, duration: use.duration, easing: use.easing });
      if (isTr) {
        if (!on) actions.appendChild(h('button', { class: 'ui-btn ui-primary ui-small', text: E.cur > 0 ? t('Use from slide {a} to {b}', { a: E.cur, b: E.cur + 1 }) : t('Use on this slide'), onClick: () => { E.commit('Transition', (d, s) => { s.transition = timing(); }); PZ.toast(t('Transition set on slide {n}', { n: E.cur + 1 })); renderList(); renderUse(); } }));
        actions.appendChild(h('button', { class: 'ui-btn ui-small', text: t('Use on all slides'), onClick: () => { E.commit('Transition on all slides', (d) => d.slides.forEach((s) => { s.transition = timing(); })); PZ.toast(t('Transition set on every slide')); renderList(); renderUse(); } }));
      } else if (!on) {
        actions.appendChild(h('button', { class: 'ui-btn ui-primary ui-small', text: one ? t('Use on selected element') : t('Select an element first'), disabled: !one, onClick: () => {
          E.commit('Animation', (d, s) => { const maxOrder = Math.max(0, ...s.els.filter((x) => x.anim && x !== one).map((x) => x.anim.order || 0)); one.anim = Object.assign({ order: maxOrder + 1 }, one.anim || {}, timing(), { trigger: use.trigger, delay: use.delay }); });
          PZ.toast(t('Animation applied')); renderList(); renderUse();
        } }));
      }
      if (actions.childNodes.length) useBox.appendChild(actions);
    }

    // ---- editor of custom effects
    function save() {
      if (!isCustom || !fx) return;
      const clean = PZ.normalizeEffect(fx);
      if (!clean) return;
      E.commit('Edit effect', (d) => { d.effects[clean.id] = clean; }, { merge: true, refresh: 'inspector' });
      title.textContent = fx.name; // fx stays the working copy (the keyframe tables hold references to its arrays)
      PZ.$$('.st-item.on span', listEl).forEach((s) => { s.textContent = fx.name; });
      replay();
    }

    function framesTable(label, frames, onChange, originKey) {
      const wrap = h('div', { class: 'st-frames' });
      const draw = () => {
        wrap.textContent = '';
        const head = h('div', { class: 'st-frames-head' }, h('b', { text: label }),
          originKey ? h('span', { class: 'st-origin', title: t('Pivot point (transform origin)') }, ORIGINS.map(([v, g]) => h('button', { class: 'st-o' + ((fx[originKey] || '50% 50%') === v ? ' on' : ''), text: g, title: v, onClick: () => { fx[originKey] = v; draw(); save(); } }))) : null,
          h('button', { class: 'ui-btn ui-small ui-ghost', text: t('+ keyframe'), onClick: () => {
            if (frames.length < 2) while (frames.length < 2) frames.push({});
            else frames.splice(frames.length - 1, 0, { offset: 0.5 });
            onChange(); draw();
          } }));
        wrap.appendChild(head);
        const table = h('table', { class: 'st-table' });
        const hdr = h('tr', null, h('th'), frames.map((f, i) => h('th', null, i === 0 ? t('Start') : i === frames.length - 1 ? t('End') : t('Key {n}', { n: i }),
          i > 0 && i < frames.length - 1 ? h('button', { class: 'st-del', title: t('Remove keyframe'), text: '×', onClick: () => { frames.splice(i, 1); onChange(); draw(); } }) : null)));
        table.appendChild(hdr);
        const cell = (f, key, o2) => {
          const input = h('input', { class: 'st-cell', type: o2 && o2.text ? 'text' : 'number', step: (o2 && o2.step) || 1, value: f[key] == null ? '' : f[key], placeholder: o2 && o2.ph != null ? String(o2.ph) : '' });
          input.addEventListener('change', () => {
            const raw = input.value.trim();
            if (raw === '') delete f[key];
            else if (o2 && o2.text) f[key] = raw;
            else { const v = parseFloat(raw); if (isFinite(v)) f[key] = key === 'offset' ? PZ.clamp(v / 100, 0, 1) : v; }
            onChange();
          });
          if (key === 'offset' && f.offset != null) input.value = Math.round(f.offset * 100);
          return h('td', null, input);
        };
        const rowOf = (name, key, o2) => h('tr', null, h('td', { class: 'st-prop', text: t(name) }), frames.map((f, i) => (key === 'offset' && (i === 0 || i === frames.length - 1) ? h('td', { class: 'st-fixed', text: i === 0 ? '0%' : '100%' }) : cell(f, key, o2))));
        if (frames.length > 2) table.appendChild(rowOf('At %', 'offset', { ph: '' }));
        PZ.FRAME_PROPS.forEach((p) => table.appendChild(rowOf(p.name, p.k, { step: p.step, ph: p.def })));
        table.appendChild(rowOf('Clip', 'clip', { text: true, ph: 'inset(0% 0% 0% 0%)' }));
        table.appendChild(rowOf('Easing →', 'easing', { text: true, ph: '' }));
        wrap.appendChild(table);
      };
      draw();
      return wrap;
    }

    function renderEditor() {
      editor.textContent = '';
      title.textContent = fx ? PZ.fxName(fx) : '';
      if (!fx) return;
      renderUse();
      editor.appendChild(useBox);
      if (!isCustom) {
        editor.appendChild(h('div', { class: 'ui-btn-row' }, h('button', { class: 'ui-btn ui-small', onClick: () => createFrom(fx) }, PZ.icon('copy'), h('span', { text: t('Customize a copy') }))));
        editor.appendChild(h('p', { class: 'ed-hint', text: t('Built-in effects are read-only. “Customize a copy” to change its keyframes, timing and pivot: your version is saved inside this presentation (and in its exports and links).') }));
        editor.appendChild(h('pre', { class: 'st-json', text: JSON.stringify(Object.assign({}, fx, { builtin: undefined }), null, 1) }));
        return;
      }
      editor.appendChild(h('div', { class: 'st-sub', text: t('Effect definition') }));
      editor.appendChild(ui.row(t('Name'), ui.text(fx.name, (v, done) => { fx.name = v || t('Custom effect'); if (done) save(); })));
      // the effect's own timing: what it starts with when picked for a slide or an element
      editor.appendChild(ui.row(t('Default duration'), ui.slider(fx.duration, (v, done) => {
        const follow = !applied() && use.duration === defDuration(fx);
        fx.duration = v;
        if (follow) { use.duration = defDuration(fx); renderUse(); }
        if (done) save(); else replay();
      }, { min: 100, max: 4000, step: 50, fmt: (v) => (v / 1000).toFixed(2) + ' s' })));
      const presets = PZ.EASINGS.map((e) => ({ value: e.id, label: t(e.name) })).concat([{ value: 'custom', label: t('Custom cubic-bezier…') }]);
      const isPreset = PZ.EASINGS.some((e) => e.id === fx.easing) || !fx.easing;
      const bez = ui.text(isPreset ? '' : fx.easing, (v, done) => { if (done) { fx.easing = v.trim(); save(); } }, { mono: true, placeholder: 'cubic-bezier(.2,.8,.2,1)' });
      editor.appendChild(ui.row(t('Default easing'), ui.select(isPreset ? fx.easing || 'smooth' : 'custom', presets, (v) => { if (v !== 'custom') { fx.easing = v; save(); } else bez.focus(); }), bez));
      if (fx.kind === 'transition') {
        editor.appendChild(ui.row(t('Layers'), ui.toggle(fx.inTop !== false, (v) => { fx.inTop = v; save(); }, t('Incoming slide on top'))));
        editor.appendChild(framesTable(t('Incoming slide'), fx.in, save, 'inOrigin'));
        editor.appendChild(framesTable(t('Outgoing slide'), fx.out, save, 'outOrigin'));
      } else {
        editor.appendChild(ui.row(t('Type'), ui.seg(fx.kind, [{ value: 'in', label: t('Entrance') }, { value: 'emph', label: t('Emphasis') }, { value: 'out', label: t('Exit') }], (v) => { fx.kind = v; kind = v; save(); renderList(); syncKinds(); })));
        editor.appendChild(framesTable(t('Element'), fx.frames, save, 'origin'));
      }
      editor.appendChild(h('p', { class: 'ed-hint', text: t('Empty cell = neutral value. Move X/Y are % of the slide size, so 100 = one full slide width/height. Clip accepts inset(), circle(), ellipse() or polygon() — use the same kind on every keyframe.') }));
      const json = h('textarea', { class: 'ui-textarea ui-mono st-json-edit', rows: 8 });
      json.value = JSON.stringify(fx, null, 1);
      editor.appendChild(h('details', { class: 'st-adv' }, h('summary', { text: t('Advanced: edit as JSON') }), json,
        h('div', { class: 'ui-btn-row' }, h('button', { class: 'ui-btn ui-small', text: t('Apply JSON'), onClick: () => {
          try { const v = JSON.parse(json.value); v.id = fx.id; const n = PZ.normalizeEffect(v); if (!n) throw new Error(t('Invalid effect')); fx = n; save(); renderEditor(); } catch (e) { PZ.toast(t('Invalid JSON: {msg}', { msg: e.message }), { type: 'error' }); }
        } }))));
      editor.appendChild(h('div', { class: 'ui-btn-row st-danger' }, h('button', { class: 'ui-btn ui-small ui-danger', text: t('Delete this effect'), onClick: async () => {
        const used = [];
        E.doc.slides.forEach((s, i) => { if (s.transition.effect === fx.id) used.push(t('slide {n}', { n: i + 1 })); s.els.forEach((el) => { if (el.anim && el.anim.effect === fx.id) used.push(t('an element on slide {n}', { n: i + 1 })); }); });
        const msg = t('Delete “{name}”?', { name: fx.name }) + (used.length ? ' ' + t('It is used by {list}: they will fall back to Fade.', { list: used.slice(0, 4).join(', ') }) : '');
        if (!(await ui.confirm(t('Delete effect'), msg, t('Delete'), true))) return;
        const id = fx.id;
        E.commit('Delete effect', (d) => {
          delete d.effects[id];
          d.slides.forEach((s) => { if (s.transition.effect === id) s.transition.effect = 'fade'; s.els.forEach((el) => { if (el.anim && el.anim.effect === id) el.anim.effect = 'fade-in'; }); });
        });
        fx = null; isCustom = false; renderList(); renderEditor(); preview.textContent = '';
      } })));
    }

    function syncKinds() {
      kindTabs.textContent = '';
      Object.entries(PZ.FX_KINDS).forEach(([kk, name]) => kindTabs.appendChild(h('button', { class: 'ui-seg-btn' + (kk === kind ? ' ui-on' : ''), text: t(name), onClick: () => {
        kind = kk; fx = null; syncKinds(); renderList(); renderEditor(); preview.textContent = '';
        const first = Object.values(PZ.EFFECTS).find((e) => e.kind === kind && e.id !== 'none');
        if (first) pick(first, false);
      } })));
    }

    const m = ui.modal({
      title: t('Transition & animation studio'), cls: 'st-modal', wide: true,
      content: h('div', { class: 'st' },
        h('div', { class: 'st-left' }, kindTabs, listEl),
        h('div', { class: 'st-right' }, h('div', { class: 'st-top' }, title,
          h('div', { class: 'ui-btn-row' }, h('button', { class: 'ui-btn ui-small', onClick: play }, PZ.icon('play'), h('span', { text: t('Play') })),
            ui.toggle(true, (v) => { loop = v; if (v) play(); else clearTimeout(loopTimer); }, t('Loop')))), preview, editor)),
      onClose: () => clearTimeout(loopTimer),
    });
    syncKinds();
    renderList();
    const start = sel || Object.values(PZ.EFFECTS).find((e) => e.kind === kind && e.id !== 'none');
    if (start) setTimeout(() => pick(start, !start.builtin), 30);
  };
})(window.PZ = window.PZ || {});
