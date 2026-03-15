import { Outlet, Link } from 'react-router-dom'
import { Film, Sparkles } from 'lucide-react'

export default function App() {
  return (
    <div className="tech-shell">
      <div className="tech-bg" aria-hidden>
        <div className="tech-grid" />
        <div className="tech-web" />
        <div className="tech-circuit" />
        <div className="tech-nodes" />
        <div className="tech-orb a" />
        <div className="tech-orb b" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="topbar-shell">
          <div className="topbar-bridge" aria-hidden />

          <header className="surface topbar-surface px-5 py-4 md:px-6 md:py-4">
            <div className="flex items-center justify-between gap-4">
              <Link to="/" className="flex items-center gap-3 text-white">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-200/30 bg-cyan-100/[0.1] text-cyan-100">
                  <Film className="h-4.5 w-4.5" />
                </span>
                <span>
                  <span className="headline block text-[1.05rem] leading-tight tracking-tight">MindMatch</span>
                  <span className="code-label text-cyan-100/70">adaptive recommender</span>
                </span>
              </Link>

              <div className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-cyan-200/20 bg-cyan-100/[0.05] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-cyan-100/70">
                <Sparkles className="h-3.5 w-3.5" />
                personalized recommendations
              </div>
            </div>
          </header>
        </div>

        <main className="pb-12 pt-5 md:pt-6">
          <Outlet />
          <footer className="mt-12 border-t border-cyan-200/12 pt-7 text-[11px] text-zinc-400/80">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <p>(c) {new Date().getFullYear()} MindMatch. All rights reserved.</p>
              <a
                href="mailto:aimindmatch@gmail.com"
                className="w-fit text-zinc-400/85 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                Suggestions: aimindmatch@gmail.com
              </a>
            </div>

            <div className="mt-5 rounded-xl px-1 py-2">
              <a
                href="https://www.themoviedb.org/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-cyan-100/70 transition-colors hover:text-cyan-50"
              >
                <img src="/tmdb-logo.svg" alt="TMDB logo" className="h-5 w-5 rounded-sm" loading="lazy" />
                <span className="text-[9px] uppercase tracking-[0.14em]">TMDB Data Source</span>
              </a>
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-500/80">
                This product uses the TMDB API but is not endorsed or certified by TMDB.
              </p>
            </div>
          </footer>
        </main>
      </div>
    </div>
  )
}
