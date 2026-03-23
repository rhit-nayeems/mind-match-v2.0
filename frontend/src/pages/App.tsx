import { Outlet, Link } from 'react-router-dom'
import NeuralBackdrop from '../components/NeuralBackdrop'

export default function App() {

  return (
    <div className="tech-shell">
      <div className="tech-bg" aria-hidden>
        <NeuralBackdrop />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="topbar-shell">
          <div className="topbar-bridge" aria-hidden />

          <header className="surface topbar-surface px-4 py-4 md:px-5 md:py-5">
            <div className="topbar-layout">
              <Link to="/" className="topbar-brand text-white">
                <span className="topbar-brand-orbit" aria-hidden>
                  <span className="topbar-brand-core">
                    <img src="/icon.png" alt="" className="h-5 w-5 rounded-[0.35rem] object-contain" loading="eager" />
                  </span>
                </span>

                <span className="topbar-brand-copy">
                  <span className="headline topbar-brand-title">MindMatch</span>
                  <span className="topbar-brand-meta">
                    <span className="topbar-brand-chip code-label">adaptive recommender</span>
                  </span>
                </span>
              </Link>
            </div>
          </header>
        </div>

        <main className="pb-12 pt-5 md:pt-6">
          <Outlet />
          <footer className="mt-12 border-t border-[#8187fc]/12 pt-7 text-[11px] text-zinc-400/80">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <p>(c) {new Date().getFullYear()} MindMatch All rights reserved</p>
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
                className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-[#8187fc]/70 transition-colors hover:text-[#8187fc]"
              >
                <img src="/tmdb-logo.svg" alt="TMDB logo" className="h-5 w-5 rounded-sm" loading="lazy" />
                <span className="text-[9px] uppercase tracking-[0.14em]">TMDB Data Source</span>
              </a>
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-500/80">
                This product uses the TMDB API but is not endorsed or certified by TMDB
              </p>
            </div>
          </footer>
        </main>
      </div>
    </div>
  )
}


