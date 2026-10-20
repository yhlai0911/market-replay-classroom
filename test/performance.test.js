import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performanceModel} from '../dist/performance.js';
import {fresh, decide, wealth, benchmark} from '../dist/engine.js';
import {createScenario} from '../dist/scenario.js';

const near = (actual, expected, tolerance=1e-8) => assert(Math.abs(actual-expected) <= tolerance, `${actual} != ${expected}`);
function scenario({closes=[100,110,90,120], opens=closes.map(()=>100), splits=[], distributions=[], initialCash=1000, feeRate=.001}={}) {
  return {
    initialCash, feeRate, history:[], news:[], corporateActions:[...splits, ...distributions],
    rounds:closes.map((close,i) => {
      const date=`2024-01-${String(i+2).padStart(2,'0')}`;
      const splitRatio=splits.filter(a=>(a.effectiveDate??a.exDate)===date).reduce((v,a)=>v*a.ratio,1);
      return {at:date+'T00:55:00Z', price:(i?closes[i-1]:100)/splitRatio,
        priceAt:`2024-01-${String(i+1).padStart(2,'0')}T05:30:00Z`,
        executionAt:date+'T01:00:00Z', executionPrice:opens[i], close,
        closeAt:date+'T05:30:00Z', revealAt:`2024-01-${String(i+3).padStart(2,'0')}T00:55:00Z`,
        splitRatio, news:[]};
    }),
  };
}
function run(s, decisions) {
  return decisions.reduce((state,[side,quantity=0])=>decide(s,state,side,quantity,'測試決策'),fresh(s));
}

test('fresh performance is cash-only and never reads the unrevealed first open',()=>{
  const s=scenario();Object.defineProperty(s.rounds[0],'executionPrice',{get(){throw Error('future open read');}});
  const m=performanceModel(s,fresh(s));
  assert.equal(m.currentAssets,1000);assert.equal(m.benchmarkAssets,1000);
  assert.equal(m.points.length,1);assert.equal(m.completed,0);assert.equal(m.finished,false);
  for(const field of ['portfolioReturn','benchmarkReturn','relativeReturn','maxDrawdown','benchmarkMaxDrawdown','totalFees','currentExposure','meanExposure','grossNotional','turnover']) assert.equal(m[field],0);
  assert.deepEqual(m.counts,{decisions:0,fills:0,buys:0,sells:0,holds:0,cancelled:0});
  assert.doesNotMatch(JSON.stringify(m),/NaN|Infinity|winRate/i);
});

test('per-close portfolio and benchmark returns, drawdowns, exposure, fees and gross turnover agree with hand calculations',()=>{
  const s=scenario(),state=run(s,[['buy',5],['hold'],['sell',2],['hold']]);
  const before=JSON.stringify({s,state}),m=performanceModel(s,state);
  assert.equal(JSON.stringify({s,state}),before);
  assert.equal(m.finished,true);assert.equal(m.currentAssets,1059.3);near(m.benchmarkAssets,1179.1);
  assert.deepEqual(m.points.map(p=>p.equity),[1000,999.5,1049.5,969.3,1059.3]);
  m.points.map(p=>p.benchmark).forEach((v,i)=>near(v,[1000,999.1,1089.1,909.1,1179.1][i]));
  near(m.portfolioReturn,5.93);near(m.benchmarkReturn,17.91);near(m.relativeReturn,-11.98);
  near(m.maxDrawdown,(1049.5-969.3)/1049.5*100);
  near(m.benchmarkMaxDrawdown,(1089.1-909.1)/1089.1*100);
  near(m.points[3].drawdown,-m.maxDrawdown);assert.equal(m.points.at(-1).drawdown,0);
  near(m.totalFees,.7);assert.equal(m.grossNotional,700);assert.equal(m.turnover,.7);assert.equal(m.turnoverPercent,70);
  near(m.currentExposure,360/1059.3*100);
  near(m.meanExposure,([500/999.5,550/1049.5,270/969.3,360/1059.3].reduce((a,b)=>a+b)/4)*100);
  assert.deepEqual(m.counts,{decisions:4,fills:2,buys:1,sells:1,holds:2,cancelled:0});
  for(const p of m.points) near(p.equity,p.cash+p.holdingValue+p.receivables);
});

test('cancelled orders contribute no filled buys, fees, notional or exposure',()=>{
  const s=scenario({opens:[200,100,100,100]}),state=run(s,[['buy',9],['hold']]),m=performanceModel(s,state);
  assert.equal(m.currentAssets,1000);assert.equal(m.totalFees,0);assert.equal(m.grossNotional,0);assert.equal(m.meanExposure,0);
  assert.deepEqual(m.counts,{decisions:2,fills:0,buys:0,sells:0,holds:1,cancelled:1});
  assert.equal(m.benchmarkAssets,benchmark(s,state));
});

test('splits retain the share basis of each completed close and do not create phantom drawdown',()=>{
  const s=scenario({closes:[100,100,25,25],opens:[100,100,25,25],splits:[{type:'split',effectiveDate:'2024-01-04',ratio:4}]}),state=run(s,[['buy',5],['hold']]),m=performanceModel(s,state);
  assert.equal(state.shares,20);assert.equal(m.shares,20);assert.equal(m.points[2].shares,5);
  assert.equal(m.holdingValue,500);assert.equal(m.points[2].holdingValue,500);
  near(m.points[1].benchmark,999.1);near(m.points[2].benchmark,999.1);
  near(m.currentAssets,999.5);near(m.maxDrawdown,.05);
  const full=performanceModel(s,run(s,[['buy',5],['hold'],['sell',20],['hold']]));
  assert.equal(full.points[3].shares,0);near(full.grossNotional,1000);near(full.totalFees,1);
});

test('dividend entitlements belong to prior holders, survive ex-date sales and settle without increasing wealth twice',()=>{
  const s=scenario({closes:[100,90,90,90],opens:[100,90,90,90],feeRate:0,distributions:[{type:'cash_distribution',exDate:'2024-01-03',paymentDate:'2024-01-05',cashPerUnit:10}]}),state=run(s,[['buy',5],['sell',5],['hold']]),m=performanceModel(s,state);
  assert.equal(m.points[2].receivables,50);assert.equal(m.points[2].cash,950);assert.equal(m.points[2].equity,1000);
  assert.equal(m.points[3].receivables,50);assert.equal(m.points[3].cash,950);
  assert.equal(m.receivables,0);assert.equal(m.cash,1000);assert.equal(m.dividends,50);assert.equal(m.currentAssets,1000);
  assert.deepEqual(m.points.map(p=>p.benchmark),[1000,1000,1000,1000]);assert.equal(m.maxDrawdown,0);
  const onEx=scenario({closes:[90,90],opens:[90,90],feeRate:0,distributions:[{type:'cash_distribution',exDate:'2024-01-02',paymentDate:'2024-01-04',cashPerUnit:10}]}),onExModel=performanceModel(onEx,run(onEx,[['buy',5],['hold']]));
  assert.equal(onExModel.dividends,0);assert.equal(onExModel.benchmarkAssets,1000);
});

test('split and ex-date dividend on the same day use post-split prior holdings',()=>{
  const s=scenario({closes:[100,24,24],opens:[100,24,24],feeRate:0,splits:[{type:'split',effectiveDate:'2024-01-03',ratio:4}],distributions:[{type:'cash_distribution',exDate:'2024-01-03',paymentDate:'2024-01-10',cashPerUnit:1}]}),m=performanceModel(s,run(s,[['buy',5],['hold']]));
  assert.equal(m.points[2].shares,20);assert.equal(m.points[2].receivables,20);assert.equal(m.points[2].equity,1000);assert.equal(m.points[2].benchmark,1000);
});

test('all-cash decisions and a benchmark unable to buy one unit have finite zero exposure and returns',()=>{
  const s=scenario({initialCash:50}),m=performanceModel(s,run(s,[['hold'],['hold']]));
  assert.equal(m.currentAssets,50);assert.equal(m.benchmarkAssets,50);assert.equal(m.benchmarkReturn,0);
  assert.equal(m.currentExposure,0);assert.equal(m.meanExposure,0);assert.equal(m.maxDrawdown,0);
});

test('future OHLC, corporate events and forged cached accounting cannot alter revealed performance',()=>{
  const s=scenario(),state=run(s,[['buy',5]]),expected=performanceModel(s,state);
  state.cash=999999;state.fees=999999;state.shares=999999;state.equity=[9,9,9,9];state.journal[0].price=999999;state.journal[0].close=999999;state.journal[0].fee=999999;
  s.rounds[1].executionPrice=987654321;s.rounds[1].close=987654321;s.rounds[2].executionPrice=987654321;s.rounds[2].close=987654321;
  s.corporateActions.push({type:'cash_distribution',exDate:'2024-01-04',paymentDate:'2024-01-05',cashPerUnit:987654321});
  assert.deepEqual(performanceModel(s,state),expected);assert.doesNotMatch(JSON.stringify(expected),/987654321/);
});

test('real archive windows match engine current valuation and independently replayed prefixes across splits and dividends',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../dist/dataset.json',import.meta.url)));
  for(const startDate of ['2024-07-15','2025-06-09','2025-07-01']){
    const s=createScenario(data,{startDate,length:40,seed:'performance-regression'});
    let state=fresh(s);
    for(let i=0;i<40;i++){
      state=decide(s,state,i===0?'buy':'hold',i===0?100:0,'持有測試');
      if(![1,2,10,39].includes(i))continue;
      const m=performanceModel(s,state);
      near(m.currentAssets,wealth(s,state));near(m.benchmarkAssets,benchmark(s,state));
      near(m.totalFees,state.fees);assert.equal(m.points.length,state.journal.length+1);
      m.points.slice(1).forEach((p,j)=>{
        const prefix={...s,rounds:s.rounds.slice(0,j+1)};
        let closed=fresh(prefix);
        state.journal.slice(0,j+1).forEach(intent=>{closed=decide(prefix,closed,intent.side,intent.requestedQuantity,intent.reason);});
        near(p.equity,wealth(prefix,closed));near(p.benchmark,benchmark(prefix,closed));
        near(p.equity,p.cash+p.holdingValue+p.receivables);
      });
    }
  }
});
