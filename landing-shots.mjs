// Landing-page visual check: serves the repo root on a local port, screenshots
// index.html at desktop/tablet/phone widths, and fails on console errors.
// Run: node landing-shots.mjs   (output → landing-shots/)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.dirname(url.fileURLToPath(import.meta.url));
const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".ico": "image/x-icon", ".json": "application/json",
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("nf"); return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
console.log("[shots] serving", base);

const { chromium } = await import("file://C:/Users/black/arkoris-website/node_modules/playwright/index.mjs");
const outDir = path.join(ROOT, "landing-shots");
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const errors = [];

for (const [name, w, h] of [["desktop", 1440, 900], ["tablet", 768, 1024], ["phone", 390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  await page.goto(base + "/index.html");
  await page.waitForTimeout(2200);
  // horizontal-overflow check
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) errors.push(`${name}: horizontal overflow ${overflow}px`);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
  console.log(`[shots] ${name}.png (overflow ${overflow}px)`);
  await page.close();
}
await browser.close();
server.close();

const real = errors.filter((e) => !/Failed to load resource|net::ERR|CORS|api\/servers/.test(e));
if (real.length) { console.log("[shots] ERRORS:"); real.forEach((e) => console.log("  " + e)); process.exit(1); }
console.log("[shots] clean — no console errors, no overflow");
