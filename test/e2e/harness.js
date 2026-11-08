// Electron main process for the e2e tests. Started by test/e2e/run.mjs as: electron harness.js <suite> <lang> <out.json>
// It loads the real main.js (same window, same security setup) with a temporary userData, the local AI pointed at a
// closed port (so "AI off" every time), a fixed date and time zone, and the test plan loaded through Restore from backup.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const [suite, lang, outFile] = process.argv.slice(-3);
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'flowly-e2e-'));
// appData too: main.js looks there for data from the old Budgeter name, and must never find the real one
app.setPath('appData', userData);
const newName = path.join(userData, 'Flowly'), oldMark = path.join(userData, 'Budgeter', 'Local Storage', 'mark');
if (suite === 'migrate') { fs.mkdirSync(path.dirname(oldMark), { recursive: true }); fs.writeFileSync(oldMark, 'saved'); }
app.setPath('userData', suite === 'migrate' ? newName : userData);
process.env.OLLAMA_HOST = '127.0.0.1:9';
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8');
// 18 November 2026, 10:00 in New York
const STUB = `(() => {
  const RD = Date, T0 = new RD(2026, 10, 18, 10, 0, 0).getTime();
  function D(...a) { if (!new.target) return new RD(T0).toString(); return a.length ? new RD(...a) : new RD(T0); }
  D.prototype = RD.prototype; D.now = () => T0; D.UTC = RD.UTC; D.parse = RD.parse;
  window.Date = D;
  try { localStorage.setItem('budgeter:ui', JSON.stringify({ lang: ${JSON.stringify(lang)} })); } catch (e) {}
})();`;

const problems = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let win;
const js = code => win.webContents.executeJavaScript(code, true);

async function waitFor(code, what, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await js(code)) return; await sleep(40); }
  throw new Error('timed out waiting for ' + what);
}
const settle = () => sleep(180);
async function click(sel) {
  const ok = await js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
  if (!ok) throw new Error('nothing to click: ' + sel);
  await settle();
}
const tab = name => click(`.tab[data-tab="${name}"]`);
const closeDlg = () => js(`document.querySelector('#dlg').open && document.querySelector('#dlg').close()`).then(settle);

// Visible text and the DOM (whitespace runs collapsed, so reformatting a template doesn't count as a change)
const SNAP = `((sel) => {
  const el = document.querySelector(sel);
  const norm = h => h.replace(/\\s+/g, ' ').replace(/></g, '>\\n<');
  const extra = sel === '#dlg' ? '' : document.querySelector('.top').innerText + '\\n';
  return { text: extra + el.innerText.replace(/[ \\t]+\\n/g, '\\n').trim(), html: norm(el.innerHTML) };
})`;
const snaps = [];
async function snap(name, sel = '#main') {
  snaps.push({ name, ...await js(`${SNAP}(${JSON.stringify(sel)})`) });
}

// Russian: interface text left in English. Names from the test plan and a few proper nouns are fine.
const ALLOWED = new Set(['Paycheck', 'Commission', 'Average of my last 4 quarters', 'Rent', 'Electricity', 'Average of the last 6 bills',
  'Streaming', 'Car loan payment', 'Gym', 'Car insurance', 'Checking', 'Savings', 'Wallet', 'Brokerage', '401k', 'Health savings', 'Car',
  'Visa', 'Auto loan', 'Ends in 2029', 'Emergency fund', 'Vacation', 'Pets', "Trader Joe's", 'Blue Bottle', 'Netflix', 'Uber',
  'Pet store', 'Cinema', 'Transfer to savings', 'Pharmacy', 'Hardware store', 'Hardware store refund', 'Mystery charge', 'Vet',
  'coffee', 'work', 'date night', 'English', 'Flowly', 'HSA', 'APR', 'APY', 'Ollama', 'Claude', 'ollama pull gemma4:12b', 'gemma4:12b', 'CSV', 'PDF',
  'IRS', 'USD', 'EUR', 'SEK', 'NOK', 'DKK', 'GBP', 'CHF', 'PLN', 'CAD', 'AUD', 'JPY', 'trader joe = Groceries\nuber = Transport\nnetflix = Bill payment']);
const SCAN = `(() => {
  const out = [], root = document.body;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { const p = n.parentElement; if (!p || p.closest('script,style') || (!p.closest('dialog[open]') && p.closest('dialog'))) continue; out.push(n.nodeValue.trim()); }
  root.querySelectorAll('[placeholder],[aria-label],[title],[data-tip]').forEach(e => { if (e.closest('dialog') && !e.closest('dialog[open]')) return; ['placeholder', 'aria-label', 'title', 'data-tip'].forEach(a => e.hasAttribute(a) && out.push(e.getAttribute(a).trim())); });
  root.querySelectorAll('textarea').forEach(e => out.push(e.value.trim()));
  return out.filter(Boolean);
})()`;
const english = new Map();
async function scan(step) {
  if (lang !== 'ru') return;
  for (const s of await js(SCAN)) {
    if (ALLOWED.has(s) || !/[A-Za-z]{3,}/.test(s)) continue;
    // a Russian sentence that names something from the plan, an amount or a code is fine
    const rest = [...ALLOWED].reduce((x, a) => x.split(a).join(' '), s);
    if (!/[A-Za-z]{3,}/.test(rest)) continue;
    if (/[А-Яа-яЁё]/.test(s) && !/\b[A-Za-z]{3,}\s+[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(rest)) continue;
    if (!english.has(s)) english.set(s, step);
  }
}
async function step(name, sel) { await snap(name, sel); await scan(name); }

async function start() {
  const wc = win.webContents;
  wc.on('console-message', (e, level, message) => {
    const lv = e.level ?? level, msg = e.message ?? message;
    // Electron's own dev-only CSP notice isn't from the app (it's gone once packaged)
    if ((lv === 'error' || lv === 3 || lv === 'warning' || lv === 2) && !/^Electron Security Warning/.test(msg)) problems.push(`console ${lv}: ${msg}`);
  });
  wc.on('render-process-gone', (e, d) => problems.push('renderer gone: ' + d.reason));
  if (wc.isLoading()) await new Promise(r => wc.once('did-finish-load', r));
  wc.debugger.attach('1.3');
  wc.debugger.on('message', (e, method, params) => {
    if (method === 'Network.requestWillBeSent' && /^(https?|wss?):/i.test(params.request.url)) problems.push('network request: ' + params.request.url);
    if (method === 'Runtime.exceptionThrown') problems.push('exception: ' + params.exceptionDetails.exception?.description);
  });
  await wc.debugger.sendCommand('Network.enable');
  await wc.debugger.sendCommand('Runtime.enable');
  await wc.debugger.sendCommand('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' });
  await wc.debugger.sendCommand('Page.enable');
  await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  const loaded = new Promise(r => wc.once('did-finish-load', r));
  wc.reload();
  await loaded;
  await waitFor(`!!document.querySelector('#main .sec, #main .row, #main .eq')`, 'the app to start');
  // Restore from backup, through the real file input and confirm dialog
  await js(`(() => { const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(FIXTURE)}], 'backup.json', { type: 'application/json' }));
    const rf = document.querySelector('#rf'); rf.files = dt.files; rf.dispatchEvent(new Event('change')); })()`);
  await waitFor(`!!document.querySelector('#dlg[open] #fy')`, 'the restore question');
  await click('#fy');
  await waitFor(`!!document.querySelector('#main .eq')`, 'the restored plan');
  await settle();
}

async function walk() {
  for (const t of ['overview', 'spend', 'bills', 'income', 'accounts', 'debt', 'goals']) { await tab(t); await step(t); }
  await tab('trends');
  await waitFor(`!!document.querySelector('[data-act="askchk"]')`, 'the AI check on Trends');
  await step('trends');
  await tab('overview');
  await click('[data-act="prev"]'); await step('overview-october');
  await click('[data-act="prev"]'); await step('overview-september-before-kickoff');
  await click('[data-act="today"]'); await click('[data-act="next"]'); await step('overview-december');
  await tab('spend'); await step('spend-december');
  await click('[data-act="today"]');
  await click('[data-act="kickoff"]'); await step('kickoff');
  await click('[data-tab="overview"]');
  const dialog = async (name, open, ready) => {
    await open();
    await waitFor(`!!document.querySelector('#dlg[open]')`, name);
    if (ready) await waitFor(ready, name + ' to be ready');
    await step('dialog-' + name, '#dlg');
    await closeDlg();
  };
  await dialog('settings', () => click('.foot [data-act="settings"]'));
  await dialog('add-category', () => click('[data-act="catadd"]'));
  await tab('bills');
  await dialog('add-bill', () => click('[data-act="add"][data-kind="bills"]'));
  await dialog('edit-bill-electricity', () => click('[data-act="edit"][data-kind="bills"][data-id="elec"]'));
  await dialog('delete-bill', () => click('[data-act="del"][data-kind="bills"][data-id="rent"]'));
  await tab('income');
  await dialog('edit-income-commission', () => click('[data-act="edit"][data-kind="income"][data-id="comm"]'));
  await tab('accounts');
  await dialog('add-account', () => click('[data-act="add"][data-kind="accounts"]'));
  await dialog('edit-account-card', () => click('[data-act="edit"][data-kind="accounts"][data-id="cc"]'));
  await dialog('edit-account-hsa', () => click('[data-act="edit"][data-kind="accounts"][data-id="hsa"]'));
  await dialog('edit-account-brokerage', () => click('[data-act="edit"][data-kind="accounts"][data-id="inv"]'));
  await dialog('new-statement', () => click('[data-act="nextstmt"][data-id="cc"]'));
  await dialog('transfer', () => click('.row [data-act="xfer"]'));
  await tab('goals');
  await dialog('add-goal', () => click('[data-act="add"][data-kind="goals"]'));
  await dialog('fund-goal', () => click('[data-act="fund"][data-id="trip"]'));
  await tab('spend');
  await dialog('add-transaction', () => click('[data-act="tadd"]'));
  await dialog('edit-transaction', () => click('[data-act="tedit"][data-id="tb05"]'));
  await dialog('category-rules', () => click('[data-act="trules"]'));
  await dialog('import', () => click('[data-act="timport"]'), `!!document.querySelector('#aichk')`);
  // the category dropdown a row builds on click
  await click('[data-act="tcatpick"][data-id="tb07"]');
  await step('spend-category-picker');
}

const planOf = () => js(`JSON.parse(localStorage.getItem('budgeter:plan'))`);
const balances = async () => Object.fromEntries((await planOf()).accounts.map(a => [a.id, { bal: a.bal, cash: a.cash, stmt: a.stmt }]));
function expect(cond, msg) { if (!cond) problems.push('transfer: ' + msg); }

async function transfer() {
  await tab('overview');
  expect(await js(`!!document.querySelector('.alert [data-act="xfer"][data-i="0"]')`), 'no transfer tip on the Overview');
  await click('.alert [data-act="xfer"][data-i="0"]');
  const form = await js(`({ from: document.querySelector('#dlg [name="from"]').value, to: document.querySelector('#dlg [name="to"]').value, amt: document.querySelector('#dlg [name="amt"]').value })`);
  expect(form.from === 'sav' && form.to === 'chk' && form.amt === '450', 'the tip should fill in Savings → Checking 450, got ' + JSON.stringify(form));
  await click('#fs');
  let b = await balances();
  expect(b.sav.bal === 7550 && b.chk.bal === 1650, 'after the transfer: ' + JSON.stringify([b.sav, b.chk]));
  expect(!await js(`!!document.querySelector('.alert [data-act="xfer"][data-i]')`), 'the tip should clear after the transfer');
  expect(await js(`!!document.querySelector('.toast .lnk')`), 'no Undo in the toast');
  // pay the card: what's owed and the statement both drop
  await tab('accounts');
  await click('.row [data-act="xfer"]');
  await js(`(() => { const d = document.querySelector('#dlg'); d.querySelector('[name="from"]').value = 'chk'; d.querySelector('[name="to"]').value = 'cc'; d.querySelector('[name="amt"]').value = '200'; })()`);
  await click('#fs');
  b = await balances();
  expect(b.cc.bal === 750 && b.cc.stmt === 420 && b.chk.bal === 1450, 'after paying the card: ' + JSON.stringify([b.cc, b.chk]));
  expect(await js(`document.querySelector('[data-act="stmt"][data-id="cc"]').value`) === '420', 'the card statement on the Accounts tab should be 420');
  await js(`[...document.querySelectorAll('.toast .lnk')].pop().click()`);
  await settle();
  b = await balances();
  expect(b.cc.bal === 950 && b.cc.stmt === 620 && b.chk.bal === 1650, 'after Undo: ' + JSON.stringify([b.cc, b.chk]));
  expect(await js(`document.querySelector('[data-act="stmt"][data-id="cc"]').value`) === '620', 'the card statement should be back to 620');
}

app.on('browser-window-created', (e, w) => {
  if (win) return;
  win = w;
  (async () => {
    let failed = null;
    try {
      if (suite === 'migrate') {
        if (!fs.existsSync(path.join(newName, 'Local Storage', 'mark'))) problems.push('migrate: the Budgeter data was not copied');
        if (!fs.existsSync(oldMark)) problems.push('migrate: the old Budgeter data is gone');
      } else {
        await start();
        if (suite === 'walk') await walk(); else await transfer();
      }
    } catch (err) { failed = err.stack || String(err); }
    fs.writeFileSync(outFile, JSON.stringify({ problems, failed, snaps, english: [...english].map(([s, step]) => ({ s, step })) }, null, 1));
    win.destroy();
    fs.rmSync(userData, { recursive: true, force: true });
    app.exit(0);
  })();
});
require('../../main.js');
