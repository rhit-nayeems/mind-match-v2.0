import { Outlet, Link } from 'react-router-dom'
import { Film, Sparkles } from 'lucide-react'

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
        <footer className="mt-12 border-t border-white/10 pt-5 text-xs text-zinc-400">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p>(c) {new Date().getFullYear()} MindMatch. All rights reserved.</p>
            <a
              href="mailto:aimindmatch@gmail.com"
              className="w-fit text-zinc-300 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              Suggestions: aimindmatch@gmail.com
            </a>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <a
              href="https://www.themoviedb.org/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2.5 py-1.5 text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
            >
              <img src="/tmdb-logo.svg" alt="TMDB logo" className="h-5 w-5 rounded-sm" loading="lazy" />
              <span className="text-[10px] uppercase tracking-[0.12em]">TMDB Data Source</span>
            </a>
            <p className="mt-2 text-zinc-500">
              This product uses the TMDB API but is not endorsed or certified by TMDB.
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}
