// Local preview server for docs/index.html using fake data, so you don't
// need a GH_TOKEN or to wait for a deploy to see the full dashboard UI.
//
// Usage: node scripts/dev-preview.js [port]
// Then open the printed URL. Requests for data.json are served from
// scripts/dev-preview-data.json instead of the real docs/data.json.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.argv[2]) || 4173;
const DOCS_DIR = path.join(__dirname, "..", "docs");
const MOCK_DATA_PATH = path.join(__dirname, "dev-preview-data.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const reqPath = decodeURIComponent(req.url.split("?")[0]);

  if (reqPath === "/data.json") {
    fs.readFile(MOCK_DATA_PATH, (err, body) => {
      if (err) {
        res.writeHead(500);
        res.end("Failed to read mock data: " + err.message);
        return;
      }
      res.writeHead(200, { "content-type": MIME[".json"], "cache-control": "no-store" });
      res.end(body);
    });
    return;
  }

  const filePath = path.join(DOCS_DIR, reqPath === "/" ? "index.html" : reqPath);
  if (!filePath.startsWith(DOCS_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, body) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found: " + reqPath);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    res.end(body);
  });
});

server.listen(PORT, () => {
  console.log(`Dev preview (fake data) running at http://localhost:${PORT}/`);
  console.log(`Editing docs/index.html and refreshing the page picks up changes immediately.`);
});
