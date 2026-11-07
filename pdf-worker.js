// Reads the text of one PDF. main.js starts it for each PDF, in its own process, and stops it after the answer.
// Answers { ok, pages } with one string per page, each line's pieces in reading order.
process.parentPort.once('message', async ({ data: req }) => {
  const reply = r => process.parentPort.postMessage(r);
  let task;
  try {
    // pdf.js doesn't treat a utility process as Node, so it would look for a web worker; loading its worker
    // module here makes it parse in this process instead.
    globalThis.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    task = pdfjs.getDocument({ data: new Uint8Array(req.data), isEvalSupported: false, useSystemFonts: true });
    const doc = await task.promise;
    if (doc.numPages > req.maxPages) return reply({ ok: false, code: 'pdf_big' });
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const items = (await (await doc.getPage(n)).getTextContent()).items.filter(i => i.str && i.str.trim());
      const lines = [];
      for (const i of items) {
        const x = i.transform[4], y = i.transform[5];
        let line = lines.find(l => Math.abs(l.y - y) < Math.max(2, (i.height || 8) * 0.4));
        if (!line) lines.push(line = { y, parts: [] });
        line.parts.push({ x, s: i.str });
      }
      lines.sort((a, b) => b.y - a.y);
      pages.push(lines.map(l => l.parts.sort((a, b) => a.x - b.x).map(p => p.s.trim()).join('  ')).join('\n'));
    }
    reply({ ok: true, pages });
  } catch (err) {
    reply({ ok: false, code: err?.name === 'PasswordException' ? 'pdf_locked' : 'pdf_error', message: String(err?.message || err) });
  } finally {
    task?.destroy().catch(() => {});
  }
});
