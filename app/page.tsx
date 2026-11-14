import React from 'react'
import Link from 'next/link'
import { Zap, ExternalLink, Telescope } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-sky-bg text-sky-ink font-manrope">
      {/* Nav */}
      <nav className="border-b border-sky-border px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-sky-accent" />
          <span className="font-bold text-sky-ink tracking-tight">SkyBlink</span>
        </div>
        <div className="flex gap-6 items-center">
          <a href="#how-it-works" className="text-sm text-sky-inkDim hover:text-sky-ink transition-colors">How it works</a>
          <a href="#about" className="text-sm text-sky-inkDim hover:text-sky-ink transition-colors">About the data</a>
          <Link
            href="/battle"
            className="text-sm text-sky-inkDim hover:text-sky-ink transition-colors"
          >
            Blink Battle
          </Link>
          <Link
            href="/viewer"
            className="px-4 py-2 rounded-lg bg-sky-accent text-sky-bg text-sm font-semibold hover:bg-sky-accent/90 transition-colors"
          >
            Open the viewer
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-24 max-w-7xl mx-auto">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-10" style={{ background: '#5ab9fc' }} />
          <div className="absolute bottom-10 right-1/3 w-64 h-64 rounded-full blur-3xl opacity-5" style={{ background: '#5ab9fc' }} />
        </div>

        <div className="relative max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-sky-accent/30 bg-sky-accent/5 text-sky-accent text-xs mb-6">
            <Zap className="w-3 h-3" />
            Built on NASA SPHEREx data
          </div>
          
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-tight mb-6 text-sky-ink">
            Watch the infrared sky move.
          </h1>
          
          <p className="text-lg sm:text-xl text-sky-inkDim mb-4 max-w-2xl leading-relaxed">
            Type any sky coordinates and play SPHEREx images as a looping blink.
            Spot proper motion, see brown dwarfs, and extract infrared spectra — 
            no FITS files needed.
          </p>
          
          <p className="text-sm text-sky-inkDim/70 mb-10">
            NASA's coordinates are out of date. We found where the stars went.
          </p>

          <div className="flex flex-wrap gap-4">
            <Link
              href="/viewer"
              className="px-6 py-3 rounded-xl bg-sky-accent text-sky-bg font-bold text-sm hover:bg-sky-accent/90 transition-colors"
            >
              Open the viewer
            </Link>
            <Link
              href="/viewer?target=wise-0855"
              className="px-6 py-3 rounded-xl border border-sky-border text-sky-inkDim font-semibold text-sm hover:border-sky-accent/40 hover:text-sky-ink transition-colors"
            >
              Try WISE 0855
            </Link>
          </div>
        </div>

        {/* App preview */}
        <div className="mt-16 relative">
          <div className="bg-sky-surface rounded-2xl border border-sky-border overflow-hidden shadow-2xl max-w-4xl mx-auto">
            {/* Fake app bar */}
            <div className="border-b border-sky-border px-4 py-3 flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
              </div>
              <div className="flex-1 bg-sky-bg rounded px-3 py-1 text-xs font-mono text-sky-inkDim">
                skyblink.vercel.app/viewer?target=barnards-star&band=D2&mode=diff
              </div>
            </div>

            {/* Fake viewer layout */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-0">
              <div className="p-6">
                {/* Target chips */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  {["Barnard's Star", 'ε Indi B', 'WISE 0855', 'RW Aur', 'R Dra'].map((n, i) => (
                    <div key={n} className={`px-3 py-1 rounded-full border text-xs ${i === 0 ? 'border-sky-accent/50 bg-sky-accent/10 text-sky-accent' : 'border-sky-border text-sky-inkDim'}`}>
                      {n}
                    </div>
                  ))}
                </div>

                {/* Fake image grid */}
                <div className="grid grid-cols-2 gap-3">
                  {['2025-05-15', '2026-02-20'].map(date => (
                    <div key={date} className="rounded-lg bg-sky-bg border border-sky-border overflow-hidden" style={{ aspectRatio: '1' }}>
                      <div className="w-full h-full relative flex items-center justify-center">
                        {/* Fake star field */}
                        <div className="absolute inset-0">
                          {Array.from({ length: 50 }, (_, i) => (
                            <div
                              key={i}
                              className="absolute rounded-full"
                              style={{
                                left: `${(i * 37 + 11) % 100}%`,
                                top: `${(i * 61 + 7) % 100}%`,
                                width: i % 7 === 0 ? 2 : 1,
                                height: i % 7 === 0 ? 2 : 1,
                                backgroundColor: `rgba(233, 237, 243, ${0.3 + (i % 4) * 0.15})`,
                              }}
                            />
                          ))}
                        </div>
                        {/* Target star */}
                        <div
                          className="absolute w-3 h-3 rounded-full bg-sky-ink"
                          style={{
                            left: date === '2025-05-15' ? '50%' : '53%',
                            top: date === '2025-05-15' ? '50%' : '44%',
                            transform: 'translate(-50%, -50%)',
                            boxShadow: '0 0 6px rgba(233,237,243,0.8)',
                          }}
                        />
                        <div className="absolute bottom-0 left-0 right-0 py-1 px-2 text-[10px] font-mono text-sky-inkDim bg-black/50 flex justify-between">
                          <span>{date}</span>
                          <span>D2</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-3 text-xs text-sky-inkDim font-mono">
                  Barnard's Star moved 10″ (1.7 px) · proper motion 10,362 mas/yr
                </div>
              </div>

              {/* Metadata sidebar */}
              <div className="border-l border-sky-border p-4 space-y-3 hidden md:block">
                <div className="text-sky-inkDim text-[10px] font-mono uppercase tracking-wider">Position</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-sky-inkDim">RA</span>
                    <span className="font-mono text-sky-ink">17h57m48.5s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sky-inkDim">Dec</span>
                    <span className="font-mono text-sky-ink">+04°41′36″</span>
                  </div>
                </div>
                
                <div className="text-sky-inkDim text-[10px] font-mono uppercase tracking-wider mt-3">Proper Motion</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-sky-inkDim">μ_RA</span>
                    <span className="font-mono text-sky-ink">−802 mas/yr</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sky-inkDim">μ_Dec</span>
                    <span className="font-mono text-sky-ink">10362 mas/yr</span>
                  </div>
                </div>
                
                <div className="mt-3 p-2 rounded border border-yellow-500/30 bg-yellow-500/5">
                  <div className="text-[10px] text-yellow-400 font-mono">⚠ Stale coordinate</div>
                  <div className="text-[10px] text-sky-inkDim mt-0.5">PM correction applied · 2016→2026</div>
                </div>
                
                <div className="pt-3">
                  <a href="/viewer?target=barnards-star" className="text-xs text-sky-accent hover:underline">
                    Open full viewer →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="how-it-works" className="px-6 py-20 bg-sky-surface/30">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-black mb-4">How it works</h2>
          <p className="text-sky-inkDim mb-12 max-w-2xl">
            SkyBlink turns raw FITS files from NASA's SPHEREx satellite into a blink comparison anyone can use.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                n: '01',
                title: 'Enter coordinates',
                desc: 'Type RA/Dec in decimal or sexagesimal, or pick one of the 5 challenge targets. SkyBlink looks up proper motion from Gaia DR3 or CatWISE2020 and corrects the position to the current epoch.',
                accent: '#5ab9fc',
              },
              {
                n: '02',
                title: 'Fetch and stack',
                desc: "IRSA's SIA service finds every SPHEREx frame at that sky position. Frames are grouped into visits (∼6-month clusters), co-added per detector band, flagged pixels masked, and reprojected onto a north-up grid.",
                accent: '#5ab9fc',
              },
              {
                n: '03',
                title: 'Blink and explore',
                desc: 'The visits play as a loop. Toggle difference mode to see the star appear as a dark/bright dipole next to a control star. Click any pixel for its 102-channel spectrum (try Epsilon Indi B for the 3.3 µm methane dip).',
                accent: '#5ab9fc',
              },
            ].map(f => (
              <div key={f.n} className="bg-sky-surface rounded-xl border border-sky-border p-6">
                <div className="font-mono text-xs text-sky-inkDim mb-2">{f.n}</div>
                <div className="font-bold text-sky-ink mb-3">{f.title}</div>
                <div className="text-sky-inkDim text-sm leading-relaxed">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Targets */}
      <section className="px-6 py-20">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-black mb-4">Five challenge targets</h2>
          <p className="text-sky-inkDim mb-12">
            Each target demonstrates a different capability of SPHEREx data.
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                id: 'barnards-star',
                name: "Barnard's Star",
                badge: '1.54 px measured',
                badgeColor: '#5ab9fc',
                desc: "10,362 mas/yr — fastest-moving star. Measured D2 dipole: 1.54 px vs 1.67 px predicted. Saturated core; wings-only Gaussian fit.",
                band: 'D2',
              },
              {
                id: 'eps-indi-b',
                name: 'Epsilon Indi B',
                badge: 'CH₄ spectrum',
                badgeColor: '#4ade80',
                desc: "T1+T6 brown dwarf binary. Unsaturated. 102-channel spectrum shows the 3.3 µm methane dip. Hero SPHEREx science product.",
                band: 'D3',
              },
              {
                id: 'wise-0855',
                name: 'WISE 0855−0714',
                badge: '125.7″ stale coord',
                badgeColor: '#f97316',
                desc: "Brief coordinate is 20 px off; SkyBlink corrects via CatWISE2020. D6 S/N ≈ 10. Gaia G=16.3 star blends short-wavelength channels.",
                band: 'D6',
              },
              {
                id: 'rw-aur',
                name: 'RW Aurigae',
                badge: 'T Tauri variable',
                badgeColor: '#c084fc',
                desc: "Pre-main-sequence variable. Variability visible in D1 channels; rest saturated. Same-channel flux comparison across visits.",
                band: 'D2',
              },
              {
                id: 'r-dra',
                name: 'R Draconis',
                badge: 'Fully saturated',
                badgeColor: '#ef4444',
                desc: "Mira giant. All 515 photometry frames saturated. PSF-wing brightness ratio is a variability proxy (systematic floor ±0.3 mag).",
                band: 'D2',
              },
            ].map(t => (
              <Link
                key={t.id}
                href={`/viewer?target=${t.id}`}
                className="bg-sky-surface rounded-xl border border-sky-border p-5 hover:border-sky-accent/40 transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold text-sky-ink group-hover:text-sky-accent transition-colors">
                      {t.name}
                    </div>
                    <div className="text-sky-inkDim text-xs mt-0.5 font-mono">Default band: {t.band}</div>
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-mono"
                    style={{ color: t.badgeColor, backgroundColor: `${t.badgeColor}15`, border: `1px solid ${t.badgeColor}40` }}
                  >
                    {t.badge}
                  </span>
                </div>
                <p className="text-sky-inkDim text-xs leading-relaxed">{t.desc}</p>
              </Link>
            ))}
            
            {/* Blink Battle card */}
            <Link
              href="/battle"
              className="rounded-xl border p-5 hover:border-opacity-80 transition-colors group"
              style={{ background: '#382d1e', borderColor: '#4a3c2c' }}
            >
              <div className="text-[11px] font-mono mb-3" style={{ color: '#bda38b' }}>STRETCH</div>
              <div className="font-semibold mb-2" style={{ color: '#e4e2da' }}>Blink Battle</div>
              <p className="text-xs leading-relaxed" style={{ color: '#a89880' }}>
                Solo game — spot the moving star in real SPHEREx data. 5 rounds, scored by accuracy and speed.
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* About / Credits */}
      <section id="about" className="px-6 py-20 bg-sky-surface/30">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-black mb-4">About the data</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div>
              <h3 className="font-semibold text-sky-ink mb-3">SPHEREx</h3>
              <p className="text-sky-inkDim text-sm leading-relaxed mb-3">
                SPHEREx (Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer) 
                is a NASA MIDEX mission launched in March 2025. It surveys the full sky in 102 infrared channels 
                from 0.75 to 5 µm, returning to each position roughly every 6 months.
              </p>
              <div className="space-y-1">
                <a href="https://doi.org/10.26131/IRSA678" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-sky-accent hover:underline">
                  <ExternalLink className="w-3 h-3" />
                  SPHEREx DR1 Spectral Images — doi:10.26131/IRSA678
                </a>
                <a href="https://doi.org/10.26131/IRSA662" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-sky-accent hover:underline">
                  <ExternalLink className="w-3 h-3" />
                  SPHEREx QR3 Spectral Images — doi:10.26131/IRSA662
                </a>
                <a href="https://doi.org/10.26131/IRSA679" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-sky-accent hover:underline">
                  <ExternalLink className="w-3 h-3" />
                  SPHEREx DR1 All-Sky Cube — doi:10.26131/IRSA679 (if HiPS shown)
                </a>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-sky-ink mb-3">Additional data</h3>
              <ul className="space-y-2 text-sm text-sky-inkDim">
                <li>• <strong className="text-sky-ink">Gaia DR3</strong> (ESA/DPAC) — proper motion for Barnard's Star, ε Indi B, RW Aur, R Dra; comparison stars</li>
                <li>• <strong className="text-sky-ink">CatWISE2020</strong> (doi:10.26131/IRSA551) — proper motion for WISE 0855</li>
                <li>• <strong className="text-sky-ink">IRSA</strong> (NASA/IPAC) — SIA service, public S3 bucket s3://nasa-irsa-spherex</li>
                <li>• <strong className="text-sky-ink">SPHEREx QR3</strong> (doi:10.26131/IRSA662) — additional frames beyond DR1</li>
              </ul>
            </div>
          </div>
          
          <div className="bg-sky-surface rounded-xl border border-sky-border p-5">
            <div className="text-sky-inkDim text-xs leading-relaxed space-y-2">
              <p>
                <strong className="text-sky-ink">SPHEREx acknowledgement (required).</strong>{' '}
                This publication makes use of data products from the Spectro-Photometer for the History of the Universe,
                Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion
                Laboratory and the California Institute of Technology, and is funded by NASA.
              </p>
              <p>
                <strong className="text-sky-ink">IRSA.</strong>{' '}
                This research made use of the NASA/IPAC Infrared Science Archive, which is funded by NASA and operated
                by the California Institute of Technology.
              </p>
              <p>
                <strong className="text-sky-ink">Gaia.</strong>{' '}
                This work has made use of data from the European Space Agency (ESA) mission Gaia
                (https://www.cosmos.esa.int/gaia), processed by the Gaia Data Processing and Analysis Consortium (DPAC).
                Gaia DR3: Gaia Collaboration, Vallenari et al. 2023, A&amp;A 674, A1.
              </p>
              <p>
                <strong className="text-sky-ink">CatWISE2020.</strong>{' '}
                Used for WISE 0855 proper motion. Marocco et al. 2021, ApJS 253, 8.{' '}
                doi:<a href="https://doi.org/10.26131/IRSA551" className="text-sky-accent hover:underline" target="_blank" rel="noopener noreferrer">10.26131/IRSA551</a>
              </p>
              <p className="text-sky-inkDim/70">
                Software: astropy, astroquery, pyvo, numpy, scipy, Pillow.
                Released under <a href="https://www.apache.org/licenses/LICENSE-2.0" className="text-sky-accent hover:underline" target="_blank" rel="noopener noreferrer">Apache-2.0</a>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-sky-border px-6 py-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-sky-accent" />
            <span className="font-semibold text-sky-ink text-sm">SkyBlink</span>
            <span className="text-sky-inkDim text-xs">— NASA Space Apps 2026</span>
          </div>
          <div className="text-sky-inkDim text-xs text-center">
            SPHEREx DR1 doi:10.26131/IRSA678 · QR3 doi:10.26131/IRSA662 · ESA/Gaia/DPAC · CatWISE2020 doi:10.26131/IRSA551 · Apache-2.0
          </div>
          <div className="flex gap-4">
            <Link href="/viewer" className="text-xs text-sky-inkDim hover:text-sky-ink transition-colors">Viewer</Link>
            <Link href="/battle" className="text-xs text-sky-inkDim hover:text-sky-ink transition-colors">Battle</Link>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-xs text-sky-inkDim hover:text-sky-ink transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
