import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

function readSavedAnswers(): number[] | null {
  try {
    const raw = localStorage.getItem('mm_answers')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export default function Loading() {
  const nav = useNavigate()
  const loc = useLocation() as any

  useEffect(() => {
    const answers = Array.isArray(loc.state?.answers) ? loc.state.answers : readSavedAnswers()

    if (!answers || answers.length === 0) {
      nav('/quiz')
      return
    }

    const t = setTimeout(() => nav('/results', { state: { answers } }), 550)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="surface w-full max-w-xl p-8 text-center">
        <div className="code-label text-[#8187fc]/80">running recommendation graph</div>
        <h1 className="headline mt-3 text-2xl text-zinc-100">Finding your best matches</h1>
        <p className="mt-2 text-sm text-zinc-300">Generating candidates and reranking for diversity</p>

        <div className="mt-6 h-2 overflow-hidden rounded-full border border-[#8187fc]/20 bg-[#8187fc]/[0.1]">
          <div className="pulse-soft bar-accent h-full w-1/2 rounded-full" />
        </div>
      </div>
    </div>
  )
}

