import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const port = Number(process.env.PORT || 4173);
const root = fileURLToPath(new URL(".", import.meta.url));
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json; charset=utf-8"
};
const PAGE_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; frame-src 'self'; worker-src 'self' blob:; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob: data:; object-src 'none'; base-uri 'self'";
const localFiles = new Map([
  ["/", resolve(root, "index.html")],
  ["/index.html", resolve(root, "index.html")],
  ["/app.js", resolve(root, "app.js")],
  ["/sw.js", resolve(root, "sw.js")]
]);
const libraryRoots = [
  ["/scram/", scramjetPath],
  ["/libcurl/", libcurlPath],
  ["/baremux/", baremuxPath]
];

logging.set_level(logging.NONE);
Object.assign(wisp.options, {
  allow_udp_streams: false,
  dns_ttl: 60,
  hostname_blacklist: [
    /localhost$/i,
    /\.local$/i,
    /\.internal$/i,
    /^metadata(?:\.google\.internal)?$/i,
    /^(?:\[)?(?:fc|fd)[a-f\d:]*\]?$/i,
    /^(?:\[)?fe[89ab][a-f\d:]*\]?$/i
  ],
  port_whitelist: [80, 443]
});

function setBaseHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("cross-origin-opener-policy", "same-origin");
  res.setHeader("cross-origin-embedder-policy", "require-corp");
  res.setHeader("cross-origin-resource-policy", "same-origin");
}

async function sendFile(req, res, filePath, { serviceWorker = false, appShell = false, noCache = false } = {}) {
  try {
    const file = await stat(filePath);
    if (!file.isFile()) throw new Error("Not a file");
    setBaseHeaders(res);
    res.setHeader("content-type", MIME_TYPES[extname(filePath)] || "application/octet-stream");
    res.setHeader("content-length", file.size);
    res.setHeader("cache-control", serviceWorker || appShell || noCache ? "no-cache" : "public, max-age=300");
    if (serviceWorker) res.setHeader("service-worker-allowed", "/");
    if (appShell) res.setHeader("content-security-policy", PAGE_CSP);
    res.writeHead(200);
    if (req.method === "HEAD") return res.end();
    const stream = createReadStream(filePath);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  } catch {
    if (!res.headersSent) {
      setBaseHeaders(res);
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found.");
    } else {
      res.destroy();
    }
  }
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (!["GET", "HEAD"].includes(req.method)) {
    setBaseHeaders(res);
    res.writeHead(405, { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" });
    return res.end("Method not allowed.");
  }
  if (requestUrl.pathname === "/favicon.ico") {
    res.writeHead(204);
    return res.end();
  }

  const localFile = localFiles.get(requestUrl.pathname);
  if (localFile) {
    await sendFile(req, res, localFile, {
      serviceWorker: requestUrl.pathname === "/sw.js",
      appShell: requestUrl.pathname === "/" || requestUrl.pathname === "/index.html",
      noCache: requestUrl.pathname === "/app.js"
    });
    return;
  }

  for (const [prefix, directory] of libraryRoots) {
    if (!requestUrl.pathname.startsWith(prefix)) continue;
    let relativePath;
    try {
      relativePath = decodeURIComponent(requestUrl.pathname.slice(prefix.length));
    } catch {
      break;
    }
    const base = resolve(directory);
    const filePath = resolve(base, relativePath);
    if (filePath !== base && !filePath.startsWith(`${base}${sep}`)) break;
    return sendFile(req, res, filePath);
  }

  setBaseHeaders(res);
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found.");
});

server.on("upgrade", (req, socket, head) => {
  const path = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  if (path === "/wisp/") return wisp.routeRequest(req, socket, head);
  socket.destroy();
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Scramjet web proxy running on port ${port}. Keep the Codespaces port private.`);
});

server.on("error", error => {
  console.error("Proxy server failed to start:", error.message);
  process.exitCode = 1;
});
