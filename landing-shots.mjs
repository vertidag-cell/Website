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

// index gets all three viewports; every other (non-dashboard) page gets desktop + phone.
const PAGES = [
  "features.html", "pop.html", "premium.html", "branding.html", "demos.html",
  "pricing.html", "servers.html", "support.html", "setup-guide.html",
  "faq.html", "terms.html", "privacy.html", "xp-leaderboard.html",
];
const SHOTS = [["index", "index.html", 1440, 900], ["index-tablet", "index.html", 768, 1024], ["index-phone", "index.html", 390, 844]];
for (const p of PAGES) {
  const slug = p.replace(".html", "");
  SHOTS.push([slug, p, 1440, 900], [slug + "-phone", p, 390, 844]);
}

for (const [name, file, w, h] of SHOTS) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  await page.goto(base + "/" + file);
  await page.waitForTimeout(900);
  // Scroll through the page first so every IntersectionObserver reveal
  // (data-animate / data-stagger) has fired before the full-page capture.
  await page.evaluate(async () => {
    const step = Math.max(500, window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 70));
    }
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
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
