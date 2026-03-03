import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Radar, Sparkles, ScanLine } from 'lucide-react'

const featureCards = [
  {
    icon: Radar,
    label: 'Trait Vectoring',
    text: 'Maps your responses into a 9-dimensional movie preference signature.',
  },
  {
    icon: Sparkles,
    label: 'Hybrid Ranking',
    text: 'Fuses profile alignment, text signals, and adaptive reranking.',
  },
  {
    icon: ScanLine,
    label: 'Precision Pass',
    text: 'Runs adaptive follow-up questions to reduce ambiguity before matching.',
  },
]

export default function Landing() {
  return (
    <div className="py-10 md:py-16">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="surface overflow-hidden"
      >
        <div className="grid gap-8 p-7 md:grid-cols-[1.1fr_0.9fr] md:items-center md:p-10">
          <div>
            <span className="outline-chip">psychology x cinema intelligence</span>
            <h1 className="headline mt-5 text-4xl leading-tight text-zinc-100 md:text-6xl">
              Stop scrolling.
              <br />
              Start matching.
            </h1>
            <p className="mt-5 max-w-xl text-base text-zinc-300 md:text-lg">
              MindMatch is a transparent recommender that models your long-term taste and current mood,
              then returns movies that feel intentionally matched, not random.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/quiz" className="btn-neo">
                Run Match Sequence
                <ArrowRight className="h-4 w-4" />
              </Link>
              <span className="btn-ghost">~2 minute adaptive quiz</span>
            </div>
          </div>

          <div className="surface-soft grid h-fit content-start gap-3 self-start p-3 md:self-center">
            <div className="rounded-xl border border-white/15 bg-black/35 p-3">
              <div className="code-label text-zinc-400">sample profile preview</div>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-xs text-zinc-300">
                {['depth', 'novelty', 'comfort', 'energy', 'mood', 'humor'].map((k, i) => (
                  <div key={k} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
                    <div className="uppercase text-[10px] text-zinc-500">{k}</div>
                    <div className="mt-1 h-1.5 rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-white"
                        style={{ width: `${50 + ((i * 11) % 38)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/[0.03] p-3">
              <div className="code-label text-zinc-400">signal path</div>
              <div className="mt-2 overflow-x-auto">
                <p className="min-w-max whitespace-nowrap text-sm text-zinc-300">
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
          return (
            <motion.article
              key={item.label}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.06, duration: 0.45 }}
              className="surface-soft p-5"
            >
              <div className="mb-3 inline-flex rounded-lg border border-white/20 bg-white/10 p-2 text-white">
                <Icon className="h-4 w-4" />
              </div>
              <h2 className="headline text-lg text-zinc-100">{item.label}</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.text}</p>
            </motion.article>
          )
        })}
      </section>
    </div>
  )
}

