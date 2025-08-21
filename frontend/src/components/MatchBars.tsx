export default function MatchBars({ match }: { match: number }) {
  const pct = Math.round(match * 100)
  return (
    <div>
      <div className="text-sm text-slate-400 mb-1">Match {pct}%</div>
      <div className="w-full h-2 bg-slate-800 rounded">
        <div className="h-2 rounded bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
