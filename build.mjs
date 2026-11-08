// Builds the app into one page: dist/index.html, with the CSS and the bundled script inlined, and dist/fonts.
// One page because Electron loads it from file://, where ES modules don't load, and the artifact is a single page.
// Not minified, so the output stays readable. Run: npm run build
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';

const src = f => new URL('src/' + f, import.meta.url);
const out = new URL('dist/', import.meta.url);

const { outputFiles } = await build({
  entryPoints: [src('main.js').pathname],
  bundle: true,
  format: 'iife',
  charset: 'utf8',
  target: 'es2022',
  write: false,
  logLevel: 'warning'
});
// "</script" inside the code would end the inline script early; "<\/script" means the same in JS
const js = outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(src('styles.css'), 'utf8');
// a function, not a string, as the replacement: the code is full of "$" patterns String.replace would expand
const page = readFileSync(src('index.html'), 'utf8')
  .replace('/* @inline styles.css */\n', () => css)
  .replace('/* @inline bundle */\n', () => js);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(new URL('index.html', out), page);
cpSync(new URL('app/fonts/', import.meta.url), new URL('fonts/', out), { recursive: true });
console.log(`built dist/index.html (${Math.round(page.length / 1024)} KB)`);
