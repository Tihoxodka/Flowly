# Budgeter

A monthly budget planner that keeps your data on your own computer. No account, no sync, no ads.

- **Overview:** income − bills − goals = spending money for the month, what's left to spend per day, a calendar of money in and out, and projected account balances. It warns you when a bill would overdraw an account and when to move money, and records the transfer in one step.
- **Bills and income** on any schedule (weekly, every 2 weeks, twice a month, monthly, yearly…), including variable bills like energy and water: enter each month's amount when the bill arrives.
- **Spending:** quick logging, CSV import from your bank, category rules, tags, and budgets per category (drag to reorder).
- **Accounts:** checking, savings, credit cards (statement and due-date tracking), loans, investments, retirement and HSA (contributions, employer match, debit card spending, yearly IRS limit). **Transfer between accounts** moves money in one step: both balances change, and a payment to a card or loan lowers what's owed.
- **Debt payoff planner** (avalanche or snowball), **trends** by category, and **net worth** over time.
- **Optional local AI** on the Mac app: read PDF statements and screenshots, and ask questions about your spending. It runs on your Mac through [Ollama](https://ollama.com), so nothing leaves your computer.

The app is in English or Russian, and amounts can be shown in US dollars, euros, Swedish, Norwegian or Danish kronor and a few other currencies (**Language and currency** at the bottom of the page).

## Two ways to use it

### 1. In your browser (any computer)
The page is built from the source in `src/`, so you need [Node.js](https://nodejs.org) 22 or newer once. Download this repo (**Code → Download ZIP**) and unzip it, then in a terminal in that folder:
```
npm install
npm run build
```
Open `dist/index.html` in Chrome, Safari, Firefox or Edge. You can copy the `dist` folder anywhere; it doesn't need Node to run.

Your data is saved in that browser on that computer. Use the same browser each time, and don't clear its site data. The AI features aren't available in the browser version.

### 2. Mac app
Built and tested on Apple Silicon Macs; Intel Macs should work too. In Terminal:
```
git clone https://github.com/ReckingBallResearch/Budgeter.git
cd Budgeter
bash install.sh
```
It installs Node.js if you don't have it (you'll be asked for your Mac password), builds the app, puts it in /Applications and opens it. The first build takes a few minutes. To update later, run `git pull` and then `bash install.sh` again. Your data is kept.

The app is built and signed on your own Mac, so macOS doesn't show the "unidentified developer" warning.

## Optional: local AI (Mac app)
Reading PDF statements and screenshots, and the **Ask about your spending** panel on the Trends tab, use a small AI model running on your Mac. Everything else works without it.

1. Install [Ollama](https://ollama.com) and open it.
2. In Terminal, download the model (about 8 GB):
   ```
   ollama pull gemma4:12b
   ```
3. In Budgeter, open **Spending → Import statement**. It should say the local AI is ready.

It needs a Mac with 16 GB of memory or more. On an 8 GB Mac, use the smaller `gemma3:4b` instead (`ollama pull gemma3:4b`, about 3.4 GB): Budgeter uses `gemma4:12b` when it's installed and `gemma3:4b` otherwise. On an M4, a one-page statement or a screenshot takes about 5 seconds, a little longer the first time while the model loads. Small models make mistakes, so you check every transaction before it's imported (with a **Flip them** link if money in and out come out backwards), and for spending questions the app does all the math while the AI only explains it. Scanned PDFs are pictures with no text in them; take screenshots of their pages instead.

## Your data
- **Back up regularly:** **Download backup** at the bottom of the page saves everything to a file. **Restore from backup** loads it, including into the other version (browser ↔ Mac app).
- The Mac app keeps its data in `~/Library/Application Support/Budgeter`.
- Nothing is sent anywhere. Fonts ship with the app, and the Mac app blocks the page from making any network requests at all. The only connection it makes is to Ollama on your own Mac, if you set it up.
- Your data and backups are stored as plain files, not encrypted. Turn on FileVault (System Settings → Privacy & Security) so they're encrypted on disk, and keep backup files somewhere private.
- Only restore backups you made yourself. A backup is checked and cleaned before it's loaded, but it replaces your plan.

## Other systems
The installer is Mac-only. On Windows or Linux, use the browser version. If you're comfortable with Node.js, `npm install` and `npm start` should also run the desktop app there, but that isn't tested.

## Development
The app is plain JavaScript (no framework) in ES modules under `src/`, with its fonts in `app/fonts`. `npm run build` bundles it with esbuild into one page, `dist/index.html` (not minified). `main.js` and `preload.js` are the Electron wrapper and the local AI bridge; `pdf-worker.js` reads PDF text in a separate process.

- `npm start`: build and run the desktop app.
- `npm test`: unit tests. `npm run e2e`: end-to-end tests in the desktop app, compared with saved snapshots of every screen.
- `npm run i18n:check`: interface text missing from the Russian dictionary. `npm run typecheck`: JSDoc type check.

See `CLAUDE.md` for how the pieces fit together.

## License
[MIT](LICENSE)
