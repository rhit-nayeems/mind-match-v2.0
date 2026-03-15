import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Radar, Sparkles, ScanLine } from 'lucide-react'

const featureCards = [
  {
    icon: Radar,
    label: 'Your Taste Profile',
    text: 'Turns your answers into a 9-part movie profile.',
  },
  {
    icon: Sparkles,
    label: 'How Recommendations Work',
    text: 'Looks at your profile, the movie itself, and a final pass to avoid repetitive picks.',
  },
  {
    icon: ScanLine,
    label: 'Adaptive Follow-Up Questions',
    text: 'Asks a few extra questions when your answers could point in more than one direction.',
  },
]

const previewMetrics = ['depth', 'novelty', 'comfort', 'energy', 'mood', 'humor']
const iconTintClasses = ['icon-tint-1', 'icon-tint-2', 'icon-tint-3']

export default function Landing() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className="py-10 md:py-16">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="surface overflow-hidden"
      >
        <div className="grid min-w-0 gap-8 p-7 md:grid-cols-[1.1fr_0.9fr] md:items-center md:p-10">
          <div className="min-w-0">
            <span className="outline-chip">adaptive movie recommendation engine</span>
            <h1 className="headline mt-5 text-4xl leading-tight text-zinc-100 md:text-6xl">
              Stop scrolling.
              <br />
              Start matching.
            </h1>
            <p className="mt-7 max-w-xl text-base text-zinc-300 md:text-lg">
              A smarter movie recommender that understands your taste and your mood.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/quiz"
                className="btn-neo group relative px-6 py-3 text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_24px_rgba(2,6,23,0.34),0_0_0_1px_rgba(103,232,249,0.08)] transition-all duration-200 hover:border-cyan-200/60 hover:text-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_16px_34px_rgba(2,6,23,0.42),0_0_26px_rgba(34,211,238,0.18)]"
              >
                <span className="relative">Find My Movie</span>
                <ArrowRight className="relative h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <span className="btn-ghost max-w-full text-sm leading-tight">~2 minute adaptive quiz</span>
            </div>
          </div>

          <div className="surface-soft grid min-w-0 h-fit content-start gap-3 self-start p-3 md:self-center">
            <div className="rounded-xl border border-cyan-200/25 bg-black/35 p-3">
              <div className="code-label text-cyan-100/80">sample profile preview</div>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-xs text-zinc-300">
                {previewMetrics.map((metric, i) => {
                  const targetWidth = `${50 + ((i * 11) % 38)}%`
                  return (
                    <div key={metric} className="rounded-lg border border-cyan-200/20 bg-white/[0.03] px-2 py-1">
                      <div className="uppercase text-[10px] text-zinc-500">{metric}</div>
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
            <div className="rounded-xl border border-cyan-200/20 bg-cyan-200/[0.04] p-3">
              <div className="code-label text-cyan-100/80">signal path</div>
              <div className="mt-2 overflow-x-auto">
                <p className="text-sm leading-relaxed text-zinc-200 whitespace-normal break-words">
                  quiz vectors -&gt; weighted similarity -&gt; diversity rerank -&gt; curated top matches
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
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
              className="surface-soft p-5"
            >
              <div className={`mb-3 inline-flex rounded-lg border border-cyan-200/20 bg-cyan-100/[0.08] p-2 ${tint}`}>
                <Icon className="h-4 w-4" />
              </div>
              <h2 className="headline text-lg text-zinc-100">{item.label}</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">{item.text}</p>
            </motion.article>
          )
        })}
      </section>
    </div>
  )
}
