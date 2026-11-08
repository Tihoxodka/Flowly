# Budgeter

A monthly budget planner that keeps your data on your own computer. No account, no sync, no ads.

| | |
|---|---|
| **Overview** | Income − bills − goals = spending money, what's left per day, a calendar of money in and out, projected balances, and a warning before a bill would overdraw an account |
| **Bills and income** | Any schedule, including variable bills: enter the amount when the bill arrives |
| **Spending** | Quick logging, bank CSV import, category rules, tags, budgets per category |
| **Accounts** | Checking, savings, cards, loans, investments, retirement and HSA, with transfers between them |
| **Planning** | Debt payoff (avalanche or snowball), trends by category, net worth over time |
| **Local AI** *(optional, Mac)* | Reads PDF statements and screenshots, answers questions about your spending, all on your Mac |

English or Russian; US dollars, euros, Scandinavian kronor and a few other currencies.

## Install

**Mac app** (Apple Silicon; Intel should work):
```
git clone https://github.com/ReckingBallResearch/Budgeter.git
cd Budgeter
bash install.sh
```
It installs Node.js if needed, builds the app, signs it on your Mac and puts it in /Applications. To update: `git pull`, then `bash install.sh` again. Your data is kept.

**Browser** (any computer, needs [Node.js](https://nodejs.org) 22+ once):
```
npm install
npm run build
```
Then open `dist/index.html`. Data stays in that browser, so use the same one each time. No AI features here.

## Local AI (optional)
1. Install [Ollama](https://ollama.com) and open it.
2. Run `ollama pull gemma4:12b` (about 8 GB, for Macs with 16 GB of memory). On an 8 GB Mac use `gemma3:4b` instead.
3. Open **Spending → Import statement**: it should say the local AI is ready.

You check every transaction before it's imported, and the app does all the math itself. The AI only reads statements and explains the numbers. For scanned PDFs, import screenshots of the pages instead.

## Your data
- **Back up** with **Download backup** at the bottom of the page. **Restore from backup** also moves data between the browser and the Mac app.
- Nothing is sent anywhere. The Mac app blocks all network requests from the page; its only connection is to Ollama on your Mac.
- Data is stored unencrypted (on the Mac, in `~/Library/Application Support/Budgeter`). Turn on FileVault, and only restore backups you made yourself.

## Development
Plain JavaScript modules in `src/`, bundled by esbuild into one page, `dist/index.html`. The Electron wrapper is `main.js`.

```
npm start             # build and run the desktop app
npm test              # unit tests
npm run e2e           # end-to-end tests against saved snapshots of every screen
npm run i18n:check    # interface text missing from the Russian dictionary
npm run typecheck     # JSDoc type check
```

See [CLAUDE.md](CLAUDE.md) for how the pieces fit together. The installer is Mac-only; `npm start` may also work on Windows and Linux, but that isn't tested.

## License
[MIT](LICENSE)
