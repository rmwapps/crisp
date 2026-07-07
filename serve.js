const { createServer } = await import("node:http");
const { readFileSync } = await import("node:fs");
const { join, extname } = await import("node:path");

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

createServer((req, res) => {
  let file = req.url === "/" ? "/index.html" : req.url;
  let path = join("dist", file);
  try {
    const content = readFileSync(path);
    const ext = extname(path);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(8080, "0.0.0.0", () => console.log("http://0.0.0.0:8080"));
