// The page's only way to reach the main process: local AI through Ollama, PDF text, and the shared folder.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flowlyDesktop', {
  status: () => ipcRenderer.invoke('ai:status'),
  json: req => ipcRenderer.invoke('ai:json', req),
  // onText gets the whole answer so far each time more arrives
  ask: (req, onText) => {
    const id = Math.random().toString(36).slice(2);
    const h = (e, m) => { if (m.id === id) onText(m.text); };
    ipcRenderer.on('ai:chunk', h);
    return { id, done: ipcRenderer.invoke('ai:ask', { ...req, id }).finally(() => ipcRenderer.removeListener('ai:chunk', h)) };
  },
  stop: id => ipcRenderer.invoke('ai:stop', id),
  pdfText: bytes => ipcRenderer.invoke('pdf:text', bytes),
  // The shared folder: k is 'plan' or 'tx-YYYY-MM', a document is its JSON text. onChange gets the k of a file that changed.
  sync: {
    dir: () => ipcRenderer.invoke('sync:dir'),
    choose: () => ipcRenderer.invoke('sync:choose'),
    off: () => ipcRenderer.invoke('sync:off'),
    read: k => ipcRenderer.invoke('sync:read', k),
    write: (k, text) => ipcRenderer.invoke('sync:write', k, text),
    list: () => ipcRenderer.invoke('sync:list'),
    onChange: fn => { ipcRenderer.on('sync:changed', (e, k) => fn(k)); }
  }
});
