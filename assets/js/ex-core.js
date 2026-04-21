/* EX-CORE — shared behaviors: reveal, sticky-bar visibility, language stub */
(function () {
  // Intersection reveal
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // Show sticky bar after hero
  const sticky = document.querySelector('.sticky-bar');
  const hero = document.querySelector('.hero');
  if (sticky && hero) {
    const heroObs = new IntersectionObserver(([entry]) => {
      sticky.style.transform = entry.isIntersecting ? 'translateY(120%)' : 'translateY(0)';
    }, { threshold: 0.1 });
    heroObs.observe(hero);
    sticky.style.transition = 'transform .4s ease';
    sticky.style.transform = 'translateY(120%)';
  }

  // Hero rotating tagline (optional — requires [data-rotate] container with data-items JSON)
  document.querySelectorAll('[data-rotate]').forEach(el => {
    try {
      const items = JSON.parse(el.getAttribute('data-items') || '[]');
      if (!items.length) return;
      let i = 0;
      setInterval(() => {
        el.style.opacity = 0;
        setTimeout(() => { i = (i + 1) % items.length; el.textContent = items[i]; el.style.opacity = 1; }, 400);
      }, 3800);
      el.style.transition = 'opacity .4s ease';
    } catch (e) {}
  });

  // Language picker stub (visual only; wire to real i18n later)
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const labels = ['EN', 'ID', 'FR', 'DE', 'ES', 'IT', 'JP', 'ZH'];
      const cur = btn.querySelector('[data-lang-label]') || btn;
      const idx = labels.indexOf(cur.textContent.trim());
      cur.textContent = labels[(idx + 1) % labels.length];
    });
  });

  // ─────────── PAX STEPPER ───────────
  // Works with any hidden/number input named "pax" (or input[data-pax-input]).
  // Keeps local state so clicks never depend on reading .value from a null input.
  document.querySelectorAll('[data-pax]').forEach(group => {
    const input = group.querySelector('input[data-pax-input], input[name="pax"], input[type="number"], input[type="hidden"]');
    const out   = group.querySelector('.pax-n');
    const min   = parseInt(group.dataset.min || '1', 10);
    const max   = parseInt(group.dataset.max || '20', 10);
    const minus = group.querySelector('[data-act="-"]');
    const plus  = group.querySelector('[data-act="+"]');

    // Seed from input, fallback to out.textContent, then min.
    let current = parseInt(
      (input && input.value) || (out && out.textContent) || String(min),
      10
    );
    if (isNaN(current)) current = min;

    const set = (v) => {
      v = Math.max(min, Math.min(max, v));
      current = v;
      if (input) input.value = String(v);
      if (out)   out.textContent = String(v);
      if (minus) minus.disabled = v <= min;
      if (plus)  plus.disabled = v >= max;
      group.dispatchEvent(new CustomEvent('pax:change', { bubbles: true, detail: { value: v } }));
    };

    if (minus) minus.addEventListener('click', (e) => { e.preventDefault(); set(current - 1); });
    if (plus)  plus.addEventListener('click',  (e) => { e.preventDefault(); set(current + 1); });

    // Re-sync if data-max changes after init (product switcher)
    new MutationObserver(() => {
      const newMax = parseInt(group.dataset.max || '20', 10);
      if (newMax !== max && current > newMax) set(newMax);
      if (plus) plus.disabled = current >= newMax;
    }).observe(group, { attributes: true, attributeFilter: ['data-max'] });

    set(current);
  });

  // NOTE: generic booking form wiring intentionally removed.
  // book.html owns its own submit/recalc logic end-to-end (validation,
  // popup-blocker-safe window.open, analytics, honeypot, thank-you overlay).
  // Keeping a second handler here caused duplicate submits and label drift.
})();
