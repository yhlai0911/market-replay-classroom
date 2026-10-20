import {fresh,decide,wealth,benchmark} from './engine.js?v=preview-v11';
import {resolveCostModel,transactionCosts,modelFor,LEGACY_COST_MODEL,TAX_CORRECTION_COST_VERSION} from './costs.js?v=preview-v11';
import {assetClassFor} from './scenario.js?v=preview-v11';

export function makeTaxCorrectionModel(s){
  const original=modelFor(s);
  if(original.version!==LEGACY_COST_MODEL.version||original.feeRate!==.001||original.sellTaxRate!==0)throw Error('只有原 0.1% 手續費、尚未計入證交稅的舊局可以建立補稅副本');
  const assetClass=assetClassFor({assetClass:s.assetClass??s.costModel?.assetClass,instrument:s.asset});
  return resolveCostModel({version:TAX_CORRECTION_COST_VERSION,assetClass},assetClass);
}
function snapshot(s,state) {
  const fees=state.fees??0,taxes=state.taxes??0;
  return {fees,taxes,totalCosts:fees+taxes,cash:state.cash,shares:state.shares,wealth:wealth(s,state),benchmark:benchmark(s,state)};
}
function conflict(decisionNumber,entry,availableCash,reason,extra={}) {
  return {ok:false,conflict:{decisionNumber,side:entry?.side??'hold',quantity:entry?.requestedQuantity??0,reason,availableCash,decisionReason:entry?.reason??'',...extra}};
}
function requiredCash(s,state,entry,opening=false) {
  const round=s.rounds[state.index];
  try {return Math.max(0,-transactionCosts(s,entry.side,entry.requestedQuantity,opening?round.executionPrice:round.price).cashFlow);}
  catch {return undefined;}
}
/** Reprice an existing, validated decision history without changing its trades or the original inputs.
 * Failure intentionally exposes no partially replayed state: the caller must never save a changed path.
 * decisionNumber 0 identifies invalid scenario/model input before the first decision.
 */
export function replayWithCosts(s,oldState,newCostModel) {
  let nextScenario,state;
  try {
    if(!s||!oldState||!Array.isArray(oldState.journal))throw Error('原練習或決策紀錄格式不正確');
    const correction=makeTaxCorrectionModel(s),assetClass=correction.assetClass;
    const model=resolveCostModel(newCostModel===undefined?correction:newCostModel,assetClass);
    if(model.version!==TAX_CORRECTION_COST_VERSION)throw Error('補稅副本只能補算證交稅，不能改動原手續費模型');
    nextScenario=structuredClone(s);nextScenario.assetClass=assetClass;nextScenario.costModel=model;nextScenario.feeRate=model.feeRate;
    state=fresh(nextScenario);
  } catch(error) {return conflict(0,null,s?.initialCash??0,error.message);}
  const entries=structuredClone(oldState.journal);
  for(let index=0;index<entries.length;index++) {
    const entry=entries[index],decisionNumber=index+1;
    if(!entry||!['buy','sell','hold'].includes(entry.side)||!Number.isSafeInteger(entry.requestedQuantity)||entry.requestedQuantity<0||typeof entry.reason!=='string'||!['filled','held','cancelled'].includes(entry.status)||!Number.isSafeInteger(entry.quantity)||entry.quantity<0) {
      return conflict(decisionNumber,entry,state.cash,'原決策紀錄不完整，無法安全重算');
    }
    const availableCash=state.cash,estimated=requiredCash(nextScenario,state,entry);
    let next;
    try {next=decide(nextScenario,state,entry.side,entry.requestedQuantity,entry.reason);}
    catch(error) {return conflict(decisionNumber,entry,availableCash,error.message,estimated===undefined?{}:{requiredCash:estimated});}
    const actual=next.journal.at(-1);
    if(actual.status!==entry.status||actual.quantity!==entry.quantity) {
      const needed=requiredCash(nextScenario,state,entry,true);
      const reason=actual.status==='cancelled'&&entry.status!=='cancelled'
        ?'新費稅使開盤可用現金不足，原本成交的委託會變成取消；已停止重算'
        :'新費稅會改變原委託的成交／取消結果或成交單位；已停止重算';
      return conflict(decisionNumber,entry,availableCash,reason,{...(needed===undefined?{}:{requiredCash:needed}),expectedStatus:entry.status,actualStatus:actual.status,expectedQuantity:entry.quantity,actualQuantity:actual.quantity});
    }
    if(!Number.isFinite(next.cash)||next.cash<0) return conflict(decisionNumber,entry,availableCash,'重算後現金不足或金額無效，已停止重算');
    state=next;
  }
  try {
    const before=snapshot(s,oldState),after=snapshot(nextScenario,state);
    const delta=Object.fromEntries(Object.keys(before).map(key=>[key,after[key]-before[key]]));
    return {ok:true,s:nextScenario,state,comparison:{before,after,delta}};
  } catch(error) {return conflict(entries.length,entries.at(-1),state.cash,`無法安全比較原練習與副本：${error.message}`);}
}
