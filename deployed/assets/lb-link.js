/* SkyBlink: adds the "Long baseline", "Time-lapse" and "Asteroids" mode buttons next to Blink / Diff / Spectrum in the viewer. */
(() => {
  const IDS = { "Barnard's Star": 'barnards-star', 'ε Indi B': 'eps-indi-b', 'WISE 0855': 'wise-0855', 'RW Aur': 'rw-aur', 'R Dra': 'r-dra' };
  const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="6" r="2.5"/><path d="M7 16 17 8"/></svg>';
  function currentTarget() {
    for (const b of document.querySelectorAll('button.rounded-full')) {
      if (b.className.includes('bg-sky-accent/15')) { const id = IDS[b.textContent.trim()]; if (id) return id; }
    }
    return new URLSearchParams(location.search).get('target') || 'barnards-star';
  }
  function inject() {
    if (document.getElementById('sb-lb-link') && document.getElementById('sb-tl-link') && document.getElementById('sb-ast-link')) return;
    const spec = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Spectrum');
    if (!spec || !spec.parentElement) return;
    if (document.getElementById('sb-lb-link')) { addTl(document.getElementById('sb-lb-link')); if (document.getElementById('sb-tl-link')) addAst(document.getElementById('sb-tl-link')); return; }
    const a = document.createElement('a');
    a.id = 'sb-lb-link';
    a.href = '/long-baseline';
    a.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors border-sky-border text-sky-inkDim hover:text-sky-accent hover:border-sky-accent/40';
    a.title = 'Blink a WISE 2010 frame against SPHEREx: 16 years of motion';
    a.innerHTML = ICON + '<span>Long baseline (WISE 2010)</span>';
    a.addEventListener('click', (e) => { e.preventDefault(); location.href = '/long-baseline?target=' + currentTarget(); });
    spec.insertAdjacentElement('afterend', a);
    addTl(a);
  }
  const TL_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="4" cy="18" r="1.5"/><circle cx="9" cy="14" r="1.5"/><circle cx="14" cy="10" r="1.5"/><circle cx="20" cy="5" r="2.5"/></svg>';
  function addTl(after) {
    if (document.getElementById('sb-tl-link')) return;
    const t = document.createElement('a');
    t.id = 'sb-tl-link';
    t.href = '/time-lapse';
    t.className = after.className;
    t.title = 'Play every WISE pass from 2010 to 2024, then SPHEREx, in order';
    t.innerHTML = TL_ICON + '<span>Time-lapse (2010 to 2026)</span>';
    t.addEventListener('click', (e) => { e.preventDefault(); location.href = '/time-lapse?target=' + currentTarget(); });
    after.insertAdjacentElement('afterend', t);
    addAst(t);
  }
  const AST_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="17" cy="7" r="3"/><path d="M3 21 14 10"/><path d="M3 15l5-5"/><path d="M9 21l5-5"/></svg>';
  function addAst(after) {
    if (document.getElementById('sb-ast-link')) return;
    const a = document.createElement('a');
    a.id = 'sb-ast-link';
    a.href = '/asteroids';
    a.className = after.className;
    a.title = 'Blink SPHEREx frames taken hours apart and find the asteroid';
    a.innerHTML = AST_ICON + '<span>Asteroids</span>';
    after.insertAdjacentElement('afterend', a);
    if (after.parentElement) { after.parentElement.style.flexWrap = 'wrap'; after.parentElement.style.rowGap = '8px'; }
  }
  new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true });
  inject();
})();
