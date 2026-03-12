// frontend/src/lib/api.ts

export type RecommendContext = {
  personality_traits?: Record<string, number>;
  mood_traits?: Record<string, number>;
  confidence?: {
    overall?: number;
    personality?: number;
    mood?: number;
    per_trait?: Record<string, number>;
  };
  query_text?: string;
};

type RecommendBody = {
  answers: number[];
  session_id?: string;
  context?: RecommendContext;
};

const RECOMMEND_CACHE_TTL_MS = 5000;
const recommendRequestCache = new Map<string, { expiresAt: number; promise: Promise<any> }>();

function normalize(base: string) {
  return base.replace(/\/+$/, "");
}

function detectApiBase(): string {
  const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  if (envBase && !/\/\/backend(?::|\/|$)/i.test(envBase)) {
    return normalize(envBase);
  }

  const { protocol, hostname } = window.location;
  const proto = protocol || "http:";
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${proto}//localhost:8000`;
  }
  return `${proto}//${hostname}:8000`;
}

const API_BASE = detectApiBase();

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Bad JSON (${res.status}): ${text.slice(0, 300)}`);
  }
}

export async function postRecommend(answers: number[], sessionId?: string, context?: RecommendContext) {
  const body: RecommendBody = { answers };
  if (sessionId) body.session_id = sessionId;
  if (context) body.context = context;

  const cacheKey = JSON.stringify(body);
  const now = Date.now();
  const cached = recommendRequestCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = (async () => {
    const res = await fetch(`${API_BASE}/recommend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-ID": sessionId || "",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
    }
    return json(res);
  })();

  recommendRequestCache.set(cacheKey, {
    expiresAt: now + RECOMMEND_CACHE_TTL_MS,
    promise,
  });

  setTimeout(() => {
    const current = recommendRequestCache.get(cacheKey);
    if (current?.promise === promise && current.expiresAt <= Date.now()) {
      recommendRequestCache.delete(cacheKey);
    }
  }, RECOMMEND_CACHE_TTL_MS);

  promise.catch(() => {
    const current = recommendRequestCache.get(cacheKey);
    if (current?.promise === promise) {
      recommendRequestCache.delete(cacheKey);
    }
  });

  return promise;
}

export async function postEvent(payload: any, sessionId?: string) {
  const res = await fetch(`${API_BASE}/event`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-ID": sessionId || "",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }
  return json(res);
}

export async function getHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }
  return json(res);
}
