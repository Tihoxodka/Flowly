const { app, BrowserWindow, shell, Menu, ipcMain, session, utilityProcess } = require('electron');
const path = require('path');
const { fileURLToPath } = require('url');

// One window only, so two copies never write the same data at once.
if (!app.requestSingleInstanceLock()) app.quit();

// The page is this one file. Only it may navigate, reach the AI, or read PDFs.
const APP_FILE = path.join(__dirname, 'app', 'index.html');
const isAppUrl = url => {
  try { return fileURLToPath(String(url).split('#')[0]) === APP_FILE; } catch (err) { return false; }
};
const fromApp = e => isAppUrl(e.senderFrame?.url);
// Links leave the app only as web pages in the default browser; other kinds of links (file:, smb:, custom apps) are ignored.
const openOutside = url => { try { if (new URL(url).protocol === 'https:') shell.openExternal(url); } catch (err) {} };

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 380,
    title: 'Budgeter',
    backgroundColor: '#eef1f6',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile(APP_FILE);
  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!isAppUrl(url)) { e.preventDefault(); openOutside(url); } });
  // Backups and calendar reminders: ask where to save, starting in Downloads.
  win.webContents.session.on('will-download', (e, item) => {
    item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
  });
}

/* ---------- local AI through Ollama, for reading statements and talking about spending ---------- */
// Everything stays on this Mac: Ollama runs the model locally on its default port.
const OLLAMA = process.env.OLLAMA_HOST ? `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, '')}` : 'http://127.0.0.1:11434';

async function ollama(route, body, timeoutMs = 300000, stop) {
  const signal = stop ? AbortSignal.any([AbortSignal.timeout(timeoutMs), stop]) : AbortSignal.timeout(timeoutMs);
  let res;
  try {
    res = await fetch(OLLAMA + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body), signal });
  } catch (err) {
    throw { code: stop?.aborted ? 'cancelled' : err.name === 'TimeoutError' ? 'timeout' : 'offline' };
  }
  if (!res.ok) {
    const msg = (await res.json().catch(() => ({}))).error || res.statusText;
    throw { code: res.status === 404 ? 'no_model' : 'ai_error', message: msg };
  }
  return res;
}
const fail = err => ({ ok: false, code: err.code || 'ai_error', message: err.message || '' });

// Models that can think before answering (gemma4, qwen3) do so by default, which here means minutes per
// statement, or no answer at all with a JSON schema. Turn it off for them; older models don't take the option.
const thinkers = new Map();
async function noThinking(model) {
  if (!thinkers.has(model)) {
    try {
      const r = await (await ollama('/api/show', { model }, 10000)).json();
      thinkers.set(model, (r.capabilities || []).includes('thinking'));
    } catch (err) { return {}; }
  }
  return thinkers.get(model) ? { think: false } : {};
}

ipcMain.handle('ai:status', async e => {
  if (!fromApp(e)) return { running: false, models: [] };
  try {
    const r = await (await ollama('/api/tags', null, 3000)).json();
    return { running: true, models: (r.models || []).map(m => m.name) };
  } catch (err) { return { running: false, models: [] }; }
});

// One answer as JSON, shaped by `schema`; images are base64 strings.
ipcMain.handle('ai:json', async (e, req) => {
  if (!fromApp(e)) return { ok: false, code: 'ai_error' };
  try {
    const res = await ollama('/api/chat', {
      model: req.model, stream: false, format: req.schema, ...await noThinking(req.model),
      options: { temperature: 0, num_ctx: req.ctx || 8192 },
      messages: [{ role: 'user', content: String(req.prompt || ''), images: req.images?.length ? req.images : undefined }]
    });
    const out = await res.json();
    try { return { ok: true, data: JSON.parse(out.message?.content || '') }; } catch (err) { return { ok: false, code: 'invalid_json' }; }
  } catch (err) { return fail(err); }
});

// A chat answer, streamed back to the page as it's written. Stop cancels the request itself,
// so it works even while the model is still reading the question.
const asks = new Map();
ipcMain.handle('ai:ask', async (e, req) => {
  if (!fromApp(e)) return { ok: false, code: 'ai_error' };
  const ctl = new AbortController();
  asks.set(req.id, ctl);
  let text = '';
  try {
    const res = await ollama('/api/chat', { model: req.model, stream: true, ...await noThinking(req.model), options: { temperature: 0.3, num_ctx: req.ctx || 16384 }, messages: req.messages }, 300000, ctl.signal);
    const dec = new TextDecoder();
    let buf = '';
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        const m = JSON.parse(line);
        if (m.error) throw { code: 'ai_error', message: m.error };
        if (m.message?.content) { text += m.message.content; e.sender.send('ai:chunk', { id: req.id, text }); }
      }
    }
    return { ok: true, text };
  } catch (err) {
    if (ctl.signal.aborted) return { ok: false, code: 'cancelled', text };
    return { ...fail(err), text };
  }
  finally { asks.delete(req.id); }
});
ipcMain.handle('ai:stop', (e, id) => { if (fromApp(e)) asks.get(id)?.abort(); return true; });

/* ---------- PDF text ---------- */
// Each PDF is read in its own short-lived process (pdf-worker.js), so a broken or hostile file can't reach
// the main process, and one that takes too long is simply stopped. The page has the same limits (PDF_MAX_MB).
const PDF_MAX_BYTES = 25e6, PDF_MAX_PAGES = 60, PDF_TIMEOUT_MS = 60000;
ipcMain.handle('pdf:text', async (e, bytes) => {
  if (!fromApp(e)) return { ok: false, code: 'pdf_error' };
  const data = ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : null;
  if (!data?.byteLength) return { ok: false, code: 'pdf_error' };
  if (data.byteLength > PDF_MAX_BYTES) return { ok: false, code: 'pdf_big' };
  return new Promise(resolve => {
    const child = utilityProcess.fork(path.join(__dirname, 'pdf-worker.js'), [], { serviceName: 'Budgeter PDF reader' });
    let settled = false;
    const finish = r => { if (settled) return; settled = true; clearTimeout(timer); child.kill(); resolve(r); };
    const timer = setTimeout(() => finish({ ok: false, code: 'pdf_error', message: 'Reading the PDF took too long.' }), PDF_TIMEOUT_MS);
    child.once('message', finish);
    child.once('exit', () => finish({ ok: false, code: 'pdf_error' }));
    child.once('spawn', () => child.postMessage({ data, maxPages: PDF_MAX_PAGES }));
  });
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  // The page makes no network requests: fonts ship with it, and Ollama is reached from this process.
  // Blocking them means nothing in the page, even injected content, can send data off this Mac.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (d, cb) => cb({ cancel: true }));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }
  ]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
