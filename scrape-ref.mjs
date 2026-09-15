// Pull a reference store's catalogue (product names, prices, descriptions and
// variants) so it can be mirrored. Writes ref-shots/ref-catalogue.json.
// Usage: node scrape-ref.mjs https://shieldark.mysellauth.com
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.dirname(url.fileURLToPath(import.meta.url));
const out = path.join(ROOT, "ref-shots");
fs.mkdirSync(out, { recursive: true });
const TARGET = (process.argv[2] || "https://shieldark.mysellauth.com").replace(/\/$/, "");

const { chromium } = await import("file://C:/Users/black/arkoris-website/node_modules/playwright/index.mjs");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const goto = async (u) => {
  try { await page.goto(u, { waitUntil: "networkidle", timeout: 45000 }); } catch { /* keep what rendered */ }
  await page.waitForTimeout(1200);
};

await goto(TARGET);
// Category cards are accordions (javascript:void(0)) — clicking them reveals
// the products inside, which is where most of the catalogue lives.
await page.evaluate(async () => {
  const cards = [...document.querySelectorAll('a[href^="javascript"]')];
  for (const c of cards) { c.click(); await new Promise((r) => setTimeout(r, 400)); }
});
await page.waitForTimeout(2000);

const productUrls = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll('a[href*="/product/"]')].map((a) => a.href))]);
console.log(`found ${productUrls.length} product pages`);

const products = [];
for (const u of productUrls) {
  await goto(u);
  const p = await page.evaluate(() => {
    const clean = (t) => (t || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    const name = clean(document.querySelector("h1")?.textContent) || clean(document.title).split("|")[0];
    const body = clean(document.body.innerText);
    // Price(s): the first money figure or range on the page.
    const price = (body.match(/\$\s?\d[\d,]*(?:\.\d{2})?(?:\s*[-–]\s*\$\s?\d[\d,]*(?:\.\d{2})?)?/) || [])[0] || null;
    // Description: the longest paragraph-ish block that is not nav or price.
    const blocks = [...document.querySelectorAll("p, li, div")]
      .filter((el) => !el.querySelector("p, li, div"))
      .map((el) => clean(el.textContent))
      .filter((t) => t.length > 25 && t.length < 1200 && !/^\$|View Details|Add to cart|In Stock|Quantity/i.test(t));
    const description = blocks.sort((a, b) => b.length - a.length)[0] || null;
    // Variants: option buttons / selects usually carry "name — $price".
    const variants = [...document.querySelectorAll("button, option, label")]
      .map((el) => clean(el.textContent))
      .filter((t) => t && /\$\s?\d/.test(t) && t.length < 90);
    return { name, price, description, variants: [...new Set(variants)], text: body.slice(0, 2500) };
  });
  products.push({ url: u, slug: u.split("/product/")[1] || "", ...p });
  console.log(`  ${(p.name || u).slice(0, 44).padEnd(46)} ${p.price || "-"}`);
}

await browser.close();
fs.writeFileSync(path.join(out, "ref-catalogue.json"), JSON.stringify(products, null, 1));
console.log(`\n${products.length} products → ref-shots/ref-catalogue.json`);
