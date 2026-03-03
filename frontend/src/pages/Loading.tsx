import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeParseJSON<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function normalizeAnswers(input: unknown): number[] | null {
  if (!Array.isArray(input) || input.length !== 9) return null
  const out = input.map((x) => Number(x))
  if (out.some((x) => !Number.isFinite(x))) return null
  return out
}

export default function Loading() {
  const nav = useNavigate()
  const loc = useLocation() as any

  useEffect(() => {
    const answersFromState = normalizeAnswers(loc.state?.answers)
    const answersFromStorage = normalizeAnswers(safeParseJSON<unknown>(safeGetItem('mm_answers')))
    const answers = answersFromState ?? answersFromStorage

    if (!answers) {
      nav('/quiz', { replace: true })
      return
    }

    const t = setTimeout(() => nav('/results', { state: { answers } }), 550)
    return () => clearTimeout(t)
  }, [loc.state?.answers, nav])

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
