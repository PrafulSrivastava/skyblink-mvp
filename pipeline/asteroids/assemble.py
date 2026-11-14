import re, sys
SITE = sys.argv[1] if len(sys.argv) > 1 else '/workspace/taste-pass/site'
S = '/workspace/asteroids/src/'
t = open(f'{SITE}/time-lapse.html').read()
t = re.sub(r'<title>.*?</title>', '<title>SkyBlink asteroids: watch SPHEREx catch a moving rock in hours</title>', t)
t = re.sub(r'<meta name="description" content=".*?">', '<meta name="description" content="Blink real SPHEREx frames taken hours apart, find the asteroid that moves, then check your tap against its JPL Horizons path.">', t)
t = t.replace('</head>', open(S + 'extra.css').read() + '</head>')
t = re.sub(r'<main id="top">.*?</main>', lambda m: open(S + 'main.html').read().strip(), t, flags=re.S)
t = re.sub(r'<script>\n\(\(\) => \{.*?</script>', lambda m: open(S + 'app.js').read().strip(), t, flags=re.S)
t = t.replace('Data via NASA/IPAC IRSA, ESA Gaia, CatWISE2020 and unWISE', 'Data via NASA/IPAC IRSA (SPHEREx, MOST) and JPL Horizons')
open(f'{SITE}/asteroids.html', 'w').write(t)
NAV_OLD = '<div class="nav__item"><a class="nav__link" href="/#battle">Battle</a></div>'
NAV_NEW = NAV_OLD + '\n      <div class="nav__item"><a class="nav__link" href="/asteroids">Asteroids</a></div>'
FOOT_OLD = '<li><a href="/time-lapse">Time-lapse</a></li></ul>'
FOOT_NEW = '<li><a href="/time-lapse">Time-lapse</a></li><li><a href="/asteroids">Asteroids</a></li></ul>'
for p in ['index.html', 'long-baseline.html', 'time-lapse.html', 'credits.html', 'asteroids.html']:
    s = open(f'{SITE}/{p}').read()
    if 'href="/asteroids">Asteroids</a></div>' not in s: s = s.replace(NAV_OLD, NAV_NEW)
    if '<li><a href="/asteroids">' not in s: s = s.replace(FOOT_OLD, FOOT_NEW)
    if p == 'index.html' and 'Watch asteroids move' not in s:
        s = s.replace('<a class="link" href="/time-lapse">Play the 2010 to 2026 time-lapse</a>',
                      '<a class="link" href="/time-lapse">Play the 2010 to 2026 time-lapse</a>\n          <a class="link" href="/asteroids">Watch asteroids move in hours</a>')
    if p == 'credits.html' and 'JPL Horizons' not in s:
        s = s.replace('doi:10.26131/IRSA662.</p></div>', 'doi:10.26131/IRSA662. Also the hours-apart exposures on the <a href="/asteroids">asteroids page</a>.</p></div>', 1)
        s = s.replace('<div class="faq__item"><h3>Gaia</h3>',
          '<div class="faq__item"><h3>IRSA MOST</h3><p>The Moving Object Search Tool (MOST) of the NASA/IPAC Infrared Science Archive, catalog spherex, found every SPHEREx exposure that covers Eros, Lutetia, Psyche and Ganymed.</p></div>\n'
          '          <div class="faq__item"><h3>JPL Horizons</h3><p>Predicted asteroid positions are astrometric ICRF coordinates from the JPL Horizons system (Solar System Dynamics Group, Jet Propulsion Laboratory, ssd.jpl.nasa.gov/horizons), computed for the SPHEREx spacecraft (ID &minus;163182) at each exposure&rsquo;s mid-time.</p></div>\n'
          '          <div class="faq__item"><h3>Gaia</h3>', 1)
    open(f'{SITE}/{p}', 'w').write(s)
    print(p, s.count('/asteroids'))
