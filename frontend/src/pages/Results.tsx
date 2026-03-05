// frontend/src/pages/Results.tsx
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { postRecommend } from '../lib/api'
import { MoviePoster } from '../components/MoviePoster'
import { Star } from 'lucide-react'

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
    rating_source?: string
    vote_average?: number
    vote_count?: number
    director?: string
    posterUrl?: string | null
    synopsis?: string
    traits?: Record<string, number>
    match?: number
    genre?: string[]
  }>
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

const normalizeTrait = (v: any, fallback = 0.5) => {
  if (v === null || v === undefined || v === '') return clamp01(fallback)
  const n = Number(v)
  if (!isFinite(n)) return clamp01(fallback)
  return clamp01(n > 1 ? n / 100 : n)
}

const pct = (v?: number) => (v == null ? '-' : `${Math.round((v > 1 ? v : v * 100))}%`)

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

function readSavedContext(): any {
  try {
    const raw = localStorage.getItem('mm_context')
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default function Results() {
  const loc = useLocation() as any
  const nav = useNavigate()

  const [data, setData] = useState<ResultsData | null>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [expandedSynopsisIds, setExpandedSynopsisIds] = useState<Set<string>>(new Set())
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
    const answers: number[] | null = Array.isArray(loc.state?.answers) ? loc.state.answers : readSavedAnswers()
    let context: any = loc.state?.context ?? readSavedContext()

    if (!answers || answers.length === 0) {
      setTimeout(() => nav('/quiz'), 0)
      return
    }

    if (context) {
      try {
        localStorage.setItem('mm_context', JSON.stringify(context))
      } catch {}
    }

    ;(async () => {
      try {
        const res = await postRecommend(answers, localStorage.getItem('mm_session') || '', context)
        setData(res as ResultsData)
        setSelectedIdx(0)
        setExpandedSynopsisIds(new Set())

        const allowConfetti =
          typeof window !== 'undefined' &&
          !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
          window.innerWidth >= 900

        if (allowConfetti) {
          setTimeout(() => {
            confetti({
              particleCount: 22,
              spread: 48,
              origin: { y: 0.72 },
              colors: ['#67e8f9', '#93c5fd', '#fbbf24'],
              scalar: 0.66,
              ticks: 120,
              disableForReducedMotion: true,
            })
          }, 200)
        }
      } catch (err) {
        console.error('Failed to load recommendations on /results refresh', err)
        setTimeout(() => nav('/quiz'), 0)
      }
    })()
  }, [])

  const userOrdered = useMemo(() => {
    const src = data?.profile?.traits ?? {}
    const out: Record<TraitKey, number> = {} as Record<TraitKey, number>
    TRAITS.forEach((k) => {
      out[k] = normalizeTrait((src as any)[k], 0.5)
    })
    return out
  }, [data?.profile?.traits])

  const movieOrdered = useMemo(() => {
    const src = data?.recommendations?.[selectedIdx]?.traits ?? {}
    const out: Record<TraitKey, number> = {} as Record<TraitKey, number>
    TRAITS.forEach((k) => {
      out[k] = normalizeTrait((src as any)[k], 0.5)
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
                  const cardKey = String(m.id ?? i)
                  const synopsis = String(m.synopsis ?? '').trim()
                  const canExpandSynopsis = synopsis.length > 110
                  const synopsisExpanded = expandedSynopsisIds.has(cardKey)

                  const voteAverage = Number(m.vote_average)
                  const normalizedVote = Number.isFinite(voteAverage) && voteAverage > 0
                    ? Math.max(0, Math.min(10, voteAverage))
                    : null
                  const ratingSource = String(m.rating_source || 'TMDB')
                  const filledStars = normalizedVote == null ? 0 : Math.max(0, Math.min(5, Math.round(normalizedVote / 2)))

                  return (
                    <div
                      key={cardKey}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedIdx(i)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedIdx(i)
                        }
                      }}
                      className={[
                        'w-full overflow-hidden rounded-2xl border p-4 text-left transition-all',
                        'bg-cyan-100/[0.03] hover:bg-cyan-100/[0.1] border-cyan-200/20',
                        active ? 'border-cyan-100/70 shadow-[0_0_0_1px_rgba(103,232,249,.45)]' : '',
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
                            {m.director && <span className="min-w-0 truncate">{m.director}</span>}
                          </div>

                          {normalizedVote != null && (
                            <div className="mt-1 max-w-full">
                              <span className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border border-amber-200/25 bg-amber-100/[0.08] px-2 py-0.5 text-xs">
                                <span className="shrink-0 text-amber-100/75">{ratingSource}:</span>
                                <span className="inline-flex shrink-0 items-center gap-0.5" aria-hidden>
                                  {Array.from({ length: 5 }).map((_, idx) => (
                                    <Star
                                      key={`${cardKey}-star-${idx}`}
                                      className={
                                        idx < filledStars
                                          ? 'h-2.5 w-2.5 fill-amber-300 text-amber-300'
                                          : 'h-2.5 w-2.5 text-amber-100/35'
                                      }
                                    />
                                  ))}
                                </span>
                                <span className="tabular-nums text-amber-200">{normalizedVote.toFixed(1)}/10</span>
                              </span>
                            </div>
                          )}

                          {synopsis && (
                            <div className="mt-2">
                              <p
                                className={[
                                  synopsisExpanded ? 'whitespace-normal break-words leading-relaxed' : 'line-clamp-1',
                                  'text-sm text-zinc-300',
                                ].join(' ')}
                              >
                                {synopsis}
                              </p>
                              {canExpandSynopsis && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setExpandedSynopsisIds((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(cardKey)) next.delete(cardKey)
                                      else next.add(cardKey)
                                      return next
                                    })
                                  }}
                                  className="mt-1 text-xs font-medium text-cyan-100/85 underline decoration-cyan-200/45 underline-offset-2 hover:text-cyan-100"
                                >
                                  {synopsisExpanded ? 'Show less' : 'Read more'}
                                </button>
                              )}
                            </div>
                          )}

                          {m.genre && m.genre.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {m.genre.slice(0, 3).map((g, idx) => (
                                <span
                                  key={`${m.id}-${g}-${idx}`}
                                  className="rounded-full border border-cyan-200/25 bg-cyan-100/[0.08] px-2 py-0.5 text-xs text-cyan-100/85"
                                >
                                  {g}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="mt-3">
                            <div className="flex items-center justify-between text-xs text-zinc-300">
                              <span>match score</span>
                              <span className="font-semibold text-cyan-100">{pct(m.match)}</span>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full border border-cyan-200/20 bg-cyan-100/[0.1]">
                              <div
                                className="bar-accent h-full rounded-full"
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
                    </div>
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

              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-300">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-400" aria-hidden />
                  Your profile
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" aria-hidden />
                  Selected movie
                </span>
              </div>

              <div className="mt-3 flex items-center justify-center">
                <InlineRadar
                  keys={TRAITS as unknown as string[]}
                  user={userOrdered}
                  movie={movieOrdered}
                  size={360}
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

  const userFill = 'rgba(56,189,248,0.18)'
  const userStroke = 'rgba(125,211,252,0.96)'
  const movieFill = 'rgba(37,99,235,0.2)'
  const movieStroke = 'rgba(37,99,235,0.95)'

  return (
    <svg width={size} height={size} role="img" aria-label="Trait radar chart" style={{ overflow: 'visible' }}>
      {[0.25, 0.5, 0.75, 1].map((p) => (
        <circle key={p} cx={cx} cy={cy} r={rMax * p} fill="none" stroke="rgba(255,255,255,.18)" />
      ))}

      {spokes.map((s) => (
        <line key={s.key} x1={cx} y1={cy} x2={s.x} y2={s.y} stroke="rgba(255,255,255,.14)" />
      ))}

      {pointsMovie && (
        <polygon points={pointsMovie} fill={movieFill} stroke={movieStroke} strokeWidth="2" />
      )}
      <polygon points={pointsUser} fill={userFill} stroke={userStroke} strokeWidth="2" />

      {spokes.map((s) => {
        const lx = cx + Math.cos(s.angle) * labelR
        const ly = cy + Math.sin(s.angle) * labelR

        const isLeft = lx < cx - 4
        const isRight = lx > cx + 4
        const isTop = !isLeft && !isRight && ly < cy
        const isBottom = !isLeft && !isRight && ly > cy

        const anchor: 'start' | 'end' | 'middle' = isLeft ? 'end' : isRight ? 'start' : 'middle'
        const baseline: 'middle' | 'hanging' | 'ideographic' = isTop
          ? 'ideographic'
          : isBottom
            ? 'hanging'
            : 'middle'

        return (
          <text
            key={s.key}
            x={lx}
            y={ly}
            textAnchor={anchor}
            dominantBaseline={baseline}
            fill="rgba(255,255,255,.78)"
            fontSize="11"
            style={{ textTransform: 'capitalize' }}
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
  v: Record<string, number>,
  r: number,
  cx: number,
  cy: number
) {
  return spokes
    .map((s) => {
      const n = clamp01(v[s.key])
      const x = cx + Math.cos(s.angle) * r * n
      const y = cy + Math.sin(s.angle) * r * n
      return `${x},${y}`
    })
    .join(' ')
}


