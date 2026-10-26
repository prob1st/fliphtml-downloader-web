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

## DDoS / kötüye kullanım koruması

Vercel, ağ katmanındaki (L3/L4) hacimsel saldırıları zaten altyapısında soğurur.
Bunun üstüne uygulama katmanında (L7) şu korumalar var:

- **Edge Middleware (`middleware.js`)** — `/api/*` istekleri fonksiyona ulaşmadan
  kenarda karşılanır: IP başına hız limiti (token-bucket; `/api/info` 20/dk,
  `/api/page` 400/dk, toplam 500/dk), GET/HEAD dışı method reddi, cross-origin
  API kullanımı reddi, 429 + `Retry-After`.
- **CDN cache** — Başarılı `/api/info` yanıtları 1 saat, sayfa görselleri 7 gün
  `s-maxage` ile kenarda önbelleklenir; tekrar istekleri fonksiyonu çalıştırmaz.
- **API sınırları** — Sayfa başına 20 sn zaman aşımı ve 30 MB boyut sınırı; eski
  kitapları yoklayan yedek moda 25 sn süre bütçesi (amplification önlemi).
- **İstemci uyumu** — Arayüz 429 alınca `Retry-After` kadar bekleyip sürdürür.

### Global (tüm edge kopyalarında ortak) limite yükseltme

Bellek içi sayaçlar edge kopyası başına çalışır (en iyi çaba). Global sayaç için
Vercel panelinden bir **Upstash Redis** (Marketplace > Storage) bağlayın;
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (veya `KV_REST_API_*`)
değişkenleri algılanınca `middleware.js` otomatik olarak global limite geçer,
kod değişikliği gerekmez.

### Saldırı anında ek adımlar

- Vercel paneli: Project > **Firewall** sekmesinden IP/ülke bazlı kurallar,
  Project Settings > Security altından **Attack Mode** (tüm istekleri zorlar).
- Kendi alan adınızı bağlarsanız önüne **Cloudflare** (ücretsiz plan) koymak
  en güçlü L7 korumasını verir (vercel.app adresleriyle bu mümkün değildir).

## Geliştirme

```bash
node dev-server.js   # http://localhost:3000
```

## Deploy (Vercel)

Bağımlılık yok; proje kökünü Vercel'e verin, `api/*.js` serverless fonksiyon
olarak, kalan dosyalar statik site olarak yayınlanır.

Yalnızca indirme hakkına sahip olduğunuz kitapları indirin. MIT.
