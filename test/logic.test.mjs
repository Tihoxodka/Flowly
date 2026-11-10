// Tests for the app's pure logic. Run with: npm test
// They import the modules from src/ directly; state (plan, logged transactions, language) is set on the shared state object.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../src/state.js';
import { esc } from '../src/core/util.js';
import { f0, f2, kfmt } from '../src/core/format.js';
import { T, TN, dl, cn, catKey } from '../src/core/i18n.js';
import { blank, cleanPlan, cleanTx } from '../src/data/clean.js';
import { holidays, bizBefore } from '../src/model/holidays.js';
import { occ, sched } from '../src/model/schedule.js';
import { sim } from '../src/model/debt.js';
import { acct } from '../src/model/accounts.js';
import { moveMoney } from '../src/model/transfers.js';
import { parseAmount, parseDate, dateOrder, parseCSV, freshRows, aiRows, chunkText, guessColumns, csvRows } from '../src/import/parse.js';

const setData = (p, t) => { state.plan = p; state.tx = t || {}; };
const setLang = l => { state.LANG = l; };
// dictionaries have no prototype, so compare by content
const eq = (got, want, msg) => assert.deepEqual(JSON.parse(JSON.stringify(got)), want, msg);

test('amounts in US, European and accounting formats', () => {
  const cases = { '1,234.56': 1234.56, '1 234,56': 1234.56, '1.234,56': 1234.56, "1'234.50": 1234.5, '12,50': 12.5, '1,234': 1234,
    '1.234.567': 1234567, '(12.50)': -12.5, '12.50-': -12.5, '−12,50': -12.5, '-$12.00': -12, '$-12.00': -12, '$1,000,000.00': 1e6, '': NaN, 'abc': NaN };
  for (const [s, want] of Object.entries(cases)) assert.ok(Object.is(parseAmount(s), want) || parseAmount(s) === want, `${s} → ${parseAmount(s)}, want ${want}`);
  assert.equal(parseAmount(' 1 234,56 ₽'), 1234.56);
});

test('dates in ISO, US and European order', () => {
  assert.equal(parseDate('2026-03-25'), '2026-03-25');
  assert.equal(parseDate('03/25/2026'), '2026-03-25');
  assert.equal(parseDate('25.03.2026'), '2026-03-25');
  assert.equal(parseDate('25/03/2026'), '2026-03-25', 'a day over 12 settles the order');
  assert.equal(parseDate('05.03.2026'), '2026-03-05', 'dots default to day first');
  assert.equal(parseDate('05/03/2026'), '2026-05-03', 'slashes default to month first');
  assert.equal(parseDate('05/03/2026', 'dmy'), '2026-03-05');
  assert.equal(parseDate('05.03.26', 'mdy'), '2026-05-03');
  assert.equal(parseDate('Mar 5, 2026'), '2026-03-05');
  assert.equal(parseDate('2026-02-30'), null, 'no such day');
  assert.equal(parseDate('13/13/2026'), null);
  assert.equal(parseDate('hello'), null);
});

test('date order of a column', () => {
  assert.equal(dateOrder(['01.02.2026', '25.02.2026']), 'dmy');
  assert.equal(dateOrder(['01/02/2026', '02/25/2026']), 'mdy');
  assert.equal(dateOrder(['01.02.2026', '03.04.2026']), 'dmy');
  assert.equal(dateOrder(['01/02/2026']), 'mdy');
});

test('CSV with quotes, semicolons and a BOM', () => {
  eq(parseCSV('﻿Date;Desc;Amount\r\n25.03.2026;"Cafe; ""Central""";-4,50\r\n'),
    [['Date', 'Desc', 'Amount'], ['25.03.2026', 'Cafe; "Central"', '-4,50']]);
});

test('CSV layouts: header names, a posted date, separate debit and credit, no header', () => {
  const read = text => { const raw = parseCSV(text), g = guessColumns(raw); return { g, rows: csvRows(raw.slice(g.hasH ? 1 : 0), g.map, g.sign, dateOrder(raw.slice(g.hasH ? 1 : 0).map(r => r[g.map.date]))) }; };
  let { g, rows } = read('Date,Description,Amount\n03/01/2026,Coffee,-4.50\n03/02/2026,Refund,10.00\n');
  eq([g.hasH, g.map, g.sign], [true, { date: 0, desc: 1, amt: 2, out: -1, inn: -1 }, 'neg']);
  eq(rows, [{ date: '2026-03-01', desc: 'Coffee', amt: -4.5 }, { date: '2026-03-02', desc: 'Refund', amt: 10 }]);
  ({ g, rows } = read('Transaction Date,Posted Date,Payee,Debit,Credit\n03/01/2026,03/03/2026,Shop,20.00,\n03/02/2026,03/04/2026,Payment,,100\n'));
  eq([g.map.date, g.map.desc, g.map.amt, g.map.out, g.map.inn, g.sign], [1, 2, -1, 3, 4, null], 'the posted date wins; no amount column, so no sign');
  eq(rows.map(r => [r.date, r.amt]), [['2026-03-03', -20], ['2026-03-04', 100]]);
  ({ g, rows } = read('25.03.2026;Cafe Central;-4,50\n26.03.2026;Bakery;-2,10\n'));
  eq([g.hasH, g.map.date, g.map.desc, g.map.amt, g.sign], [false, 0, 1, 2, 'neg']);
  eq(rows[0], { date: '2026-03-25', desc: 'Cafe Central', amt: -4.5 });
  ({ g, rows } = read('Date,Merchant,Amount\n2026-03-01,Shop,12.00\n2026-03-02,Shop 2,8.00\n2026-03-03,Payment,-50\n'));
  eq([g.sign, rows.map(r => r.amt)], ['pos', [-12, -8, 50]], 'mostly plus amounts: plus is money out, as on card statements');
});

test('import keeps identical purchases that are not logged yet', () => {
  const c = { date: '2026-03-05', desc: 'Coffee', amt: -4.5 };
  assert.equal(freshRows([c, { ...c }], []).length, 2, 'two coffees on one statement both import');
  assert.equal(freshRows([c, { ...c }], [{ ...c, desc: 'COFFEE' }]).length, 1, 'one already logged');
  assert.equal(freshRows([c, { ...c }], [c, c]).length, 0);
  assert.equal(freshRows([c, { ...c }], [], true).length, 1, 'overlapping screenshot pieces');
});

test('AI rows: the app sets the sign', () => {
  const card = aiRows({ transactions: [
    { date: '2026-03-01', description: 'Shop', amount: 20, money: 'out' },
    { date: '2026-03-02', description: 'Shop 2', amount: 30, money: 'out' },
    { date: '2026-03-03', description: 'Payment', amount: -100, money: 'in' }] });
  eq(card.map(r => r.amt), [-20, -30, 100], 'card statement: plain is money out');
  const plain = aiRows([{ date: '2026-03-01', description: 'Refund', amount: 5, money: 'in' }, { date: '2026-03-01', description: 'Fee', amount: '1 234,50', money: 'out' }]);
  eq(plain.map(r => r.amt), [5, -1234.5]);
  assert.equal(aiRows([{ date: '2026-03-01', description: 'PENDING shop', amount: 5, money: 'out' }]).length, 0);
});

test('schedules', () => {
  eq(occ({ freq: 'monthly', date: '2026-01-31' }, 2026, 1), ['2026-02-28'], 'short month');
  eq(occ({ freq: 'biweekly', date: '2026-01-02' }, 2026, 0), ['2026-01-02', '2026-01-16', '2026-01-30']);
  eq(occ({ freq: 'semi', date: '2026-01-01', day2: 15 }, 2026, 0), ['2026-01-01', '2026-01-15']);
  eq(occ({ freq: 'quarterly', date: '2026-01-10' }, 2026, 1), []);
  eq(occ({ freq: 'monthly', date: '2026-01-10', end: '2026-02-01' }, 2026, 1), []);
});

test('business days skip weekends and Fed holidays', () => {
  assert.equal(bizBefore('2026-07-06', 1), '2026-07-03', 'July 4 2026 is a Saturday; the Fed stays open the Friday before');
  assert.equal(bizBefore('2026-01-20', 1), '2026-01-16', 'Martin Luther King Jr. Day');
  assert.equal(bizBefore('2026-11-30', 3), '2026-11-24', 'Thanksgiving');
});

test('debt payoff: avalanche pays less interest than snowball', () => {
  setData({ ...blank(), accounts: [
    { id: 'a', type: 'credit', bal: 1000, apr: 25, min: 50 },
    { id: 'b', type: 'credit', bal: 500, apr: 5, min: 25 }] });
  const av = sim(200, 'avalanche', true), sn = sim(200, 'snowball', true);
  assert.ok(av.interest < sn.interest);
  assert.ok(av.last >= av.done.a && av.last >= av.done.b);
});

test('a hostile backup is made safe', () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const p = Object.assign(blank(), {
    bills: [{ id: evil, name: 5, amt: '12.5', date: 'tomorrow', acct: evil, freq: 'constructor' }, 'junk'],
    accounts: [{ id: 'ok-1', type: '<b>', bal: 'x' }],
    payOn: { 'out:x:2026-01-01': evil, 'out:y:2026-01-01': '2026-01-02' },
    actual: { k: '12', j: evil }, nw: { '2026-01': { a: '5', d: 1, dt: evil }, bad: {} },
    merch: JSON.parse('{"__proto__":{"cat":"Food"},"constructor":{"cat":"X"}}'),
    kickoff: evil, strategy: evil, done: { a: 1, b: 0 }
  });
  cleanPlan(p);
  const b = p.bills[0];
  assert.equal(p.bills.length, 1);
  assert.match(b.id, /^[\w.-]+$/);
  eq([b.name, b.amt, b.date, b.acct, b.freq], ['5', 12.5, '', '', 'monthly']);
  eq([p.accounts[0].id, p.accounts[0].type, p.accounts[0].bal], ['ok-1', 'checking', 0]);
  eq({ ...p.payOn }, { 'out:y:2026-01-01': '2026-01-02' });
  eq({ ...p.actual }, { k: 12 });
  eq(Object.keys(p.nw), ['2026-01']);
  assert.equal(p.nw['2026-01'].dt, '');
  assert.equal(p.merch.__proto__.cat, 'Food', '__proto__ is an ordinary merchant');
  assert.equal(p.merch.constructor.cat, 'X');
  assert.equal(p.merch.toString, undefined);
  eq([p.kickoff, p.strategy, { ...p.done }], ['', 'avalanche', { a: 1 }]);
  const t = cleanTx({ items: [{ id: evil, date: 'x', desc: null, amt: '3', cat: 7 }, null] }, '2026-03').items;
  assert.equal(t.length, 1);
  assert.match(t[0].id, /^[\w.-]+$/);
  eq([t[0].date, t[0].desc, t[0].amt, t[0].cat], ['2026-03-01', '', 3, 'Uncategorized']);
  assert.equal(esc(evil), '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
});

test('long statements split on line breaks', () => {
  const parts = chunkText(['a'.repeat(30) + '\n' + 'b'.repeat(30), 'c'.repeat(10)], 40);
  assert.ok(parts.every(p => p.length <= 40));
  assert.equal(parts.join('').replace(/\s/g, ''), 'a'.repeat(30) + 'b'.repeat(30) + 'c'.repeat(10));
});

test('money in the plan currency and number format', () => {
  const show = (currency, numfmt) => { setData({ ...blank(), currency, numfmt }); return [f2(-1234.5), f0(1234.4), kfmt(12500), kfmt(800)].join(' | ').replace(/[\u00a0\u202f]/g, ' '); };
  assert.equal(show('USD', ''), '−$1,234.50 | $1,234 | $12.5k | $800');
  assert.equal(show('SEK', ''), '−1 234,50 kr | 1 234 kr | 12,5k kr | 800 kr');
  assert.equal(show('EUR', ''), '−1.234,50 € | 1.234 € | 12,5k € | 800 €');
  assert.equal(show('EUR', 'sv-SE'), '−1 234,50 € | 1 234 € | 12,5k € | 800 €');
  assert.equal(show('JPY', ''), '−￥1,235 | ￥1,234 | ￥12.5k | ￥800');
});

test('an unknown currency in a backup falls back to USD', () => {
  const p = Object.assign(blank(), { currency: '<b>', numfmt: 'xx' });
  cleanPlan(p);
  assert.deepEqual([p.currency, p.numfmt], ['USD', '']);
});

test('Russian: text, plurals, dates and categories', () => {
  setData(blank());
  setLang('ru');
  try {
    assert.equal(T('Add {what}', { what: T('goal') }), 'Добавить цель');
    assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map(n => `${n} ${TN(n, 'payment', 'payments')}`),
      ['1 платёж', '2 платежа', '5 платежей', '11 платежей', '21 платёж', '22 платежа', '25 платежей']);
    assert.equal(dl('2026-11-05'), '5 ноября');
    assert.equal(sched({ freq: 'monthly', date: '2020-01-25' }), 'Ежемесячно, 25-го числа');
    assert.equal(cn('Groceries'), 'Продукты');
    assert.equal(cn('My own'), 'My own', 'categories people add stay as typed');
    assert.equal(catKey('продукты'), 'Groceries', 'a translated name maps back to the saved one');
    assert.equal(T('Not in the dictionary'), 'Not in the dictionary');
  } finally { setLang('en'); }
  assert.equal(dl('2026-11-05'), 'Nov 5');
  assert.equal(sched({ freq: 'monthly', date: '2020-01-25' }), 'Monthly on the 25th');
});

test('Swedish bank holidays', () => {
  const se = y => [...holidays(y, 'se')].sort();
  // Good Friday and Easter Monday move with Easter: 2025-04-20, 2026-04-05, 2027-03-28, 2038-04-25
  for (const [y, gf, em] of [[2025, '04-18', '04-21'], [2026, '04-03', '04-06'], [2027, '03-26', '03-29'], [2038, '04-23', '04-26']])
    assert.ok(se(y).includes(`${y}-${gf}`) && se(y).includes(`${y}-${em}`), `Easter ${y}`);
  assert.deepEqual(se(2026), ['2026-01-01', '2026-01-06', '2026-04-03', '2026-04-06', '2026-05-01', '2026-05-14', '2026-06-06', '2026-06-19',
    '2026-12-24', '2026-12-25', '2026-12-26', '2026-12-31']);
  setData({ ...blank(), currency: 'SEK' });
  assert.equal(bizBefore('2026-04-07', 1), '2026-04-02', 'Easter weekend');
  assert.equal(bizBefore('2026-06-22', 1), '2026-06-18', 'Midsummer Eve');
  assert.equal(bizBefore('2026-12-28', 1), '2026-12-23', 'Christmas');
  assert.equal(bizBefore('2027-01-04', 1), '2026-12-30', 'New Year');
  assert.equal(bizBefore('2026-07-06', 1), '2026-07-03', 'no July 4 in Sweden');
  assert.equal(bizBefore('2026-01-07', 1), '2026-01-05', 'Epiphany');
  setData({ ...blank(), currency: 'SEK', holidays: 'us' });
  assert.equal(bizBefore('2026-01-07', 1), '2026-01-06', 'an explicit US calendar wins over the currency (Epiphany is Swedish only)');
  setData(blank());
});

test('transfers between accounts', () => {
  setData({ ...blank(), accounts: [
    { id: 'chk', name: 'Checking', type: 'checking', bal: 500, upd: '2026-11-01' },
    { id: 'sav', name: 'Savings', type: 'savings', bal: 4000 },
    { id: 'inv', name: 'Broker', type: 'investment', bal: 9000, cash: 100 },
    { id: 'cc', name: 'Card', type: 'credit', bal: 600, stmt: 400 },
    { id: 'loan', name: 'Loan', type: 'loan', bal: 50 },
    { id: 'car', name: 'Car', type: 'property', bal: 20000 }] });
  const bal = id => acct(id).bal;
  const undo = moveMoney('sav', 'chk', 1234.567);
  assert.equal(bal('sav'), 2765.43); assert.equal(bal('chk'), 1734.57);
  assert.equal(acct('chk').upd, '2026-11-01', 'the as-of date stays');
  undo(); assert.equal(bal('sav'), 4000); assert.equal(bal('chk'), 500);
  moveMoney('chk', 'inv', 200);
  eq([bal('chk'), acct('inv').cash, bal('inv')], [300, 300, 9000], 'into an investment goes to buying power');
  moveMoney('chk', 'cc', 250);
  eq([bal('cc'), acct('cc').stmt], [350, 150], 'paying a card lowers what is owed and the statement');
  moveMoney('sav', 'loan', 80);
  eq([bal('sav'), bal('loan')], [3920, 0], 'a loan does not go below zero');
  const undoCard = moveMoney('chk', 'cc', 400);
  eq([bal('cc'), acct('cc').stmt], [0, 0]); undoCard(); eq([bal('cc'), acct('cc').stmt], [350, 150]);
  for (const [f, t, a] of [['chk', 'chk', 10], ['chk', 'sav', 0], ['chk', 'sav', -5], ['cc', 'chk', 10], ['chk', 'car', 10], ['chk', 'nope', 10]])
    assert.equal(moveMoney(f, t, a), null, `${f} → ${t} ${a} is refused`);
  setData(blank());
});

test('a cash account now: its balance, plus checked-off items and logged spending since', async () => {
  const { cashNow } = await import('../src/model/project.js');
  state.TODAY = '2026-11-18'; state.now = new Date(2026, 10, 18);
  setData({ ...blank(), accounts: [{ id: 'chk', name: 'Checking', type: 'checking', bal: 1000, upd: '2026-11-05', updAt: 100 }],
    income: [{ id: 'pay', name: 'Pay', amt: 500, freq: 'monthly', date: '2026-11-10', acct: 'chk' }],
    bills: [{ id: 'rent', name: 'Rent', amt: 300, freq: 'monthly', date: '2026-11-15', acct: 'chk', cat: 'Housing' }] },
  { '2026-11': { items: [
    { id: 'a', date: '2026-11-06', desc: 'Shop', amt: -40, cat: 'Groceries', acct: 'chk', tag: '' },
    { id: 'b', date: '2026-11-05', desc: 'Early', amt: -7, cat: 'Groceries', acct: 'chk', tag: '', at: 50 },
    { id: 'c', date: '2026-11-05', desc: 'Late', amt: -3, cat: 'Groceries', acct: 'chk', tag: '', at: 200 },
    { id: 'd', date: '2026-11-10', desc: 'Salary', amt: 500, cat: 'Income', acct: 'chk', tag: '' },
    { id: 'e', date: '2026-11-07', desc: 'Other card', amt: -99, cat: 'Groceries', acct: 'cc', tag: '' }] } });
  const a = acct('chk');
  assert.equal(cashNow(a), 957, 'logged spending after the balance; logged income is left to the schedule');
  state.plan.done['in:pay:2026-11-10'] = 1;
  assert.equal(cashNow(a), 1457, 'checked-off pay counts');
  a.upd = '2026-11-12';
  assert.equal(cashNow(a), 1000, 'nothing before the balance date counts');
});
