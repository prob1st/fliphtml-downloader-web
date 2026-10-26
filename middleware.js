// Edge Middleware — application-layer (L7) DDoS / abuse protection for /api/*.
//
// Vercel's network already absorbs volumetric (L3/L4) floods. This layer runs
// at the edge, BEFORE the serverless functions, and caps how hard a single IP
// can drive the expensive endpoints:
//   - /api/info  fetches + WASM-decodes a book config (heavy-ish)
//   - /api/page  proxies page images            (bandwidth)
//
// Rate limiting uses a per-isolate in-memory token bucket. That is a best-
// effort first line (each edge isolate has its own counters). If an Upstash
// Redis / Vercel KV store is connected (REST env vars present), limits become
// GLOBAL automatically — no code change needed. See README.

export const config = { matcher: "/api/:path*" };

// Requests allowed per IP. `capacity` = burst size, refill spreads over a
// minute. Page limit must stay generous: downloading a 500-page book means
// ~500 /api/page calls in a couple of minutes.
const LIMITS = {
  info: { capacity: 20, perMinute: 20 },
  page: { capacity: 400, perMinute: 400 },
  other: { capacity: 60, perMinute: 60 },
  all: { capacity: 500, perMinute: 500 },
};

const ENV = typeof process !== "undefined" && process.env ? process.env : {};
const REST_URL = (ENV.UPSTASH_REDIS_REST_URL || ENV.KV_REST_API_URL || "").replace(/\/$/, "");
const REST_TOKEN = ENV.UPSTASH_REDIS_REST_TOKEN || ENV.KV_REST_API_TOKEN || "";

// ---------------------------------------------------------------------------
// In-memory token bucket (per edge isolate)
// ---------------------------------------------------------------------------
const buckets = new Map();

function prune(now) {
  if (buckets.size < 10000) return;
  for (const [k, b] of buckets) if (now - b.last > 600000) buckets.delete(k);
  if (buckets.size > 20000) buckets.clear(); // pathological case: fail open
}

function tokenBucket(key, { capacity, perMinute }, now) {
  const refillPerMs = perMinute / 60000;
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: capacity, last: now };
    buckets.set(key, b);
  }
  b.tokens = Math.min(capacity, b.tokens + (now - b.last) * refillPerMs);
  b.last = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true, limit: capacity, remaining: Math.floor(b.tokens), retryAfter: 0 };
  }
  const waitSec = Math.max(1, Math.ceil((1 - b.tokens) / refillPerMs / 1000));
  return { ok: false, limit: capacity, remaining: 0, retryAfter: waitSec };
}

// ---------------------------------------------------------------------------
// Optional global limiter via Upstash Redis REST (fixed window)
// ---------------------------------------------------------------------------
async function upstashLimit(key, limitPerMinute) {
  if (!REST_URL || !REST_TOKEN) return null;
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const windowId = Math.floor(nowSec / 60);
    const k = "fh:rl:" + key + ":" + windowId;
    const r = await fetch(REST_URL + "/pipeline", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + REST_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", k],
        ["EXPIRE", k, 60, "NX"],
      ]),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const count = data && data[0] && data[0].result;
    if (typeof count !== "number") return null;
    return {
      ok: count <= limitPerMinute,
      limit: limitPerMinute,
      remaining: Math.max(0, limitPerMinute - count),
      retryAfter: 60 - (nowSec % 60),
    };
  } catch {
    return null; // fail open to the in-memory limiter
  }
}

async function rateLimit(key, limit) {
  const global = await upstashLimit(key, limit.perMinute);
  if (global) return global;
  return tokenBucket(key, limit, Date.now());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function jsonError(status, message, extraHeaders = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function clientIp(request) {
  const h = request.headers;
  const raw =
    h.get("x-vercel-forwarded-for") ||
    h.get("x-real-ip") ||
    h.get("x-forwarded-for") ||
    "unknown";
  return raw.split(",")[0].trim() || "unknown";
}

// ---------------------------------------------------------------------------
// Middleware entry
// ---------------------------------------------------------------------------
export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/api/")) return; // let everything else through

  // 1) Only read methods on the API.
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonError(405, "Method not allowed", { Allow: "GET, HEAD" });
  }

  // 2) Stop other websites from hot-wiring this API from browsers.
  //    (Non-browser clients can spoof headers, so this is a casual-abuse
  //    barrier; the rate limits below are the real cap.)
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== url.host)
        return jsonError(403, "Cross-origin API access is not allowed");
    } catch {
      return jsonError(403, "Bad origin");
    }
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return jsonError(403, "Cross-site API access is not allowed");
  }

  // 3) Per-IP rate limits (route bucket + overall bucket).
  prune(Date.now());
  const ip = clientIp(request);
  const route = path.startsWith("/api/info")
    ? "info"
    : path.startsWith("/api/page")
      ? "page"
      : "other";

  for (const [name, limit] of [
    [route, LIMITS[route]],
    ["all", LIMITS.all],
  ]) {
    const res = await rateLimit(`${name}:${ip}`, limit);
    if (!res.ok) {
      return jsonError(
        429,
        "Çok fazla istek gönderdin. Lütfen biraz bekleyip tekrar dene.",
        {
          "Retry-After": String(res.retryAfter),
          "X-RateLimit-Limit": String(res.limit),
          "X-RateLimit-Remaining": String(res.remaining),
          "X-RateLimit-Bucket": name,
        }
      );
    }
  }

  return; // continue to the function / CDN cache
}
