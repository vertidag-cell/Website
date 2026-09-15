// Turn the scraped reference pages into a clean catalogue.
// The product pages all share one shape:
//   <nav junk> … "$"   <NAME>   <description lines…>   "$25.00"   "In Stock" …
// so the name is the line after the lone currency symbol and the description is
// everything up to the first real price.
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.dirname(url.fileURLToPath(import.meta.url));
const src = path.join(ROOT, "ref-shots", "ref-catalogue.json");
const raw = JSON.parse(fs.readFileSync(src, "utf8"));

const NAV = /^(home|products|reviews|login|cart|quantity|add to cart|buy now|in stock|out of stock|terms of service|powered by sellauth|maximum order:.*|made by .*|shield ark|💥.*)$/i;

const parsed = raw.map((p) => {
  const lines = String(p.text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const dollarIdx = lines.findIndex((l) => l === "$");
  const after = dollarIdx > -1 ? lines.slice(dollarIdx + 1) : lines;

  const name = after[0] || p.slug;
  // Description runs until the first standalone price.
  const priceIdx = after.findIndex((l, i) => i > 0 && /^\$\s?\d[\d,]*(\.\d{2})?$/.test(l));
  const descLines = (priceIdx > 0 ? after.slice(1, priceIdx) : after.slice(1))
    .filter((l) => !NAV.test(l));
  const price = priceIdx > 0 ? Number(after[priceIdx].replace(/[^0-9.]/g, "")) : null;

  // Variant-priced products list several prices; keep them all so tiers survive.
  const allPrices = after
    .filter((l) => /^\$\s?\d[\d,]*(\.\d{2})?$/.test(l))
    .map((l) => Number(l.replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n));

  return {
    slug: p.slug,
    name,
    price,
    priceRange: allPrices.length > 1 ? [Math.min(...allPrices), Math.max(...allPrices)] : null,
    description: descLines.join("\n").trim() || null,
    url: p.url,
  };
});

fs.writeFileSync(path.join(ROOT, "ref-shots", "ref-clean.json"), JSON.stringify(parsed, null, 1));
for (const p of parsed) {
  const d = (p.description || "").replace(/\n/g, " · ").slice(0, 74);
  console.log(`${String(p.name).slice(0, 26).padEnd(28)} $${String(p.price ?? "?").padStart(7)}  ${d}`);
}
console.log(`\n${parsed.length} products → ref-shots/ref-clean.json`);
