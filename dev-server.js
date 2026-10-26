// Local development server (not deployed). Serves the static site and
// mounts the Vercel-style API handlers so everything can be tested offline.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".ico": "image/x-icon",
};
const apiInfo = require("./api/info");
const apiPage = require("./api/page");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/api/info") return apiInfo(req, res);
    if (url.pathname === "/api/page") return apiPage(req, res);
    let file = url.pathname === "/" ? "/index.html" : url.pathname;
    file = path.normalize(path.join(ROOT, file));
    if (!file.startsWith(ROOT) || file.includes("/api/")) {
      res.writeHead(403); return res.end("Forbidden");
    }
    const data = await fs.promises.readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
});
server.listen(PORT, "0.0.0.0", () => console.log("dev server: http://0.0.0.0:" + PORT));
