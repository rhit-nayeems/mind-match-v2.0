import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Radar, Sparkles, ScanLine, Cpu, Gauge } from 'lucide-react'

const featureCards = [
  {
    icon: Radar,
    label: 'Trait Vectoring',
    text: 'Transforms your answers into a normalized 9D preference profile.',
  },
  {
    icon: Sparkles,
    label: 'Hybrid Scoring',
    text: 'Combines trait alignment, text signals, and session context.',
  },
  {
    icon: ScanLine,
    label: 'Precision Rerank',
    text: 'Applies relevance floor and anti-repeat logic before final picks.',
  },
]

const quickStats = [
  { label: 'Active Catalog', value: '500 curated' },
  { label: 'Output', value: 'Top 4 matches' },
  { label: 'Flow', value: 'Adaptive quiz' },
]

export default function Landing() {
  return (
    <div className="py-8 md:py-12">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="surface overflow-hidden"
      >
        <div className="grid gap-8 p-6 md:grid-cols-[1.12fr_0.88fr] md:p-10">
          <div>
            <span className="outline-chip">psychology-informed movie intelligence</span>

            <h1 className="headline mt-5 text-4xl leading-[1.05] text-zinc-100 md:text-6xl">
              Picks that feel
              <br />
              personal, not random.
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-zinc-300 md:text-lg">
              MindMatch models both your baseline taste and tonight&apos;s mood, then serves high-confidence
              recommendations with minimal repetition across different users and sessions.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/quiz" className="btn-neo">
                Start Match Sequence
                <ArrowRight className="h-4 w-4" />
              </Link>
              <span className="btn-ghost">~2-3 minute adaptive flow</span>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {quickStats.map((item) => (
                <div key={item.label} className="surface-soft rounded-xl p-3">
                  <div className="code-label text-zinc-500">{item.label}</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-100">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="surface-soft rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="code-label text-zinc-400">runtime profile snapshot</span>
                <Gauge className="h-4 w-4 text-zinc-300" />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-300">
                {['depth', 'novelty', 'comfort', 'energy', 'mood', 'humor'].map((k, i) => (
                  <div key={k} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                    <div className="uppercase text-[10px] text-zinc-500">{k}</div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-white" style={{ width: `${48 + ((i * 13) % 40)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-soft rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="code-label text-zinc-400">signal pipeline</span>
                <Cpu className="h-4 w-4 text-zinc-300" />
              </div>
              <div className="mt-3 space-y-2 text-sm text-zinc-300">
                <p>quiz vectors -&gt; weighted similarity</p>
                <p>relevance floor -&gt; anti-repeat freshness</p>
                <p>rerank -&gt; top matches</p>
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
