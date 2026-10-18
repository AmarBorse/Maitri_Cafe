/* Motion toolkit. Everything animates transform/opacity only (GPU-friendly on phones)
   and switches off when the device asks for reduced motion. */
(function () {
  const reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const on = () => !reduce.matches;
  const raf = fn => requestAnimationFrame(fn);

  // Page-to-page morph using the View Transitions API, with a plain swap as fallback.
  function vt(update, dirClass) {
    if (!on() || !document.startViewTransition) { update(); return Promise.resolve(); }
    const html = document.documentElement;
    if (dirClass) html.classList.add(dirClass);
    let t;
    try { t = document.startViewTransition(update); }
    catch (e) { update(); html.classList.remove(dirClass); return Promise.resolve(); }
    t.finished.finally(() => { if (dirClass) html.classList.remove(dirClass); });
    return t.updateCallbackDone.catch(() => {});
  }

  // Re-trigger a one-shot CSS animation class.
  function bump(el, cls = 'm-bump') {
    if (!el || !on()) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }

  // Animated number (used for cart totals).
  function countTo(el, to, format = n => n) {
    if (!el) return;
    const from = el._mv ?? to;
    el._mv = to;
    if (!on() || from === to) { el.textContent = format(to); return; }
    const t0 = performance.now(), dur = 420;
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = format(Math.round(from + (to - from) * e));
      if (p < 1 && el._mv === to) raf(step);
    };
    raf(step);
  }

  // Flies a copy of an image into the cart button along an arc.
  function fly(fromEl, toEl) {
    if (!on() || !fromEl || !toEl || !fromEl.animate) return Promise.resolve();
    const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    if (!a.width || !b.width) return Promise.resolve();
    const ghost = fromEl.cloneNode(false);
    ghost.removeAttribute('loading');
    Object.assign(ghost.style, {
      position: 'fixed', left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px',
      margin: 0, zIndex: 90, pointerEvents: 'none', borderRadius: '14px', objectFit: 'cover',
      boxShadow: '0 12px 30px -8px rgba(0,0,0,.45)', willChange: 'transform, opacity',
    });
    document.body.appendChild(ghost);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const lift = Math.min(160, Math.abs(dy) * 0.45 + 60);
    const anim = ghost.animate([
      { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(.7) rotate(-8deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(.12) rotate(6deg)`, opacity: 0.4 },
    ], { duration: 680, easing: 'cubic-bezier(.45,.05,.35,1)' });
    return anim.finished.then(() => ghost.remove(), () => ghost.remove());
  }

  function haptic(ms = 12) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not supported */ } }

  // Lightweight confetti burst on a canvas (about 1.6 s, then removed).
  function confetti(originEl) {
    if (!on()) return;
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = innerWidth, H = innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    Object.assign(c.style, { position: 'fixed', inset: 0, width: W + 'px', height: H + 'px', pointerEvents: 'none', zIndex: 95 });
    document.body.appendChild(c);
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const r = originEl ? originEl.getBoundingClientRect() : { left: W / 2, top: H / 3, width: 0, height: 0 };
    const ox = r.left + r.width / 2, oy = r.top + r.height / 2;
    const colors = ['#C2410C', '#FB923C', '#FDBA74', '#1C1512', '#F5EFE9', '#15803D'];
    const parts = Array.from({ length: 110 }, () => {
      const ang = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9;
      return { x: ox, y: oy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 6, w: 5 + Math.random() * 6, h: 8 + Math.random() * 8,
        rot: Math.random() * 6, vr: (Math.random() - .5) * .4, col: colors[(Math.random() * colors.length) | 0] };
    });
    const t0 = performance.now();
    const frame = now => {
      const t = now - t0;
      g.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.32; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        g.save(); g.globalAlpha = Math.max(0, 1 - t / 1600); g.translate(p.x, p.y); g.rotate(p.rot);
        g.fillStyle = p.col; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
      }
      if (t < 1600) raf(frame); else c.remove();
    };
    raf(frame);
  }

  // Drag a bottom sheet down to close it.
  function swipeToClose(sheet, close) {
    let y0 = null, dy = 0, t0 = 0, dragging = false;
    const body = () => sheet.querySelector('.sheet-body');
    sheet.addEventListener('touchstart', e => {
      const b = body();
      const fromHead = e.target.closest('.sheet-head, .grab');
      if (!fromHead && b && b.scrollTop > 0) return;
      y0 = e.touches[0].clientY; dy = 0; t0 = performance.now(); dragging = false;
    }, { passive: true });
    sheet.addEventListener('touchmove', e => {
      if (y0 === null) return;
      dy = e.touches[0].clientY - y0;
      if (dy > 6) dragging = true;
      if (dragging) { sheet.style.transition = 'none'; sheet.style.transform = `translateY(${Math.max(0, dy)}px)`; }
    }, { passive: true });
    sheet.addEventListener('touchend', () => {
      if (y0 === null) return;
      const v = dy / Math.max(1, performance.now() - t0);
      y0 = null;
      sheet.style.transition = '';
      if (dragging && (dy > 110 || v > 0.6)) close();
      else sheet.style.transform = '';
    });
  }

  // Ink ripple on buttons, delegated once for the whole page.
  document.addEventListener('pointerdown', e => {
    if (!on()) return;
    const b = e.target.closest('.btn, .add-btn, .type-tile, .cat, .cart-fab, .stepper button, .mo-item, .t-chip, .t-card, .chip');
    if (!b || b.disabled) return;
    const r = b.getBoundingClientRect();
    const s = document.createElement('span');
    const size = Math.max(r.width, r.height) * 1.2;
    s.className = 'ripple';
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.appendChild(s);
    s.addEventListener('animationend', () => s.remove(), { once: true });
  }, { passive: true });

  window.Motion = { on, vt, bump, countTo, fly, haptic, confetti, swipeToClose };
})();