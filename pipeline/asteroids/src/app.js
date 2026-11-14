<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const q = new URLSearchParams(location.search);
  const BASE = 650, N = 89, PX = 6.15;
  const state = { idx: null, t: null, d: null, i: 0, playing: !reduce, speed: 1, track: false, diff: false, found: false, timer: null, cache: {}, scores: {} };
  const fmt = (v, n = 1) => (v == null ? 'n/a' : Number(v).toFixed(n));
  const big = (v) => Number(v).toLocaleString('en-US');
  const NS = 'http://www.w3.org/2000/svg';
  function setPressed(el, on) { el.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  function frames() { return state.d.frames; }
  function url(f) { return '/data/asteroids/' + state.t.id + '/' + (state.diff ? f.diff : f.img); }
  function preload() { frames().forEach((f) => [f.img, f.diff].forEach((p) => { const u = '/data/asteroids/' + state.t.id + '/' + p; if (!state.cache[u]) { const im = new Image(); im.src = u; state.cache[u] = im; } })); }
  function pt(f) { return [f.px[0] + 0.5, f.px[1] + 0.5]; }
  function minutes(f) { return Math.round((f.mjd - frames()[0].mjd) * 1440); }
  function hm(m) { return m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min' : m + ' min'; }
  function overlay() {
    const on = state.track || state.found;
    $('ast-track').style.display = on ? '' : 'none'; $('ast-now').style.display = on ? '' : 'none'; $('ast-dots').style.display = on ? '' : 'none';
  }
  function show(i) {
    const fr = frames(); i = ((i % fr.length) + fr.length) % fr.length; state.i = i;
    const f = fr[i];
    $('ast-img').src = url(f);
    $('ast-range').value = i;
    $('ast-date').firstChild.nodeValue = f.utc.slice(11, 16) + ' UTC';
    $('ast-sub').textContent = f.utc.slice(0, 10) + ', frame ' + (i + 1) + ' of ' + fr.length + (i ? ', +' + hm(minutes(f)) : '');
    $('ast-badge').innerHTML = '<b>SPHEREx ' + f.det + '</b> ' + fmt(f.wl_um, 2) + ' µm' + (f.saturated ? ', saturated core' : '');
    const [x, y] = pt(f);
    $('ast-now').setAttribute('cx', x); $('ast-now').setAttribute('cy', y);
    document.querySelectorAll('#ast-ticks i').forEach((el, k) => el.classList.toggle('is-past', k <= i));
  }
  function schedule() {
    clearTimeout(state.timer);
    if (!state.playing) return;
    const fr = frames(), nxt = (state.i + 1) % fr.length;
    const jump = nxt === 0 || (fr[nxt].mjd - fr[state.i].mjd) * 1440 > 15;
    state.timer = setTimeout(() => { show(state.i + 1); schedule(); }, (jump ? BASE * 1.6 : BASE) / state.speed);
  }
  function play(on) { state.playing = on; $('ast-play').textContent = on ? 'Pause' : 'Play'; setPressed($('ast-play'), on); schedule(); }
  function nearest(gx, gy) {
    const p = frames().map(pt); let best = { d: 1e9, x: p[0][0], y: p[0][1] };
    for (let k = 0; k < p.length - 1; k++) {
      const [ax, ay] = p[k], [bx, by] = p[k + 1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      const s = L ? Math.max(0, Math.min(1, ((gx - ax) * dx + (gy - ay) * dy) / L)) : 0;
      const x = ax + s * dx, y = ay + s * dy, d = Math.hypot(gx - x, gy - y);
      if (d < best.d) best = { d, x, y };
    }
    return best;
  }
  function totals() {
    const v = Object.values(state.scores);
    $('ast-total').textContent = v.length ? 'Total ' + v.reduce((a, b) => a + b, 0) + ' of ' + (100 * state.idx.targets.length) : '';
  }
  function setFind() {
    state.found = false; $('ast-stage').classList.add('is-finding'); $('ast-stage').classList.remove('is-guessed');
    $('ast-prompt').textContent = 'Watch the loop, then tap the dot that moves.';
    $('ast-reveal').hidden = false; $('ast-again').hidden = true; overlay();
  }
  function reveal(guess) {
    state.found = true; $('ast-stage').classList.remove('is-finding'); $('ast-reveal').hidden = true; $('ast-again').hidden = false; overlay();
    const d = state.d;
    if (guess) {
      const nb = nearest(guess[0], guess[1]), px = nb.d, score = Math.max(0, Math.round(100 * (1 - Math.max(0, px - 1) / 11)));
      state.scores[state.t.id] = Math.max(state.scores[state.t.id] || 0, score); totals();
      const g = $('ast-guess'); g.setAttribute('transform', 'translate(' + guess[0] + ' ' + guess[1] + ')');
      const m = $('ast-miss'); m.setAttribute('x1', guess[0]); m.setAttribute('y1', guess[1]); m.setAttribute('x2', nb.x); m.setAttribute('y2', nb.y);
      $('ast-stage').classList.add('is-guessed');
      $('ast-prompt').innerHTML = (px <= 1.5 ? 'On the track. ' : px <= 6 ? 'Close. ' : 'Missed it. ') + 'Your tap was <b>' + fmt(px * PX, 0) + '″</b> (' + fmt(px, 1) + ' px) from the Horizons path. Score <b>' + score + '</b> of 100.';
    } else {
      $('ast-prompt').innerHTML = d.name.replace(/^\d+ /, '') + ' moves <b>' + fmt(d.path_px, 0) + ' px</b> in ' + d.span_label + '. The dashed line is its JPL Horizons path.';
    }
  }
  function render() {
    const d = state.d, fr = frames();
    document.querySelectorAll('[data-target]').forEach((b) => setPressed(b, b.dataset.target === state.t.id));
    $('ast-name').textContent = d.name + ', ' + d.kind;
    preload();
    $('ast-range').max = fr.length - 1;
    $('ast-ticks').innerHTML = fr.map((f, k) => '<i style="left:' + (100 * (f.mjd - fr[0].mjd) / (fr[fr.length - 1].mjd - fr[0].mjd)).toFixed(3) + '%"></i>').join('');
    $('ast-start').textContent = fr[0].utc.slice(11, 16) + ' UTC'; $('ast-end').textContent = '+' + d.span_label;
    $('ast-track').setAttribute('points', fr.map((f) => pt(f).join(',')).join(' '));
    $('ast-dots').innerHTML = fr.map((f) => { const [x, y] = pt(f); return '<circle cx="' + x + '" cy="' + y + '" r=".55" fill="#bda38b"/>'; }).join('');
    $('ast-still-a').src = '/data/asteroids/' + state.t.id + '/' + fr[0].img; $('ast-still-b').src = '/data/asteroids/' + state.t.id + '/' + fr[fr.length - 1].img;
    $('ast-flags').innerHTML = d.labels.map((l) => '<li class="' + (l.kind === 'warn' ? 'is-warn' : '') + '">' + l.text + '</li>').join('');
    $('ast-flags-m').innerHTML = $('ast-flags').innerHTML;
    const rows = [
      ['Time gap, first to last', d.span_label + ', ' + d.n_visits + ' visits'],
      ['Exposures', fr.length + ' in ' + d.detector + ', ' + fmt(d.wl_range[0], 2) + ' to ' + fmt(d.wl_range[1], 2) + ' µm'],
      ['Apparent speed', fmt(d.rate_arcsec_h, 1) + '″ per hour'],
      ['Path on the grid', fmt(d.path_px, 1) + ' px (' + fmt(d.path_arcsec / 60, 1) + '′)'],
      ['Barnard’s Star, same path', fmt(d.barnard_years_for_same_path, 1) + ' years'],
      ['Fit vs Horizons, median', d.median_fit_offset_arcsec == null ? 'n/a' : fmt(d.median_fit_offset_arcsec, 1) + '″ (' + d.n_fitted + ' of ' + fr.length + ' frames)'],
      ['Brightness, distance', 'V ' + fmt(d.V, 1) + ', ' + fmt(d.delta_au, 2) + ' au'],
    ];
    $('ast-stats').innerHTML = rows.map((r) => '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>').join('');
    $('ast-compare').textContent = 'Barnard’s Star, the fastest star in the sky, drifts ' + fmt(state.idx.barnard_arcsec_yr, 2) + '″ a year. ' + d.name.replace(/^\d+ /, '') + ' covers that in ' + fmt(3600 * state.idx.barnard_arcsec_yr / d.rate_arcsec_h / 60, 1) + ' minutes, about ' + big(Math.round(d.rate_vs_barnard / 1000) * 1000) + ' times faster.';
    setFind();
    show(0);
  }
  async function pick(id) {
    const t = state.idx.targets.find((x) => x.id === id) || state.idx.targets[0];
    const d = await (await fetch('/data/' + t.data)).json();
    state.t = t; state.d = d; state.i = 0;
    const u = new URL(location.href); u.searchParams.set('target', t.id); history.replaceState(null, '', u);
    render(); schedule();
  }
  function stageClick(e) {
    if (state.found) return;
    const r = $('ast-img').getBoundingClientRect();
    reveal([(e.clientX - r.left) / r.width * N, (e.clientY - r.top) / r.height * N]);
  }
  async function init() {
    state.idx = await (await fetch('/data/asteroids.json')).json();
    $('ast-targets').innerHTML = '<span class="lb__label">Asteroid</span>' + state.idx.targets.map((t) => '<button class="lb__chip" type="button" data-target="' + t.id + '" aria-pressed="false">' + t.short + '</button>').join('');
    $('ast-targets').addEventListener('click', (e) => { const b = e.target.closest('[data-target]'); if (b) pick(b.dataset.target); });
    document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => { state.speed = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach((x) => setPressed(x, x === b)); schedule(); }));
    $('ast-play').addEventListener('click', () => play(!state.playing));
    $('ast-range').addEventListener('input', (e) => { play(false); show(+e.target.value); });
    $('ast-track-btn').addEventListener('click', () => { state.track = !state.track; setPressed($('ast-track-btn'), state.track); if (state.track && !state.found) reveal(null); overlay(); });
    $('ast-diff-btn').addEventListener('click', () => { state.diff = !state.diff; setPressed($('ast-diff-btn'), state.diff); show(state.i); });
    $('ast-reveal').addEventListener('click', () => reveal(null));
    $('ast-again').addEventListener('click', () => { state.track = false; setPressed($('ast-track-btn'), false); setFind(); });
    $('ast-stage').addEventListener('click', stageClick);
    $('ast-stage').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!state.found) reveal(null); } });
    await pick(q.get('target') || 'eros');
    play(state.playing);
  }
  init();
})();
</script>
