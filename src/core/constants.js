/* Choices saved in the plan by their first value; the second is the English label, shown with T() */
/** how often an income, bill or contribution repeats */
export const FREQS=[['monthly','Monthly'],['semi','Twice a month'],['biweekly','Every 2 weeks'],['weekly','Weekly'],['quarterly','Every 3 months'],
  ['semiannual','Every 6 months'],['yearly','Yearly'],['once','One time']];
/** kinds of account */
export const TYPES=[['checking','Checking account'],['savings','Savings account'],['cash','Cash'],['investment','Investment'],
  ['retirement','Retirement (401k, IRA)'],['hsa','HSA (health savings account)'],['property','Vehicle or property'],['credit','Credit card'],['loan','Loan']];
/** the categories a new plan starts with (saved in English, shown with cn()) */
export const DEFAULT_CATS=['Housing','Utilities','Groceries','Take Out','Dining & Bars','Transport','Insurance','Subscriptions','Health','Shopping',
  'Entertainment','Travel','Savings','Other'];
/** categories every plan has */
export const RESERVED=['Bill payment','Transfer','Income','Uncategorized'];
/** categories that aren't spending: logged, but not counted against budgets */
export const NOSPEND=['Bill payment','Transfer','Income'];
/** how many times a year each schedule repeats */
export const PER={weekly:52,biweekly:26,semi:24,monthly:12,quarterly:4,semiannual:2,yearly:1,once:1};
