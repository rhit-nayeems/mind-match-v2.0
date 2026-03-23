import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Radar, Sparkles, ScanLine } from 'lucide-react'

const featureCards = [
  {
    icon: Radar,
    label: 'Your Taste Profile',
    text: 'Turns your answers into a 9-part movie profile',
  },
  {
    icon: Sparkles,
    label: 'How Recommendations Work',
    text: 'Looks at your profile, the movie itself, and a final pass to avoid repetitive picks',
  },
  {
    icon: ScanLine,
    label: 'Adaptive Follow-Up Questions',
    text: 'Asks a few extra questions when your answers could point in more than one direction',
  },
]

const previewMetrics = ['depth', 'novelty', 'comfort', 'energy', 'mood', 'humor']
const iconTintClasses = ['icon-tint-1', 'icon-tint-2', 'icon-tint-3']

export default function Landing() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className="landing-page py-10 md:py-16">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="surface landing-hero overflow-hidden"
      >
        <div className="landing-hero-grid grid min-w-0 gap-8 p-7 md:grid-cols-[1.08fr_0.92fr] md:items-center md:p-10">
          <div className="min-w-0">
            <span className="outline-chip">adaptive movie recommendation engine</span>
            <h1 className="headline landing-title mt-5 text-4xl md:text-6xl">
              <span className="block">Stop scrolling</span>
              <span className="landing-title-accent block">Start matching</span>
            </h1>
            <p className="landing-copy-text mt-7 max-w-xl text-base md:text-lg">
              A smarter movie recommender that combines your taste and current mood to find movies you'll actually want to watch
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/quiz" className="btn-neo landing-cta group relative px-6 py-3 text-[15px]">
                <span className="relative">Find My Movie</span>
                <ArrowRight className="relative h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <span className="landing-cta-note max-w-full text-sm leading-tight">~2 minute adaptive quiz</span>
            </div>
          </div>

          <div className="surface-soft landing-preview grid min-w-0 h-fit content-start gap-3 self-start p-3 md:self-center">
            <div className="landing-preview-card rounded-xl p-3">
              <div className="code-label text-[#8187fc]/90">sample profile preview</div>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-xs text-zinc-200">
                {previewMetrics.map((metric, i) => {
                  const targetWidth = `${50 + ((i * 11) % 38)}%`
                  return (
                    <div key={metric} className="landing-preview-metric rounded-lg px-2 py-1">
                      <div className="uppercase text-[10px] text-zinc-400">{metric}</div>
                      <div className="mt-1 h-1.5 rounded-full bg-white/10">
                        <motion.div
                          className="bar-accent h-full rounded-full origin-left"
                          style={{ width: targetWidth }}
                          initial={shouldReduceMotion ? false : { scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={
                            shouldReduceMotion
                              ? { duration: 0 }
                              : { duration: 0.42, delay: 0.18 + i * 0.08, ease: [0.22, 1, 0.36, 1] as const }
                          }
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="landing-signal-card rounded-xl p-3">
              <div className="code-label text-[#8187fc]/90">signal path</div>
              <div className="mt-2 overflow-x-auto">
                <p className="text-sm leading-relaxed text-zinc-100 whitespace-normal break-words">
                  quiz vectors -&gt; weighted similarity -&gt; diversity rerank -&gt; curated top matches
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      <section className="landing-feature-grid mt-8 grid gap-4 md:grid-cols-3">
        {featureCards.map((item, idx) => {
          const Icon = item.icon
          const tint = iconTintClasses[idx % iconTintClasses.length]
          return (
            <motion.article
              key={item.label}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.06, duration: 0.45 }}
              className="surface-soft landing-feature-card p-5"
            >
              <div className={`landing-feature-icon mb-3 inline-flex rounded-lg p-2 ${tint}`}>
                <Icon className="h-4 w-4" />
              </div>
              <h2 className="headline text-lg text-zinc-50">{item.label}</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-200/85">{item.text}</p>
            </motion.article>
          )
        })}
      </section>
    </div>
  )
}
