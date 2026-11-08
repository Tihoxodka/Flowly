import {pad} from './core/util.js';
const today0=new Date();
/**
 * What the app changes as it runs, in one object, since modules can't reassign each other's variables.
 * LANG: the interface language. now/TODAY: today; newDay() moves them on. plan: the saved plan. tx: logged
 * transactions by month ('2026-11'). view: the month shown. tab: the open tab. fq/fcat/ftag: Spending tab filters.
 * @type {{LANG:string,now:Date,TODAY:string,plan:Plan,tx:Record<string,TxMonth>,view:{y:number,m:number},tab:string,fq:string,fcat:string,ftag:string}}
 */
export const state={LANG:'en',now:today0,TODAY:`${today0.getFullYear()}-${pad(today0.getMonth()+1)}-${pad(today0.getDate())}`,
  plan:null,tx:{},view:{y:today0.getFullYear(),m:today0.getMonth()},tab:'overview',fq:'',fcat:'',ftag:''};
