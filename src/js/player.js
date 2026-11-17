/* PrezEn · player: runs a presentation full screen with transitions, step-by-step animations, overview grid,
 * keyboard / clicker / touch navigation and a presenter window (notes, next slide, timer). */
(function (PZ) {
  'use strict';
  const h = PZ.h, t = PZ.t;

  /** Group a slide's animated elements into click steps with start times. */
  PZ.buildSteps = function (doc, slide) {
    const items = slide.els.map((el, z) => ({ el, z })).filter((o) => o.el.anim && PZ.getEffect(doc, o.el.anim.effect))
      .sort((a, b) => (a.el.anim.order || 0) - (b.el.anim.order || 0) || a.z - b.z);
    const steps = [];
    let cur = null, prevStart = 0, stepEnd = 0;
    for (const it of items) {
      const a = it.el.anim;
      const fx = PZ.getEffect(doc, a.effect);
      const dur = a.duration || fx.duration || 600;
      let start;
      if (!cur || a.trigger === 'click') {
        // first step started automatically: 'with' plays during the slide transition, 'after' once it has ended
        cur = { items: [], auto: !cur && a.trigger !== 'click', withSlide: !cur && a.trigger === 'with' };
        steps.push(cur);
        start = a.delay || 0;
      } else if (a.trigger === 'with') start = prevStart + (a.delay || 0);
      else start = stepEnd + (a.delay || 0);
      cur.items.push({ id: it.el.id, anim: a, kind: fx.kind, start });
      prevStart = start;
      stepEnd = Math.max(stepEnd * (cur.items.length > 1 ? 1 : 0), start + dur);
    }
    return steps;
  };

  /** Show elements as they are before step k (k = number of steps already played). */
  PZ.applySteps = function (slideEl, steps, k) {
    steps.forEach((st, i) => st.items.forEach((it) => {
      const node = slideEl.querySelector(`.pz-el[data-id="${it.id}"]`);
      if (!node) return;
      const hidden = i < k ? it.kind === 'out' : it.kind === 'in';
      node.classList.toggle('pz-hide', hidden);
    }));
  };

  class Player {
    constructor(doc, opts) {
      this.doc = doc;
      this.opts = opts || {};
      this.order = doc.slides.map((s, i) => i).filter((i) => !doc.slides[i].hidden);
      if (!this.order.length) this.order = [0];
      this.pos = -1;
      this.cur = null;
      this.trans = null;
      this.running = [];
      this.root = h('div', { class: 'pz-player', tabindex: '-1' });
      this.viewport = h('div', { class: 'pz-viewport' });
      this.scaler = h('div', { class: 'pz-scaler' });
      this.viewport.appendChild(this.scaler);
      this.curtain = h('div', { class: 'pz-curtain' });
      this.progress = h('div', { class: 'pz-progress' }, h('div', { class: 'pz-progress-bar' }));
      this.counter = h('span', { class: 'pz-counter' });
      this.controls = h('div', { class: 'pz-controls' });
      this.buildControls();
      this.root.append(this.viewport, this.curtain, this.progress, this.controls);
      (this.opts.container || document.body).appendChild(this.root);
      PZ.loadFonts(doc);

      this._key = (e) => this.onKey(e);
      this._resize = () => this.layout();
      this._fs = () => {
        // Esc in full screen is swallowed by the browser: leaving full screen that way ends a show started from the editor
        if (!document.fullscreenElement && this.wasFull && !this.togglingFs && this.opts.onExit && this.opts.exitWithFullscreen) this.exit();
        this.wasFull = !!document.fullscreenElement;
        this.layout();
      };
      window.addEventListener('keydown', this._key);
      window.addEventListener('resize', this._resize);
      document.addEventListener('fullscreenchange', this._fs);
      this.root.addEventListener('click', (e) => this.onClick(e));
      this.root.addEventListener('contextmenu', (e) => { e.preventDefault(); this.prev(); });
      this.root.addEventListener('mousemove', () => this.poke());
      let tx = 0, ty = 0;
      this.root.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
      this.root.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { this.swiped = true; if (dx < 0) this.next(); else this.prev(); }
      });
      this.preload();
      this.layout();
      this.go(this.posOf(this.opts.start || 0), { instant: true });
      this.root.focus();
      this.poke();
    }

    /** Control bar (rebuilt when the language changes). */
    buildControls() {
      const btn = (icon, title, fn, cls) => h('button', { class: 'pz-pbtn' + (cls ? ' ' + cls : ''), title, 'aria-label': title, onClick: (e) => { e.stopPropagation(); fn(); } }, PZ.icon(icon));
      const langs = Object.keys(PZ.LANGS);
      this.controls.textContent = '';
      this.controls.append(...[
        btn('chevron-left', t('Previous (←)'), () => this.prev()), this.counter, btn('chevron-right', t('Next (→, space)'), () => this.next()),
        h('span', { class: 'pz-sep' }),
        btn('grid', t('Overview (O)'), () => this.toggleOverview()),
        btn('notes', t('Presenter view (S)'), () => this.openPresenter()),
        btn('maximize', t('Full screen (F)'), () => this.toggleFullscreen()),
        this.opts.allowPrint ? btn('pdf', t('Print / save as PDF (P)'), () => PZ.printDoc(this.doc)) : null,
        // standalone slideshows get a language switch (the editor has its own)
        this.opts.langSwitch && langs.length > 1 ? h('button', { class: 'pz-pbtn pz-lang', title: t('Language') + ' · ' + PZ.LANGS[PZ.lang], 'aria-label': t('Language'), text: PZ.lang.toUpperCase(),
          onClick: (e) => { e.stopPropagation(); PZ.setLang(langs[(langs.indexOf(PZ.lang) + 1) % langs.length]); this.buildControls(); if (this.presenter && !this.presenter.win.closed) { this.presenter.win.close(); this.openPresenter(); } } }) : null,
        this.opts.onExit ? btn('exit', t('Exit (Esc)'), () => this.exit()) : null,
      ].filter(Boolean));
    }

    posOf(slideIndex) { const p = this.order.indexOf(slideIndex); return p < 0 ? Math.max(0, this.order.findIndex((i) => i > slideIndex)) : p; }
    get index() { return this.order[this.pos]; }

    preload() {
      for (const r of PZ.imageRefs(this.doc)) { const img = new Image(); PZ.setImgSrc(img, r.ref, this.doc); }
    }

    layout() {
      const W = this.doc.w, H = this.doc.h;
      const cw = this.root.clientWidth || window.innerWidth, ch = this.root.clientHeight || window.innerHeight;
      const k = Math.min(cw / W, ch / H);
      this.viewport.style.width = W * k + 'px';
      this.viewport.style.height = H * k + 'px';
      this.scaler.style.width = W + 'px';
      this.scaler.style.height = H + 'px';
      this.scaler.style.transform = `scale(${k})`;
    }

    makeLayer(pos) {
      const slide = this.doc.slides[this.order[pos]];
      const layer = h('div', { class: 'pz-layer' });
      const el = PZ.renderSlide(this.doc, slide, 'play');
      layer.appendChild(el);
      return { pos, slide, layer, el, steps: PZ.buildSteps(this.doc, slide), step: 0 };
    }

    finishRunning() {
      if (this.trans) { this.trans.finish(); }
      this.running.forEach((a) => { try { a.finish(); } catch (e) { /* done */ } });
    }

    async go(pos, o) {
      o = o || {};
      if (pos < 0 || pos >= this.order.length) return;
      this.finishRunning();
      clearTimeout(this.autoTimer);
      const next = this.makeLayer(pos);
      next.step = o.atEnd ? next.steps.length : 0;
      PZ.applySteps(next.el, next.steps, next.step);
      this.scaler.appendChild(next.layer);
      const prev = this.cur;
      this.cur = next;
      this.pos = pos;
      this.updateUi();
      const first = next.step === 0 && next.steps[0] && next.steps[0].auto;
      const early = first && next.steps[0].withSlide && prev && !o.instant;
      if (early) this.playStep(); // plays alongside the transition
      if (prev && !o.instant) {
        const t = (o.reverse ? prev.slide : next.slide).transition || {};
        const tr = PZ.runTransition({
          inLayer: next.layer, outLayer: prev.layer, effect: PZ.getEffect(this.doc, t.effect) || PZ.EFFECTS.fade,
          duration: t.duration, easing: t.easing, w: this.doc.w, h: this.doc.h, reverse: !!o.reverse, perspective: this.scaler, doc: this.doc,
        });
        this.trans = tr;
        await tr.finished;
        if (this.trans === tr) this.trans = null;
      }
      if (prev) prev.layer.remove();
      next.layer.style.zIndex = '';
      if (this.cur !== next) return;
      if (first && !early) this.playStep();
      else if (!this.running.length) this.scheduleAuto();
    }

    playStep() {
      const c = this.cur;
      const step = c.steps[c.step];
      if (!step) return;
      c.step++;
      let pending = step.items.length;
      const done = () => { if (--pending <= 0 && this.cur === c) { this.running = []; this.scheduleAuto(); } };
      for (const it of step.items) {
        const node = c.el.querySelector(`.pz-el[data-id="${it.id}"]`);
        if (!node) { done(); continue; }
        node.classList.remove('pz-hide');
        const a = PZ.animateElement(node, it.anim, this.doc, { delay: it.start });
        if (!a) { if (it.kind === 'out') node.classList.add('pz-hide'); done(); continue; }
        this.running.push(a);
        a.finished.catch(() => {}).then(() => {
          a.cancel();
          if (it.kind === 'out') node.classList.add('pz-hide');
          done();
        });
      }
      this.updateUi();
    }

    scheduleAuto() {
      clearTimeout(this.autoTimer);
      const c = this.cur;
      if (!c || !c.slide.auto || this.overview) return;
      this.autoTimer = setTimeout(() => { if (this.cur === c) this.next(); }, c.slide.auto * 1000);
    }

    next() {
      if (this.trans || this.running.length) { this.finishRunning(); return; }
      const c = this.cur;
      if (c.step < c.steps.length) this.playStep();
      else if (this.pos < this.order.length - 1) this.go(this.pos + 1);
      else if (this.opts.loop) this.go(0);
      else PZ.toast(t('End of the presentation'), { timeout: 1600 });
    }

    prev() {
      if (this.trans || this.running.length) { this.finishRunning(); return; }
      const c = this.cur;
      if (c.step > 0) { c.step--; PZ.applySteps(c.el, c.steps, c.step); this.updateUi(); }
      else if (this.pos > 0) this.go(this.pos - 1, { reverse: true, atEnd: true });
    }

    goToSlide(slideIndex) { this.go(this.posOf(slideIndex), { instant: true }); }

    onClick(e) {
      if (this.swiped) { this.swiped = false; return; }
      if (this.overview) return;
      const link = e.target.closest('[data-link]');
      if (link) {
        const href = link.dataset.link;
        if (/^#\d+$/.test(href)) this.goToSlide(parseInt(href.slice(1), 10) - 1);
        else if (PZ.safeLink(href)) window.open(href, '_blank', 'noopener');
        return;
      }
      if (e.target.closest('a[href]')) return;
      this.next();
    }

    onKey(e) {
      if (e.defaultPrevented || e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const k = e.key;
      if (this.overview) {
        if (k === 'Escape' || k === 'o' || k === 'O' || k === 'g') { this.toggleOverview(); e.preventDefault(); }
        return;
      }
      if (/^\d$/.test(k)) { this.typed = (this.typed || '') + k; clearTimeout(this.typedTimer); this.typedTimer = setTimeout(() => { this.typed = ''; }, 1500); return; }
      if (k === 'Enter' && this.typed) { this.goToSlide(parseInt(this.typed, 10) - 1); this.typed = ''; e.preventDefault(); return; }
      const map = {
        ArrowRight: 'next', ArrowDown: 'next', PageDown: 'next', ' ': 'next', Enter: 'next', n: 'next', N: 'next',
        ArrowLeft: 'prev', ArrowUp: 'prev', PageUp: 'prev', Backspace: 'prev', p: 'prev',
        Home: 'first', End: 'last', f: 'full', F: 'full', b: 'black', B: 'black', '.': 'black', w: 'white', W: 'white',
        o: 'overview', O: 'overview', g: 'overview', s: 'presenter', S: 'presenter', Escape: 'escape', P: 'print',
      };
      const act = map[k];
      if (!act) return;
      e.preventDefault();
      if (act !== 'black' && act !== 'white' && this.curtain.className !== 'pz-curtain') { this.curtain.className = 'pz-curtain'; if (act !== 'escape') return; }
      switch (act) {
        case 'next': this.next(); break;
        case 'prev': this.prev(); break;
        case 'first': this.go(0, { instant: true }); break;
        case 'last': this.go(this.order.length - 1, { instant: true }); break;
        case 'full': this.toggleFullscreen(); break;
        case 'black': this.curtain.className = this.curtain.className.includes('black') ? 'pz-curtain' : 'pz-curtain pz-black'; break;
        case 'white': this.curtain.className = this.curtain.className.includes('white') ? 'pz-curtain' : 'pz-curtain pz-white'; break;
        case 'overview': this.toggleOverview(); break;
        case 'presenter': this.openPresenter(); break;
        case 'print': if (this.opts.allowPrint) PZ.printDoc(this.doc); break;
        case 'escape': if (this.opts.onExit) this.exit(); break;
      }
    }

    poke() {
      this.root.classList.add('pz-show-ui');
      clearTimeout(this.uiTimer);
      this.uiTimer = setTimeout(() => this.root.classList.remove('pz-show-ui'), 2200);
    }

    updateUi() {
      this.counter.textContent = `${this.pos + 1} / ${this.order.length}`;
      const total = this.order.length > 1 ? this.order.length - 1 : 1;
      this.progress.firstChild.style.width = (this.pos / total) * 100 + '%';
      if (this.opts.hash) history.replaceState(null, '', '#slide=' + (this.index + 1));
      if (this.presenter) this.presenter.update();
      if (this.opts.onChange) this.opts.onChange(this.index);
    }

    toggleFullscreen() {
      this.togglingFs = true;
      setTimeout(() => { this.togglingFs = false; }, 600);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else (this.opts.fullscreenTarget || this.root).requestFullscreen().catch(() => {});
    }

    toggleOverview() {
      if (this.overview) { this.overview.remove(); this.overview = null; this.scheduleAuto(); return; }
      clearTimeout(this.autoTimer);
      const grid = h('div', { class: 'pz-overview-grid' });
      this.order.forEach((si, pos) => {
        const s = this.doc.slides[si];
        const card = h('button', { class: 'pz-ov-card' + (pos === this.pos ? ' pz-on' : ''), onClick: (e) => { e.stopPropagation(); this.toggleOverview(); this.go(pos, { instant: true }); } },
          PZ.renderThumb(this.doc, s, 280), h('span', { class: 'pz-ov-num', text: String(pos + 1) }));
        grid.appendChild(card);
      });
      this.overview = h('div', { class: 'pz-overview', onClick: (e) => e.stopPropagation() }, grid);
      this.root.appendChild(this.overview);
      const on = grid.querySelector('.pz-on');
      if (on) on.focus();
    }

    openPresenter() {
      if (this.presenter && !this.presenter.win.closed) { this.presenter.win.focus(); return; }
      this.presenter = PZ.openPresenter(this);
    }

    exit() {
      this.destroy();
      if (this.opts.onExit) this.opts.onExit(this.index);
    }

    destroy() {
      this.finishRunning();
      clearTimeout(this.autoTimer); clearTimeout(this.uiTimer);
      window.removeEventListener('keydown', this._key);
      window.removeEventListener('resize', this._resize);
      document.removeEventListener('fullscreenchange', this._fs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (this.presenter && !this.presenter.win.closed) this.presenter.win.close();
      this.root.remove();
    }
  }
  PZ.Player = Player;

  /** Presenter window: current & next slide, notes, timer. Same-origin popup driven from here. */
  PZ.openPresenter = function (player) {
    const win = window.open('', 'prezen-presenter', 'width=1200,height=760');
    if (!win) { PZ.toast(t('The browser blocked the presenter window: allow pop-ups for this page.'), { type: 'warn' }); return null; }
    const d = win.document;
    d.open();
    d.write(`<!doctype html><html lang="${PZ.lang}"><head><meta charset="utf-8"><title>${PZ.escapeHtml(t('Presenter view'))}</title></head><body class="pz-presenter-body"></body></html>`);
    d.close();
    d.head.appendChild(Object.assign(d.createElement('style'), { textContent: PZ.cssText() }));
    PZ.loadFonts(player.doc, d);
    const H = (tag, props, ...kids) => d.adoptNode(h(tag, props, ...kids));
    const cur = H('div', { class: 'pzp-cur' }), nxt = H('div', { class: 'pzp-next' }), notes = H('div', { class: 'pzp-notes' });
    const timer = H('div', { class: 'pzp-timer' }), clock = H('div', { class: 'pzp-clock' }), count = H('div', { class: 'pzp-count' });
    const start = Date.now();
    let paused = 0, pausedAt = 0;
    const bar = H('div', { class: 'pzp-bar' },
      H('button', { class: 'pzp-btn', text: t('◀ Prev'), onClick: () => player.prev() }),
      H('button', { class: 'pzp-btn pzp-primary', text: t('Next ▶'), onClick: () => player.next() }),
      count, timer,
      H('button', { class: 'pzp-btn', text: t('Pause timer'), onClick: (e) => { if (pausedAt) { paused += Date.now() - pausedAt; pausedAt = 0; e.target.textContent = t('Pause timer'); } else { pausedAt = Date.now(); e.target.textContent = t('Resume'); } } }),
      clock);
    d.body.append(H('div', { class: 'pzp' }, H('div', { class: 'pzp-main' }, H('div', { class: 'pzp-label', text: t('Current') }), cur),
      H('div', { class: 'pzp-side' }, H('div', { class: 'pzp-label', text: t('Next') }), nxt, H('div', { class: 'pzp-label', text: t('Notes') }), notes), bar));
    const fit = (box, slide, steps, k) => {
      box.textContent = '';
      if (!slide) { box.appendChild(H('div', { class: 'pzp-end', text: t('End of presentation') })); return; }
      const w = box.clientWidth || 400;
      const th = PZ.renderThumb(player.doc, slide, w);
      if (steps) PZ.applySteps(th.firstChild, steps, k);
      box.appendChild(d.adoptNode(th));
    };
    const api = {
      win,
      update() {
        if (win.closed) return;
        const c = player.cur;
        fit(cur, c.slide, c.steps, c.step);
        if (c.step < c.steps.length) fit(nxt, c.slide, c.steps, c.step + 1);
        else fit(nxt, player.doc.slides[player.order[player.pos + 1]], null);
        notes.textContent = c.slide.notes || t('No notes for this slide.');
        count.textContent = t('Slide {n} / {total}', { n: player.pos + 1, total: player.order.length });
      },
    };
    const tick = () => {
      if (win.closed) return;
      const ms = (pausedAt || Date.now()) - start - paused;
      const s = Math.floor(ms / 1000);
      timer.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      clock.textContent = new Date().toLocaleTimeString(PZ.lang, { hour: '2-digit', minute: '2-digit' });
      win.setTimeout(tick, 500);
    };
    win.addEventListener('keydown', (e) => { if (!e.target.closest('button')) player.onKey(e); });
    win.addEventListener('resize', () => api.update());
    tick();
    setTimeout(() => api.update(), 50);
    return api;
  };
})(window.PZ = window.PZ || {});
