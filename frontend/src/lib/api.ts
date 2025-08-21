// frontend/src/lib/api.ts

type RecommendBody = {
  answers: number[];              // 9 numbers in 0..1
  session_id?: string;
};

function normalize(base: string) {
  return base.replace(/\/+$/, "");
}

function detectApiBase(): string {
  // 1) Prefer env if it's a real, reachable host (NOT "backend")
  const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  if (envBase && !/\/\/backend(?::|\/|$)/i.test(envBase)) {
    return normalize(envBase);
  }

  // 2) Otherwise talk to the backend published on the host
  const { protocol, hostname } = window.location;
  const proto = protocol || "http:";
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${proto}//localhost:8000`;
  }
  // e.g., hitting by LAN IP or custom host
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

export async function postRecommend(answers: number[], sessionId?: string) {
  const body: RecommendBody = { answers };
  if (sessionId) body.session_id = sessionId;

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
