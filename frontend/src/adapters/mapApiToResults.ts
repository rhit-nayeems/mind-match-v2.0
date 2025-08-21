// frontend/src/adapters/mapApiToResults.ts
// Normalizes your backend JSON to exactly what Results.tsx expects.
// If your backend already sends the same fields, this will just pass them through.

export type UserTraits = { [k: string]: number };

type ApiMovie = Record<string, any>;
type ApiResponse = {
  profile?: { summary?: string; traits?: Record<string, number> };
  recommendations?: ApiMovie[];
};

const TMDB_BASE = "https://image.tmdb.org/t/p/w500";

function normalizePoster(u?: any): string {
  const s = (u ?? "").toString().trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/")) return TMDB_BASE + s; // TMDB relative path
  // Sometimes backends send "t/p/w500/..." or "w500/..." without the leading slash
  if (s.startsWith("t/p/") || s.startsWith("w500/"))
    return TMDB_BASE + "/" + s.replace(/^\/?/, "");
  return s;
}

export function mapApiToResults(api: ApiResponse) {
  const userTraits = (api.profile?.traits ?? {}) as UserTraits;
  const profileSummary =
    api.profile?.summary ??
    "Tonight you’re feeling playful and comfort-seeking and uplifting.";

  const raw = Array.isArray(api.recommendations) ? api.recommendations : [];

  const recommendations = raw.map((m: ApiMovie, i: number) => {
    // tolerate many field names from different backends
    const rawPoster =
      m.posterUrl ??
      m.poster_url ??
      m.posterUrlSmall ??
      m.poster ??
      m.poster_path ??
      m.posterPath ??
      m.image ??
      m.imageUrl ??
      m.backdrop ??
      m.backdrop_path ??
      "";

    const match =
      typeof m.match === "number"
        ? m.match
        : typeof m.score === "number"
        ? m.score > 1
          ? m.score / 100
          : m.score
        : undefined;

    const traits = (m.traits ?? {}) as Record<string, number>;

    return {
      id: m.id ?? i,
      title: m.title ?? "Untitled",
      year: m.year ? Number(m.year) : undefined,
      posterUrl: normalizePoster(rawPoster),
      synopsis: m.synopsis ?? m.overview ?? "",
      match,
      traits,
      genre: (m.genre ?? m.genres ?? []).slice(0, 3),
      director: m.director ?? "—",
      rating: m.rating ?? "NR",
    };
  });

  return { userTraits, profileSummary, recommendations };
}

export default mapApiToResults;
