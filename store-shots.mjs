// Storefront visual check: serves the repo, mocks the buyer store API with the
// imageless IRONS catalog (as quick-generate produces it), and screenshots the
// category-tiles landing + a drilled-in category at desktop/phone widths.
// Run: node store-shots.mjs   (output → store-shots/)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.dirname(url.fileURLToPath(import.meta.url));
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("nf"); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

// ── Mock catalog (imageless, GBP) — mirrors the grouped ark-irons template:
//    8 top-level categories, three of them with sub-categories. ─────────────────
const GROUPS = [
  { name: "Resource Packs", products: [["Beer Pack", 5], ["Mutagen Pack", 10], ["Small Dedi Pack", 10], ["Large Dedi Pack", 20]] },
  { name: "Turrets & Ammo", subs: [
    { name: "Turret Packs", products: [["Heavy Turret Bundle", 15], ["Tek Turret Bundle", 15]] },
    { name: "Ammo Packs", products: [["Basic Pack", 8], ["Advanced Bullet Pack", 20]] },
  ] },
  { name: "Blueprints", subs: [
    { name: "Blueprint Packs", products: [["Small Blueprint Pack", 3], ["Medium Blueprint Pack", 7], ["Large Blueprint Pack", 20], ["Flak Blueprint Pack", 12]] },
    { name: "Tek Blueprint Packs", products: [["Simple Tek Blueprint Pack", 5], ["Advanced Tek Blueprint Pack", 12], ["Deluxe Mek Blueprint Pack", 5]] },
    { name: "Bullet Blueprint Packs", products: [["Basic ARB Blueprint Pack", 2], ["Advanced ARB Blueprint Pack", 10]] },
  ] },
  { name: "Ascension Packs", products: [["Simple Ascension Pack", 5], ["Small Ascension Pack", 15], ["Medium Ascension Pack", 20], ["Large Ascension Pack", 25]] },
  { name: "Base Packs", products: [["Small Base Pack", 15], ["Medium Base Pack", 25], ["Large Base Pack", 40]] },
  { name: "Dino Bundles", products: [["Basic Bundle", 15], ["Advanced Bundle", 25], ["Elite Bundle", 30], ["Mega Bundle", 40]] },
  { name: "Dinos & Breeding", subs: [
    { name: "Breeding Packs", products: [["Small Breeder Pack", 4], ["Medium Breeder Pack", 10], ["Large Breeder Pack", 25]] },
    { name: "Unbreedable Dinos", products: [["Basic Bundle", 4], ["Advanced Bundle", 10], ["Medium Dino Pack", 25], ["Large Dino Pack", 35]] },
    { name: "Cloner Female Packs", products: [["Small Cloner Pack", 5], ["Medium Cloner Pack", 10], ["Large Cloner Pack", 15]] },
  ] },
  { name: "Mystery Boxes", products: [["Mystery Box", 10], ["Mega Mystery Box", 25]] },
];
const categories = [], products = [];
let cid = 1, pid = 100;
const addProduct = (catId, name, price, featured) => products.push({ id: pid++, name, description: "Delivered in-game via a redeem code in a ticket.", image_url: null, category: null, category_id: catId, price_money: price, price_credits: null, sale_price_money: null, sale_ends_at: null, fulfillment_type: "manual", inStock: true, lowStock: null, featured: !!featured, isBundle: false, rating: 0, reviewCount: 0, variants: [], soldCount: 0, bestseller: false, bundle: null });
GROUPS.forEach((g, gi) => {
  const top = { id: cid++, parent_id: null, name: g.name, description: g.name + " for your tribe.", image_url: null, position: gi, enabled: true, children: [], productCount: (g.products || []).length, totalProductCount: 0 };
  let total = 0;
  (g.products || []).forEach(([n, p], j) => { addProduct(top.id, n, p, gi === 0 && j === 0); total++; });
  (g.subs || []).forEach((s, si) => {
    const sub = { id: cid++, parent_id: top.id, name: s.name, description: s.name + ".", image_url: null, position: si, enabled: true, children: [], productCount: s.products.length, totalProductCount: s.products.length };
    s.products.forEach(([n, p]) => { addProduct(sub.id, n, p, false); total++; });
    top.children.push(sub);
  });
  top.totalProductCount = total;
  categories.push(top);
});
const STORE = { guildId: "1", guildName: "Iron Ark", guildIcon: null, title: "Iron Ark", description: "Donation store — support the cluster and gear up.", announcement: "Season 4 is live — new base packs added!", checkoutFields: [], banner: null, logo: null, color: "#2bff9e", currency: "GBP", acceptMoney: true, acceptCredits: false, enabled: true, testMode: true };

const json = (o) => ({ status: 200, contentType: "application/json", body: JSON.stringify(o) });

const { chromium } = await import("file://C:/Users/black/arkoris-website/node_modules/playwright/index.mjs");
const outDir = path.join(ROOT, "store-shots");
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const errors = [];

const GUILD = "100000000000000001";
STORE.guildId = GUILD;

async function mock(page) {
  await page.route(/\/auth\/csrf/, (r) => r.fulfill(json({ csrfToken: "x" })));
  await page.route(/\/api\/dashboard\/me/, (r) => r.fulfill(json({ user: null })));
  await page.route(/\/api\/dashboard\/store\/cart/, (r) => r.fulfill(json({ items: [] })));
  await page.route(/\/api\/dashboard\/store\/orders/, (r) => r.fulfill(json({ orders: [] })));
  await page.route(/\/api\/dashboard\/store\?guild=/, (r) => r.fulfill(json({ premium: true, enabled: true, store: STORE, products, categories })));
}

for (const [name, w, h, drill] of [["landing", 1440, 1100, false], ["landing-phone", 390, 844, false], ["category", 1440, 1100, true]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  await mock(page);
  await page.goto(base + "/store.html?guild=100000000000000001");
  await page.waitForTimeout(1000);
  if (drill) {
    await page.evaluate(() => { const t = document.querySelectorAll(".cat-tile[data-cat]")[1]; if (t) t.click(); }); // grouped parent w/ sub-sections
    await page.waitForTimeout(800);
  }
  // Scroll through so every scroll-reveal fires, then return to the top.
  await page.evaluate(async () => {
    const step = Math.max(500, window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(700);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) errors.push(`${name}: horizontal overflow ${overflow}px`);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
  console.log(`[store-shots] ${name}.png (overflow ${overflow}px)`);
  await page.close();
}
await browser.close();
server.close();

const real = errors.filter((e) => !/Failed to load resource|net::ERR|CORS|favicon/.test(e));
if (real.length) { console.log("[store-shots] ERRORS:"); real.forEach((e) => console.log("  " + e)); process.exit(1); }
console.log("[store-shots] clean — no console errors, no overflow");
