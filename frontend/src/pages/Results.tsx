// frontend/src/pages/Results.tsx
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { postRecommend } from '../lib/api'
import { MoviePoster } from '../components/MoviePoster' // named export

// ---- constants / helpers ----
const TRAITS = [
  'darkness','energy','mood','depth','optimism','novelty','comfort','intensity','humor'
] as const
type TraitKey = typeof TRAITS[number]

const clamp01 = (v: any) => {
  const n = Number(v ?? 0)
  if (!isFinite(n)) return 0
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n))
}
const pct = (v?: number) => v == null ? '—' : `${Math.round((v > 1 ? v : v*100))}%`

export default function Results() {
  const loc = useLocation() as any
  const nav = useNavigate()

  const [data, setData] = useState<null | {
    profile: { summary: string, traits: Record<string, number> },
    recommendations: Array<{
      id: string|number, title: string, year?: number, rating?: string,
      director?: string, posterUrl?: string|null, synopsis?: string,
      traits?: Record<string, number>, match?: number, genre?: string[]
    }>
  }>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const isLoading = !data

  // NEW: fully reset saved quiz state before navigating back
  function handleRetake() {
    try {
      localStorage.removeItem('mm_answers')   // 9-number vector used by Results
      localStorage.removeItem('mm_responses') // per-question autosave used by Quiz
      localStorage.removeItem('mm_page')      // last quiz page index
    } catch {}
    // send to quiz; use replace so back button doesn't return to Results with stale state
    nav('/quiz', { replace: true, state: { reset: true } })
  }

  // Always run hooks in the same order: fetch inside effect, no early return
  useEffect(() => {
    const saved = localStorage.getItem('mm_answers')
    const answers: number[] = loc.state?.answers ?? (saved ? JSON.parse(saved) : null)
    if (!answers) {
      // still don’t return early; just navigate after render
      setTimeout(() => nav('/quiz'), 0)
      return
    }
    ;(async () => {
      const res = await postRecommend(answers, localStorage.getItem('mm_session') || '')
      setData(res as any)
      setSelectedIdx(0)
      setTimeout(() => {
        confetti({
          particleCount: 80,
          spread: 65,
          origin: { y: 0.65 },
          colors: ['#a78bfa','#8b5cf6','#22d3ee','#60a5fa'],
          scalar: .8,
          ticks: 180
        })
      }, 200)
    })()
  }, [])

  // Build ordered vectors for radar on every render (fallback to zeros while loading)
  const userOrdered = useMemo(() => {
    const src = data?.profile?.traits ?? {}
    const o: Record<TraitKey, number> = {} as any
    TRAITS.forEach(k => { o[k] = clamp01((src as any)[k]) })
    return o
  }, [data?.profile?.traits])

  const movieOrdered = useMemo(() => {
    const mv = data?.recommendations?.[selectedIdx]?.traits ?? {}
    const o: Record<TraitKey, number> = {} as any
    TRAITS.forEach(k => { o[k] = clamp01((mv as any)[k]) })
    return o
  }, [data?.recommendations, selectedIdx])

  const recs = data?.recommendations ?? []
  const selected = recs[selectedIdx]

  return (
    <div className="min-h-screen text-slate-100 bg-[radial-gradient(1200px_600px_at_10%_-10%,#16182a,#0b1020)]">
      <div className="max-w-7xl mx-auto px-5 pb-16 pt-10">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Your Personality Profile</h1>

          {/* Explanatory subtitle */}
          <p className="text-slate-300/90 mt-2">
            Based on your personality and how you're feeling <span className="italic">today</span>, here are your best matches.
          </p>

          <p className="mt-4 max-w-3xl mx-auto text-slate-300 leading-relaxed">
            {data?.profile?.summary ?? 'Loading your summary…'}
          </p>
          <div className="mt-6">
            <button
              onClick={handleRetake}
              className="rounded-xl px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 font-semibold"
            >
              ↻ Take Quiz Again
            </button>
          </div>
        </div>

        {/* Main */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: matches */}
          <section className="lg:col-span-7">
            <h2 className="text-lg font-semibold mb-4">Your Movie Matches</h2>

            {isLoading ? (
              <div className="grid sm:grid-cols-2 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-2xl p-4 border border-slate-700 bg-[#12162a]/70">
                    <div className="h-36 w-24 bg-slate-800 rounded-xl mb-3" />
                    <div className="h-4 w-40 bg-slate-800 rounded mb-2" />
                    <div className="h-3 w-56 bg-slate-800 rounded mb-1" />
                    <div className="h-3 w-48 bg-slate-800 rounded" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-6">
                {recs.map((m, i) => {
                  const active = i === selectedIdx
                  return (
                    <button
                      key={m.id ?? i}
                      onClick={() => setSelectedIdx(i)}
                      className={[
                        "text-left rounded-2xl p-4 border transition-all w-full",
                        "bg-[#12162a]/80 hover:bg-[#151a34]",
                        active ? "border-violet-500 shadow-[0_0_0_3px_rgba(139,92,246,.15)]" : "border-slate-700"
                      ].join(" ")}
                    >
                      <div className="flex gap-4">
                        <div className="shrink-0 w-24">
                          <MoviePoster
                            posterUrl={m.posterUrl || undefined}
                            title={m.title}
                            className="h-36 w-24 bg-slate-900 rounded-xl"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base md:text-lg font-semibold line-clamp-1">{m.title}</h3>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                            {m.year && <span>📅 {m.year}</span>}
                            {m.rating && <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700">{m.rating}</span>}
                            {m.director && <span>👤 {m.director}</span>}
                          </div>

                          {m.synopsis && <p className="mt-2 text-sm text-slate-300 line-clamp-2">{m.synopsis}</p>}

                          {m.genre && m.genre.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {m.genre.slice(0,3).map((g, idx) => (
                                <span key={idx} className="px-2 py-0.5 text-xs rounded-full bg-[#1a2040] border border-[#2b3360] text-slate-200">
                                  {g}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="mt-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400">Match Score</span>
                              <span className="font-semibold">{pct(m.match)}</span>
                            </div>
                            <div className="mt-1 h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-cyan-300"
                                style={{ width: `${Math.min(100, (m.match ?? 0) > 1 ? (m.match as number) : (m.match ?? 0) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* Right: radar comparison (inline SVG) */}
          <aside className="lg:col-span-5">
            <h2 className="text-lg font-semibold mb-4">Personality Comparison</h2>
            <div className="rounded-2xl border border-slate-700 bg-[#12162a]/80 p-5">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm text-slate-300">Selected</div>
                  <div className="font-semibold truncate">{selected?.title ?? '—'}</div>
                </div>
                <div className="text-violet-300 text-sm">
                  ⭐ {selected?.match != null ? pct(selected.match) : '—'} Match
                </div>
              </div>

              <div className="mt-4 flex items-center justify-center">
                <InlineRadar
                  keys={TRAITS as unknown as string[]}
                  user={userOrdered}
                  movie={movieOrdered}
                  size={440}
                />
              </div>

              <p className="mt-3 text-center text-xs text-slate-400">
                Click on a movie to see how your personalities align
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function InlineRadar({
  keys, user, movie, size = 420,
}: {
  keys: string[]
  user: Record<string, number>
  movie?: Record<string, number>
  size?: number
}) {
  // Typography + spacing constants
  const fontPx = 12;            // label font size
  const charPx = 7;             // rough px/char for 12px font (good estimate)
  const edgePad = 16;           // min distance from text to svg edge
  const labelGap = 16;          // distance from ring to label baseline

  // Compute ring radius so labels fit perfectly inside the SVG box
  const maxLabelWidth = Math.max(...keys.map(k => k.length * charPx))
  const half = size / 2

  // side (left/right) needs horizontal room for full text
  const sideReserve = maxLabelWidth + edgePad + labelGap

  // top/bottom needs vertical room for text height
  const topBottomReserve = fontPx + edgePad + labelGap

  // ring radius is the limiting dimension
  const rMax = Math.max(
    0,
    Math.min(half - sideReserve, half - topBottomReserve)
  )

  // Center (no vertical bias), label radius just outside ring
  const cx = half
  const cy = half
  const labelR = rMax + labelGap

  // Build spokes
  const spokes = keys.map((key, idx) => {
    const angle = (Math.PI * 2 * idx) / keys.length - Math.PI / 2 // start at top (12 o'clock)
    const x = cx + Math.cos(angle) * rMax
    const y = cy + Math.sin(angle) * rMax
    return { key, angle, x, y }
  })

  const pointsUser  = toPoints(spokes, user,  rMax, cx, cy)
  const pointsMovie = movie ? toPoints(spokes, movie, rMax, cx, cy) : null

  return (
    <svg
      width={size}
      height={size}
      role="img"
      aria-label="Trait radar chart"
      style={{ overflow: 'visible' }}  // safety (shouldn’t be needed now)
    >
      {/* rings */}
      {[0.25, 0.5, 0.75, 1].map((p) => (
        <circle key={p} cx={cx} cy={cy} r={rMax * p} fill="none" stroke="#203054" opacity="0.6" />
      ))}

      {/* spokes */}
      {spokes.map((s) => (
        <line key={s.key} x1={cx} y1={cy} x2={s.x} y2={s.y} stroke="#203054" opacity="0.45" />
      ))}

      {/* polygons */}
      {pointsMovie && <polygon points={pointsMovie} fill="#f59e0b38" stroke="#f59e0b" strokeWidth="2" />}
      <polygon points={pointsUser} fill="#6ea8fe40" stroke="#6ea8fe" strokeWidth="2" />

      {/* labels — perfectly symmetric & edge-safe */}
      {spokes.map((s) => {
        const lx = cx + Math.cos(s.angle) * labelR
        const ly = cy + Math.sin(s.angle) * labelR

        const isLeft  = lx < cx - 4
        const isRight = lx > cx + 4
        const isTop   = !isLeft && !isRight && ly < cy
        const isBottom= !isLeft && !isRight && ly > cy

        // “Anchor” determines which edge of the text sits at (x, y)
        const anchor: 'start'|'end'|'middle' = isLeft ? 'end' : isRight ? 'start' : 'middle'

        // Vertical baseline adjustments to keep optical balance
        const dy =
          isTop    ? '-0.5em' :
          isBottom ? '1.0em'  :
                     '0.35em'

        // Edge-aware x clamping (final safety; with dynamic rMax it rarely triggers)
        const approxW = (s.key.length * charPx)
        let x = lx
        if (anchor === 'end')   x = Math.max(edgePad + approxW, lx)                  // left side
        if (anchor === 'start') x = Math.min(size - edgePad - approxW, lx)           // right side
        if (anchor === 'middle') {
          const halfW = approxW / 2
          x = Math.min(size - edgePad - halfW, Math.max(edgePad + halfW, lx))
        }

        return (
          <text
            key={s.key}
            x={x}
            y={ly}
            textAnchor={anchor}
            dy={dy}
            style={{ fill: '#9eb1d1', fontSize: fontPx, pointerEvents: 'none' }}
          >
            {s.key}
          </text>
        )
      })}
    </svg>
  )
}

function toPoints(
  spokes: { key: string, angle: number }[],
  vec: Record<string, number>,
  rMax: number, cx: number, cy: number
) {
  return spokes.map((s) => {
    const v = clamp01(vec?.[s.key] ?? 0)
    const x = cx + Math.cos(s.angle) * (rMax * v)
    const y = cy + Math.sin(s.angle) * (rMax * v)
    return `${x},${y}`
  }).join(' ')
}
