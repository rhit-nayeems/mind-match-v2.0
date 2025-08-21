// Robust poster component: normalizes TMDB paths and uses seeded fallback per title.
export function MoviePoster({
  posterUrl,
  title,
  className = "",
}: {
  posterUrl?: string | null;
  title: string;
  className?: string;
}) {
  const normalized = normalizePosterUrl(posterUrl);
  const fallback = seededFallback(title);

  return (
    <img
      src={normalized || fallback}
      alt={title}
      loading="lazy"
      className={`${className} object-cover rounded-md`}
      onError={(e) => {
        const img = e.currentTarget as HTMLImageElement;
        // prevent infinite loop if fallback also errors
        if (img.dataset.fbk === "1") return;
        img.src = fallback;
        img.dataset.fbk = "1";
      }}
      referrerPolicy="no-referrer"
    />
  );
}

// ---- helpers ----
const TMDB_BASE = "https://image.tmdb.org/t/p/w500";

function normalizePosterUrl(u?: string | null): string {
  if (!u) return "";
  const s = u.toString().trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/")) return TMDB_BASE + s; // TMDB relative path
  // Sometimes backends send "t/p/w500/..." without the leading slash
  if (s.startsWith("t/p/") || s.startsWith("w500/")) return TMDB_BASE + "/" + s.replace(/^\/?/, "");
  return s;
}

function seededFallback(title: string): string {
  // unique placeholder per movie so cards are different
  const seed = encodeURIComponent((title || "movie").toLowerCase());
  return `https://picsum.photos/seed/${seed}/300/450`;
}

export default MoviePoster;
