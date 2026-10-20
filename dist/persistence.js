import {modelFor,normalizeCostModel,LEGACY_COST_MODEL} from './costs.js?v=preview-v12';
import {defaultIndicatorSettings,normalizeIndicatorSettings} from './indicators.js?v=preview-v12';
import {createScenario,assetClassFor} from './scenario.js?v=preview-v12';
import {fresh,decide} from './engine.js?v=preview-v12';
export const SAVE_KEY='market-replay-save-v1', BACKUP_KEY='market-replay-previous-v1';
export async function datasetVersion(data){const bytes=new TextEncoder().encode(JSON.stringify(data));const digest=await crypto.subtle.digest('SHA-256',bytes);return 'sha256:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
const fail=message=>{throw Error(message)};
function str(v,max,label){if(typeof v!=='string'||v.length>max)fail(`${label}格式不正確`);return v;}
function extras(x={}){return {side:['buy','sell','hold'].includes(x.side)?x.side:fail('委託模式格式不正確'),quantity:str(x.quantity,30,'數量草稿'),reason:str(x.reason,1000,'理由'),studentName:str(x.studentName,100,'姓名'),studentId:str(x.studentId,100,'學號'),notes:str(x.notes,10000,'操作筆記'),reflection:str(x.reflection,10000,'反思')};}
export const emptyDraft=()=>({side:'hold',quantity:'100',reason:'',studentName:'',studentId:'',notes:'',reflection:''});
export function makeSave(s,state,version,draft=emptyDraft(),createdAt=new Date().toISOString()){
 return {format:'market-replay-save',version:3,datasetVersion:version,createdAt,updatedAt:new Date().toISOString(),scenario:{assetClass:s.assetClass??'etf',costModel:modelFor(s),seed:s.seed,startDate:s.startDate,requestedStartDate:s.requestedStartDate??null,startYear:s.startYear,length:s.length,warmup:s.warmup,...(s.taxRecalculation?{taxRecalculation:structuredClone(s.taxRecalculation)}:{}),blind:s.blind??{revealed:true,everRevealed:true,revealedAtStep:0},indicatorSettings:s.indicatorSettings??defaultIndicatorSettings(),indicatorHistory:s.indicatorHistory??[{step:0,settings:defaultIndicatorSettings()}]},state,draft:extras(draft)};
}
export function restoreSave(raw,data,version){
 if(typeof raw!=='string'||raw.length>2000000)fail('存檔過大或格式不正確');
 let x;try{x=JSON.parse(raw)}catch{fail('存檔 JSON 損壞，已保留原檔')}
 if(!x||x.format!=='market-replay-save'||![1,2,3].includes(x.version))fail('不支援此存檔版本，已保留原檔');
 if(x.datasetVersion!==version)fail('歷史資料版本不同，無法安全續玩；已保留原檔');
 const p=x.scenario;if(!p||![20,40,60,120].includes(p.length)||typeof p.startDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.startDate)||typeof p.startYear!=='string'||!/^all$|^\d{4}$/.test(p.startYear))fail('回合設定損壞');
 str(p.seed,200,'種子');
 for(const key of ['createdAt','updatedAt'])if(typeof x[key]!=='string'||!Number.isFinite(Date.parse(x[key])))fail('存檔時間格式不正確');
 if(p.requestedStartDate!==null&&p.requestedStartDate!==p.startDate)fail('指定開始日設定損壞');
 if(x.version>=2&&(!Number.isInteger(p.warmup)||p.warmup<40||p.warmup>500))fail('暖機設定損壞');
 if(x.version===3&&!p.costModel)fail('存檔缺少交易成本模型');if(x.version===3&&p.costModel.version===LEGACY_COST_MODEL.version&&p.costModel.feeRate!==LEGACY_COST_MODEL.feeRate)fail('舊版存檔成本模型須維持 0.1% 手續費率');const costModel=x.version<=2?{...LEGACY_COST_MODEL}:normalizeCostModel(p.costModel);if(['tw-equity-v2','tw-legacy-tax-v1'].includes(costModel.version)&&(costModel.assetClass!==assetClassFor(data)||p.assetClass!==undefined&&p.assetClass!==assetClassFor(data)))fail('存檔商品類型與歷史資料不一致');const s=createScenario(data,{...p,warmup:p.warmup??40,costModel});s.datasetVersion=version;s.requestedStartDate=p.requestedStartDate;let state=fresh(s);
 if(!x.state||!Array.isArray(x.state.journal)||x.state.journal.length>p.length)fail('交易紀錄損壞');
 for(const j of x.state.journal){if(!j||!['buy','sell','hold'].includes(j.side)||!Number.isSafeInteger(j.requestedQuantity)||j.requestedQuantity<0)fail('交易紀錄損壞');str(j.reason,1000,'理由');state=decide(s,state,j.side,j.requestedQuantity,j.reason);}
 // Rebuild all accounting and then-visible news from original data; never trust imported totals.
 if(JSON.stringify(state)!==JSON.stringify(x.state))fail('交易紀錄或資產校驗失敗，已保留原檔');
 if(x.version===1){s.blind={revealed:true,everRevealed:true,revealedAtStep:0,legacy:true};s.indicatorSettings=defaultIndicatorSettings();s.indicatorHistory=[{step:0,settings:structuredClone(s.indicatorSettings),legacy:true}];}
 else {const b=p.blind;if(!b||typeof b.revealed!=='boolean'||typeof b.everRevealed!=='boolean'||b.revealed!==b.everRevealed||!(b.revealedAtStep===null||Number.isInteger(b.revealedAtStep)&&b.revealedAtStep>=0&&b.revealedAtStep<=state.journal.length)||b.revealed&&b.revealedAtStep===null||!b.revealed&&b.revealedAtStep!==null)fail('揭露紀錄損壞');s.blind={...b};s.indicatorSettings=normalizeIndicatorSettings(p.indicatorSettings);const h=p.indicatorHistory;if(!Array.isArray(h)||!h.length||h.length>10000||h[0].step!==0)fail('指標紀錄損壞');let step=0;s.indicatorHistory=h.map(entry=>{if(!Number.isInteger(entry.step)||entry.step<step||entry.step>state.journal.length)fail('指標生效日損壞');step=entry.step;return {...entry,settings:normalizeIndicatorSettings(entry.settings)};});if(JSON.stringify(s.indicatorSettings)!==JSON.stringify(s.indicatorHistory.at(-1).settings))fail('指標設定與紀錄不一致');}
 if(costModel.version==='tw-legacy-tax-v1'){
  const t=p.taxRecalculation;
  if(!t||t.kind!=='add-sell-tax'||t.sourceDatasetVersion!==version||!Number.isInteger(t.sourceDecisionCount)||t.sourceDecisionCount<0||t.sourceDecisionCount>state.journal.length||!Number.isFinite(Date.parse(t.recalculatedAt))||JSON.stringify(normalizeCostModel(t.sourceCostModel))!==JSON.stringify(LEGACY_COST_MODEL))fail('補稅副本的來源說明不完整');
  str(t.sourcePracticeId,200,'來源練習識別');str(t.sourcePracticeName,100,'來源練習名稱');
  s.taxRecalculation=structuredClone(t);
 }else if(p.taxRecalculation)fail('補稅說明與費用設定不一致');
 return {s,state,draft:extras(x.draft),createdAt:x.createdAt};
}
export function createStore(storage){
 let expected,blocked=false;
 return {
  read(){try{expected=storage.getItem(SAVE_KEY);return expected}catch(e){blocked=true;throw Error('瀏覽器無法讀取本機存檔；請使用 JSON 備份')}} ,
  lock(){blocked=true},
  write(save,{replace=false}={}){if(blocked&&!replace)fail('原存檔已保護，請先備份並明確開始新局或載入備份');
   try{const current=storage.getItem(SAVE_KEY);if(current!==expected) {blocked=true;fail('另一分頁已更新存檔；請備份目前進度後重新整理，避免互相覆蓋')}
    if(replace&&current!==null)storage.setItem(BACKUP_KEY,current);
    const raw=JSON.stringify(save);storage.setItem(SAVE_KEY,raw);expected=raw;blocked=false;return save.updatedAt;
   }catch(e){if(/另一分頁/.test(e.message))throw e;throw Error('本機保存失敗（空間不足或瀏覽器限制）；舊存檔未覆蓋，請立即匯出 JSON 備份')}
  },
  raw(){return expected},
  previous(){return storage.getItem(BACKUP_KEY)}
 };
}
