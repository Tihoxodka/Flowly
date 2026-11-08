// End-to-end tests in the real desktop app: npm run e2e (UPDATE_GOLDEN=1 npm run e2e rewrites the golden files).
//  - walk en: every tab and the main dialogs in English, compared with golden/en.txt and golden/en.html
//  - walk ru: the same in Russian, compared with golden/ru.*, and a scan for interface text left in English
//  - transfer: a transfer tip, Record transfer, Save, a card payment and its statement, Undo
// Every run also fails on console errors and warnings, uncaught exceptions and any network request from the page.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const electron = join(root, 'node_modules', '.bin', 'electron');
const goldenDir = join(here, 'golden');
const update = !!process.env.UPDATE_GOLDEN;
const tmp = mkdtempSync(join(tmpdir(), 'budgeter-e2e-out-'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

let failed = false;
const fail = msg => { failed = true; console.log('  FAIL ' + msg); };

function run(suite, lang) {
  const out = join(tmp, `${suite}-${lang}.json`);
  const r = spawnSync(electron, [join(here, 'harness.js'), suite, lang, out], { env, encoding: 'utf8', timeout: 180000 });
  if (!existsSync(out)) throw new Error(`${suite} ${lang} produced no result\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(readFileSync(out, 'utf8'));
}

function firstDiff(want, got) {
  const a = want.split('\n'), b = got.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return `line ${i + 1}\n    want: ${a[i]}\n    got:  ${b[i]}`;
  return '';
}

function golden(lang, snaps) {
  const files = { txt: snaps.map(s => `=== ${s.name}\n${s.text}\n`).join('\n'), html: snaps.map(s => `=== ${s.name}\n${s.html}\n`).join('\n') };
  mkdirSync(goldenDir, { recursive: true });
  for (const [ext, got] of Object.entries(files)) {
    const f = join(goldenDir, `${lang}.${ext}`);
    if (update || !existsSync(f)) { writeFileSync(f, got); console.log(`  wrote golden/${lang}.${ext}`); continue; }
    const want = readFileSync(f, 'utf8');
    if (want !== got) {
      const actual = join(tmp, `${lang}.${ext}`);
      writeFileSync(actual, got);
      fail(`golden/${lang}.${ext} changed (${actual}): ${firstDiff(want, got)}`);
    }
  }
}

for (const [suite, lang] of [['walk', 'en'], ['walk', 'ru'], ['transfer', 'en']]) {
  console.log(`${suite} ${lang}`);
  const r = run(suite, lang);
  if (r.failed) fail(r.failed);
  r.problems.forEach(fail);
  if (suite === 'walk') golden(lang, r.snaps);
  r.english.forEach(e => fail(`English text in Russian (${e.step}): ${JSON.stringify(e.s)}`));
  if (!r.failed && !r.problems.length && !r.english.length) console.log('  ok' + (suite === 'walk' ? ` (${r.snaps.length} screens)` : ''));
}
if (!failed) rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
