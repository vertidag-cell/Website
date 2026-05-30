/*
 * Production build — minifies HTML, CSS, JS into dist/.
 *
 * Run:    npm install && npm run build
 * Preview: npm run preview
 *
 * Auto-discovers every .html and .js file in the project root so new
 * pages and scripts get picked up without editing this file. Skips
 * build.mjs itself and anything under backend/, dist/, or node_modules/.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { minify as minifyJs } from "terser";
import { minify as minifyHtml } from "html-minifier-terser";
import CleanCSS from "clean-css";

const ROOT = ".";
const DIST = "dist";
const SKIP_FILES = new Set(["build.mjs"]);
const SKIP_DIRS = new Set(["dist", "node_modules", "backend", ".git"]);

await fs.rm(DIST, { recursive: true, force: true });
await fs.mkdir(DIST, { recursive: true });

const entries = await fs.readdir(ROOT, { withFileTypes: true });

const htmlFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".html")).map((e) => e.name);
const jsFiles = entries
  .filter((e) => e.isFile() && e.name.endsWith(".js") && !SKIP_FILES.has(e.name))
  .map((e) => e.name);
const cssFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".css")).map((e) => e.name);

console.log(`[build] HTML: ${htmlFiles.length} · JS: ${jsFiles.length} · CSS: ${cssFiles.length}`);

// --- CSS ---
for (const f of cssFiles) {
  const css = await fs.readFile(f, "utf8");
  const out = new CleanCSS({ level: 2 }).minify(css);
  await fs.writeFile(path.join(DIST, f), out.styles);
  console.log(`[build] css  ${f}  (${out.styles.length} bytes)`);
}

// --- JS ---
const jsOptions = {
  compress: { drop_console: false, passes: 2 },
  mangle: { toplevel: false },
  format: { comments: false },
};
for (const f of jsFiles) {
  const code = await fs.readFile(f, "utf8");
  const out = await minifyJs(code, jsOptions);
  await fs.writeFile(path.join(DIST, f), out.code);
  console.log(`[build] js   ${f}  (${(out.code || "").length} bytes)`);
}

// --- HTML ---
for (const f of htmlFiles) {
  const html = await fs.readFile(f, "utf8");
  const min = await minifyHtml(html, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: true,
    removeRedundantAttributes: true,
    useShortDoctype: true,
    sortAttributes: true,
    sortClassName: true,
  });
  await fs.writeFile(path.join(DIST, f), min);
  console.log(`[build] html ${f}  (${min.length} bytes)`);
}

// --- Static assets that aren't .html/.css/.js ---
// NOTE: .env.example is intentionally NOT shipped — it's a dev-only template and
// publishing it leaks the env-var structure. Keep deploy artifacts here only.
const STATIC = ["robots.txt", "_headers", "vercel.json"];
for (const f of STATIC) {
  try {
    await fs.copyFile(f, path.join(DIST, f));
    console.log(`[build] copy ${f}`);
  } catch {
    /* file may not exist; skip silently */
  }
}

// --- Static asset directories (images, fonts, etc.) — copied verbatim ---
const STATIC_DIRS = ["assets", ".well-known"];
for (const d of STATIC_DIRS) {
  try {
    await fs.cp(d, path.join(DIST, d), { recursive: true });
    console.log(`[build] copy dir ${d}/`);
  } catch {
    /* dir may not exist; skip silently */
  }
}

console.log(`✓ Built ${htmlFiles.length + jsFiles.length + cssFiles.length} files to ./${DIST}`);
