import { Outlet, Link } from 'react-router-dom'
import { Film, Sparkles, ArrowUpRight } from 'lucide-react'

export default function App() {
  return (
    <div className="tech-shell">
      <div className="tech-bg" aria-hidden>
        <div className="tech-grid" />
        <div className="tech-web" />
        <div className="tech-circuit" />
        <div className="tech-spokes" />
        <div className="tech-nodes" />
        <div className="tech-orb a" />
        <div className="tech-orb b" />
        <div className="tech-noise" />
      </div>

      <header className="mx-3 mt-3 md:mx-5 md:mt-5">
        <div className="surface px-4 py-3 md:px-5 md:py-3.5">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
            <Link to="/" className="group flex min-w-0 items-center gap-3 text-white">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/35 bg-white/[0.11]">
                <Film className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="headline block truncate text-base tracking-tight">MindMatch</span>
                <span className="code-label text-zinc-400">cinematic intent engine</span>
              </span>
            </Link>

            <div className="hidden items-center gap-2 sm:flex">
              <span className="outline-chip">
                <Sparkles className="h-3.5 w-3.5" />
                profile-aware ranking
              </span>
              <Link to="/quiz" className="btn-ghost inline-flex items-center gap-1.5 text-sm">
                New run
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-3 pb-14 pt-8 md:px-4 md:pt-10">
        <Outlet />

        <footer className="mt-14 surface-soft px-4 py-3 text-xs text-zinc-500 md:px-5">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </footer>
      </main>
    </div>
  )
}
