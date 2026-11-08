# Budgeter

Monthly budget planner in vanilla JS (no framework). The source is ES modules in `src/`; `npm run build` (`build.mjs`, esbuild) bundles them into one page, `dist/index.html`, with the CSS and script inlined and the fonts copied from `app/fonts/` (woff2, SIL OFL) to `dist/fonts/`. One page because Electron loads it from `file://`, where ES modules don't load, and the artifact is a single page. The built page runs in two places:

- **claude.ai artifact** "Budgeter": https://claude.ai/artifact/JNg9Q5Q8WCvU4tBUzzCRXM, published with capabilities `db`, `downloads`, `sample`, `user`. Data syncs to the viewer's account (`data/users/<id>/plan` and `tx-YYYY-MM` docs) and is also copied to localStorage.
- **macOS desktop app** (Electron, `main.js`). `window.claude` doesn't exist there, so the app falls back to localStorage only and saves files with an `<a download>` link. AI features (reading PDFs, screenshots and statement text; Ask about your spending) use a local model through Ollama: the first installed of `LOCAL_MODELS` (`gemma4:12b`, then `gemma3:4b`) on 127.0.0.1:11434. `main.js` sends `think: false` to models whose `/api/show` capabilities include `thinking` (gemma4 thinks by default and then never finishes JSON-schema answers). The page reaches it through `window.budgeterDesktop` (`preload.js`); `main.js` makes the Ollama calls (JSON-schema output for transactions, streamed chat for questions); PDF text comes from `pdfjs-dist` in `pdf-worker.js`, a `utilityProcess` started per PDF (25 MB / 60 pages / 60 s limits, mirrored by `PDF_MAX_MB`/`PDF_MAX_PAGES` in the page). The page makes no network requests: `main.js` blocks http(s)/ws for the window, only lets `dist/index.html` navigate or use IPC, and opens only `https:` links in the browser. In the page, `sampleCaps()` hides the difference between Claude on the web and Ollama on desktop: `s.json()` reads transactions and `chat()` answers questions.

This folder is the source of truth. Edit `src/` here, build, then ship `dist/` to one or both targets. `dist/` is built output and isn't committed.

## Layout of `src/`
- `index.html` (the page shell: header, tabs, footer, `<dialog>`), `styles.css`, `main.js` (startup: loads the plan, then `render()`), `events.js` (click and change handlers as action maps, `CLICK`/`CHANGE` by `data-act`; category drag), `state.js`, `types.js` (JSDoc typedefs of the saved data; not bundled).
- `core/`: `util.js` (`$`, `$$`, `esc`, `dict`, `uid`, `clone`), `html.js` (`html`, `raw`, `TH`, `options`), `i18n.js` (`T`, `TN`, `cn`, `catKey`, `dl`, `wdl`, `mon`, `monl`), `format.js` (`f0`, `f2`, `kfmt`, `r2`, currencies), `dates.js`, `constants.js`.
- `data/`: `storage.js` (localStorage and the claude.ai db, `savePlan`, `saveTx`, `ensureTx`), `clean.js` (`blank`, `cleanPlan`, `cleanTx`, `upgrade`), `backup.js`.
- `model/`: `schedule.js` (`occ`, `build`, `evs`, bills to enter), `project.js` (balance projection, transfer tips), `holidays.js`, `accounts.js`, `hsa.js`, `debt.js`, `transfers.js` (`moveMoney`), `spending.js`.
- `import/`: `parse.js` (amounts, dates, CSV layout, AI rows; pure), `dialog.js` (the Import dialog). `ai/`: `caps.js` (`sampleCaps`), `facts.js` (`spendingFacts`, the Ask rules).
- `ui/`: `render.js` (`render`, `paint`, `paintSoon`, `project`, `VIEWS`), `dialog.js` (`openForm`, `ask`), `forms.js` (the add/edit forms), `chrome.js`, `toast.js`. `views/`: one file per tab, plus `shared.js` (calendar, budget table, transfer tips, small parts) and `quicklog.js`.
- `i18n/ru.js`: the Russian dictionary.

## Rules for changes
- Every `claude.use(...)` call must keep working when it resolves `null` or `window.claude` is missing. The desktop app depends on that.
- Don't break saved data: the localStorage prefix is `budgeter:`, backups are `{app:'budgeter',version:2,plan,tx}`, and restore also accepts the old `monthly-planner` v1 backups. Put schema changes in `upgrade(p)`, which runs on load and on restore.
- Saved data is untrusted (backups can come from anywhere): `upgrade()` runs `cleanPlan()` and every loaded month goes through `cleanTx()`, which force ids, dates and numbers into shape. New fields need a line there, and in the typedefs in `types.js`.
- Build HTML with the `html` tagged template: every `${value}` is escaped, in text and attributes, ids included; arrays are joined; `null`/`undefined`/`false` print nothing. Nested `html` results and `raw()` go in unescaped, so never `raw()` anything that came from data. A string literal holding markup (`' step="any"'`) gets escaped: write it as html`…`. Translations that contain markup, or take markup as a value, use `TH()` instead of `T()`. `CSS.escape` ids in selectors.
- Shared mutable state lives on `state` (`state.plan`, `state.tx`, `state.view`, `state.tab`, `state.TODAY`, `state.now`, `state.LANG`, the Spending filters): modules can't reassign each other's variables. A module's own `let` is fine when only that module assigns it.
- A new button or field action goes in `CLICK` or `CHANGE` in `events.js`, keyed by its `data-act`.
- Languages: English and Russian. Write every piece of interface text in English inside `T('…')` (placeholders `{name}`, plurals with `TN(n,'one','other')`), and add its Russian to `src/i18n/ru.js`; a missing entry shows the English, and `npm run i18n:check` fails on it. Text in the static HTML uses `data-t`/`data-ta`. Dates go through `dl`/`wdl`/`mon`/`monl`. Built-in category names are saved in English and shown with `cn()`; `catKey()` maps a translated name back. Prompts to the AI stay in English (`askRules()` adds the answer language). The language is a per-device setting (`ui.lang` in localStorage), not part of the plan.
- Show money only through `f0`/`f2`/`kfmt`: they use the plan's currency and number format (`plan.currency`, `plan.numfmt`, set with the Currency button). Amounts are never converted.
- Business days (transfer reminders) use `holidays(y)`: the US Federal Reserve calendar or Swedish bank holidays (Easter-based ones computed, plus Midsummer, Christmas and New Year's Eves). `plan.holidays` is `''` (follow the currency: SEK means Sweden), `'us'` or `'se'`.
- Maps keyed by names people type (merchants, categories, tags) are `dict()` (no prototype).
- Account balances are what's there now, and the projection starts from them. A transfer (`moveMoney`) changes both balances (an investment's buying power, a debt's amount owed and a card's statement) and keeps each account's `upd` date. It returns an undo.
- Load months with `ensureTx(m)` (shared promise per month, so concurrent loads can't overwrite each other). `state.TODAY`/`state.now` move forward via `newDay()`.
- After a field's `change`, call `paintSoon()`, not `paint()`, so focus and clicks survive the repaint.
- Keep the light/dark tokens on `:root` and the phone layout (≤640px) working.
- Don't trust a small model with signs or arithmetic: the AI copies amounts as printed and the app sets the sign (`fromClaude`); for questions the app computes every total in `spendingFacts()` and the AI only explains them.

## Run
- Build: `npm run build` → `dist/index.html` and `dist/fonts/`. `npm start`, `npm test` and `npm run e2e` build first.
- Unit tests: `npm test` (node:test). `test/logic.test.mjs` imports the pure modules straight from `src/` and sets `state.plan`/`state.tx`/`state.LANG` itself. Modules a test imports must not touch `window` or `document` when they load (only inside functions).
- End-to-end: `npm run e2e` runs the real desktop app (`test/e2e/harness.js` loads `main.js`) with a temporary userData, the local AI pointed at a closed port, a fixed date (18 Nov 2026, New York) and the plan in `test/e2e/fixture.json` loaded through Restore from backup. It walks every tab and the main dialogs in English and Russian, scans the Russian screens for English, and tests a transfer (tip, Record transfer, card statement, Undo). It fails on console errors, exceptions and network requests. Each screen's visible text and DOM are compared with `test/e2e/golden/{en,ru}.{txt,html}`; after an intended change to what the app shows, rewrite them with `UPDATE_GOLDEN=1 npm run e2e` and check the diff.
- Translations: `npm run i18n:check` lists interface text with no Russian (and fails) and Russian entries no longer used. Types: `npm run typecheck` (`tsc` with `checkJs`, `jsconfig.json`; no compile step).
- Browser preview: the `budgeter` config in `.claude/launch.json` serves `dist/` on port 8765 (localStorage-only mode, same as desktop). Build first.
- Desktop dev: `npm start`. Install or update the Mac app: `bash install.sh` (builds the page, then the app with electron-builder into `release/`, and copies it to /Applications).
- Web: `npm run build`, then republish `dist/index.html` to the artifact URL above, without changing its capabilities (`db`, `downloads`, `sample`, `user`), and with the fonts as supporting files: `files` maps each `fonts/<name>.woff2` to `dist/fonts/<name>.woff2`.
- When running Electron from the VS Code terminal, unset `ELECTRON_RUN_AS_NODE` (`env -u ELECTRON_RUN_AS_NODE npm start`), or it starts as plain Node.

## History
Monthly planner (https://claude.ai/artifact/92K1s89g3tRGJrnNWMTiHD) is the v1 ancestor. The first git commit is the old desktop build of it.
