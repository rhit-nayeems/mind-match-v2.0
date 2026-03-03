import { Outlet, Link } from 'react-router-dom'
import { Film, Sparkles } from 'lucide-react'

export default function App() {
  return (
    <div className="tech-shell">
      <div className="tech-bg" aria-hidden>
        <div className="tech-grid" />
        <div className="tech-web" />
        <div className="tech-circuit" />
        <div className="tech-ring" />
        <div className="tech-spokes" />
        <div className="tech-nodes" />
        <div className="tech-flares" />
        <div className="tech-scan" />
        <div className="tech-orb a" />
        <div className="tech-orb b" />
        <div className="tech-noise" />
        <div className="tech-vignette" />
      </div>

      <header className="mx-4 mt-4 rounded-2xl surface px-4 py-3">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <Link to="/" className="flex items-center gap-3 text-white">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/30 bg-white/10">
              <Film className="h-4 w-4" />
            </span>
            <span>
              <span className="headline block text-base tracking-tight">MindMatch</span>
              <span className="code-label text-zinc-400">adaptive recommender</span>
            </span>
          </Link>

          <div className="outline-chip hidden sm:inline-flex">
            <Sparkles className="mr-2 h-3.5 w-3.5" />
            live profile inference
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-8">
        <Outlet />
        <footer className="mt-12 text-xs text-zinc-500">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </footer>
      </main>
    </div>
  )
}
