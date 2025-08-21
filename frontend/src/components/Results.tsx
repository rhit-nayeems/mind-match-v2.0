// frontend/src/pages/Results.tsx
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadarChart } from "@/components/RadarChart";
import { MoviePoster } from "@/components/MoviePoster";
import { RotateCcw, Star, Calendar, User as UserIcon, Film } from "lucide-react";
import type { UserTraits } from "../adapters/mapApiToResults";

// ---- Types the adapter already returns ----
interface Movie {
  id?: number | string;
  title: string;
  year?: number;
  posterUrl?: string;
  synopsis?: string;
  traits?: Record<string, number>;
  match?: number;                 // 0..1 (adapter also normalizes 0..100)
  genre?: string[];               // top 1–3
  director?: string;
  rating?: string;                // G / PG / PG‑13 / R / NR
}

type ResultsProps = {
  userTraits: UserTraits;
  recommendations: Movie[];
  profileSummary: string;
  onRestart: () => void;
};

// Pretty labels & stable trait order for radar
const TRAIT_ORDER = [
  "darkness",
  "energy",
  "mood",
  "depth",
  "optimism",
  "novelty",
  "comfort",
  "intensity",
  "humor",
];

const pretty = (k: string) =>
  k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

const pct = (v: number | undefined) => {
  if (v === undefined || v === null) return "—";
  const n = v > 1 ? v : v * 100;
  return `${Math.round(n)}%`;
};

export default function Results({
  userTraits,
  recommendations,
  profileSummary,
  onRestart,
}: ResultsProps) {
  // Select first movie by default
  const [selected, setSelected] = useState<Movie | null>(
    recommendations?.[0] ?? null
  );

  useEffect(() => {
    // Confetti on mount (subtle)
    const t = setTimeout(() => {
      confetti({
        particleCount: 80,
        spread: 65,
        origin: { y: 0.65 },
        colors: ["#a78bfa", "#8b5cf6", "#22d3ee", "#60a5fa"],
        scalar: 0.8,
        ticks: 180,
      });
    }, 200);
    return () => clearTimeout(t);
  }, []);

  // Build radar vectors in the desired order (missing traits -> 0)
  const orderedUser = useMemo(
    () =>
      Object.fromEntries(
        TRAIT_ORDER.map((k) => [k, clamp01((userTraits as any)?.[k] ?? 0)])
      ),
    [userTraits]
  );

  const orderedMovie = useMemo(() => {
    if (!selected?.traits) return undefined;
    return Object.fromEntries(
      TRAIT_ORDER.map((k) => [k, clamp01((selected.traits as any)?.[k] ?? 0)])
    );
  }, [selected]);

  return (
    <div className="min-h-screen text-slate-100 bg-[radial-gradient(1200px_600px_at_10%_-10%,#16182a,#0b1020)]">
      <div className="max-w-7xl mx-auto px-5 pb-16 pt-10">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Your Personality Profile
          </h1>
          <p className="mt-4 max-w-3xl mx-auto text-slate-300 leading-relaxed">
            {profileSummary}
          </p>

          <div className="mt-6">
            <Button
              onClick={onRestart}
              className="rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700"
              variant="secondary"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Take Quiz Again
            </Button>
          </div>
        </div>

        {/* Main content: left = matches list, right = radar compare */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Movie Matches */}
          <section className="lg:col-span-7">
            <h2 className="text-lg font-semibold mb-4">Your Movie Matches</h2>

            <div className="grid sm:grid-cols-2 gap-6">
              {recommendations.map((m, idx) => {
                const isActive = selected?.title === m.title && selected?.year === m.year;
                const match = m.match ?? 0;

                return (
                  <motion.button
                    key={`${m.id ?? idx}-${m.title}`}
                    onClick={() => setSelected(m)}
                    whileHover={{ y: -2 }}
                    className={[
                      "text-left rounded-2xl p-4 border transition-all",
                      "bg-[#12162a]/80 hover:bg-[#151a34]",
                      isActive
                        ? "border-violet-500 shadow-[0_0_0_3px_rgba(139,92,246,.15)]"
                        : "border-slate-700",
                    ].join(" ")}
                  >
                    <div className="flex gap-4">
                      <div className="shrink-0 w-24">
                        <MoviePoster
                          src={m.posterUrl}
                          alt={m.title}
                          className="rounded-xl h-36 w-24 object-cover bg-slate-900"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="text-base md:text-lg font-semibold line-clamp-1">
                          {m.title}
                        </h3>

                        {/* meta row */}
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                          {m.year && (
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {m.year}
                            </span>
                          )}
                          {m.rating && (
                            <Badge
                              variant="secondary"
                              className="bg-slate-800 border border-slate-700"
                            >
                              {m.rating}
                            </Badge>
                          )}
                          {m.director && (
                            <span className="inline-flex items-center gap-1">
                              <UserIcon className="h-3.5 w-3.5" />
                              {m.director}
                            </span>
                          )}
                        </div>

                        {/* synopsis */}
                        {m.synopsis && (
                          <p className="mt-2 text-sm text-slate-300 line-clamp-2">
                            {m.synopsis}
                          </p>
                        )}

                        {/* genres */}
                        {m.genre && m.genre.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {m.genre.slice(0, 3).map((g, i) => (
                              <Badge
                                key={i}
                                variant="secondary"
                                className="bg-[#1a2040] border border-[#2b3360] text-slate-200"
                              >
                                {g}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Match bar */}
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Match Score</span>
                            <span className="font-semibold">{pct(match)}</span>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-cyan-300"
                              style={{
                                width: `${Math.min(
                                  100,
                                  match > 1 ? match : match * 100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </section>

          {/* Right: Radar comparison */}
          <aside className="lg:col-span-5">
            <h2 className="text-lg font-semibold mb-4">Personality Comparison</h2>

            <div className="rounded-2xl border border-slate-700 bg-[#12162a]/80 p-5">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm text-slate-300">Selected</div>
                  <div className="font-semibold truncate flex items-center gap-2">
                    <Film className="h-4 w-4 text-violet-300" />
                    <span className="truncate">
                      {selected?.title ?? "—"}
                    </span>
                  </div>
                </div>
                <div className="text-violet-300 flex items-center gap-1 text-sm">
                  <Star className="h-4 w-4" />
                  {selected?.match !== undefined ? pct(selected.match) : "—"} Match
                </div>
              </div>

              <div className="mt-4 flex items-center justify-center">
                <RadarChart
                  keys={TRAIT_ORDER}
                  user={orderedUser}
                  movie={orderedMovie}
                  title=""
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
  );
}

// ---- helpers ----
function clamp01(v: any) {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}
