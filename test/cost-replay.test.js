import test from 'node:test';import assert from 'node:assert/strict';
import {replayWithCosts,makeTaxCorrectionModel} from '../dist/cost-replay.js';
import {fresh,decide,wealth,benchmark} from '../dist/engine.js';
import {DEFAULT_COST_MODEL,LEGACY_COST_MODEL,ETF_V1_COST_MODEL} from '../dist/costs.js';
function scenario({cash=100000,prices=[100,100,100,100],opens=prices,model=LEGACY_COST_MODEL,assetClass='etf',actions=[],splits=[]}={}) {
 return {id:'original-scenario',asset:'private-test-asset',assetClass,initialCash:cash,feeRate:model.feeRate,costModel:{...model},history:[],news:[],corporateActions:actions,blind:{revealed:true,everRevealed:true,revealedAtStep:1},indicatorSettings:{smaEnabled:false},indicatorHistory:[{step:0,settings:{smaEnabled:false}},{step:1,settings:{smaEnabled:true,smaPeriod:5}}],rounds:prices.map((price,i)=>({at:`2024-01-${String(i+1).padStart(2,'0')}T00:55:00Z`,price,priceAt:`2024-01-${String(i+1).padStart(2,'0')}T00:00:00Z`,executionPrice:opens[i],executionAt:`2024-01-${String(i+1).padStart(2,'0')}T01:00:00Z`,close:opens[i],closeAt:`2024-01-${String(i+1).padStart(2,'0')}T06:00:00Z`,revealAt:`2024-01-${String(i+2).padStart(2,'0')}T00:55:00Z`,splitRatio:splits[i]??1,news:[]}))};
}
const run=(s,orders)=>orders.reduce((state,[side,q,reason='原判斷'])=>decide(s,state,side,q,reason),fresh(s));

test('replay keeps buy/sell/hold decisions and all scenario context without mutating inputs',()=>{
 const s=scenario(),old=run(s,[['buy',100,'第一個理由'],['sell',50,'第二個理由'],['hold',0,'等待']]);const before=structuredClone({s,old});
 const result=replayWithCosts(s,old);assert.equal(result.ok,true);assert.deepEqual({s,old},before);assert.notEqual(result.s,s);assert.notEqual(result.s.rounds,s.rounds);
 for(const key of ['history','rounds','blind','indicatorSettings','indicatorHistory','corporateActions'])assert.deepEqual(result.s[key],s[key]);
 assert.deepEqual(result.state.journal.map(j=>[j.side,j.requestedQuantity,j.quantity,j.status,j.reason]),old.journal.map(j=>[j.side,j.requestedQuantity,j.quantity,j.status,j.reason]));
 assert.equal(result.state.fees,15);assert.equal(result.state.taxes,5);assert.equal(result.state.totalCosts,20);assert.equal(result.state.shares,50);
 assert.equal(result.comparison.before.totalCosts,15);assert.equal(result.comparison.after.totalCosts,20);assert.equal(result.comparison.delta.cash,-5);assert.equal(result.comparison.delta.wealth,-5);
 assert.equal(result.comparison.after.wealth,wealth(result.s,result.state));assert.equal(result.comparison.after.benchmark,benchmark(result.s,result.state));
});

test('new sell tax stops at the first later preflight deficit without shrinking an order',()=>{
 const s=scenario({cash:10010,prices:[100,100,99.8,99.8]}),old=run(s,[['buy',100],['sell',100],['buy',100]]),before=structuredClone(old);
 const result=replayWithCosts(s,old);assert.equal(result.ok,false);assert.equal(result.conflict.decisionNumber,3);assert.equal(result.conflict.quantity,100);assert.equal(result.conflict.availableCash,9980);assert.equal(result.conflict.requiredCash,9989.98);assert.equal('state' in result,false);assert.deepEqual(old,before);
});

test('opening deficit caused by earlier sell tax stops at the formerly filled decision',()=>{
 const s=scenario({cash:10010,prices:[100,100,99,99.8],opens:[100,100,99.8,99.8]}),old=run(s,[['buy',100],['sell',100],['buy',100]]);
 const result=replayWithCosts(s,old);assert.equal(result.ok,false);assert.equal(result.conflict.decisionNumber,3);assert.equal(result.conflict.expectedStatus,'filled');assert.equal(result.conflict.actualStatus,'cancelled');assert.equal(result.conflict.requiredCash,9989.98);
});

test('original cancellation stays free and unchanged; later preflight rejection still stops',()=>{
 const s=scenario({cash:10000,prices:[90,100],opens:[110,100]}),old=run(s,[['buy',100],['hold',0]]);assert.equal(old.journal[0].status,'cancelled');
 const same=replayWithCosts(s,old);assert.equal(same.ok,true);assert.equal(same.state.journal[0].status,'cancelled');assert.equal(same.state.journal[0].fee,0);assert.equal(same.state.journal[0].tax,0);
 const changed=scenario({cash:10010,prices:[100,100,99.8],opens:[100,100,110]}),cancelled=run(changed,[['buy',100],['sell',100],['buy',100]]);assert.equal(cancelled.journal[2].status,'cancelled');
 const result=replayWithCosts(changed,cancelled);assert.equal(result.ok,false);assert.equal(result.conflict.decisionNumber,3);assert.equal(result.conflict.quantity,100);
});

test('fractional original commission remains bit-for-bit identical and benchmark does not change',()=>{
 const s=scenario({prices:[173.4,172.35,172.35]}),old=run(s,[['buy',100],['sell',50],['hold',0]]),result=replayWithCosts(s,old);
 assert.equal(result.ok,true);assert.deepEqual(result.state.journal.map(j=>j.fee),old.journal.map(j=>j.fee));assert.equal(result.state.fees,old.fees);assert.equal(result.state.journal[1].fee,8.6175);assert.equal(result.state.taxes,8);assert.equal(result.comparison.delta.benchmark,0);
});

test('dividends and splits are replayed with original eligibility, claims, and share quantities',()=>{
 const actions=[{type:'split',effectiveDate:'2024-01-03',ratio:4},{type:'cash_distribution',exDate:'2024-01-02',paymentDate:'2024-01-04',cashPerUnit:2}];
 const s=scenario({prices:[100,100,25,25],splits:[1,1,4,1],actions}),old=run(s,[['buy',100],['hold',0],['sell',200],['hold',0]]);
 const result=replayWithCosts(s,old);assert.equal(result.ok,true);assert.equal(result.state.finished,true);assert.equal(result.state.shares,200);assert.deepEqual(result.state.claims,old.claims);assert.deepEqual(result.state.splitEvents,old.splitEvents);assert.equal(result.state.dividends,200);assert.equal(result.state.receivable,0);
 assert.equal(result.comparison.delta.shares,0);assert.equal(result.comparison.delta.cash,-5);
});

test('stock metadata resolves correct sell tax and rejects mismatched or legacy targets',()=>{
 const s=scenario({assetClass:'stock'}),old=run(s,[['buy',100],['sell',100]]);
 const result=replayWithCosts(s,old);assert.equal(result.ok,true);assert.equal(result.s.costModel.sellTaxRate,.003);assert.equal(result.state.taxes,30);
 for(const target of [LEGACY_COST_MODEL,ETF_V1_COST_MODEL,DEFAULT_COST_MODEL,{version:'tw-legacy-tax-v1',assetClass:'etf'}]){const failed=replayWithCosts(s,old,target);assert.equal(failed.ok,false);assert.equal(failed.conflict.decisionNumber,0);}
});

test('empty unfinished records replay without revealing anything or charging fees',()=>{
 const s=scenario();s.blind={revealed:false,everRevealed:false,revealedAtStep:null};const old=fresh(s),result=replayWithCosts(s,old);
 assert.equal(result.ok,true);assert.deepEqual(result.s.blind,s.blind);assert.equal(result.state.fees,0);assert.equal(result.state.taxes,0);assert.equal(result.state.finished,false);assert.equal(result.comparison.delta.benchmark,0);
});

test('malformed journal or changed original fill quantity never creates a successful copy',()=>{
 const s=scenario(),old=run(s,[['buy',100]]);old.journal[0].quantity=99;
 const result=replayWithCosts(s,old);assert.equal(result.ok,false);assert.equal(result.conflict.expectedQuantity,99);assert.equal(result.conflict.actualQuantity,100);
 old.journal[0].requestedQuantity=1.5;assert.equal(replayWithCosts(s,old).ok,false);
});


test('only untaxed legacy sources can receive a correction and repeated correction is blocked',()=>{
 const s=scenario(),old=run(s,[['buy',100],['sell',100]]),model=makeTaxCorrectionModel(s);assert.equal(model.version,'tw-legacy-tax-v1');assert.equal(model.rounding,'none');assert.equal(model.taxRounding,'floor-twd');assert.equal(model.feeRate,.001);
 const first=replayWithCosts(s,old);assert.equal(first.ok,true);assert.equal(replayWithCosts(first.s,first.state).ok,false);
 const alreadyTaxed=scenario({model:ETF_V1_COST_MODEL});assert.equal(replayWithCosts(alreadyTaxed,fresh(alreadyTaxed)).ok,false);assert.throws(()=>makeTaxCorrectionModel(alreadyTaxed));
 const changedFee=scenario({model:{...LEGACY_COST_MODEL,feeRate:.002}});assert.equal(replayWithCosts(changedFee,fresh(changedFee)).ok,false);
});
