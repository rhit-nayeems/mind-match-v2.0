import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Radar, Sparkles, ScanLine } from 'lucide-react'

const featureCards = [
  {
    icon: Radar,
    label: 'Your Movie Profile',
    text: 'Turns your answers into a 9-part movie profile.',
  },
  {
    icon: Sparkles,
    label: 'How Picks Are Chosen',
    text: 'Looks at your profile, the movie itself, and a final pass to avoid repetitive picks.',
  },
  {
    icon: ScanLine,
    label: 'Follow-Up Questions',
    text: 'Asks a few extra questions when your answers could point in more than one direction.',
  },
]

const iconTintClasses = ['icon-tint-1', 'icon-tint-2', 'icon-tint-3']

export default function Landing() {
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
            <span className="outline-chip">psychology x cinema intelligence</span>
            <h1 className="headline mt-5 text-4xl leading-tight text-zinc-100 md:text-6xl">
              Stop scrolling.
              <br />
              Start matching.
            </h1>
            <p className="mt-5 max-w-xl text-base text-zinc-300 md:text-lg">
              MindMatch looks at your usual taste and how you're feeling right now, then recommends
              movies that feel picked for you instead of pulled at random.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/quiz" className="btn-neo">
                Run Match Sequence
                <ArrowRight className="h-4 w-4" />
              </Link>
              <span className="btn-ghost max-w-full text-sm leading-tight">~2 minute adaptive quiz</span>
            </div>
          </div>

          <div className="surface-soft grid min-w-0 h-fit content-start gap-3 self-start p-3 md:self-center">
            <div className="rounded-xl border border-cyan-200/25 bg-black/35 p-3">
              <div className="code-label text-cyan-100/80">sample profile preview</div>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-xs text-zinc-300">
                {['depth', 'novelty', 'comfort', 'energy', 'mood', 'humor'].map((k, i) => (
                  <div key={k} className="rounded-lg border border-cyan-200/20 bg-white/[0.03] px-2 py-1">
                    <div className="uppercase text-[10px] text-zinc-500">{k}</div>
                    <div className="mt-1 h-1.5 rounded-full bg-white/10">
                      <div
                        className="bar-accent h-full rounded-full"
                        style={{ width: `${50 + ((i * 11) % 38)}%` }}
                      />
                    </div>
                  </div>
                ))}
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


