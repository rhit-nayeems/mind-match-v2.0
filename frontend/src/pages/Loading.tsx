import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export default function Loading() {
  const nav = useNavigate()
  const loc = useLocation() as any

  useEffect(() => {
    const saved = localStorage.getItem('mm_answers')
    const answers = loc.state?.answers ?? (saved ? JSON.parse(saved) : null)

    if (!answers) {
      nav('/quiz')
      return
    }

    const t = setTimeout(() => nav('/results', { state: { answers } }), 550)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="surface w-full max-w-xl p-8 text-center">
        <div className="code-label text-zinc-400">running recommendation graph</div>
        <h1 className="headline mt-3 text-2xl text-zinc-100">Finding your best matches</h1>
        <p className="mt-2 text-sm text-zinc-400">Generating candidates and reranking for diversity.</p>

        <div className="mt-6 h-2 overflow-hidden rounded-full border border-white/15 bg-white/5">
          <div className="pulse-soft h-full w-1/2 rounded-full bg-white" />
        </div>
      </div>
    </div>
  )
}

