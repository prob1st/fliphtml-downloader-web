# 📖 FlipHTML Downloader — Web

[fliphtml-downloader](https://github.com/prob1st/fliphtml-downloader) CLI aracının
web sürümü. FlipHTML5 bağlantısını yapıştırın; kitap tarayıcınızda PDF veya ZIP
olarak indirilsin.

## Mimari

- **Statik arayüz** (`index.html`, `style.css`, `app.js`) — PDF/ZIP tarayıcıda
  `pdf-lib` / `JSZip` ile oluşturulur; sunucuda kitap saklanmaz, fonksiyon süre
  limitine takılmaz.
- **`api/info.js`** — Kitabın `config.js` dosyasını çeker. Sayfa listesi şifreliyse
  FlipHTML5'in kendi `deString` WASM modülünü (bağımlılıksız, saf `WebAssembly`)
  çalıştırarak çözer. Config yoksa eski kitaplar için sayfa yoklama yedeği var.
- **`api/page.js`** — CORS proxy'si: sayfa görselini kalite/uzantı yedeklerini
  deneyerek (large → medium → thumb, webp ↔ jpg) iletir. Yalnızca kitabın kendi
  host'una ve görsel dosyalarına izin verir.

## Geliştirme

```bash
node dev-server.js   # http://localhost:3000
```

## Deploy (Vercel)

Bağımlılık yok; proje kökünü Vercel'e verin, `api/*.js` serverless fonksiyon
olarak, kalan dosyalar statik site olarak yayınlanır.

Yalnızca indirme hakkına sahip olduğunuz kitapları indirin. MIT.
