// GET /api/info?input=<book url or xxxxx/yyyy>
// Returns { title, baseUrl, bookId, pageCount, pages: [fileName...], source }
const lib = require("./_lib");

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD")
      return lib.sendJson(res, 405, { error: "Method not allowed" });
    const url = new URL(req.url, "http://localhost");
    const input = url.searchParams.get("input") || "";
    if (!input) return lib.sendJson(res, 400, { error: "Bağlantı eksik" });

    const { baseUrl, bookId } = lib.parseBookInput(input);
    const config = await lib.fetchConfig(baseUrl);

    let names = null;
    let source = "config";
    let title = null;
    let meta = {};
    if (config) {
      meta = config.meta || {};
      title =
        (meta && meta.title) ||
        config.title ||
        (config.bookConfig && config.bookConfig.bookTitle) ||
        null;
      const entries = await lib.extractPages(config);
      if (entries) {
        names = entries.map(lib.pageFilename).filter(Boolean);
        if (typeof config.fliphtml5_pages === "string" &&
            !config.fliphtml5_pages.trim().startsWith("["))
          source = "config-encrypted";
      }
    }
    if (!names || !names.length) {
      names = await lib.probePages(baseUrl);
      source = "probe";
    }
    if (!names.length) {
      return lib.sendJson(res, 404, {
        error:
          "Sayfa listesi bulunamadı veya çözülemedi. Kitap gizli, kaldırılmış " +
          "ya da şifre korumalı olabilir; kitaplık (bookcase) bağlantısı yerine " +
          "kitabın kendi bağlantısını deneyin.",
      });
    }
    // Successful lookups are cached at the CDN for an hour: repeat requests
    // for the same book never reach this function (cheap DDoS absorption).
    return lib.sendJson(res, 200, {
      title: lib.sanitizeName(title) || (bookId ? bookId.replace("/", "_") : "fliphtml5-kitap"),
      baseUrl,
      bookId,
      pageCount: names.length,
      pages: names,
      pageWidth: meta.pageWidth || null,
      pageHeight: meta.pageHeight || null,
      source,
    }, "public, s-maxage=3600, stale-while-revalidate=86400");
  } catch (e) {
    return lib.sendJson(res, 400, { error: String(e && e.message ? e.message : e) });
  }
};
