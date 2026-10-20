import test from 'node:test';
import assert from 'node:assert/strict';
import {riskMetrics,performanceComparisonRows,performanceComparisonHtml,performanceModel} from '../dist/performance.js';
import {fresh,decide} from '../dist/engine.js';
const near=(a,b,tol=1e-10)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
const metric=values=>riskMetrics(values[0],values.slice(1).map((equity,i)=>({date:`2024-01-${String(i+2).padStart(2,'0')}`,equity})));
test('daily-equity fixture independently verifies sample volatility and full-observation downside deviation',()=>{
 const m=metric([100,110,104.5]);near(m.returns[0],.1);near(m.returns[1],-.05);near(m.totalReturn.value,.045);
 // Hand calculations: mean .025, sample variance .01125, downside second moment .00125.
 near(m.annualizedVolatility.value,Math.sqrt(.01125*252));near(m.sharpe.value,.025/Math.sqrt(.01125)*Math.sqrt(252));near(m.sortino.value,.025/Math.sqrt(.00125)*Math.sqrt(252));near(m.maxDrawdown.value,.05);
 assert.equal(m.currentDrawdown.value.duration,1);assert.equal(m.currentDrawdown.value.recovered,false);
});
test('longest recovered drawdown, deepest loss, and current duration are separate with latest equal high',()=>{
 const m=metric([100,90,80,90,100,100,90]);near(m.maxDrawdown.value,.2);assert.equal(m.longestDrawdown.value.duration,4);assert.equal(m.longestDrawdown.value.recovered,true);assert.equal(m.currentDrawdown.value.duration,1);assert.equal(m.currentDrawdown.value.peakIndex,5);
 const other=metric([100,70,100,99,98,99,98,100]);assert.equal(other.deepestDrawdown.value.duration,2);assert.equal(other.longestDrawdown.value.duration,5);assert.equal(other.currentDrawdown.value.duration,0);
});
test('initial capital is a drawdown peak and recovery counts through the first recovered close',()=>{
 const m=metric([100,90,95,100,110,110]);near(m.maxDrawdown.value,.1);assert.equal(m.deepestDrawdown.value.peakIndex,0);assert.equal(m.deepestDrawdown.value.recoveryIndex,3);assert.equal(m.deepestDrawdown.value.duration,3);
});
test('cash and constant nonzero returns have zero volatility with N/A Sharpe; no losses has N/A Sortino',()=>{
 for(const values of [[100,100,100],[100,200,400]]){const m=metric(values);assert.equal(m.annualizedVolatility.value,0);assert.equal(m.sharpe.value,null);assert(m.sharpe.reason);assert.equal(m.sortino.value,null);assert(m.sortino.reason);}
 const positive=metric([100,105,120]);assert(positive.sharpe.value>0);assert.equal(positive.sortino.value,null);
});
test('absent and one-return samples never invent risk estimates; N/A has a reason',()=>{
 for(const m of [riskMetrics(100,[]),metric([100,90])])for(const field of ['annualizedVolatility','sharpe','sortino']){assert.equal(m[field].value,null);assert(m[field].reason);}
 assert.equal(riskMetrics(100,[]).maxDrawdown.value,null);assert.equal(metric([100,90]).totalReturn.value,-.09999999999999998);
});
test('invalid, missing, nonfinite, negative, duplicate, and unordered observations are rejected rather than skipped',()=>{
 for(const points of [null,{},[{}],[{date:'2024-02-30',equity:100}],[{date:'2024-01-02',equity:NaN}],[{date:'2024-01-02',equity:Infinity}],[{date:'2024-01-02',equity:-1}],[{date:'2024-01-02'}],[{date:'2024-01-02',equity:100},{date:'2024-01-02',equity:110}],[{date:'2024-01-03',equity:100},{date:'2024-01-02',equity:110}],Array(2)]){
 const m=riskMetrics(100,points);for(const field of ['totalReturn','annualizedVolatility','sharpe','sortino','maxDrawdown']){assert.equal(m[field].value,null);assert(m[field].reason);}}
 for(const initial of [0,-1,NaN,Infinity,undefined])assert.equal(riskMetrics(initial,[{date:'2024-01-02',equity:100}]).totalReturn.value,null);
});
test('zero daily-return denominator and overflowing statistics become N/A rather than infinity or artificial zero',()=>{
 const zero=metric([100,0,0]);assert.equal(zero.totalReturn.value,-1);assert.equal(zero.maxDrawdown.value,1);for(const f of ['annualizedVolatility','sharpe','sortino']){assert.equal(zero[f].value,null);assert.match(zero[f].reason,/分母為 0/);}
 const huge=metric([1,1e200,1e200]);for(const f of ['annualizedVolatility','sharpe','sortino'])assert.equal(huge[f].value,null);
});
function scenario(){return {initialCash:1000,feeRate:0,history:[],news:[],corporateActions:[{type:'cash_distribution',exDate:'2024-01-03',paymentDate:'2024-01-03',cashPerUnit:10}],rounds:[100,90,90].map((close,i)=>({at:`2024-01-0${i+2}T00:55:00Z`,executionAt:`2024-01-0${i+2}T01:00:00Z`,closeAt:`2024-01-0${i+2}T05:30:00Z`,revealAt:`2024-01-0${i+3}T00:55:00Z`,executionPrice:close,price:i===0?100:i===1?100:90,close,news:[]}))};}
test('same-day dividend rights and cash settlement do not create phantom returns; prefix excludes the future',()=>{
 const s=scenario();let state=decide(s,fresh(s),'buy',5,'買入');state=decide(s,state,'sell',5,'除息日賣出');const before=JSON.stringify({s,state}),m=performanceModel(s,state);
 assert.deepEqual(m.points.map(p=>p.equity),[1000,1000,1000]);assert.deepEqual(m.points.map(p=>p.benchmark),[1000,1000,1000]);assert.equal(m.risk.strategy.annualizedVolatility.value,0);assert.equal(m.risk.strategy.observations,2);assert.equal(m.dividends,50);assert.equal(m.cash,1000);
 for(const p of m.points)near(p.equity,p.cash+p.holdingValue+p.receivables);
 s.rounds[2].close=999999;assert.deepEqual(performanceModel(s,state).risk,m.risk);s.rounds[2].close=90;assert.equal(JSON.stringify({s,state}),before);
});
test('comparison formatting shares values and explicit N/A reasons without leaking blind dates or HTML',()=>{
 const s=scenario(),state=decide(s,fresh(s),'hold',0,'觀望'),m=performanceModel(s,state),html=performanceComparisonHtml(m);
 assert.match(html,/策略/);assert.match(html,/買入持有/);assert.match(html,/Sharpe/);assert.match(html,/Sortino/);assert.match(html,/N\/A（至少需要兩個每日報酬觀測）/);assert.match(html,/252/);assert.match(html,/短樣本/);assert.doesNotMatch(html,/2024-/);
 const two=performanceModel(s,decide(s,state,'hold',0,'觀望'));two.points[1].date='<script>bad</script>';assert.doesNotMatch(performanceComparisonHtml(two,{revealDates:true}),/<script>/);assert.equal(performanceComparisonRows(two).length,8);
});
