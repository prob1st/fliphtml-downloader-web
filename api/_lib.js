// Shared helpers for the FlipHTML5 downloader API (not a route itself).
// Pure Node (global fetch, WebAssembly). No dependencies.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DESTRING_URL =
  "https://static.fliphtml5.com/resourceFiles/html5_templates/js/deString.js";
const SIZES = ["large", "medium", "thumb"];

// ---------------------------------------------------------------------------
// Input parsing / safety
// ---------------------------------------------------------------------------

function isPrivateHost(hostname) {
  const h = (hostname || "").toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal"))
    return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  if (h === "::1" || h.startsWith("[::1")) return true;
  return false;
}

/** Accept a book ID (xxxxx/yyyy) or a fliphtml5.com / custom-domain URL. */
function parseBookInput(raw) {
  raw = String(raw || "").trim().replace(/^['"]|['"]$/g, "");
  if (!raw) throw new Error("Boş bağlantı");

  const idMatch = raw.match(/^([\w-]+)\/([\w-]+)\/?(?:[?#].*)?$/);
  if (idMatch && !raw.includes("://") && !idMatch[1].includes(".")) {
    const id = idMatch[1] + "/" + idMatch[2];
    return { baseUrl: `https://online.fliphtml5.com/${id}/`, bookId: id };
  }
  if (!raw.includes("://")) raw = "https://" + raw;
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Geçersiz bağlantı");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:")
    throw new Error("Yalnızca http/https bağlantıları desteklenir");
  if (isPrivateHost(u.hostname)) throw new Error("Bu adrese izin verilmiyor");

  const segments = u.pathname.split("/").filter(Boolean);
  if (segments.length && /^index\.html?$/i.test(segments[segments.length - 1]))
    segments.pop();

  if (u.hostname.toLowerCase().endsWith("fliphtml5.com")) {
    if (segments.length < 2) throw new Error("Bağlantıda kitap kimliği yok");
    const id = segments[0] + "/" + segments[1];
    return { baseUrl: `https://online.fliphtml5.com/${id}/`, bookId: id };
  }
  if (!segments.length) throw new Error("Bağlantıda kitap yolu yok");
  return { baseUrl: `${u.protocol}//${u.host}/` + segments.join("/") + "/", bookId: null };
}

function sanitizeName(name) {
  return String(name || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

// ---------------------------------------------------------------------------
// Config fetching & deString WASM decoding
// ---------------------------------------------------------------------------

async function fetchText(url, timeoutMs = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: ctl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchConfig(baseUrl) {
  for (const path of ["javascript/config.js", "mobile/javascript/config.js"]) {
    try {
      const text = await fetchText(new URL(path, baseUrl).href);
      if (!text.includes("fliphtml5_pages")) continue;
      return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

let decoderPromise = null;

function getDecoder() {
  if (!decoderPromise) decoderPromise = buildDecoder().catch((e) => {
    decoderPromise = null;
    throw e;
  });
  return decoderPromise;
}

async function buildDecoder() {
  const js = await fetchText(DESTRING_URL, 30000);
  const m = js.match(/data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)/);
  if (!m) throw new Error("deString WASM bulunamadı");
  const mod = await WebAssembly.compile(Buffer.from(m[1], "base64"));

  let mem;
  const u8 = () => new Uint8Array(mem.buffer);
  const imports = {
    env: {
      emscripten_run_script: () => {},
      emscripten_memcpy_big: (dest, src, size) => {
        u8().copyWithin(dest, src, src + size);
      },
      emscripten_resize_heap: (requested) => {
        const cur = mem.buffer.byteLength;
        if (requested <= cur) return 1;
        try {
          mem.grow(Math.ceil((requested - cur) / 65536));
          return 1;
        } catch {
          return 0;
        }
      },
    },
    wasi_snapshot_preview1: {
      fd_write: (_fd, iovs, iovsLen, nwritten) => {
        const v = new DataView(mem.buffer);
        let total = 0;
        for (let i = 0; i < iovsLen; i++) total += v.getUint32(iovs + i * 8 + 4, true);
        v.setUint32(nwritten, total, true);
        return 0;
      },
    },
  };
  for (const i of WebAssembly.Module.imports(mod)) {
    imports[i.module] = imports[i.module] || {};
    if (!(i.name in imports[i.module])) imports[i.module][i.name] = () => 0;
  }
  const inst = await WebAssembly.instantiate(mod, imports);
  mem = inst.exports.memory;
  if (inst.exports.emscripten_stack_init) inst.exports.emscripten_stack_init();
  if (inst.exports.__wasm_call_ctors) inst.exports.__wasm_call_ctors();

  return function decode(str) {
    const data = Buffer.from(str + "\0", "utf8");
    const ptr = inst.exports.malloc(data.length);
    try {
      u8().set(data, ptr);
      const out = inst.exports.DeString(ptr);
      const arr = u8();
      let end = out;
      while (arr[end] !== 0) end++;
      return Buffer.from(arr.slice(out, end)).toString("utf8");
    } finally {
      inst.exports.free(ptr);
    }
  };
}

function parsePagesJson(text) {
  if (typeof text !== "string") return null;
  const s = text.indexOf("["), e = text.lastIndexOf("]");
  if (s === -1 || e <= s) return null;
  try {
    const data = JSON.parse(text.slice(s, e + 1));
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

async function decodePagesValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const t = value.trim();
    if (t.startsWith("[")) return parsePagesJson(t);
    const decode = await getDecoder();
    return parsePagesJson(decode(t));
  }
  return null;
}

async function extractPages(config) {
  let pages = await decodePagesValue(config.fliphtml5_pages);
  if (pages && pages.length) return pages;
  const bc = config.bookConfig;
  if (typeof bc === "string") {
    try {
      const decode = await getDecoder();
      const decoded = decode(bc);
      pages = parsePagesJson(decoded);
      if (pages && pages.length) return pages;
      const inner = JSON.parse(decoded);
      if (inner && typeof inner === "object")
        return decodePagesValue(inner.fliphtml5_pages);
    } catch {
      /* fall through */
    }
  }
  if (bc && typeof bc === "object") return decodePagesValue(bc.fliphtml5_pages);
  return null;
}

function pageFilename(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    if (Array.isArray(entry.n) && entry.n.length) return String(entry.n[0]);
    if (typeof entry.n === "string" && entry.n) return entry.n;
    if (entry.src) return String(entry.src);
    if (entry.url) return String(entry.url);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Page URLs & image checks
// ---------------------------------------------------------------------------

function candidateUrls(baseUrl, filename, quality) {
  if (/^https?:\/\//i.test(filename)) return [filename];
  const name = filename.replace(/^\.?\//, "");
  const variants = [name];
  if (/\.webp$/i.test(name)) variants.push(name.slice(0, -5) + ".jpg");
  else if (/\.jpe?g$/i.test(name)) variants.push(name.replace(/\.jpe?g$/i, ".webp"));

  const sizes = [quality, ...SIZES.filter((s) => s !== quality)];
  const urls = [];
  for (const v of variants) {
    if (v.startsWith("files/")) urls.push(new URL(v, baseUrl).href);
    else for (const s of sizes) urls.push(new URL(`files/${s}/${v}`, baseUrl).href);
  }
  return [...new Set(urls)];
}

function looksLikeImage(buf) {
  if (!buf || buf.length < 100) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // jpg
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true; // png
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return true;
  if (buf.toString("ascii", 0, 4) === "GIF8") return true;
  if (buf[0] === 0x42 && buf[1] === 0x4d) return true; // bmp
  return false;
}

function contentTypeFor(url, fallback) {
  const path = new URL(url).pathname.toLowerCase();
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return fallback || "image/jpeg";
}

// ---------------------------------------------------------------------------
// Legacy probing: files/large/1.jpg, 2.jpg, ...
// ---------------------------------------------------------------------------

async function probePages(baseUrl, maxMisses = 12, hardLimit = 2000, budgetMs = 25000) {
  // Time-budgeted: probing fires many outbound requests, so cap how long one
  // /api/info call may spend here (abuse/amplification guard).
  const deadline = Date.now() + budgetMs;
  const exts = ["jpg", "webp", "png", "jpeg"];
  const found = [];
  let misses = 0;
  for (let batchStart = 1; batchStart <= hardLimit && misses < maxMisses; batchStart += 10) {
    if (Date.now() > deadline) break;
    const batch = [];
    for (let n = batchStart; n < batchStart + 10 && n <= hardLimit; n++) {
      batch.push(
        (async () => {
          for (const ext of exts) {
            try {
              const r = await fetch(new URL(`files/large/${n}.${ext}`, baseUrl).href, {
                method: "GET",
                headers: { "User-Agent": UA },
              });
              const ctype = r.headers.get("content-type") || "";
              const len = +(r.headers.get("content-length") || 0);
              if (r.body && r.body.cancel) r.body.cancel().catch(() => {});
              if (r.ok && (ctype.startsWith("image/") || len > 1000)) return `${n}.${ext}`;
            } catch {
              /* next ext */
            }
          }
          return null;
        })()
      );
    }
    const results = await Promise.all(batch);
    for (const r of results) {
      if (r) {
        found.push(r);
        misses = 0;
      } else misses++;
    }
    if (found.length === 0 && batchStart > 50) break; // nothing here at all
  }
  return found;
}

// ---------------------------------------------------------------------------
// tiny response helpers (plain Node style, work on Vercel and locally)
// ---------------------------------------------------------------------------

function sendJson(res, status, obj, cacheControl = "no-store") {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cacheControl,
  });
  res.end(body);
}

module.exports = {
  UA,
  SIZES,
  parseBookInput,
  sanitizeName,
  isPrivateHost,
  fetchText,
  fetchConfig,
  extractPages,
  pageFilename,
  candidateUrls,
  looksLikeImage,
  contentTypeFor,
  probePages,
  sendJson,
};
