// GET /api/page?base=<bookBaseUrl>&name=<pageFile>&quality=large|medium|thumb
// Tries size/extension fallbacks server-side and streams the first real image.
const lib = require("./_lib");

const MAX_IMAGE_BYTES = 30 * 1024 * 1024; // a single page never needs more
const FETCH_TIMEOUT_MS = 20000;

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD")
      return lib.sendJson(res, 405, { error: "Method not allowed" });
    const url = new URL(req.url, "http://localhost");
    const base = url.searchParams.get("base") || "";
    const name = url.searchParams.get("name") || "";
    const quality = lib.SIZES.includes(url.searchParams.get("quality"))
      ? url.searchParams.get("quality")
      : "large";

    let baseUrl;
    try {
      baseUrl = new URL(base);
    } catch {
      return lib.sendJson(res, 400, { error: "Geçersiz base" });
    }
    if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:")
      return lib.sendJson(res, 400, { error: "Geçersiz protokol" });
    if (lib.isPrivateHost(baseUrl.hostname))
      return lib.sendJson(res, 403, { error: "Bu adrese izin verilmiyor" });
    if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";

    if (!name || name.includes("..") || !/^[\w.\-/]+$/i.test(name) ||
        !/\.(jpe?g|webp|png|gif)$/i.test(name))
      return lib.sendJson(res, 400, { error: "Geçersiz sayfa adı" });

    const candidates = lib.candidateUrls(baseUrl.href, name, quality);
    // Never proxy anything outside the book host.
    const sameHost = candidates.filter((u) => {
      try {
        return new URL(u).hostname === baseUrl.hostname;
      } catch {
        return false;
      }
    });

    for (const u of sameHost) {
      let r;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
      try {
        r = await fetch(u, { headers: { "User-Agent": lib.UA }, signal: ctl.signal });
      } catch {
        continue;
      } finally {
        clearTimeout(timer);
      }
      if (!r.ok) continue;
      const declared = +(r.headers.get("content-length") || 0);
      if (declared > MAX_IMAGE_BYTES) continue; // try a smaller fallback size
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_IMAGE_BYTES) continue;
      if (!lib.looksLikeImage(buf)) continue;
      res.writeHead(200, {
        "Content-Type": lib.contentTypeFor(u, r.headers.get("content-type")),
        "Content-Length": buf.length,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
        "X-Page-Source": u.replace(baseUrl.href, ""),
      });
      return res.end(buf);
    }
    return lib.sendJson(res, 404, { error: "Sayfa bulunamadı: " + name });
  } catch (e) {
    return lib.sendJson(res, 502, { error: String(e && e.message ? e.message : e) });
  }
};
