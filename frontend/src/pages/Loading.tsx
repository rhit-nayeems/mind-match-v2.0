import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export default function Loading() {
  const nav = useNavigate()
  const loc = useLocation() as any

  useEffect(() => {
    const saved = localStorage.getItem('mm_answers')
    const answers = loc.state?.answers ?? (saved ? JSON.parse(saved) : null)

    if (!answers) {
      // No answers at all → send the user back to the quiz
      nav('/quiz')
      return
    }

    // Small delay to show the loader, then go to results carrying answers
    const t = setTimeout(() => nav('/results', { state: { answers } }), 500)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="h-80 grid place-items-center">
      <div className="animate-pulse text-slate-300">Finding movies for your mood… 🎬</div>
    </div>
  )
}
