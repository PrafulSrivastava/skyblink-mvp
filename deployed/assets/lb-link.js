/* SkyBlink: adds the "Long baseline" mode button next to Blink / Diff / Spectrum in the viewer. */
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
    if (document.getElementById('sb-lb-link')) return;
    const spec = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Spectrum');
    if (!spec || !spec.parentElement) return;
    const a = document.createElement('a');
    a.id = 'sb-lb-link';
    a.href = '/long-baseline';
    a.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors border-sky-border text-sky-inkDim hover:text-sky-accent hover:border-sky-accent/40';
    a.title = 'Blink a WISE 2010 frame against SPHEREx: 16 years of motion';
    a.innerHTML = ICON + '<span>Long baseline (WISE 2010)</span>';
    a.addEventListener('click', (e) => { e.preventDefault(); location.href = '/long-baseline?target=' + currentTarget(); });
    spec.insertAdjacentElement('afterend', a);
  }
  new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true });
  inject();
})();
