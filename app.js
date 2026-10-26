// FlipHTML Downloader — web UI logic (TR/EN).
// Flow: /api/info resolves the page list (incl. encrypted books), pages are
// fetched through /api/page (proxy with fallbacks), then the PDF/ZIP is built
// locally in the browser (pdf-lib / JSZip).

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------
const I18N = {
  tr: {
    docTitle: "FlipHTML Downloader — FlipHTML5 kitaplarını PDF olarak indir",
    metaDesc: "FlipHTML5 flipbook'larını tarayıcıda PDF veya ZIP olarak indirin. Kurulum yok, ücretsiz. Şifreli yeni format kitaplar dahil.",
    navHow: "Nasıl çalışır?",
    navLegal: "Yasal uyarı",
    heroTitle: 'FlipHTML5 kitabını <span class="grad">PDF</span> olarak indir',
    heroSub: "Kitap bağlantısını yapıştır — sayfaları toplayıp tek PDF (istersen ZIP) haline getirelim. Kurulum yok, kayıt yok. Yeni <em>şifreli</em> kitaplar dahil.",
    urlPlaceholder: "https://fliphtml5.com/xxxxx/yyyy  veya  xxxxx/yyyy",
    fetchBtn: "Kitabı Getir",
    hintBefore: "Örnek denemek için:",
    sampleBtn: "35 sayfalık örnek kitap",
    hintAfter: "· Kitaplık (bookcase) bağlantısı değil, kitabın kendi bağlantısını kullan.",
    coverAlt: "Kapak",
    lblPages: "Sayfa sayısı",
    lblSource: "Kaynak",
    lblAddress: "Adres",
    openBook: "kitabı aç ↗",
    srcEncrypted: "şifreli config (çözüldü 🔓)",
    srcProbe: "eski format (yoklanarak bulundu)",
    srcConfig: "config",
    optFormat: "Format",
    optZip: "ZIP (sayfa görselleri)",
    optQuality: "Görsel kalitesi",
    qLarge: "Büyük (large)",
    qMedium: "Orta (medium)",
    qThumb: "Küçük (thumb)",
    optStart: "Başlangıç sayfası",
    optEnd: "Bitiş sayfası",
    endPlaceholder: "son sayfa",
    optJpeg: "PDF JPEG kalitesi",
    consent: "Bu kitabı indirme hakkına sahip olduğumu ve indirme/çoğaltmadan doğacak telif sorumluluğunun bana ait olduğunu kabul ediyorum.",
    consentRequired: "⚠️ Devam etmek için önce sorumluluk onay kutusunu işaretle.",
    downloadBtn: "İndirmeyi Başlat",
    cancelBtn: "Durdur",
    preparing: "Hazırlanıyor…",
    f1Title: "Şifreli kitaplar dahil",
    f1Desc: "Yeni FlipHTML5 kitaplarının şifreli sayfa listesi, sitenin kendi WASM çözücüsüyle sunucu tarafında güvenle açılır.",
    f2Title: "Tarayıcıda birleşir",
    f2Desc: "PDF/ZIP senin tarayıcında oluşturulur; sunucuda kitap saklanmaz, süre limitine takılmazsın.",
    f3Title: "Hızlı ve dayanıklı",
    f3Desc: "Paralel indirme, otomatik tekrar deneme ve kalite yedekleri (large → medium → thumb, webp ↔ jpg).",
    howTitle: "Nasıl çalışır?",
    how1: 'Kitabı <a href="https://fliphtml5.com" target="_blank" rel="noopener">FlipHTML5</a>\'te aç ve bağlantısını kopyala (ör. <code>https://fliphtml5.com/xxxxx/yyyy</code>).',
    how2: "Bağlantıyı yukarı yapıştırıp <strong>Kitabı Getir</strong>'e bas; kitabın sayfa listesi çıkarılır (şifreliyse çözülür).",
    how3: "Format ve sayfa aralığını seçip <strong>İndirmeyi Başlat</strong>'a bas. PDF/ZIP tarayıcında oluşturulup indirilir.",
    howNote: 'Çok büyük kitaplarda (300+ sayfa) tarayıcı belleği zorlanabilir; sayfa aralığıyla parça parça indirmek daha rahattır. Komut satırı sürümü için <a href="https://github.com/prob1st/fliphtml-downloader" target="_blank" rel="noopener">GitHub reposuna</a> bak.',
    legalTitle: "⚖️ Yasal Uyarı ve Sorumluluk Reddi",
    legal1: "Bu site yalnızca teknik bir araçtır. <strong>Sunucusunda hiçbir kitap, sayfa veya dosya barındırmaz, saklamaz ve yayınlamaz.</strong> Tüm içerik, kullanıcının verdiği bağlantı üzerinden üçüncü taraf kaynaklardan anlık olarak aktarılır ve kullanıcının kendi tarayıcısında işlenir.",
    legal2: "<strong>İndirilen, kopyalanan, çoğaltılan veya dağıtılan her türlü içeriğe ilişkin telif hakkı ve diğer tüm yasal sorumluluk tamamen kullanıcıya aittir.</strong> Bu site ve site sahibi; kullanıcıların indirdiği, yasa dışı biçimde çoğalttığı veya paylaştığı kitaplardan ve bunlardan doğabilecek hiçbir zarar, talep veya yaptırımdan sorumlu değildir ve sorumlu tutulamaz.",
    legal3: 'Bu aracı yalnızca <strong>sahibi olduğunuz</strong> ya da indirme/çoğaltma izninizin bulunduğu içerikler için kullanın. İndirmeye başlamanız, bu uyarıyı okuduğunuz ve kabul ettiğiniz anlamına gelir. Hak sahipleri, taleplerini <a href="https://github.com/prob1st/fliphtml-downloader-web/issues" target="_blank" rel="noopener">GitHub üzerinden</a> iletebilir.',
    footerLegal: "Bu site hiçbir içerik barındırmaz; indirilen içeriklerden doğan tüm yasal sorumluluk kullanıcıya aittir. Yalnızca hakkına sahip olduğun kitapları indir.",
    // dynamic strings
    defaultName: "fliphtml5-kitap",
    fetching: "Kitap bilgileri alınıyor… (şifreli kitaplarda ilk çözüm biraz sürebilir)",
    unknownError: "Bilinmeyen hata",
    bookFound: 'Kitap bulundu: "{title}" — {count} sayfa ({source}).',
    invalidRange: "⚠️ Geçersiz sayfa aralığı.",
    bigWarning: "⚠️ {count} sayfa büyük bir indirme; tarayıcı belleği zorlanabilir. Gerekirse aralığı daralt.",
    downloadStarted: "İndirme başladı: sayfa {start}-{end} ({count} sayfa), kalite={quality}, format={format}.",
    downloadingPages: "Sayfalar indiriliyor: {done}/{total}",
    stopped: "⛔ İndirme durduruldu.",
    stoppedShort: "Durduruldu.",
    nothingDownloaded: "❌ Hiçbir sayfa indirilemedi.",
    failedShort: "Başarısız.",
    skippedPages: "⚠️ İndirilemeyen {count} sayfa atlandı: {list}",
    buildError: "❌ Dosya oluşturulurken hata: {msg}",
    errorShort: "Hata oluştu.",
    doneNow: "Tamamlandı ✓ Dosya indiriliyor…",
    doneLog: "✅ Tamamlandı.",
    invalidImage: "geçersiz görsel",
    pdfBuilding: "PDF oluşturuluyor: {done}/{total}",
    pdfReady: "PDF hazır ({size} MB).",
    pdfLibMissing: "pdf-lib yüklenemedi (internet bağlantısını kontrol et)",
    jpegFail: "JPEG dönüştürme başarısız",
    zipBuilding: "ZIP oluşturuluyor: %{pct}",
    zipReady: "ZIP hazır ({size} MB).",
    zipMissing: "JSZip yüklenemedi (internet bağlantısını kontrol et)",
  },
  en: {
    docTitle: "FlipHTML Downloader — Download FlipHTML5 books as PDF",
    metaDesc: "Download FlipHTML5 flipbooks as PDF or ZIP right in your browser. No installation, free. New encrypted-format books included.",
    navHow: "How it works",
    navLegal: "Legal disclaimer",
    heroTitle: 'Download any FlipHTML5 book as a <span class="grad">PDF</span>',
    heroSub: "Paste a book link — we collect the pages and merge them into a single PDF (or ZIP). No installation, no sign-up. New <em>encrypted</em> books included.",
    urlPlaceholder: "https://fliphtml5.com/xxxxx/yyyy  or  xxxxx/yyyy",
    fetchBtn: "Get Book",
    hintBefore: "Want to try it?",
    sampleBtn: "35-page sample book",
    hintAfter: "· Use the book's own link, not a bookcase link.",
    coverAlt: "Cover",
    lblPages: "Pages",
    lblSource: "Source",
    lblAddress: "Address",
    openBook: "open book ↗",
    srcEncrypted: "encrypted config (decoded 🔓)",
    srcProbe: "legacy format (found by probing)",
    srcConfig: "config",
    optFormat: "Format",
    optZip: "ZIP (page images)",
    optQuality: "Image quality",
    qLarge: "Large",
    qMedium: "Medium",
    qThumb: "Small (thumb)",
    optStart: "Start page",
    optEnd: "End page",
    endPlaceholder: "last page",
    optJpeg: "PDF JPEG quality",
    consent: "I confirm that I have the right to download this book and that all copyright liability arising from downloading or reproducing it rests with me.",
    consentRequired: "⚠️ Please tick the responsibility confirmation box first.",
    downloadBtn: "Start Download",
    cancelBtn: "Stop",
    preparing: "Preparing…",
    f1Title: "Encrypted books included",
    f1Desc: "The encrypted page list of new FlipHTML5 books is safely decoded server-side with the site's own WASM decoder.",
    f2Title: "Assembled in your browser",
    f2Desc: "The PDF/ZIP is built in your browser; no book is stored on the server and you never hit a timeout.",
    f3Title: "Fast and resilient",
    f3Desc: "Parallel downloads, automatic retries and quality fallbacks (large → medium → thumb, webp ↔ jpg).",
    howTitle: "How it works",
    how1: 'Open the book on <a href="https://fliphtml5.com" target="_blank" rel="noopener">FlipHTML5</a> and copy its link (e.g. <code>https://fliphtml5.com/xxxxx/yyyy</code>).',
    how2: "Paste the link above and press <strong>Get Book</strong>; the page list is extracted (and decrypted if needed).",
    how3: "Pick a format and page range, then press <strong>Start Download</strong>. The PDF/ZIP is created in your browser and downloaded.",
    howNote: 'Very large books (300+ pages) can strain browser memory; downloading in page ranges is easier. For the command-line version, see the <a href="https://github.com/prob1st/fliphtml-downloader" target="_blank" rel="noopener">GitHub repo</a>.',
    legalTitle: "⚖️ Legal Disclaimer",
    legal1: "This site is merely a technical tool. <strong>It does not host, store, or publish any book, page, or file on its servers.</strong> All content is relayed in real time from third-party sources via the link provided by the user and is processed in the user's own browser.",
    legal2: "<strong>All copyright and other legal liability for any content downloaded, copied, reproduced, or distributed rests solely and entirely with the user.</strong> This site and its owner are not responsible, and cannot be held responsible, for books downloaded, illegally reproduced, or shared by users, nor for any damage, claim, or sanction arising from such use.",
    legal3: 'Use this tool only for content you <strong>own</strong> or are permitted to download/reproduce. By starting a download you acknowledge that you have read and accepted this disclaimer. Rights holders may submit requests <a href="https://github.com/prob1st/fliphtml-downloader-web/issues" target="_blank" rel="noopener">via GitHub</a>.',
    footerLegal: "This site hosts no content; all legal liability for downloaded material rests with the user. Only download books you have the right to.",
    // dynamic strings
    defaultName: "fliphtml5-book",
    fetching: "Fetching book information… (first decode of encrypted books can take a moment)",
    unknownError: "Unknown error",
    bookFound: 'Book found: "{title}" — {count} pages ({source}).',
    invalidRange: "⚠️ Invalid page range.",
    bigWarning: "⚠️ {count} pages is a big download; browser memory may struggle. Narrow the range if needed.",
    downloadStarted: "Download started: pages {start}-{end} ({count} pages), quality={quality}, format={format}.",
    downloadingPages: "Downloading pages: {done}/{total}",
    stopped: "⛔ Download stopped.",
    stoppedShort: "Stopped.",
    nothingDownloaded: "❌ No pages could be downloaded.",
    failedShort: "Failed.",
    skippedPages: "⚠️ {count} pages could not be downloaded and were skipped: {list}",
    buildError: "❌ Error while building the file: {msg}",
    errorShort: "Something went wrong.",
    doneNow: "Done ✓ Your file is downloading…",
    doneLog: "✅ Done.",
    invalidImage: "invalid image",
    pdfBuilding: "Building PDF: {done}/{total}",
    pdfReady: "PDF ready ({size} MB).",
    pdfLibMissing: "pdf-lib failed to load (check your connection)",
    jpegFail: "JPEG conversion failed",
    zipBuilding: "Building ZIP: {pct}%",
    zipReady: "ZIP ready ({size} MB).",
    zipMissing: "JSZip failed to load (check your connection)",
  },
};

let LANG = (() => {
  const saved = localStorage.getItem("fh-lang");
  if (saved === "tr" || saved === "en") return saved;
  return (navigator.language || "tr").toLowerCase().startsWith("tr") ? "tr" : "en";
})();

function t(key, vars = {}) {
  let s = (I18N[LANG] && I18N[LANG][key]) || I18N.en[key] || key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll("{" + k + "}", v);
  return s;
}

function applyLang() {
  document.documentElement.lang = LANG;
  document.title = t("docTitle");
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", t("metaDesc"));
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll("[data-i18n-alt]").forEach((el) => { el.alt = t(el.dataset.i18nAlt); });
  $("lang-tr").classList.toggle("active", LANG === "tr");
  $("lang-en").classList.toggle("active", LANG === "en");
  if (state.book) showBookMeta(state.book);
}

function setLang(lang) {
  LANG = lang;
  localStorage.setItem("fh-lang", lang);
  applyLang();
}

// ---------------------------------------------------------------------------
// App state & helpers
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const state = { book: null, aborted: false, busy: false };

function log(msg) {
  const el = $("log");
  el.hidden = false;
  const time = new Date().toLocaleTimeString(LANG === "en" ? "en-GB" : "tr-TR", { hour12: false });
  el.textContent += `[${time}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

function setStatus(msg, isError = false) {
  const el = $("fetch-status");
  if (!msg) { el.hidden = true; el.textContent = ""; return; }
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

function setProgress(pct, text) {
  $("progress-wrap").hidden = false;
  $("progress-fill").style.width = Math.round(pct) + "%";
  if (text) $("progress-text").textContent = text;
}

function pageApiUrl(name, quality) {
  const b = state.book;
  return `/api/page?base=${encodeURIComponent(b.baseUrl)}&name=${encodeURIComponent(name)}&quality=${quality}`;
}

function safeFileName(title, ext) {
  const clean = (title || t("defaultName"))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || t("defaultName");
  return `${clean}.${ext}`;
}

function saveBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

const apiHeaders = () => ({ "X-Lang": LANG });

// --- Step 1: resolve the book ------------------------------------------------

async function fetchBook(input) {
  setStatus(t("fetching"));
  $("fetch-btn").disabled = true;
  try {
    const r = await fetch(`/api/info?input=${encodeURIComponent(input)}`, { headers: apiHeaders() });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || t("unknownError"));
    state.book = data;
    setStatus("");
    showBook(data);
    log(t("bookFound", { title: data.title, count: data.pageCount, source: data.source }));
  } catch (e) {
    setStatus("❌ " + e.message, true);
    $("book-card").hidden = true;
  } finally {
    $("fetch-btn").disabled = false;
  }
}

function showBookMeta(b) {
  $("book-title").textContent = b.title;
  $("book-pages").textContent = b.pageCount;
  $("book-source").textContent =
    b.source === "config-encrypted" ? t("srcEncrypted") :
    b.source === "probe" ? t("srcProbe") : t("srcConfig");
}

function showBook(b) {
  $("book-card").hidden = false;
  showBookMeta(b);
  $("book-link").href = b.baseUrl;
  const cover = $("book-cover");
  cover.hidden = true;
  if (b.pages && b.pages.length) {
    cover.src = pageApiUrl(b.pages[0], "thumb");
    cover.onload = () => { cover.hidden = false; };
  }
  $("opt-start").value = 1;
  $("opt-end").value = "";
  $("opt-end").placeholder = b.pageCount;
  $("book-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

// --- Step 2: download pages ----------------------------------------------------

async function fetchPageBlob(name, quality, attempt = 1) {
  try {
    const r = await fetch(pageApiUrl(name, quality), { headers: apiHeaders() });
    if (r.status === 429 && attempt <= 8 && !state.aborted) {
      // Rate-limited by the edge protector: back off politely and retry.
      const retryAfter = parseInt(r.headers.get("Retry-After") || "2", 10) || 2;
      await new Promise((res) => setTimeout(res, Math.min(retryAfter, 15) * 1000 + 250));
      return fetchPageBlob(name, quality, attempt + 1);
    }
    if (!r.ok) throw new Error("HTTP " + r.status);
    const blob = await r.blob();
    if (!blob.type.startsWith("image/") && blob.size < 512) throw new Error(t("invalidImage"));
    return blob;
  } catch (e) {
    if (attempt < 3 && !state.aborted) {
      await new Promise((res) => setTimeout(res, 600 * attempt));
      return fetchPageBlob(name, quality, attempt + 1);
    }
    throw e;
  }
}

async function downloadSelected() {
  const b = state.book;
  if (!b || state.busy) return;

  if (!$("consent").checked) {
    log(t("consentRequired"));
    $("consent").focus();
    document.querySelector(".consent").classList.add("warn");
    setTimeout(() => document.querySelector(".consent").classList.remove("warn"), 1600);
    return;
  }

  const start = Math.max(1, parseInt($("opt-start").value, 10) || 1);
  const endRaw = parseInt($("opt-end").value, 10);
  const end = Math.min(b.pageCount, endRaw > 0 ? endRaw : b.pageCount);
  if (end < start) { log(t("invalidRange")); return; }

  const format = $("opt-format").value;
  const quality = $("opt-quality").value;
  const jpegQ = (parseInt($("opt-jpeg").value, 10) || 90) / 100;
  const names = b.pages.slice(start - 1, end);
  const total = names.length;

  if (total > 300 && !$("opt-end").value) {
    log(t("bigWarning", { count: total }));
  }
  state.aborted = false;
  state.busy = true;
  $("download-btn").disabled = true;
  $("cancel-btn").hidden = false;
  log(t("downloadStarted", { start, end, count: total, quality, format }));

  const blobs = new Array(total).fill(null);
  const failed = [];
  let done = 0, cursor = 0;
  const CONCURRENCY = 5;

  async function worker() {
    while (cursor < total && !state.aborted) {
      const i = cursor++;
      try {
        blobs[i] = await fetchPageBlob(names[i], quality);
      } catch {
        failed.push(start + i);
      }
      done++;
      setProgress((done / total) * 70, t("downloadingPages", { done, total }));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (state.aborted) {
    log(t("stopped"));
    setProgress(0, t("stoppedShort"));
    return finish();
  }
  const ok = blobs.filter(Boolean);
  if (!ok.length) {
    log(t("nothingDownloaded"));
    setProgress(0, t("failedShort"));
    return finish();
  }
  if (failed.length) {
    log(t("skippedPages", {
      count: failed.length,
      list: failed.slice(0, 30).join(", ") + (failed.length > 30 ? " …" : ""),
    }));
  }

  try {
    if (format === "pdf" || format === "both") await buildPdf(ok, jpegQ);
    if (format === "zip" || format === "both") await buildZip(ok, start);
    setProgress(100, t("doneNow"));
    log(t("doneLog"));
  } catch (e) {
    log(t("buildError", { msg: e.message }));
    setProgress(0, t("errorShort"));
  }
  finish();

  function finish() {
    state.busy = false;
    $("download-btn").disabled = false;
    $("cancel-btn").hidden = true;
  }
}

async function toJpegBytes(blob, quality) {
  if (blob.type === "image/jpeg") return new Uint8Array(await blob.arrayBuffer());
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close && bitmap.close();
  const jpg = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
  if (!jpg) throw new Error(t("jpegFail"));
  return new Uint8Array(await jpg.arrayBuffer());
}

async function buildPdf(blobs, jpegQ) {
  if (!window.PDFLib) throw new Error(t("pdfLibMissing"));
  const { PDFDocument } = window.PDFLib;
  const pdf = await PDFDocument.create();
  pdf.setTitle(state.book.title);
  pdf.setProducer("FlipHTML Downloader");
  for (let i = 0; i < blobs.length; i++) {
    if (state.aborted) throw new Error("stopped");
    const bytes = await toJpegBytes(blobs[i], jpegQ);
    const img = await pdf.embedJpg(bytes);
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    setProgress(70 + ((i + 1) / blobs.length) * 30, t("pdfBuilding", { done: i + 1, total: blobs.length }));
  }
  const out = await pdf.save();
  saveBlob(new Blob([out], { type: "application/pdf" }), safeFileName(state.book.title, "pdf"));
  log(t("pdfReady", { size: (out.length / 1048576).toFixed(1) }));
}

async function buildZip(blobs, startPage) {
  if (!window.JSZip) throw new Error(t("zipMissing"));
  const zip = new window.JSZip();
  const width = String(state.book.pageCount).length;
  blobs.forEach((blob, i) => {
    const ext = blob.type.includes("webp") ? "webp" : blob.type.includes("png") ? "png" : "jpg";
    zip.file(`${String(startPage + i).padStart(width, "0")}.${ext}`, blob);
  });
  const out = await zip.generateAsync({ type: "blob", compression: "STORE" }, (meta) => {
    setProgress(70 + meta.percent * 0.3, t("zipBuilding", { pct: meta.percent.toFixed(0) }));
  });
  saveBlob(out, safeFileName(state.book.title, "zip"));
  log(t("zipReady", { size: (out.size / 1048576).toFixed(1) }));
}

// --- Wiring -------------------------------------------------------------------

$("fetch-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("url-input").value.trim();
  if (v) fetchBook(v);
});
$("sample-btn").addEventListener("click", () => {
  $("url-input").value = "https://fliphtml5.com/btkj/fvcg";
  fetchBook("https://fliphtml5.com/btkj/fvcg");
});
$("download-btn").addEventListener("click", downloadSelected);
$("cancel-btn").addEventListener("click", () => { state.aborted = true; });
$("opt-jpeg").addEventListener("input", (e) => { $("jpeg-val").textContent = "%" + e.target.value; });
$("lang-tr").addEventListener("click", () => setLang("tr"));
$("lang-en").addEventListener("click", () => setLang("en"));

applyLang();
