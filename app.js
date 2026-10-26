// FlipHTML Downloader — web UI logic.
// Flow: /api/info resolves the page list (incl. encrypted books), pages are
// fetched through /api/page (CORS proxy with fallbacks), then the PDF/ZIP is
// built locally in the browser (pdf-lib / JSZip).

const $ = (id) => document.getElementById(id);
const state = { book: null, aborted: false, busy: false };

function log(msg) {
  const el = $("log");
  el.hidden = false;
  const time = new Date().toLocaleTimeString("tr-TR", { hour12: false });
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
  const clean = (title || "fliphtml5-kitap")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "fliphtml5-kitap";
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

// --- Step 1: resolve the book ------------------------------------------------

async function fetchBook(input) {
  setStatus("Kitap bilgileri alınıyor… (şifreli kitaplarda ilk çözüm biraz sürebilir)");
  $("fetch-btn").disabled = true;
  try {
    const r = await fetch(`/api/info?input=${encodeURIComponent(input)}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Bilinmeyen hata");
    state.book = data;
    setStatus("");
    showBook(data);
    log(`Kitap bulundu: "${data.title}" — ${data.pageCount} sayfa (${data.source}).`);
  } catch (e) {
    setStatus("❌ " + e.message, true);
    $("book-card").hidden = true;
  } finally {
    $("fetch-btn").disabled = false;
  }
}

function showBook(b) {
  $("book-card").hidden = false;
  $("book-title").textContent = b.title;
  $("book-pages").textContent = b.pageCount;
  $("book-source").textContent =
    b.source === "config-encrypted" ? "şifreli config (çözüldü 🔓)" :
    b.source === "probe" ? "eski format (yoklanarak bulundu)" : "config";
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
    const r = await fetch(pageApiUrl(name, quality));
    if (r.status === 429 && attempt <= 8 && !state.aborted) {
      // Rate-limited by the edge protector: back off politely and retry.
      const retryAfter = parseInt(r.headers.get("Retry-After") || "2", 10) || 2;
      await new Promise((res) => setTimeout(res, Math.min(retryAfter, 15) * 1000 + 250));
      return fetchPageBlob(name, quality, attempt + 1);
    }
    if (!r.ok) throw new Error("HTTP " + r.status);
    const blob = await r.blob();
    if (!blob.type.startsWith("image/") && blob.size < 512) throw new Error("geçersiz görsel");
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

  const start = Math.max(1, parseInt($("opt-start").value, 10) || 1);
  const endRaw = parseInt($("opt-end").value, 10);
  const end = Math.min(b.pageCount, endRaw > 0 ? endRaw : b.pageCount);
  if (end < start) { log("⚠️ Geçersiz sayfa aralığı."); return; }

  const format = $("opt-format").value;
  const quality = $("opt-quality").value;
  const jpegQ = (parseInt($("opt-jpeg").value, 10) || 90) / 100;
  const names = b.pages.slice(start - 1, end);
  const total = names.length;

  if (total > 300 && !$("opt-end").value) {
    log(`⚠️ ${total} sayfa büyük bir indirme; tarayıcı belleği zorlanabilir. Gerekirse aralığı daralt.`);
  }
  state.aborted = false;
  state.busy = true;
  $("download-btn").disabled = true;
  $("cancel-btn").hidden = false;
  log(`İndirme başladı: sayfa ${start}-${end} (${total} sayfa), kalite=${quality}, format=${format}.`);

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
      setProgress((done / total) * 70, `Sayfalar indiriliyor: ${done}/${total}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (state.aborted) {
    log("⛔ İndirme durduruldu.");
    setProgress(0, "Durduruldu.");
    return finish();
  }
  const ok = blobs.filter(Boolean);
  if (!ok.length) {
    log("❌ Hiçbir sayfa indirilemedi.");
    setProgress(0, "Başarısız.");
    return finish();
  }
  if (failed.length) log(`⚠️ İndirilemeyen ${failed.length} sayfa atlandı: ${failed.slice(0, 30).join(", ")}${failed.length > 30 ? " …" : ""}`);

  try {
    if (format === "pdf" || format === "both") await buildPdf(ok, jpegQ);
    if (format === "zip" || format === "both") await buildZip(ok, start);
    setProgress(100, "Tamamlandı ✓ Dosya indiriliyor…");
    log("✅ Tamamlandı.");
  } catch (e) {
    log("❌ Dosya oluşturulurken hata: " + e.message);
    setProgress(0, "Hata oluştu.");
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
  if (!jpg) throw new Error("JPEG dönüştürme başarısız");
  return new Uint8Array(await jpg.arrayBuffer());
}

async function buildPdf(blobs, jpegQ) {
  if (!window.PDFLib) throw new Error("pdf-lib yüklenemedi (internet bağlantısını kontrol et)");
  const { PDFDocument } = window.PDFLib;
  const pdf = await PDFDocument.create();
  pdf.setTitle(state.book.title);
  pdf.setProducer("FlipHTML Downloader");
  for (let i = 0; i < blobs.length; i++) {
    if (state.aborted) throw new Error("durdu");
    const bytes = await toJpegBytes(blobs[i], jpegQ);
    const img = await pdf.embedJpg(bytes);
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    setProgress(70 + ((i + 1) / blobs.length) * 30, `PDF oluşturuluyor: ${i + 1}/${blobs.length}`);
  }
  const out = await pdf.save();
  saveBlob(new Blob([out], { type: "application/pdf" }), safeFileName(state.book.title, "pdf"));
  log(`PDF hazır (${(out.length / 1048576).toFixed(1)} MB).`);
}

async function buildZip(blobs, startPage) {
  if (!window.JSZip) throw new Error("JSZip yüklenemedi (internet bağlantısını kontrol et)");
  const zip = new window.JSZip();
  const width = String(state.book.pageCount).length;
  blobs.forEach((blob, i) => {
    const ext = blob.type.includes("webp") ? "webp" : blob.type.includes("png") ? "png" : "jpg";
    zip.file(`${String(startPage + i).padStart(width, "0")}.${ext}`, blob);
  });
  const out = await zip.generateAsync({ type: "blob", compression: "STORE" }, (meta) => {
    setProgress(70 + meta.percent * 0.3, `ZIP oluşturuluyor: %${meta.percent.toFixed(0)}`);
  });
  saveBlob(out, safeFileName(state.book.title, "zip"));
  log(`ZIP hazır (${(out.size / 1048576).toFixed(1)} MB).`);
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
