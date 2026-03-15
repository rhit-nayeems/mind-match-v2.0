// frontend/src/pages/Quiz.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import {
  DEFAULT_ADAPTIVE_PER_GROUP,
  DEFAULT_CORE_PER_GROUP,
  Question,
  Responses,
  answersToTraitContext,
  buildAdaptiveQuizQuestions,
  buildCoreQuizQuestions,
} from "../data/questions";

const PAGE_SIZE_PER_GROUP = 2;
const APP_STATE_VERSION = "2026-03-02-2";
const VERSION_KEY = "mm_version";
const RECENT_QIDS_KEY = "mm_recent_question_ids";
const RECENT_QIDS_MAX = 64;
const PENDING_RETAKE_KEY = "mm_pending_retake";
const RETAKE_AVOID_IDS_MAX = 24;

type PendingRetakeState = {
  round: number;
  avoid_movie_ids: string[];
};

function normalizeMovieIds(raw: unknown, limit = RETAKE_AVOID_IDS_MAX): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const id = String(item ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

function readPendingRetake(): PendingRetakeState | null {
  try {
    const raw = localStorage.getItem(PENDING_RETAKE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const round = Number(parsed?.round);
    const avoid_movie_ids = normalizeMovieIds(parsed?.avoid_movie_ids);
    if (!Number.isFinite(round) || round < 1 || !avoid_movie_ids.length) return null;
    return { round: Math.floor(round), avoid_movie_ids };
  } catch {
    return null;
  }
}

function ensureSessionId(): string {
  try {
    let sid = localStorage.getItem("mm_session");
    if (!sid) {
      // @ts-ignore
      sid = (crypto?.randomUUID?.() as string) || String(Date.now());
      localStorage.setItem("mm_session", sid);
    }
    return sid;
  } catch {
    return String(Date.now());
  }
}

function readRecentQuestionIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_QIDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, RECENT_QIDS_MAX);
  } catch {
    return [];
  }
}

function rememberQuestionIds(ids: string[]) {
  if (!ids.length) return;
  const clean = ids.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (!clean.length) return;

  const prev = readRecentQuestionIds();
  const merged = [...clean, ...prev.filter((id) => !clean.includes(id))].slice(0, RECENT_QIDS_MAX);
  try {
    localStorage.setItem(RECENT_QIDS_KEY, JSON.stringify(merged));
  } catch {}
}

function overlapCount(questions: Question[], recentIds: Set<string>): number {
  let overlap = 0;
  for (const q of questions) {
    if (recentIds.has(q.id)) overlap += 1;
  }
  return overlap;
}

function splitByGroup<T extends { choices: { group: string }[] }>(qs: T[]) {
  const personality: T[] = [];
  const today: T[] = [];
  for (const q of qs) {
    const g = q.choices[0]?.group;
    if (g === "today") today.push(q);
    else personality.push(q);
  }
  return { personality, today };
}

function buildPages<T extends { choices: { group: string }[] }>(qs: T[]) {
  const { personality, today } = splitByGroup(qs);
  const pages: T[][] = [];
  const steps = Math.max(
    Math.ceil(personality.length / PAGE_SIZE_PER_GROUP),
    Math.ceil(today.length / PAGE_SIZE_PER_GROUP)
  );

  for (let i = 0; i < steps; i++) {
    const sliceP = personality.slice(
      i * PAGE_SIZE_PER_GROUP,
      i * PAGE_SIZE_PER_GROUP + PAGE_SIZE_PER_GROUP
    );
    const sliceT = today.slice(
      i * PAGE_SIZE_PER_GROUP,
      i * PAGE_SIZE_PER_GROUP + PAGE_SIZE_PER_GROUP
    );
    pages.push([...sliceP, ...sliceT]);
  }
  return pages;
}

export default function Quiz() {
  const navigate = useNavigate();
  const loc = useLocation() as any;

  const [coreQuestions] = useState<Question[]>(() => {
    const recent = new Set(readRecentQuestionIds());
    const opts = { personalityCount: DEFAULT_CORE_PER_GROUP, todayCount: DEFAULT_CORE_PER_GROUP, excludeIds: recent };

    let best = buildCoreQuizQuestions(opts);
    let bestOverlap = overlapCount(best, recent);

    for (let i = 0; i < 6; i++) {
      const cand = buildCoreQuizQuestions(opts);
      const overlap = overlapCount(cand, recent);
      if (overlap < bestOverlap) {
        best = cand;
        bestOverlap = overlap;
      }
      if (bestOverlap === 0) break;
    }

    return best;
  });
  const [adaptiveQuestions, setAdaptiveQuestions] = useState<Question[]>([]);
  const [stage, setStage] = useState<"core" | "adaptive">("core");

  const [responses, setResponses] = useState<Responses>({});
  const [page, setPage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [missingIds, setMissingIds] = useState<Set<string>>(new Set());
  const topRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const [navDirection, setNavDirection] = useState<1 | -1>(1);
  const [showIntroOverlay, setShowIntroOverlay] = useState(true);

  const quizQuestions = useMemo(() => [...coreQuestions, ...adaptiveQuestions], [coreQuestions, adaptiveQuestions]);
  const pages = useMemo(() => buildPages(quizQuestions), [quizQuestions]);
  const totalPages = pages.length;
  const currentQs = pages[page] ?? [];
  const { personality: currentTasteQs, today: currentVibeQs } = useMemo(() => splitByGroup(currentQs), [currentQs]);

  const projectedTotalPages =
    stage === "core"
      ? totalPages + Math.ceil(DEFAULT_ADAPTIVE_PER_GROUP / PAGE_SIZE_PER_GROUP)
      : totalPages;

  useEffect(() => {
    ensureSessionId();

    const storedVer = localStorage.getItem(VERSION_KEY);
    if (storedVer !== APP_STATE_VERSION) {
      try {
        localStorage.removeItem("mm_answers");
        localStorage.removeItem("mm_context");
        localStorage.removeItem("mm_responses");
        localStorage.removeItem("mm_page");
        localStorage.removeItem(PENDING_RETAKE_KEY);
        localStorage.setItem(VERSION_KEY, APP_STATE_VERSION);
      } catch {}
      setResponses({});
      setPage(0);
      setMissingIds(new Set());
      setAdaptiveQuestions([]);
      setStage("core");
      return;
    }

    const search = new URLSearchParams(window.location.search);
    const reset = (loc?.state && loc.state.reset === true) || search.get("fresh") === "1";
    const isRetake = (loc?.state && loc.state.retake === true) || search.get("retake") === "1";

    if (reset) {
      try {
        localStorage.removeItem("mm_answers");
        localStorage.removeItem("mm_context");
        localStorage.removeItem("mm_responses");
        localStorage.removeItem("mm_page");
        if (!isRetake) {
          localStorage.removeItem(PENDING_RETAKE_KEY);
        }
        localStorage.setItem(VERSION_KEY, APP_STATE_VERSION);
      } catch {}
      setResponses({});
      setPage(0);
      setMissingIds(new Set());
      setAdaptiveQuestions([]);
      setStage("core");

      if (loc?.state?.reset || search.get("fresh") === "1") {
        const url = window.location.pathname;
        window.history.replaceState({}, document.title, url);
      }
      return;
    }

    // Always start fresh on quiz entry/refresh.
    try {
      localStorage.removeItem("mm_responses");
      localStorage.removeItem("mm_page");
    } catch {}
    setResponses({});
    setPage(0);
    setMissingIds(new Set());
    setAdaptiveQuestions([]);
    setStage("core");
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (shouldReduceMotion) {
      setShowIntroOverlay(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowIntroOverlay(false);
    }, 1520);

    return () => window.clearTimeout(timer);
  }, [shouldReduceMotion]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [page]);

  function choose(qid: string, cid: string) {
    setResponses((prev) => ({ ...prev, [qid]: cid }));

    if (missingIds.has(qid)) {
      const next = new Set(missingIds);
      next.delete(qid);
      setMissingIds(next);
    }
  }

  function pageComplete(idx: number) {
    return pages[idx]?.every((q) => !!responses[q.id]);
  }

  function computeMissingOnPage(idx: number) {
    const s = new Set<string>();
    for (const q of pages[idx] || []) {
      if (!responses[q.id]) s.add(q.id);
    }
    return s;
  }

  function onBack() {
    setMissingIds(new Set());
    setNavDirection(-1);
    setPage((p) => Math.max(0, p - 1));
  }

  function onNext() {
    if (!pageComplete(page)) {
      setMissingIds(computeMissingOnPage(page));
      return;
    }
    setMissingIds(new Set());
    setNavDirection(1);
    setPage((p) => Math.min(totalPages - 1, p + 1));
  }

  function startAdaptivePhase() {
    const recent = new Set(readRecentQuestionIds());

    const opts = {
      personalityCount: DEFAULT_ADAPTIVE_PER_GROUP,
      todayCount: DEFAULT_ADAPTIVE_PER_GROUP,
      excludeIds: recent,
    };

    let generated = buildAdaptiveQuizQuestions(responses, coreQuestions, opts);
    let bestOverlap = overlapCount(generated, recent);

    for (let i = 0; i < 6; i++) {
      const cand = buildAdaptiveQuizQuestions(responses, coreQuestions, opts);
      const overlap = overlapCount(cand, recent);
      if (overlap < bestOverlap) {
        generated = cand;
        bestOverlap = overlap;
      }
      if (bestOverlap === 0) break;
    }

    if (!generated.length) return false;

    const nextPages = buildPages([...coreQuestions, ...generated]).length;
    setAdaptiveQuestions(generated);
    setStage("adaptive");
    setMissingIds(new Set());
    setNavDirection(1);
    setPage((p) => Math.min(p + 1, Math.max(0, nextPages - 1)));
    return true;
  }

  async function onPrimaryAction() {
    if (!pageComplete(page)) {
      setMissingIds(computeMissingOnPage(page));
      return;
    }

    if (stage === "core") {
      if (startAdaptivePhase()) return;
    }

    try {
      setSubmitting(true);

      const traitContext = answersToTraitContext(responses, quizQuestions);
      const vector = traitContext.blendedArray;
      const pendingRetake = readPendingRetake();
      const requestContext: any = {
        personality_traits: traitContext.personality,
        mood_traits: traitContext.mood,
        confidence: {
          overall: traitContext.confidence.overall,
          personality: traitContext.confidence.personality,
          mood: traitContext.confidence.mood,
          per_trait: traitContext.confidence.per_trait,
        },
      };

      if (pendingRetake) {
        requestContext.retake_round = pendingRetake.round;
        requestContext.avoid_movie_ids = pendingRetake.avoid_movie_ids;
      }

      try {
        localStorage.setItem("mm_answers", JSON.stringify(vector));
        localStorage.setItem("mm_context", JSON.stringify(requestContext));
      } catch {}

      try {
        localStorage.removeItem(PENDING_RETAKE_KEY);
      } catch {}

      rememberQuestionIds(quizQuestions.map((q) => q.id));
      navigate("/results", { state: { answers: vector, context: requestContext } });
    } finally {
      setSubmitting(false);
    }
  }

  const progress = ((page + 1) / Math.max(1, projectedTotalPages)) * 100;
  const progressPct = Math.round(progress);

  const overlayTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.82, ease: [0.22, 1, 0.36, 1] as const };
  const overlayTextTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.48, ease: [0.22, 1, 0.36, 1] as const };
  const pageEnter = shouldReduceMotion ? 0 : 18;
  const pageExit = shouldReduceMotion ? 0 : 12;
  const pageTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };

  const questionListVariants = shouldReduceMotion
    ? {
        hidden: {},
        visible: { transition: { staggerChildren: 0 } },
      }
    : {
        hidden: {},
        visible: {
          transition: { staggerChildren: 0.06 },
        },
      };

  const questionCardVariants = shouldReduceMotion
    ? {
        hidden: { opacity: 1, y: 0 },
        visible: { opacity: 1, y: 0 },
      }
    : {
        hidden: { opacity: 0, y: 14 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
        },
      };

  const renderQ = (qid: string, text: string, helper: string, choices: any[]) => {
    const isMissing = missingIds.has(qid);
    return (
      <motion.div
        key={qid}
        variants={questionCardVariants}
        className={[
          "rounded-2xl border p-5 transition-colors bg-cyan-100/[0.03] border-cyan-200/20",
          isMissing ? "ring-2 ring-rose-300/70" : "",
        ].join(" ")}
      >
        <div className="text-base font-medium text-zinc-100">{text}</div>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{helper}</p>
        <div className="mt-4 grid gap-2.5 sm:flex sm:flex-wrap">
          {choices.map((c: any) => {
            const checked = responses[qid] === c.id;
            const inputId = `${qid}__${c.id}`;
            return (
              <div key={c.id} className="w-full sm:inline-flex sm:w-auto">
                <input
                  id={inputId}
                  className="peer sr-only"
                  type="radio"
                  name={qid}
                  value={c.id}
                  checked={!!checked}
                  onChange={() => choose(qid, c.id)}
                />
                <label
                  htmlFor={inputId}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      choose(qid, c.id);
                    }
                  }}
                  className={[
                    "w-full cursor-pointer select-none rounded-xl border px-3 py-2 text-left outline-none sm:w-auto",
                    checked
                      ? "border-cyan-100/70 bg-cyan-100/90 text-zinc-900 shadow-[0_0_0_1px_rgba(103,232,249,.5)]"
                      : "border-cyan-200/20 bg-black/35 text-zinc-200 hover:bg-cyan-200/[0.12]",
                    "focus-visible:ring-2 focus-visible:ring-cyan-200/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-200/80 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black",
                  ].join(" ")}
                >
                  {c.label}
                </label>
              </div>
            );
          })}
        </div>

        {isMissing && <div className="mt-3 text-sm text-zinc-200">Please select an option.</div>}
      </motion.div>
    );
  };

  return (
    <>
      <AnimatePresence>
        {showIntroOverlay && (
          <motion.div
            className="fixed inset-0 z-[60] overflow-hidden bg-slate-950/44 px-6"
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: shouldReduceMotion ? 0 : 1, y: shouldReduceMotion ? 0 : "-100%", transition: overlayTransition }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_46%)]" />
            <div className="relative flex min-h-screen items-center justify-center">
              <motion.div
                className="mx-auto w-full max-w-xl rounded-[28px] border border-white/10 bg-slate-950/78 px-6 py-8 text-center shadow-[0_24px_80px_rgba(2,6,23,0.45)] sm:px-10 sm:py-10"
                initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0, transition: overlayTextTransition }}
                exit={{ opacity: shouldReduceMotion ? 0 : 0, y: shouldReduceMotion ? 0 : -10, transition: overlayTextTransition }}
              >
                <h1 className="headline text-4xl leading-tight text-zinc-100 md:text-5xl">Let's find your movie.</h1>
                <p className="mt-4 text-base leading-relaxed text-zinc-300 md:text-lg">
                  A few quick questions will help us understand your taste and what feels right tonight.
                </p>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-4xl px-2 pb-24 pt-4 md:px-4">
        <div className="surface p-5 md:p-7">
          <div ref={topRef} />

          <div>
            <div className="mb-5 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
              <span className="outline-chip">adaptive quiz</span>
              <span className="outline-chip">
                {stage === "core" ? "your taste" : "a few follow-up questions"}
              </span>
            </div>

            <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-zinc-500">
              <span>Progress</span>
              <span>{progressPct}%</span>
            </div>

            <div
              role="progressbar"
              aria-label="Quiz progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPct}
              className="mb-8 h-2.5 w-full overflow-hidden rounded-full border border-cyan-200/25 bg-cyan-100/[0.08]"
            >
              <div className="bar-accent h-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="relative overflow-hidden">
            <AnimatePresence mode="wait" initial={false} custom={navDirection}>
              <motion.div
                key={`${stage}-${page}`}
                custom={navDirection}
                initial={{ opacity: shouldReduceMotion ? 1 : 0, x: shouldReduceMotion ? 0 : navDirection * pageEnter }}
                animate={{ opacity: 1, x: 0, transition: pageTransition }}
                exit={{ opacity: shouldReduceMotion ? 1 : 0, x: shouldReduceMotion ? 0 : navDirection > 0 ? -pageExit : pageExit, transition: pageTransition }}
              >
                <motion.div
                  className="space-y-6"
                  initial="hidden"
                  animate="visible"
                  variants={questionListVariants}
                >
                  {currentTasteQs.length > 0 && (
                    <section className="space-y-4">
                      <div>
                        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100/85">Your Movie Taste</h2>
                        <p className="mt-1 text-xs text-zinc-500">What you usually enjoy.</p>
                      </div>
                      <div className="space-y-4">
                        {currentTasteQs.map((q) => renderQ(q.id, q.text, q.helper, q.choices))}
                      </div>
                    </section>
                  )}

                  {currentVibeQs.length > 0 && (
                    <section className="space-y-4">
                      <div>
                        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100/85">How You Feel Right Now</h2>
                        <p className="mt-1 text-xs text-zinc-500">What fits this moment.</p>
                      </div>
                      <div className="space-y-4">
                        {currentVibeQs.map((q) => renderQ(q.id, q.text, q.helper, q.choices))}
                      </div>
                    </section>
                  )}
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="sticky bottom-0 left-0 right-0 mt-6">
            <div className="quiz-nav-tray px-4 py-3">
              <div className="mx-auto flex max-w-4xl items-center justify-between">
                <button
                  type="button"
                  onClick={onBack}
                  disabled={page === 0}
                  className={`rounded-xl border px-4 py-2 ${
                    page === 0
                      ? "cursor-not-allowed border-white/10 bg-white/[0.03] text-zinc-600"
                      : "border-cyan-200/25 bg-cyan-100/[0.08] text-zinc-100 hover:bg-cyan-100/[0.16]"
                  }`}
                >
                  &larr; Back
                </button>

                {page < totalPages - 1 ? (
                  <button type="button" onClick={onNext} className="btn-neo px-5 py-2">
                    Next &rarr;
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onPrimaryAction}
                    disabled={submitting}
                    className={`rounded-2xl px-5 py-2 font-medium ${
                      submitting
                        ? "cursor-not-allowed border border-white/10 bg-white/[0.05] text-zinc-500"
                        : "btn-neo"
                    }`}
                  >
                    {stage === "core" ? "Keep Going" : submitting ? "Working..." : "See My Matches"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
