/* The shapes of the app's data, for type checking in the editor and with npm run typecheck (jsconfig.json).
   This file has no running code and isn't bundled; with no imports or exports, its types can be used in every file.
   Saved data comes from backups too, so cleanPlan() and cleanTx() force it into these shapes on load. */

/**
 * The saved plan (localStorage budgeter:plan, and data/users/<id>/plan on claude.ai).
 * @typedef {object} Plan
 * @property {number} v schema version (2)
 * @property {string} currency a code from CURRENCIES; amounts are never converted
 * @property {string} numfmt a locale from NUMFMTS, or '' for the currency's own
 * @property {''|'us'|'se'} holidays bank holidays for business days; '' follows the currency (SEK means Sweden)
 * @property {Item[]} income
 * @property {Item[]} bills
 * @property {Account[]} accounts
 * @property {Goal[]} goals
 * @property {Cat[]} cats budget categories, in the order shown
 * @property {string} rules category rules, one "keyword = Category" per line
 * @property {Record<string,1>} done event keys checked off as done
 * @property {Record<string,number>} actual event key → the actual amount (or a variable bill's amount due)
 * @property {Record<string,{f:'bal'|'cash',v:number}>} applied dividend amounts already added to an account, so a change can undo them
 * @property {Record<string,string>} [payOn] event key → a moved pay date
 * @property {boolean} showPlanned count planned (what-if) bills
 * @property {boolean} interestIn count interest and dividends as income
 * @property {string} kickoff the day budgeting starts ('' for none)
 * @property {boolean} kickDone the kickoff balances were confirmed
 * @property {Record<string,{a:number,d:number,dt:string}>} nw net worth snapshots by month: assets, debts, date
 * @property {Record<string,Merchant>} merch merchants by lowercased name (a dict(): no prototype)
 * @property {number} extra extra debt payment each month
 * @property {'avalanche'|'snowball'} strategy debt payoff order
 */

/**
 * An income source or a bill.
 * @typedef {object} Item
 * @property {string} id
 * @property {string} name
 * @property {number} amt the amount, or the estimate when it varies
 * @property {string} freq a FREQS value
 * @property {string} date the first (or any) date on the schedule
 * @property {number} [day2] the second day of the month, twice a month
 * @property {string} [end] the last date
 * @property {string} [acct] the account it's paid from or into
 * @property {string} [to] a loan it pays down (bills)
 * @property {string} [cat] category (bills)
 * @property {boolean} [variable] the amount varies
 * @property {string} [basis] notes on the estimate
 * @property {string} [conf] what an income estimate means: floor, avg or target
 * @property {number} [issue] days before the due date a variable bill comes out
 * @property {boolean} [auto] autopay is on
 * @property {boolean} [planned] a what-if bill
 */

/**
 * An account. bal is what's there now: the value of an investment or property, what's owed on a card or loan.
 * @typedef {object} Account
 * @property {string} id
 * @property {string} name
 * @property {string} type a TYPES value
 * @property {number} bal
 * @property {string} [upd] the date bal was last recorded
 * @property {number} [updAt] when, as a timestamp (HSA card purchases logged after it count against the balance)
 * @property {number} [cash] an investment's buying power
 * @property {number} [apy] interest rate of a cash account, %
 * @property {number} [intday] the day interest is credited
 * @property {number} [divAmt] an investment's dividend per payment
 * @property {string} [divFreq] @property {string} [divDate] @property {'cash'|'reinvest'} [divMode]
 * @property {number} [contrib] your contribution per payment (retirement, HSA)
 * @property {number} [match] your employer's
 * @property {string} [cfreq] @property {string} [cdate] @property {number} [cday2] @property {string} [cfrom] where your contribution comes from ('' for payroll)
 * @property {number} [ret] expected annual return, %
 * @property {'self'|'family'} [cover] HSA coverage @property {boolean} [age55] @property {number} [ytd] HSA contributions this year @property {string} [ytdOn]
 * @property {number} [limit] credit limit
 * @property {number} [dueDay] a card's fixed due day @property {string} [duedate] its next due date
 * @property {number} [stmt] a card's statement balance, due on duedate
 * @property {number} [typ] a card's typical monthly payment
 * @property {string} [payfrom] the account a card's statement is paid from
 * @property {number} [apr] interest rate of a card or loan, %
 * @property {number} [min] monthly payment of a loan (minimum for a card)
 * @property {number} [lead] days before the due date it's usually paid
 * @property {string} [note]
 */

/** @typedef {{id:string,name:string,kind:'short'|'long',target:number,saved:number,date?:string,acct?:string}} Goal */
/** @typedef {{name:string,budget:number}} Cat */
/** @typedef {{desc:string,cat:string,tag:string,acct:string}} Merchant what was last used for a merchant */

/**
 * A logged transaction. Spending is negative.
 * @typedef {object} Tx
 * @property {string} id
 * @property {string} date
 * @property {string} desc
 * @property {number} amt
 * @property {string} cat
 * @property {string} acct
 * @property {string} tag
 * @property {number} [at] when it was logged
 */
/** One month of transactions (localStorage budgeter:tx-YYYY-MM) @typedef {{items:Tx[]}} TxMonth */

/**
 * A backup file. Restore also accepts the old Monthly planner's (app 'monthly-planner', version 1).
 * @typedef {{app:'budgeter',version:2,exported:string,plan:Plan,tx:Record<string,TxMonth>}} Backup
 */

/**
 * One scheduled event in a month, built from the plan (see build()).
 * @typedef {object} Ev
 * @property {'in'|'out'|'save'} t money in, out, or saved inside an account (contributions)
 * @property {string} id the item's id, or c-/int-/div-/k-/m- plus an account id
 * @property {string} name
 * @property {number} amt the actual amount if recorded, else the estimate
 * @property {number} est the estimate
 * @property {boolean} variable @property {boolean} hasActual
 * @property {string} date when it happens (a payment's pay date)
 * @property {string} key 't:id:date', the key in plan.done, plan.actual and plan.payOn
 * @property {string} [acct] @property {string} [cat] @property {string} [to]
 * @property {boolean} [bill] @property {boolean} [planned] @property {string} [card] a card's statement payment
 * @property {boolean} [guess] a card payment estimated from charges
 * @property {boolean} [interest] @property {boolean} [dividend] @property {'cash'|'reinvest'} [mode] @property {boolean} [passive]
 * @property {boolean} [contrib] @property {boolean} [hsa]
 * @property {boolean} [pay] a payment to a card or loan, which can move @property {string} [due] its due date
 * @property {string} [payAcct] @property {boolean} [moved]
 * @property {number} [after] the account's projected balance after it @property {boolean} [debt] @property {number} [short] how much it overdraws
 */

/** When each debt is paid off (month index by account id), the interest paid, and the last month; see sim() @typedef {{done:Record<string,number>,interest:number,last:number}} Payoff */

/**
 * A warning that an account would go below zero: move money in by the deadline.
 * @typedef {{acct:string,amount:number,date:string,name:string,key:string,late:boolean,deadline:string}} Tip
 */

/**
 * What the AI can do here (see sampleCaps()): Claude on claude.ai, or the local model in the Mac app.
 * @typedef {object} AiCaps
 * @property {{json:(prompt:string,o?:object)=>Promise<any>}|null} s reads transactions as JSON
 * @property {{maxCount:number,maxInputBytes:number,mediaTypes:string[]}|null} img screenshots it can read
 * @property {(messages:{role:string,content:string}[],onText:(t:string)=>void)=>{stop:()=>void,done:Promise<string>}} [chat]
 * @property {boolean} [desktop] the Mac app @property {boolean} [local] the local model is ready @property {boolean} [pdf]
 * @property {number} [chunk] how much statement text fits in one request
 * @property {'off'|'model'} [why] why the local AI isn't ready
 */

/**
 * @typedef {object} Field one field of a form
 * @property {string} k the key in the values
 * @property {string} [l] label (English, translated when shown)
 * @property {'text'|'number'|'date'|'select'|'checkbox'|'textarea'} [t] type; text if left out
 * @property {[unknown,string][]} [opts] a select's [value, label] choices
 * @property {string} [ph] placeholder
 * @property {string} [help] a note under the field
 * @property {string[]} [list] suggestions for a text field
 * @property {boolean|number|((o:object)=>boolean)} [req] required (or when)
 * @property {(o:object)=>boolean} [show] shown only when this is true for the current values
 */

/* Globals the page may find. Declared here only for the type checker; the page checks that they exist before use. */
/** claude.ai's artifact runtime: claude.use('db'|'user'|'downloads'|'sample') resolves a capability or null @type {any} */
var claude;
/** the Mac app's bridge to the local AI and the PDF reader (preload.js) @type {any} */
var flowlyDesktop;
