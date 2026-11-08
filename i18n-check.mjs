// Checks the Russian dictionary against the interface text in src/: npm run i18n:check
//  - missing: English text shown through T() with no Russian. These fail the check.
//  - unused: Russian entries whose English no longer appears anywhere in src/. Listed, to delete.
// Interface text is found in: T('…'), TH('…') and TN(n,'one','other') calls (every literal in the first argument, so
// T(a?'x':'y') counts both), data-t and data-ta in src/index.html, form fields' l/ph/help, KINDS labels, the choice
// lists (FREQS, TYPES, …), and the helpers below that pass one of their arguments to T().
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ru } from './src/i18n/ru.js';

const SRC = new URL('src/', import.meta.url).pathname;
/* helpers that translate one of their arguments: name → argument index */
const HELPERS = { th: 0, thNum: 0, section: 0, check: 2, say: 1, goalGroup: 1, opt: 2, fld: 1, openForm: 0, kickGroup: -1 };
/* constants whose strings (or pairs' second strings) are labels shown with T() or cn() */
const LISTS = new Set(['FREQS', 'TYPES', 'HOLIDAYS', 'CURRENCIES', 'NUMFMTS', 'CONF', 'SCHED_TEXT', 'ASK_SUGGEST', 'DEFAULT_CATS', 'RESERVED', 'CAT_KEYS']);
const FIELD_PROPS = new Set(['l', 'ph', 'help', 'label']);

const walk = d => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);
const files = walk(SRC).filter(f => f.endsWith('.js') && !f.includes('/i18n/'));
const shown = new Map(); // English → where it's used as interface text
const literals = new Set(); // every string in the code
const add = (s, where) => { if (/[A-Za-z]/.test(s) && !shown.has(s)) shown.set(s, where); };
const CMP = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken]);
/* the strings in an expression, except values it compares against (a.type==='hsa'?'HSA account':…) */
const strs = n => {
  const o = [];
  (function f(x) {
    if (ts.isBinaryExpression(x) && CMP.has(x.operatorToken.kind)) return;
    if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) o.push(x.text);
    ts.forEachChild(x, f);
  })(n);
  return o;
};
/* the labels of tOpts([['v','Label'],…]) and of lists of pairs */
const pairLabels = n => ts.isArrayLiteralExpression(n) ? n.elements.flatMap(e => ts.isArrayLiteralExpression(e) && e.elements[1] ? strs(e.elements[1]) : strs(e)) : [];

for (const file of files) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
  const where = n => `${relative(SRC, file)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  (function visit(n) {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) literals.add(n.text);
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const name = n.expression.text, a = n.arguments;
      if ((name === 'T' || name === 'TH') && a[0]) strs(a[0]).forEach(s => add(s, where(n)));
      if (name === 'TN' && a[1] && a[2] && ts.isStringLiteral(a[1]) && ts.isStringLiteral(a[2])) {
        literals.add(`${a[1].text}|${a[2].text}`); add(`${a[1].text}|${a[2].text}`, where(n));
      }
      if (name === 'tOpts' && a[0]) pairLabels(a[0]).forEach(s => add(s, where(n)));
      if (name in HELPERS && HELPERS[name] >= 0 && a[HELPERS[name]]) strs(a[HELPERS[name]]).forEach(s => add(s, where(n)));
    }
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && FIELD_PROPS.has(n.name.text) && ts.isStringLiteral(n.initializer)) add(n.initializer.text, where(n));
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && LISTS.has(n.name.text) && n.initializer) {
      const init = n.initializer;
      const vals = ts.isObjectLiteralExpression(init) ? init.properties.flatMap(p => ts.isPropertyAssignment(p) ? strs(p.initializer) : []) : pairLabels(init);
      vals.forEach(s => add(s, where(n)));
    }
    ts.forEachChild(n, visit);
  })(sf);
}
const page = readFileSync(join(SRC, 'index.html'), 'utf8');
for (const m of page.matchAll(/data-ta?="([^"]+)"/g)) { add(m[1], 'index.html'); literals.add(m[1]); }

/* text that is the same in Russian, or isn't words: codes, numbers, the app's name */
const SAME = new Set(['HSA', 'APR', 'Claude', 'Budgeter', '1,234.56', '1 234,56', '1.234,56', "1'234.56"]);
const missing = [...shown].filter(([s]) => !(s in ru) && !SAME.has(s));
const unused = Object.keys(ru).filter(k => !literals.has(k));

if (unused.length) {
  console.log(`${unused.length} Russian ${unused.length === 1 ? 'entry is' : 'entries are'} no longer used (delete them from src/i18n/ru.js):`);
  unused.forEach(k => console.log('  ' + JSON.stringify(k)));
}
if (missing.length) {
  console.log(`${missing.length} interface ${missing.length === 1 ? 'text has' : 'texts have'} no Russian (add to src/i18n/ru.js):`);
  missing.forEach(([s, w]) => console.log(`  ${JSON.stringify(s)}  (${w})`));
  process.exit(1);
}
console.log(`i18n: ${shown.size} interface texts, all translated; ${Object.keys(ru).length} Russian entries.`);
