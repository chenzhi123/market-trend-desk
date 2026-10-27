import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSnapshot } from "./update.mjs";
import { writeFile, mkdir } from "node:fs/promises";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

let refreshing = null;

function local(req) {
  const address = req.socket.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function fileFor(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const rel = clean === "/" ? "index.html" : clean.replace(/^[/\\]+/, "");
  const file = path.normalize(path.join(root, rel));
  const rootLower = path.normalize(root).toLowerCase();
  if (!file.toLowerCase().startsWith(rootLower)) return null;
  return file;
}

async function refresh() {
  if (!refreshing) {
    refreshing = (async () => {
      const snapshot = await buildSnapshot();
      const dir = path.join(root, "data");
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "snapshot.json"), JSON.stringify(snapshot, null, 2), "utf8");
      return snapshot;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname === "/api/refresh" && req.method === "POST") {
      if (!local(req)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("只允许本机更新行情");
        return;
      }
      const snapshot = await refresh();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(snapshot));
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    const file = fileFor(url.pathname);
    if (!file) {
      res.writeHead(403);
      res.end();
      return;
    }
    const body = await readFile(file);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": ext === ".json" || ext === ".html" ? "no-store" : "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (error) {
    const missing = error && error.code === "ENOENT";
    res.writeHead(missing ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(missing ? "找不到页面" : "服务器错误");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`大盘多空季报 http://127.0.0.1:${port}/`);
});
