import React from 'react'
import Link from 'next/link'
import { ExternalLink, ArrowRight, Crosshair, Layers, Eye, Gamepad2 } from 'lucide-react'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import HeroBlink from '@/components/HeroBlink'
import { BUNDLE_TARGET_IDS } from '@/lib/bundle-loader'
import { TARGET_STORIES } from '@/lib/target-stories'

const STEPS = [
  {
    icon: Crosshair,
    title: 'Pick an object',
    desc: 'Choose one of five nearby stars and brown dwarfs. SkyBlink works out where each one is today, because star catalogues record where they were years ago.',
    tech: 'Positions corrected with Gaia DR3 or CatWISE2020 proper motion.',
  },
  {
    icon: Layers,
    title: 'We line up the images',
    desc: 'Every NASA SPHEREx picture of that patch of sky is stacked by visit, cleaned of artefacts and turned so north is up, so the background stars hold still.',
    tech: 'Frames grouped into ~6-month visits, co-added per detector band, flagged pixels masked, reprojected to one grid.',
  },
  {
    icon: Eye,
    title: 'Watch it move',
    desc: 'The images flip back and forth like a flip-book. Anything that moved jumps. Switch to Diff to see the change in colour, or open a spectrum to see what it is made of.',
    tech: '102 infrared channels from 0.75 to 5 µm.',
  },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-sky-bg text-sky-ink font-manrope">
      <SiteHeader />

      <main id="main">
        {/* Hero: the real 16-year blink, not an illustration */}
        <section aria-labelledby="hero-h" className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-sky-gradient" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-accent/30 bg-sky-accent/5 px-3 py-1.5 text-sm text-sky-accent">
                Real images from NASA SPHEREx and WISE
              </p>
              <h1 id="hero-h" className="mb-6 text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                Watch the infrared sky move.
              </h1>
              <p className="mb-5 max-w-xl text-lg leading-relaxed text-sky-inkDim sm:text-xl">
                Flip between NASA infrared images taken years apart and see nearby stars drift across the sky.
                No software, no sign-in, no FITS files.
              </p>
              <p className="mb-10 max-w-xl text-base font-semibold text-sky-ink">
                Star catalogues are out of date. We found where the stars went.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/viewer" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-sky-accent px-6 font-bold text-sky-bg transition-colors hover:bg-sky-accent/90">
                  Open the viewer
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="/long-baseline" className="inline-flex min-h-12 items-center rounded-xl border border-sky-border px-6 font-semibold text-sky-ink transition-colors hover:border-sky-accent/50">
                  See 16 years of motion
                </Link>
              </div>
            </div>
            <div className="mx-auto w-full max-w-md lg:max-w-none">
              <HeroBlink />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" aria-labelledby="how-h" className="bg-sky-surface/30 px-4 sm:px-6 py-20">
          <div className="mx-auto max-w-7xl">
            <h2 id="how-h" className="mb-4 text-3xl font-black">How it works</h2>
            <p className="mb-12 max-w-2xl text-lg text-sky-inkDim">
              Astronomers have found moving stars this way for a century: take two pictures of the same sky and flip between them.
              SkyBlink does it with NASA’s newest infrared survey.
            </p>
            <ol className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-xl border border-sky-border bg-sky-surface p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-accent/10 text-sky-accent">
                      <s.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="font-mono text-sm text-sky-inkDim">Step {i + 1}</span>
                  </div>
                  <h3 className="mb-3 text-lg font-bold">{s.title}</h3>
                  <p className="mb-3 leading-relaxed text-sky-inkDim">{s.desc}</p>
                  <p className="text-sm text-sky-inkDim">{s.tech}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Targets */}
        <section aria-labelledby="targets-h" className="px-4 sm:px-6 py-20">
          <div className="mx-auto max-w-7xl">
            <h2 id="targets-h" className="mb-4 text-3xl font-black">Five objects to explore</h2>
            <p className="mb-12 max-w-2xl text-lg text-sky-inkDim">
              Each one shows something different: fast motion, a cold atmosphere, an out-of-date position, a flickering young star and a pulsing giant.
            </p>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {BUNDLE_TARGET_IDS.map(id => {
                const t = TARGET_STORIES[id]
                return (
                  <li key={id}>
                    <Link href={`/viewer?target=${id}`} className="group flex h-full flex-col rounded-xl border border-sky-border bg-sky-surface p-5 transition-colors hover:border-sky-accent/50">
                      <span className="mb-3 self-start rounded-full border border-sky-accent/30 bg-sky-accent/10 px-2.5 py-0.5 text-xs font-semibold text-sky-accent">
                        {t.tag}
                      </span>
                      <h3 className="text-lg font-bold text-sky-ink group-hover:text-sky-accent">{t.name}</h3>
                      <p className="mb-3 text-sm text-sky-inkDim">{t.kind}</p>
                      <p className="mb-4 leading-relaxed text-sky-inkDim">{t.story}</p>
                      <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-sky-accent">
                        Open in the viewer <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                )
              })}
              <li>
                <Link href="/battle" className="group flex h-full flex-col rounded-xl border border-battle-accent/30 bg-battle-accent/5 p-5 transition-colors hover:border-battle-accent/60">
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-battle-accent/15 text-battle-accent">
                    <Gamepad2 className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-lg font-bold text-sky-ink group-hover:text-battle-accent">Blink Battle</h3>
                  <p className="mb-4 leading-relaxed text-sky-inkDim">
                    A quick game: spot the star that moved in real SPHEREx images. Five rounds, scored on accuracy and speed.
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-battle-accent">
                    Play <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            </ul>
          </div>
        </section>

        {/* About / Credits */}
        <section id="about" aria-labelledby="about-h" className="bg-sky-surface/30 px-4 sm:px-6 py-20">
          <div className="mx-auto max-w-7xl">
            <h2 id="about-h" className="mb-8 text-3xl font-black">About the data</h2>

            <div className="mb-10 grid grid-cols-1 gap-8 md:grid-cols-2">
              <div>
                <h3 className="mb-3 font-semibold text-sky-ink">SPHEREx</h3>
                <p className="mb-4 leading-relaxed text-sky-inkDim">
                  SPHEREx (Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer)
                  is a NASA mission launched in March 2025. It maps the whole sky in 102 infrared colours,
                  from 0.75 to 5 µm, and comes back to each spot about every six months.
                </p>
                <ul className="space-y-1">
                  {[
                    ['https://doi.org/10.26131/IRSA678', 'SPHEREx DR1 Spectral Images (doi:10.26131/IRSA678)'],
                    ['https://doi.org/10.26131/IRSA662', 'SPHEREx QR3 Spectral Images (doi:10.26131/IRSA662)'],
                    ['https://doi.org/10.26131/IRSA151', 'WISE All-Sky Atlas (doi:10.26131/IRSA151)'],
                  ].map(([href, label]) => (
                    <li key={href}>
                      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-sky-accent hover:underline">
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        {label}
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-3 font-semibold text-sky-ink">Other data</h3>
                <ul className="list-disc space-y-2 pl-5 text-sky-inkDim marker:text-sky-accent">
                  <li><strong className="text-sky-ink">Gaia DR3</strong> (ESA/DPAC): motion for Barnard’s Star, ε Indi B, RW Aur and R Dra, and the comparison stars</li>
                  <li><strong className="text-sky-ink">CatWISE2020</strong> (doi:10.26131/IRSA551): motion for WISE 0855</li>
                  <li><strong className="text-sky-ink">CatWISE, AllWISE and 2MASS</strong>: the catalogues used to label objects as known</li>
                  <li><strong className="text-sky-ink">IRSA</strong> (NASA/IPAC): image search and the public SPHEREx archive</li>
                </ul>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-sky-border bg-sky-surface p-5 text-sm leading-relaxed text-sky-inkDim">
              <p>
                <strong className="text-sky-ink">SPHEREx acknowledgement.</strong>{' '}
                This publication makes use of data products from the Spectro-Photometer for the History of the Universe,
                Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion
                Laboratory and the California Institute of Technology, and is funded by NASA.
              </p>
              <p>
                <strong className="text-sky-ink">WISE.</strong>{' '}
                This publication makes use of data products from the Wide-field Infrared Survey Explorer, which is a joint project of the
                University of California, Los Angeles, and the Jet Propulsion Laboratory/California Institute of Technology, funded by NASA.
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
                Marocco et al. 2021, ApJS 253, 8.{' '}
                doi:<a href="https://doi.org/10.26131/IRSA551" className="text-sky-accent hover:underline" target="_blank" rel="noopener noreferrer">10.26131/IRSA551</a>
              </p>
              <p>
                Software: astropy, astroquery, pyvo, numpy, scipy, Pillow. Released under{' '}
                <a href="https://www.apache.org/licenses/LICENSE-2.0" className="text-sky-accent hover:underline" target="_blank" rel="noopener noreferrer">Apache-2.0</a>.
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
