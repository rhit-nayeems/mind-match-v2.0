import { motion } from 'framer-motion'
import MatchBars from './MatchBars'

export default function MovieCard({ m, onClick, onSave }: { m: any, onClick?: ()=>void, onSave?: ()=>void }) {
  return (
    <motion.div whileHover={{ y: -4, rotateX: 1, rotateY: -1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className="card overflow-hidden">
      <button onClick={onClick} className="text-left w-full">
        <img src={m.posterUrl || 'https://picsum.photos/300/450'} alt={m.title} className="w-full aspect-[2/3] object-cover" />
        <div className="p-4">
          <div className="font-semibold">{m.title}</div>
          <div className="text-xs text-slate-400 mb-2">{m.year}</div>
          <p className="text-sm text-slate-300 line-clamp-3 mb-3">{m.synopsis}</p>
          <MatchBars match={m.match} />
          {m.links && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {m.links.watch && (
                <a href={m.links.watch} target="_blank" rel="noreferrer"
                  className="px-2 py-1 rounded-full border border-slate-700 hover:border-slate-500">
                  Where to Watch
                </a>
              )}
              {m.links.imdb && (
                <a href={m.links.imdb} target="_blank" rel="noreferrer"
                  className="px-2 py-1 rounded-full border border-slate-700 hover:border-slate-500">
                  IMDb
                </a>
              )}
              {m.links.tmdb && (
                <a href={m.links.tmdb} target="_blank" rel="noreferrer"
                  className="px-2 py-1 rounded-full border border-slate-700 hover:border-slate-500">
                  TMDb
                </a>
              )}
              {Array.isArray(m.links.providers) && m.links.providers.length > 0 && (
                <span className="text-slate-400">• {m.links.providers.slice(0,3).join(' · ')}</span>
              )}
            </div>
          )}
        </div>
      </button>
      <div className="px-4 pb-4 flex justify-end">
        <button onClick={onSave} className="text-xs px-3 py-1 rounded-full border border-slate-700 hover:border-slate-500">Save</button>
      </div>
    </motion.div>
  )
}
