import {fresh, decide, wealth, benchmark, mark} from './engine.js?v=preview-v15';

const percentage = (part, whole) => whole > 0 ? part / whole * 100 : 0;
const returnPercent = (value, initial) => percentage(value - initial, initial);

/**
 * Pure, as-of performance facts rebuilt from completed decisions.
 *
 * Point series contain the initial cash balance and completed closes only.
 * Returns and exposures are percentages. Point drawdowns are non-positive
 * percentages; maximum drawdowns are their positive magnitudes. Turnover is
 * gross filled notional / initial capital, with turnoverPercent also provided.
 * Mean exposure is the arithmetic mean of completed-close holding value /
 * equity, excluding the initial cash-only point. No hypothetical liquidation,
 * dividend reinvestment, terminal liquidation or trade win rate is introduced.
 * Risk estimates below use daily total equity, including uninvested cash and rights.
 */
export function performanceModel(s, state) {
  if (!Array.isArray(state?.journal) || state.journal.length > s.rounds.length) {
    throw Error('無法計算績效：已完成決策紀錄格式不正確。');
  }
  const initialAssets = s.initialCash;
  const counts = {decisions:state.journal.length, fills:0, buys:0, sells:0, holds:0, cancelled:0};
  const points = [{
    index:0, date:null, at:null, equity:initialAssets, benchmark:initialAssets,
    portfolioReturn:0, benchmarkReturn:0, drawdown:0, benchmarkDrawdown:0,
    exposure:0, cash:initialAssets, shares:0, holdingValue:0, receivables:0,
  }];
  let replay = fresh(s), peak = initialAssets, benchmarkPeak = initialAssets;
  let maxDrawdown = 0, benchmarkMaxDrawdown = 0, grossNotional = 0;

  for (let i = 0; i < state.journal.length; i++) {
    const intent = state.journal[i], round = s.rounds[i];
    const priorReceivables = replay.receivable ?? 0;
    const priorClaimCount = replay.claims?.length ?? 0;
    replay = decide(s, replay, intent.side, intent.requestedQuantity ?? intent.quantity, intent.reason);
    const fill = replay.journal.at(-1);
    const equity = replay.equity.at(-1);
    const holdingValue = fill.shares * round.close;
    // decide settles claims after recording this close (at the next decision
    // cutoff). Keep close components before that settlement and next-day split.
    const receivables = priorReceivables + replay.claims.slice(priorClaimCount).reduce((sum, claim) => sum + claim.amount, 0);
    // A finished prefix marks THIS close. Using the live replay directly here
    // would use the next session's reference price and share-split basis.
    const closedScenario = {...s, rounds:s.rounds.slice(0, i + 1)};
    const base = benchmark(closedScenario, {...replay, index:i, finished:true});
    peak = Math.max(peak, equity);
    benchmarkPeak = Math.max(benchmarkPeak, base);
    const drawdown = percentage(equity - peak, peak);
    const benchmarkDrawdown = percentage(base - benchmarkPeak, benchmarkPeak);
    maxDrawdown = Math.max(maxDrawdown, -drawdown);
    benchmarkMaxDrawdown = Math.max(benchmarkMaxDrawdown, -benchmarkDrawdown);
    points.push({
      index:i + 1, date:round.at.slice(0, 10), at:round.closeAt ?? round.bar?.closeAt ?? null,
      equity, benchmark:base, portfolioReturn:returnPercent(equity, initialAssets),
      benchmarkReturn:returnPercent(base, initialAssets), drawdown, benchmarkDrawdown,
      exposure:percentage(holdingValue, equity), cash:fill.cash, shares:fill.shares,
      holdingValue, receivables,
    });
    if (fill.status === 'filled' && fill.quantity > 0) {
      counts.fills++;
      if (fill.side === 'buy') counts.buys++;
      if (fill.side === 'sell') counts.sells++;
      grossNotional += Math.abs(fill.quantity * fill.price);
    } else if (fill.status === 'cancelled') {
      counts.cancelled++;
    } else if (fill.side === 'hold') {
      counts.holds++;
    }
  }

  const currentAssets = wealth(s, replay), benchmarkAssets = benchmark(s, replay);
  const holdingValue = replay.shares * mark(s, replay);
  const portfolioReturn = returnPercent(currentAssets, initialAssets);
  const benchmarkReturn = returnPercent(benchmarkAssets, initialAssets);
  const turnover = initialAssets > 0 ? grossNotional / initialAssets : 0;
  return {
    completed:counts.decisions, total:s.rounds.length, finished:replay.finished,
    initialAssets, currentAssets, benchmarkAssets, portfolioReturn, benchmarkReturn,
    relativeReturn:portfolioReturn - benchmarkReturn, maxDrawdown, benchmarkMaxDrawdown,
    totalFees:replay.fees, totalTaxes:replay.taxes??0, totalCosts:replay.totalCosts??replay.fees, cash:replay.cash, shares:replay.shares, holdingValue,
    receivables:replay.receivable ?? 0, dividends:replay.dividends ?? 0,
    currentExposure:percentage(holdingValue, currentAssets),
    meanExposure:counts.decisions ? points.slice(1).reduce((sum, point) => sum + point.exposure, 0) / counts.decisions : 0,
    grossNotional, turnover, turnoverPercent:turnover * 100, counts, points,
    risk:{strategy:riskMetrics(initialAssets,points.slice(1).map(p=>({date:p.date,equity:p.equity}))),
      benchmark:riskMetrics(initialAssets,points.slice(1).map(p=>({date:p.date,equity:p.benchmark})))},
  };
}

export const RISK_ASSUMPTIONS = Object.freeze({tradingDays:252, riskFreeRate:0, minimumAcceptableReturn:0, standardDeviation:'sample', downsideDenominator:'all observations'});
const unavailable = reason => ({value:null,reason});
const available = value => Number.isFinite(value) ? {value,reason:null} : unavailable('計算結果不是有限數值');
/** Daily simple total-equity returns. initial is a baseline, dates are completed trading closes. */
export function riskMetrics(initial, observations) {
  const invalid = reason => ({observations:Array.isArray(observations)?observations.length:0,returns:[],totalReturn:unavailable(reason),annualizedVolatility:unavailable(reason),sharpe:unavailable(reason),sortino:unavailable(reason),maxDrawdown:unavailable(reason),longestDrawdown:unavailable(reason),currentDrawdown:unavailable(reason),deepestDrawdown:unavailable(reason)});
  if (!Number.isFinite(initial) || initial<=0) return invalid('初始總資產必須是有限正數');
  if (!Array.isArray(observations)) return invalid('缺少每日總資產序列');
  let priorDate='';
  for (const point of observations) {
    const date=point?.date;
    if (typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date) return invalid('每日觀測日期不正確');
    if (date<=priorDate) return invalid('每日觀測含重複日期或日期順序不正確');
    if (!Number.isFinite(point.equity)||point.equity<0) return invalid('每日總資產缺失、非有限值或負數');
    priorDate=date;
  }
  if (!observations.length) return invalid('尚無已完成交易日');
  const values=[initial,...observations.map(p=>p.equity)];
  const returns=values.slice(1).map((value,i)=>value/values[i]-1);
  const n=returns.length;
  const returnError=returns.some(r=>!Number.isFinite(r))?'每日報酬分母為 0 或計算不是有限值':null;
  const mean=returns.reduce((a,b)=>a+b,0)/n;
  const sd=n>=2?Math.sqrt(returns.reduce((sum,r)=>sum+(r-mean)**2,0)/(n-1)):null;
  const downside=Math.sqrt(returns.reduce((sum,r)=>sum+Math.min(r,0)**2,0)/n);
  let peak=initial,peakIndex=0,current=null,deepest=null,longest=null,maxDepth=0;
  function record(episode) {
    if (!longest||episode.duration>longest.duration) longest={...episode};
    if (!deepest||episode.depth>deepest.depth) deepest={...episode};
  }
  for (let i=1;i<values.length;i++) {
    const value=values[i];
    if (value>=peak) {
      if(current) record({...current,recoveryIndex:i,recovered:true,duration:i-current.peakIndex});
      current=null;peak=value;peakIndex=i;
    } else {
      if (!current) current={peakIndex,troughIndex:i,depth:0,recoveryIndex:null,recovered:false,duration:i-peakIndex};
      const depth=1-value/peak;
      if(depth>current.depth){current.depth=depth;current.troughIndex=i;}
      current.duration=i-current.peakIndex;maxDepth=Math.max(maxDepth,depth);
    }
  }
  if(current)record(current);
  const none={peakIndex:values.length-1,troughIndex:null,depth:0,recoveryIndex:null,recovered:true,duration:0};
  const short=unavailable(returnError??'至少需要兩個每日報酬觀測');
  const insufficient=n<2||returnError;
  const finiteMoments=Number.isFinite(mean)&&Number.isFinite(sd)&&Number.isFinite(downside);
  const momentError=unavailable('每日報酬統計計算超出有限數值範圍');
  return {observations:n,returns:returnError?[]:returns,totalReturn:available(values.at(-1)/initial-1),annualizedVolatility:insufficient?short:!finiteMoments?momentError:available(sd*Math.sqrt(252)),sharpe:insufficient?short:!finiteMoments?momentError:sd===0?unavailable('每日報酬標準差為 0'):available(mean/sd*Math.sqrt(252)),sortino:insufficient?short:!finiteMoments?momentError:downside===0?unavailable('沒有低於最低可接受報酬 0 的觀測，下行偏差為 0'):available(mean/downside*Math.sqrt(252)),maxDrawdown:available(maxDepth),longestDrawdown:{value:longest??none,reason:null},currentDrawdown:{value:current??none,reason:null},deepestDrawdown:{value:deepest??none,reason:null}};
}

/** Shared educational wording and display rows for the application and both reports. */
export const RISK_METHODS = [
  '策略與買入持有採相同起點、相同已完成交易日及收盤總資產；總資產＝現金＋持倉市值＋應收配息。配息付款只轉成現金，不重複增加報酬。未強制平倉；成本沿用原局模型。',
  '每日簡單報酬 r＝當日總資產／前一觀測總資產－1；首日以前置初始資金為共同基準。期間淨報酬＝末值／初始資金－1，不年化期間報酬。',
  '教學預設：無風險利率 rf＝0、最低可接受報酬 MAR＝0、每年 252 交易日。年化波動度＝每日報酬樣本標準差（分母 N−1）×√252；Sharpe＝每日報酬算術平均／樣本標準差×√252。',
  'Sortino＝每日報酬算術平均／下行偏差×√252；下行偏差＝√[Σ min(r,0)²／N]，分母包含全部 N 日，並非只有下跌日。波動度及兩比率至少需兩個每日報酬。零波動的 Sharpe、無下行的 Sortino 以 N/A 附原因表示。',
  '回撤含初始資產與每個已完成收盤；最深回撤與最長回撤可能屬不同事件。期間以高點至首次回到或超過該高點的交易日間隔計；未恢復則計至最後觀測。同值新高重設後續回撤起點，不反映盤中損失。',
  '未滿 252 個每日報酬為短樣本：年化風險與比率只是尺度換算，不是一年預測。單局結果不證明策略優越、alpha 或統計顯著；報酬差不是風險調整後超額報酬。未推算 Calmar 或交易勝率。',
];
const riskNumber=n=>new Intl.NumberFormat('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Object.is(n,-0)?0:n);
export function riskMetricText(metric,percent=false){
  return metric?.value===null||metric?.value===undefined?`N/A（${metric?.reason??'資料不足'}）`:`${riskNumber(metric.value*(percent?100:1))}${percent?'%':''}`;
}
export function performanceComparisonRows(model,{revealDates=false}={}){
  const pointLabel=i=>i===0?'初始':revealDates?model.points[i]?.date??`第 ${i} 日`:`第 ${i} 日`;
  const duration=metric=>{
    if(!metric||metric.value===null)return `N/A（${metric?.reason??'資料不足'}）`;
    const e=metric.value;if(!e.duration)return '0 交易日（無回撤）';
    return `${e.duration} 交易日（${e.recovered?'已恢復':'尚未恢復'}）；${pointLabel(e.peakIndex)} → ${pointLabel(e.recovered?e.recoveryIndex:model.completed)}`;
  };
  const definitions=[['期間總淨報酬',m=>riskMetricText(m.totalReturn,true)],['年化每日波動度',m=>riskMetricText(m.annualizedVolatility,true)],['收盤最大回撤',m=>riskMetricText(m.maxDrawdown,true)],['最深回撤期間／恢復',m=>duration(m.deepestDrawdown)],['最長回撤期間／恢復',m=>duration(m.longestDrawdown)],['目前回撤期間／恢復',m=>duration(m.currentDrawdown)],['Sharpe（rf＝0）',m=>riskMetricText(m.sharpe)],['Sortino（MAR＝0）',m=>riskMetricText(m.sortino)]];
  return definitions.map(([label,format])=>[label,format(model.risk.strategy),format(model.risk.benchmark)]);
}
export function performanceComparisonHtml(model,options={}){
  const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<div class="risk-comparison"><h3>報酬、風險與風險調整後績效</h3><p>共同觀測：初始資金＋${model.completed} 個已完成交易日收盤；未送出決策不計入。</p><table aria-label="策略與買入持有績效比較"><thead><tr><th scope="col">績效指標</th><th scope="col">策略</th><th scope="col">買入持有</th></tr></thead><tbody>${performanceComparisonRows(model,options).map(row=>`<tr>${row.map((value,i)=>i?`<td>${escape(value)}</td>`:`<th scope="row">${escape(value)}</th>`).join('')}</tr>`).join('')}</tbody></table><details><summary>計算假設與短樣本限制</summary>${RISK_METHODS.map(text=>`<p>${escape(text)}</p>`).join('')}</details><p>rf＝0、MAR＝0、252 交易日／年；${model.completed<252?'短樣本年化僅為尺度換算，不是一年預測。':'比率為樣本描述，不代表未來績效。'}</p></div>`;
}
