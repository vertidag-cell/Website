/*
 * Optional production build — minifies HTML, CSS, JS into dist/.
 *
 * Run:  npm install && npm run build
 * Preview: npm run preview
 *
 * Deployment note: the root files (index.html, styles.css, etc.) are
 * already production-ready. This build step is optional and only
 * produces smaller files. You can deploy either the root or dist/.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { minify as minifyJs } from 'terser';
import { minify as minifyHtml } from 'html-minifier-terser';
import CleanCSS from 'clean-css';

const dist = 'dist';

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });

// CSS ---
const css = await fs.readFile('styles.css', 'utf8');
const minCss = new CleanCSS({ level: 2 }).minify(css);
await fs.writeFile(path.join(dist, 'styles.css'), minCss.styles);

// JS — terser handles compression + name mangling (a form of light obfuscation)
const jsOptions = {
  compress: { drop_console: true, passes: 2 },
  mangle: { toplevel: false },
  format: { comments: false },
};
for (const f of ['config.js', 'script.js']) {
  const code = await fs.readFile(f, 'utf8');
  const out = await minifyJs(code, jsOptions);
  await fs.writeFile(path.join(dist, f), out.code);
}

// HTML
const htmlFiles = ['index.html', 'pricing.html', 'dashboard.html', 'terms.html', 'privacy.html'];
for (const f of htmlFiles) {
  const html = await fs.readFile(f, 'utf8');
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
  await fs.writeFile(path.join(dist, f), min);
}

// Static assets
for (const f of ['robots.txt', '_headers', 'vercel.json']) {
  try {
    await fs.copyFile(f, path.join(dist, f));
  } catch {
    /* file may not exist */
  }
}

console.log('✓ Built to ./dist (deploy this folder for the minified version)');
