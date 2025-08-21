import { Outlet, Link } from 'react-router-dom'
import { Film } from 'lucide-react'

export default function App() {
  return (
    <div className="min-h-screen gradient">
      <header className="p-4 glass rounded-b-2xl mx-4 mt-4 flex items-center gap-2">
        <Film className="w-5 h-5 text-brand-500" />
        <Link to="/" className="font-semibold tracking-wide">MindMatch Industrial</Link>
      </header>
      <main className="max-w-5xl mx-auto p-4">
        <Outlet />
        <footer className="mt-16 text-xs text-slate-500">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </footer>
      </main>
    </div>
  )
}
