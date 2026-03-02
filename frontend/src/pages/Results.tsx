// frontend/src/pages/Results.tsx
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { postRecommend } from '../lib/api'
import { MoviePoster } from '../components/MoviePoster'

const TRAITS = [
  'darkness',
  'energy',
  'mood',
  'depth',
  'optimism',
  'novelty',
  'comfort',
  'intensity',
  'humor',
] as const

type TraitKey = typeof TRAITS[number]

type ResultsData = {
  profile: { summary: string; traits: Record<string, number> }
  recommendations: Array<{
    id: string | number
    title: string
    year?: number
    rating?: string
    director?: string
    posterUrl?: string | null
    synopsis?: string
    traits?: Record<string, number>
    match?: number
    genre?: string[]
  }>
}

const clamp01 = (v: any) => {
  const n = Number(v ?? 0)
  if (!isFinite(n)) return 0
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n))
}

const pct = (v?: number) => (v == null ? '-' : `${Math.round((v > 1 ? v : v * 100))}%`)

export default function Results() {
  const loc = useLocation() as any
  const nav = useNavigate()

  const [data, setData] = useState<ResultsData | null>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const isLoading = !data

  function handleRetake() {
    try {
      localStorage.removeItem('mm_answers')
      localStorage.removeItem('mm_context')
      localStorage.removeItem('mm_responses')
      localStorage.removeItem('mm_page')
    } catch {}
    nav('/quiz', { replace: true, state: { reset: true } })
  }

  useEffect(() => {
    const saved = localStorage.getItem('mm_answers')
    const savedCtx = localStorage.getItem('mm_context')
    const answers: number[] = loc.state?.answers ?? (saved ? JSON.parse(saved) : null)
    let context: any = loc.state?.context

    if (!context && savedCtx) {
      try {
        context = JSON.parse(savedCtx)
      } catch {}
    }

    if (!answers) {
      setTimeout(() => nav('/quiz'), 0)
      return
    }

    if (context) {
      try {
        localStorage.setItem('mm_context', JSON.stringify(context))
      } catch {}
    }

    ;(async () => {
      const res = await postRecommend(answers, localStorage.getItem('mm_session') || '', context)
      setData(res as ResultsData)
      setSelectedIdx(0)

      setTimeout(() => {
        confetti({
          particleCount: 48,
          spread: 58,
          origin: { y: 0.68 },
          colors: ['#f5f5f5', '#d4d4d8', '#a1a1aa'],
          scalar: 0.76,
          ticks: 160,
        })
      }, 180)
    })()
  }, [])

  const userOrdered = useMemo(() => {
    const src = data?.profile?.traits ?? {}
    const out: Record<TraitKey, number> = {} as Record<TraitKey, number>
    TRAITS.forEach((k) => {
      out[k] = clamp01((src as any)[k])
    })
    return out
  }, [data?.profile?.traits])

  const movieOrdered = useMemo(() => {
    const src = data?.recommendations?.[selectedIdx]?.traits ?? {}
    const out: Record<TraitKey, number> = {} as Record<TraitKey, number>
    TRAITS.forEach((k) => {
      out[k] = clamp01((src as any)[k])
    })
    return out
  }, [data?.recommendations, selectedIdx])

  const recs = data?.recommendations ?? []
  const selected = recs[selectedIdx]

  return (
    <div className="py-4 md:py-6">
      <section className="surface p-5 md:p-8">
        <header className="text-center">
          <span className="outline-chip">personal profile synthesis</span>
          <h1 className="headline mt-4 text-3xl text-zinc-100 md:text-4xl">Your Match Matrix</h1>
          <p className="mx-auto mt-3 max-w-3xl text-sm leading-relaxed text-zinc-300 md:text-base">
            {data?.profile?.summary ?? 'Computing your profile summary...'}
          </p>
          <div className="mt-5">
            <button onClick={handleRetake} className="btn-ghost">
              Retake Quiz
            </button>
          </div>
        </header>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="lg:col-span-7">
            <h2 className="headline mb-4 text-lg text-zinc-100">Recommended Titles</h2>

            {isLoading ? (
              <div className="grid gap-5 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="surface-soft p-4">
                    <div className="skeleton mb-3 h-36 w-24" />
                    <div className="skeleton mb-2 h-4 w-40" />
                    <div className="skeleton mb-2 h-3 w-52" />
                    <div className="skeleton h-3 w-44" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                {recs.map((m, i) => {
                  const active = i === selectedIdx
                  return (
                    <button
                      key={m.id ?? i}
                      onClick={() => setSelectedIdx(i)}
                      className={[
                        'w-full rounded-2xl border p-4 text-left transition-all',
                        'bg-white/[0.03] hover:bg-white/[0.09] border-white/15',
                        active ? 'border-white/65 shadow-[0_0_0_1px_rgba(255,255,255,.35)]' : '',
                      ].join(' ')}
                    >
                      <div className="flex gap-4">
                        <div className="w-24 shrink-0">
                          <MoviePoster
                            posterUrl={m.posterUrl || undefined}
                            title={m.title}
                            className="h-36 w-24 rounded-xl bg-black/40"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-1 text-base font-semibold text-zinc-100 md:text-lg">{m.title}</h3>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                            {m.year && <span>{m.year}</span>}
                            {m.rating && (
                              <span className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-0.5">{m.rating}</span>
                            )}
                            {m.director && <span>{m.director}</span>}
                          </div>

                          {m.synopsis && <p className="mt-2 line-clamp-2 text-sm text-zinc-300">{m.synopsis}</p>}

                          {m.genre && m.genre.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {m.genre.slice(0, 3).map((g, idx) => (
                                <span
                                  key={`${m.id}-${g}-${idx}`}
                                  className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-xs text-zinc-300"
                                >
                                  {g}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="mt-3">
                            <div className="flex items-center justify-between text-xs text-zinc-400">
                              <span>match score</span>
                              <span className="font-semibold text-zinc-200">{pct(m.match)}</span>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full border border-white/15 bg-white/10">
                              <div
                                className="h-full rounded-full bg-white"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (m.match ?? 0) > 1 ? (m.match as number) : (m.match ?? 0) * 100
                                  )}%`,
                                }}
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

          <aside className="lg:col-span-5">
            <h2 className="headline mb-4 text-lg text-zinc-100">Profile vs Selected Movie</h2>
            <div className="surface-soft p-5">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">selected</div>
                  <div className="truncate font-semibold text-zinc-100">{selected?.title ?? '-'}</div>
                </div>
                <div className="text-sm text-zinc-300">{selected?.match != null ? pct(selected.match) : '-'} match</div>
              </div>

              <div className="mt-4 flex items-center justify-center">
                <InlineRadar
                  keys={TRAITS as unknown as string[]}
                  user={userOrdered}
                  movie={movieOrdered}
                  size={430}
                />
              </div>

              <p className="mt-3 text-center text-xs text-zinc-500">
                Select any card to inspect trait alignment.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}

function InlineRadar({
  keys,
  user,
  movie,
  size = 420,
}: {
  keys: string[]
  user: Record<string, number>
  movie?: Record<string, number>
  size?: number
}) {
  const fontPx = 11
  const charPx = 7
  const edgePad = 14
  const labelGap = 16

  const maxLabelWidth = Math.max(...keys.map((k) => k.length * charPx))
  const half = size / 2
  const sideReserve = maxLabelWidth + edgePad + labelGap
  const topBottomReserve = fontPx + edgePad + labelGap

  const rMax = Math.max(0, Math.min(half - sideReserve, half - topBottomReserve))

  const cx = half
  const cy = half
  const labelR = rMax + labelGap

  const spokes = keys.map((key, idx) => {
    const angle = (Math.PI * 2 * idx) / keys.length - Math.PI / 2
    const x = cx + Math.cos(angle) * rMax
    const y = cy + Math.sin(angle) * rMax
    return { key, angle, x, y }
  })

  const pointsUser = toPoints(spokes, user, rMax, cx, cy)
  const pointsMovie = movie ? toPoints(spokes, movie, rMax, cx, cy) : null

  return (
    <svg width={size} height={size} role="img" aria-label="Trait radar chart" style={{ overflow: 'visible' }}>
      {[0.25, 0.5, 0.75, 1].map((p) => (
        <circle key={p} cx={cx} cy={cy} r={rMax * p} fill="none" stroke="rgba(255,255,255,.18)" />
      ))}

      {spokes.map((s) => (
        <line key={s.key} x1={cx} y1={cy} x2={s.x} y2={s.y} stroke="rgba(255,255,255,.14)" />
      ))}

      {pointsMovie && (
        <polygon points={pointsMovie} fill="rgba(163,163,163,.18)" stroke="rgba(212,212,212,.92)" strokeWidth="2" />
      )}
      <polygon points={pointsUser} fill="rgba(255,255,255,.20)" stroke="rgba(255,255,255,.96)" strokeWidth="2" />

      {spokes.map((s) => {
        const lx = cx + Math.cos(s.angle) * labelR
        const ly = cy + Math.sin(s.angle) * labelR

        const isLeft = lx < cx - 4
        const isRight = lx > cx + 4
        const isTop = !isLeft && !isRight && ly < cy
        const isBottom = !isLeft && !isRight && ly > cy

        const anchor: 'start' | 'end' | 'middle' = isLeft ? 'end' : isRight ? 'start' : 'middle'
        const dy = isTop ? '-0.5em' : isBottom ? '1.0em' : '0.35em'

        const approxW = s.key.length * charPx
        let x = lx

        if (anchor === 'end') x = Math.max(edgePad + approxW, lx)
        if (anchor === 'start') x = Math.min(size - edgePad - approxW, lx)
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
            style={{ fill: 'rgba(228,228,231,.84)', fontSize: fontPx, pointerEvents: 'none' }}
          >
            {s.key}
          </text>
        )
      })}
    </svg>
  )
}

function toPoints(
  spokes: { key: string; angle: number }[],
  vec: Record<string, number>,
  rMax: number,
  cx: number,
  cy: number
) {
  return spokes
    .map((s) => {
      const v = clamp01(vec?.[s.key] ?? 0)
      const x = cx + Math.cos(s.angle) * (rMax * v)
      const y = cy + Math.sin(s.angle) * (rMax * v)
      return `${x},${y}`
    })
    .join(' ')
}

