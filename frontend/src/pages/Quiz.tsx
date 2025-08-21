// frontend/src/pages/Quiz.tsx
import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { QUESTIONS, Responses, answersToTraitVector } from "../data/questions";
import { postRecommend } from "../lib/api";

const RESP_KEY = "mm_responses";   // per-question autosave
const PAGE_KEY = "mm_page";        // last page index
const PAGE_SIZE_PER_GROUP = 2;     // 2 personality + 2 today per page

// 🚦 bump this whenever you change questions/flow so stale state is auto-cleared
const APP_STATE_VERSION = "2025-08-20-1";
const VERSION_KEY = "mm_version";

function ensureSessionId(): string {
  let sid = localStorage.getItem("mm_session");
  if (!sid) {
    // @ts-ignore
    sid = (crypto?.randomUUID?.() as string) || String(Date.now());
    localStorage.setItem("mm_session", sid);
  }
  return sid;
}

// Split questions by group, keeping original order
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

// Build pages: each page gets 2 personality + 2 today (in order)
// Falls back gracefully if counts aren't perfectly even.
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

  const [responses, setResponses] = useState<Responses>({});
  const [page, setPage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [missingIds, setMissingIds] = useState<Set<string>>(new Set());
  const topRef = useRef<HTMLDivElement>(null);

  // Build pages (2+2) deterministically
  const pages = useMemo(() => buildPages(QUESTIONS), []);
  const totalPages = pages.length;
  const currentQs = pages[page] ?? [];

  // Session + version guard + reset flag + restore
  useEffect(() => {
    ensureSessionId();

    // 1) Auto-clear saved quiz when app schema/flow version changes
    const storedVer = localStorage.getItem(VERSION_KEY);
    if (storedVer !== APP_STATE_VERSION) {
      try {
        localStorage.removeItem("mm_answers");
        localStorage.removeItem(RESP_KEY);
        localStorage.removeItem(PAGE_KEY);
        localStorage.setItem(VERSION_KEY, APP_STATE_VERSION);
      } catch {}
      setResponses({});
      setPage(0);
      setMissingIds(new Set());
      return; // fresh start for this load
    }

    // 2) Force-fresh start if navigated from Results "Take Quiz Again" or URL has ?fresh=1
    const search = new URLSearchParams(window.location.search);
    const reset =
      (loc?.state && loc.state.reset === true) ||
      search.get("fresh") === "1";

    if (reset) {
      try {
        localStorage.removeItem("mm_answers"); // vector used by Results
        localStorage.removeItem(RESP_KEY);     // per-question autosave
        localStorage.removeItem(PAGE_KEY);     // last page idx
        localStorage.setItem(VERSION_KEY, APP_STATE_VERSION);
      } catch {}
      setResponses({});
      setPage(0);
      setMissingIds(new Set());
      // strip the reset hint so back/forward doesn't keep wiping
      if (loc?.state?.reset || search.get("fresh") === "1") {
        const url = window.location.pathname; // remove query string
        window.history.replaceState({}, document.title, url);
      }
      return;
    }

    // 3) Restore saved state (filtered to current QUESTION ids)
    try {
      const raw = localStorage.getItem(RESP_KEY);
      const saved = raw ? (JSON.parse(raw) as Responses) : {};
      const validIds = new Set(QUESTIONS.map((q) => q.id));
      const filtered: Responses = {};
      for (const [k, v] of Object.entries(saved || {})) {
        if (validIds.has(k)) filtered[k] = v;
      }
      if (Object.keys(filtered).length) setResponses(filtered);

      const pRaw = localStorage.getItem(PAGE_KEY);
      const pSaved = pRaw ? parseInt(pRaw, 10) : 0;
      if (!Number.isNaN(pSaved) && pSaved >= 0 && pSaved < totalPages) {
        setPage(pSaved);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to top on page change + persist page index
  useEffect(() => {
    try { localStorage.setItem(PAGE_KEY, String(page)); } catch {}
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [page]);

  function choose(qid: string, cid: string) {
    setResponses((prev) => {
      const next = { ...prev, [qid]: cid };
      try { localStorage.setItem(RESP_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
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
    setPage((p) => Math.max(0, p - 1));
  }

  function onNext() {
    if (!pageComplete(page)) {
      setMissingIds(computeMissingOnPage(page));
      return;
    }
    setMissingIds(new Set());
    setPage((p) => Math.min(totalPages - 1, p + 1));
  }

  async function onSubmit() {
    if (!pageComplete(page)) {
      setMissingIds(computeMissingOnPage(page));
      return;
    }
    try {
      setSubmitting(true);
      const vector = answersToTraitVector(responses); // 9 numbers (0..1)
      try { localStorage.setItem("mm_answers", JSON.stringify(vector)); } catch {}

      const sid = localStorage.getItem("mm_session") || "";
      try { await postRecommend(vector, sid); } catch { /* Results will retry if needed */ }

      navigate("/results", { state: { answers: vector } });
    } finally {
      setSubmitting(false);
    }
  }

  const progress = ((page + 1) / totalPages) * 100; // bar only; no numbers

  const renderQ = (qid: string, text: string, choices: any[]) => {
    const isMissing = missingIds.has(qid);
    return (
      <div
        key={qid}
        className={[
          "rounded-2xl p-4 border transition-colors",
          "bg-slate-800/40 border-slate-700/60",
          isMissing ? "ring-2 ring-amber-400/70" : ""
        ].join(" ")}
      >
        <div className="mb-3 font-medium text-slate-100">{text}</div>
        <div className="flex flex-wrap gap-3">
          {choices.map((c: any) => {
            const checked = responses[qid] === c.id;
            const inputId = `${qid}__${c.id}`;
            return (
              <div key={c.id} className="inline-flex">
                {/* Native radio for keyboard + focus ring */}
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
                    "px-3 py-2 rounded-xl cursor-pointer border select-none outline-none",
                    checked
                      ? "bg-indigo-600 text-white border-indigo-500"
                      : "bg-slate-700/40 text-slate-200 border-slate-600/60 hover:bg-slate-700/60",
                    "focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-900"
                  ].join(" ")}
                >
                  {c.label}
                </label>
              </div>
            );
          })}
        </div>

        {isMissing && (
          <div className="mt-3 text-sm text-amber-300">
            Please select an option.
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-6"> {/* pb-24 for sticky footer space */}
      <div ref={topRef} />
      {/* Accessible progress bar (no numbers shown) */}
      <div
        role="progressbar"
        aria-label="Quiz progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        className="w-full h-3 rounded-full bg-slate-800 border border-slate-700 overflow-hidden mb-6"
      >
        <div
          className="h-full bg-gradient-to-r from-indigo-500 via-fuchsia-400 to-cyan-300 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <h1 className="text-2xl font-semibold text-slate-100 mb-2">
        MindMatch: Discover Movies That Match Your Mind
      </h1>
      <p className="text-slate-300 mb-6">
        Tell us about your personality and how you feel <em>today</em>.
      </p>

      <div className="space-y-4">
        {currentQs.map((q) => renderQ(q.id, q.text, q.choices))}
      </div>

      {/* Sticky footer controls for mobile comfort */}
      <div className="sticky bottom-0 left-0 right-0 mt-6">
        <div className="backdrop-blur supports-[backdrop-filter]:bg-slate-900/70 bg-slate-900/95 border-t border-slate-700/60 px-4 py-3 rounded-t-2xl">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              disabled={page === 0}
              className={`px-4 py-2 rounded-xl border ${
                page === 0
                  ? "bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed"
                  : "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
              }`}
            >
              ← Back
            </button>

            {page < totalPages - 1 ? (
              <button
                type="button"
                onClick={onNext}
                className="px-5 py-2 rounded-2xl font-medium bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className={`px-5 py-2 rounded-2xl font-medium ${
                  submitting
                    ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                }`}
              >
                {submitting ? "Working..." : "See My Matches"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
