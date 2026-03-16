// frontend/src/pages/Results.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { postEvent, postRecommend } from '../lib/api'
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
    fitScore?: number
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

const withoutPeriods = (text: string) => text.replace(/\./g, '')

const TRAIT_REASON_LABELS: Record<TraitKey, string> = {
  darkness: 'darker stories',
  energy: 'more momentum',
  mood: 'strong atmosphere',
  depth: 'deeper themes',
  optimism: 'a warmer tone',
  novelty: 'something a little less familiar',
  comfort: 'something easy to settle into',
  intensity: 'more emotional weight',
  humor: 'a bit of wit',
}

function joinPhrases(parts: string[]) {
  if (parts.length <= 1) return parts[0] ?? ''
  if (parts.length == 2) return `${parts[0]} and ${parts[1]}`
  return `${parts[0]}, ${parts[1]}, and ${parts[2]}`
}

function buildRecommendationReason(
  userTraits: Record<TraitKey, number>,
  movieTraits?: Record<TraitKey, number> | null
) {
  if (!movieTraits) return ''

  const ranked = TRAITS.map((key) => ({
    key,
    score: Math.min(clamp01(userTraits[key] ?? 0.5), clamp01(movieTraits[key] ?? 0.5)) - 0.5,
  }))
    .filter((item) => item.score >= 0.08)
    .sort((a, b) => b.score - a.score)

  const top = (ranked.length ? ranked : TRAITS.map((key) => ({
    key,
    score: Math.min(clamp01(userTraits[key] ?? 0.5), clamp01(movieTraits[key] ?? 0.5)),
  })).sort((a, b) => b.score - a.score)).slice(0, 3)

  const phrases = top.map((item) => TRAIT_REASON_LABELS[item.key])
  if (!phrases.length) return ''

  return `Recommended because it lines up with your preference for ${joinPhrases(phrases)}`
}

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

const RESULT_HISTORY_KEY = 'mm_result_history_ids'
const PENDING_RETAKE_KEY = 'mm_pending_retake'
const RESULT_HISTORY_MAX = 24

function normalizeMovieIds(raw: unknown, limit = RESULT_HISTORY_MAX): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    const id = String(item ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= limit) break
  }
  return out
}

function readStoredMovieIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    return normalizeMovieIds(JSON.parse(raw))
  } catch {
    return []
  }
}

function writeStoredMovieIds(key: string, ids: string[]) {
  try {
    if (ids.length) localStorage.setItem(key, JSON.stringify(ids))
    else localStorage.removeItem(key)
  } catch {}
}

function mergeMovieIds(...lists: string[][]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const item of list) {
      const id = String(item ?? '').trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push(id)
      if (out.length >= RESULT_HISTORY_MAX) return out
    }
  }
  return out
}

export default function Results() {
  const loc = useLocation() as any
  const nav = useNavigate()

  const [data, setData] = useState<ResultsData | null>(null)
  const [isCompactViewport, setIsCompactViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 480 : false
  )
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [expandedSynopsisIds, setExpandedSynopsisIds] = useState<Set<string>>(new Set())
  const clickedIdsRef = useRef<Set<string>>(new Set())
  const isLoading = !data

  function handleRetake() {
    const currentIds = normalizeMovieIds((data?.recommendations ?? []).map((movie) => movie.id))
    const historyIds = readStoredMovieIds(RESULT_HISTORY_KEY)
    const savedContext = readSavedContext()
    const parsedRound = Number(savedContext?.retake_round)
    const nextRound = Number.isFinite(parsedRound) && parsedRound > 0 ? Math.floor(parsedRound) + 1 : 1
    const avoidMovieIds = mergeMovieIds(currentIds, historyIds)

    try {
      if (avoidMovieIds.length) {
        localStorage.setItem(
          PENDING_RETAKE_KEY,
          JSON.stringify({ round: nextRound, avoid_movie_ids: avoidMovieIds })
        )
      } else {
        localStorage.removeItem(PENDING_RETAKE_KEY)
      }
      localStorage.removeItem('mm_answers')
      localStorage.removeItem('mm_context')
      localStorage.removeItem('mm_responses')
      localStorage.removeItem('mm_page')
    } catch {}
    nav('/quiz?fresh=1&retake=1', { replace: true, state: { reset: true, retake: true } })
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    const media = window.matchMedia('(max-width: 479px)')
    const syncViewport = () => setIsCompactViewport(media.matches)
    syncViewport()

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', syncViewport)
      return () => media.removeEventListener('change', syncViewport)
    }

    media.addListener(syncViewport)
    return () => media.removeListener(syncViewport)
  }, [])

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
        const resultData = res as ResultsData
        const resultIds = normalizeMovieIds((resultData.recommendations ?? []).map((movie) => movie.id))
        const parsedRetakeRound = Number(context?.retake_round)
        const priorHistory =
          Number.isFinite(parsedRetakeRound) && parsedRetakeRound > 0 ? readStoredMovieIds(RESULT_HISTORY_KEY) : []
        writeStoredMovieIds(RESULT_HISTORY_KEY, mergeMovieIds(resultIds, priorHistory))
        try {
          localStorage.removeItem(PENDING_RETAKE_KEY)
        } catch {}
        setData(resultData)
        setSelectedIdx(0)
        setExpandedSynopsisIds(new Set())
        clickedIdsRef.current = new Set()

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
  const recs = data?.recommendations ?? []
  const sortedRecs = useMemo(
    () =>
      recs
        .map((movie, index) => ({ movie, index, matchValue: normalizeTrait(movie.match, 0) }))
        .sort((a, b) => {
          if (b.matchValue !== a.matchValue) return b.matchValue - a.matchValue
          return a.index - b.index
        })
        .map(({ movie }) => movie),
    [recs]
  )
  const selected = sortedRecs[selectedIdx]
  const movieOrdered = useMemo(() => {
    const src = selected?.traits ?? {}
    const out: Record<TraitKey, number> = {} as Record<TraitKey, number>
    TRAITS.forEach((k) => {
      out[k] = normalizeTrait((src as any)[k], 0.5)
    })
    return out
  }, [selected?.traits])
  const selectedTraits = useMemo(() => {
    const src = selected?.traits
    if (!src || !Object.keys(src).length) return null
    const out: Record<TraitKey, number> = {} as Record<TraitKey, number>
    TRAITS.forEach((k) => {
      out[k] = normalizeTrait((src as any)[k], 0.5)
    })
    return out
  }, [selected?.traits])
  const recommendationReason = useMemo(
    () => buildRecommendationReason(userOrdered, selectedTraits),
    [userOrdered, selectedTraits]
  )

  function buildEventFeatures(movie: ResultsData['recommendations'][number]) {
    return {
      user_traits: data?.profile?.traits ?? {},
      movie_traits: movie?.traits ?? {},
    }
  }

  async function sendFeedback(type: 'click', movie: ResultsData['recommendations'][number]) {
    await postEvent(
      {
        type,
        movie_id: String(movie.id),
        features: buildEventFeatures(movie),
      },
      localStorage.getItem('mm_session') || ''
    )
  }

  function handleSelectMovie(index: number) {
    setSelectedIdx(index)
    const movie = sortedRecs[index]
    if (!movie) return

    const movieId = String(movie.id)
    if (clickedIdsRef.current.has(movieId)) return
    clickedIdsRef.current.add(movieId)

    void sendFeedback('click', movie).catch((err) => {
      clickedIdsRef.current.delete(movieId)
      console.error('Failed to log click event', err)
    })
  }

  return (
    <div className="results-page py-4 md:py-6">
      <section className="surface results-shell p-5 md:p-8">
        <header className="results-hero text-center">
          <span className="outline-chip">your movie profile</span>
          <h1 className="headline mt-4 text-3xl text-zinc-100 md:text-4xl">Your Movie Matches</h1>
          <p className="mx-auto mt-3 max-w-3xl text-sm leading-relaxed text-zinc-300 md:text-base">
            {data?.profile?.summary ?? 'Computing your profile summary...'}
          </p>
          <div className="mt-5">
            <button onClick={handleRetake} className="btn-ghost results-retake-btn">
              Retake Quiz
            </button>
          </div>
        </header>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="lg:col-span-7">
            <h2 className="headline results-section-title mb-4 text-lg text-zinc-50">Recommended Movies</h2>

            {isLoading ? (
              <div className="grid gap-5 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="surface-soft results-loading-card p-4">
                    <div className="skeleton mb-3 h-36 w-24" />
                    <div className="skeleton mb-2 h-4 w-40" />
                    <div className="skeleton mb-2 h-3 w-52" />
                    <div className="skeleton h-3 w-44" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                {sortedRecs.map((m, i) => {
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
                      onClick={() => handleSelectMovie(i)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleSelectMovie(i)
                        }
                      }}
                      className={[
                        'result-card group relative w-full overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200',
                        active ? 'result-card-active' : '',
                      ].join(' ')}
                    >
                      <span className="result-rank-badge absolute left-3 top-3 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold transition-colors duration-200">
                        {i + 1}
                      </span>

                      <div className="flex gap-4 pt-2">
                        <div className="w-24 shrink-0 pt-5">
                          <MoviePoster
                            posterUrl={m.posterUrl || undefined}
                            title={m.title}
                            className="result-poster h-36 w-24 rounded-xl bg-black/40 transition-transform duration-300 group-hover:scale-[1.03]"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-1 text-base font-semibold text-zinc-50 md:text-lg">{m.title}</h3>

                          <div className="result-meta mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-300/70">
                            {m.year && <span>{m.year}</span>}
                            {m.director && <span className="min-w-0 truncate">{m.director}</span>}
                          </div>

                          {normalizedVote != null && (
                            <div className="mt-1 max-w-full">
                              <span className="result-rating-chip inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md px-2 py-0.5 text-xs">
                                <span className="shrink-0 text-amber-100/80">{ratingSource}:</span>
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
                                  'result-synopsis text-sm text-zinc-100/88',
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
                                  className="result-inline-link mt-1 text-xs font-medium underline decoration-cyan-200/45 underline-offset-2 hover:text-cyan-100"
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
                                  className="result-genre-chip rounded-full px-2 py-0.5 text-xs text-cyan-50/90"
                                >
                                  {g}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="mt-3">
                            <div className="flex items-center justify-between text-xs text-zinc-200/85">
                              <span>match</span>
                              <span className="font-semibold text-cyan-50">{pct(m.fitScore ?? m.match)}</span>
                            </div>
                            <div className="result-match-track mt-1 h-2 overflow-hidden rounded-full border">
                              <div
                                className="bar-accent h-full rounded-full"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    ((m.fitScore ?? m.match) ?? 0) > 1 ? ((m.fitScore ?? m.match) as number) : (((m.fitScore ?? m.match) ?? 0) * 100)
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
            <h2 className="headline results-section-title mb-4 text-lg text-zinc-50">Your Profile vs This Movie</h2>
            <div className="surface-soft results-compare-card p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="results-selected-label text-xs uppercase tracking-[0.14em] text-zinc-500">selected</div>
                  <div className="truncate font-semibold text-zinc-50">{selected?.title ?? '-'}</div>
                </div>
                <div className="text-sm text-zinc-200/90">{(selected?.fitScore ?? selected?.match) != null ? pct(selected?.fitScore ?? selected?.match) : '-'} match</div>
              </div>

              <div className="results-legend mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-200/85">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" aria-hidden />
                  Your profile
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" aria-hidden />
                  Selected movie
                </span>
              </div>

              {recommendationReason && (
                <div className="results-reason-card mt-4 rounded-xl p-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">Why this was recommended</div>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-200/90">{recommendationReason}</p>
                </div>
              )}

              <div className="results-radar-wrap mt-4 flex items-center justify-center">
                <InlineRadar
                  keys={TRAITS as unknown as string[]}
                  user={userOrdered}
                  movie={movieOrdered}
                  size={isCompactViewport ? 360 : 440}
                />
              </div>

              <p className="results-helper-copy mt-3 text-center text-xs text-zinc-400">
                Select a movie to see how it lines up with your profile
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
  const compact = size <= 380
  const fontPx = compact ? 10.5 : 11.5
  const charPx = compact ? 6.7 : 7.1
  const edgePad = compact ? 12 : 14
  const labelGap = compact ? 10 : 12

  const maxLabelWidth = Math.max(...keys.map((k) => k.length * charPx))
  const half = size / 2
  const sideReserve = maxLabelWidth + edgePad
  const topBottomReserve = fontPx + edgePad

  const rMax = Math.max(0, Math.min(half - sideReserve - labelGap, half - topBottomReserve - labelGap))

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

  const ringStroke = 'rgba(125,211,252,0.16)'
  const spokeStroke = 'rgba(165,243,252,0.11)'
  const userFill = 'rgba(34,211,238,0.16)'
  const userStroke = 'rgba(103,232,249,0.96)'
  const movieFill = 'rgba(251,191,36,0.14)'
  const movieStroke = 'rgba(251,191,36,0.94)'

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Trait radar chart"
      style={{ display: 'block', margin: '0 auto', height: 'auto', overflow: 'visible' }}
    >
      {[0.25, 0.5, 0.75, 1].map((p) => (
        <circle key={p} cx={cx} cy={cy} r={rMax * p} fill="none" stroke={ringStroke} />
      ))}

      {spokes.map((s) => (
        <line key={s.key} x1={cx} y1={cy} x2={s.x} y2={s.y} stroke={spokeStroke} />
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
            fill="rgba(255,255,255,.82)"
            fontSize={fontPx}
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




