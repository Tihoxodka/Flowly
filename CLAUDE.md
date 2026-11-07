# Budgeter

Monthly budget planner. The whole app is one file, `app/index.html` (HTML, CSS and vanilla JS, no build step), plus its fonts in `app/fonts/` (woff2, SIL OFL). The same file runs in two places:

- **claude.ai artifact** "Budgeter": https://claude.ai/artifact/JNg9Q5Q8WCvU4tBUzzCRXM, published with capabilities `db`, `downloads`, `sample`, `user`. Data syncs to the viewer's account (`data/users/<id>/plan` and `tx-YYYY-MM` docs) and is also copied to localStorage.
- **macOS desktop app** (Electron, `main.js`). `window.claude` doesn't exist there, so the app falls back to localStorage only and saves files with an `<a download>` link. AI features (reading PDFs, screenshots and statement text; Ask about your spending) use a local model through Ollama: the first installed of `LOCAL_MODELS` (`gemma4:12b`, then `gemma3:4b`) on 127.0.0.1:11434. `main.js` sends `think: false` to models whose `/api/show` capabilities include `thinking` (gemma4 thinks by default and then never finishes JSON-schema answers). The page reaches it through `window.budgeterDesktop` (`preload.js`); `main.js` makes the Ollama calls (JSON-schema output for transactions, streamed chat for questions); PDF text comes from `pdfjs-dist` in `pdf-worker.js`, a `utilityProcess` started per PDF (25 MB / 60 pages / 60 s limits, mirrored by `PDF_MAX_MB`/`PDF_MAX_PAGES` in the page). The page makes no network requests: `main.js` blocks http(s)/ws for the window, only lets `app/index.html` navigate or use IPC, and opens only `https:` links in the browser. In the page, `sampleCaps()` hides the difference between Claude on the web and Ollama on desktop: `s.json()` reads transactions and `chat()` answers questions.

This folder is the source of truth. Edit `app/index.html` here, then ship it to one or both targets.

## Rules for changes
- Every `claude.use(...)` call must keep working when it resolves `null` or `window.claude` is missing. The desktop app depends on that.
- Don't break saved data: the localStorage prefix is `budgeter:`, backups are `{app:'budgeter',version:2,plan,tx}`, and restore also accepts the old `monthly-planner` v1 backups. Put schema changes in `upgrade(p)`, which runs on load and on restore.
- Saved data is untrusted (backups can come from anywhere): `upgrade()` runs `cleanPlan()` and every loaded month goes through `cleanTx()`, which force ids, dates and numbers into shape. New fields need a line there. Still `esc()` everything put into HTML, ids included, and `CSS.escape` ids in selectors.
- Languages: English and Russian. Write every piece of interface text in English inside `T('…')` (placeholders `{name}`, plurals with `TN(n,'one','other')`), and add its Russian to `window.BUDGETER_LANGS.ru` in the script block before the app; a missing entry shows the English. Text in the static HTML uses `data-t`/`data-ta`. Dates go through `dl`/`wdl`/`mon`/`monl`. Built-in category names are saved in English and shown with `cn()`; `catKey()` maps a translated name back. Prompts to the AI stay in English (`askRules()` adds the answer language). The language is a per-device setting (`ui.lang` in localStorage), not part of the plan.
- Show money only through `f0`/`f2`/`kfmt`: they use the plan's currency and number format (`plan.currency`, `plan.numfmt`, set with the Currency button). Amounts are never converted.
- Business days (transfer reminders) use `holidays(y)`: the US Federal Reserve calendar or Swedish bank holidays (Easter-based ones computed, plus Midsummer, Christmas and New Year's Eves). `plan.holidays` is `''` (follow the currency: SEK means Sweden), `'us'` or `'se'`.
- Maps keyed by names people type (merchants, categories, tags) are `dict()` (no prototype).
- Account balances are what's there now, and the projection starts from them. A transfer (`moveMoney`) changes both balances (an investment's buying power, a debt's amount owed and a card's statement) and keeps each account's `upd` date. It returns an undo.
- Load months with `ensureTx(m)` (shared promise per month, so concurrent loads can't overwrite each other). `TODAY`/`now` are `let` and move forward via `newDay()`.
- After a field's `change`, call `paintSoon()`, not `paint()`, so focus and clicks survive the repaint.
- Keep the light/dark tokens on `:root` and the phone layout (≤640px) working.
- Don't trust a small model with signs or arithmetic: the AI copies amounts as printed and the app sets the sign (`fromClaude`); for questions the app computes every total in `spendingFacts()` and the AI only explains them.

## Run
- Tests: `npm test` (node:test). `test/logic.test.mjs` runs the page script in a stub; the script hands its pure functions to `window.__budgeterTest` instead of starting. Add new pure functions to that hook when they need tests.
- Browser preview: the `budgeter` config in `.claude/launch.json` serves `app/` on port 8765 (localStorage-only mode, same as desktop).
- Desktop dev: `npm start`. Install or update the Mac app: `bash install.sh` (builds with electron-builder and copies to /Applications).
- Web: republish `app/index.html` to the artifact URL above, without changing its capabilities, and with the fonts as supporting files: `files` maps each `fonts/<name>.woff2` to `app/fonts/<name>.woff2`.
- When running Electron from the VS Code terminal, unset `ELECTRON_RUN_AS_NODE` (`env -u ELECTRON_RUN_AS_NODE npm start`), or it starts as plain Node.

## History
Monthly planner (https://claude.ai/artifact/92K1s89g3tRGJrnNWMTiHD) is the v1 ancestor. The first git commit is the old desktop build of it.
