import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {DEFAULT_COST_MODEL,ETF_V1_COST_MODEL,LEGACY_COST_MODEL,resolveCostModel,normalizeCostModel,modelFor,transactionCosts,maxAffordableQuantity} from '../dist/costs.js';
import {fresh,decide,benchmark} from '../dist/engine.js';import {createScenario,assetClassFor} from '../dist/scenario.js';import {makeSave,restoreSave,datasetVersion} from '../dist/persistence.js';
const modern=(extra={})=>({costModel:{...ETF_V1_COST_MODEL,...extra}});
const data=JSON.parse(fs.readFileSync(new URL('../dist/dataset.json',import.meta.url)));const version=await datasetVersion(data);
const scenario=(costModel=ETF_V1_COST_MODEL)=>createScenario(data,{seed:'cost-test',startDate:'2019-11-08',startYear:'2019',length:20,costModel});
function tiny({price=100,open=100,min=0,cash=10000}={}){return {...modern({minimumCommission:min}),initialCash:cash,feeRate:.001,history:[],news:[],corporateActions:[],rounds:Array.from({length:3},(_,i)=>({at:`2024-01-0${i+1}T00:55:00Z`,price,priceAt:`2024-01-0${i+1}T00:00:00Z`,executionPrice:open,executionAt:`2024-01-0${i+1}T01:00:00Z`,close:open,closeAt:`2024-01-0${i+1}T06:00:00Z`,revealAt:`2024-01-0${i+2}T00:55:00Z`,news:[]}))};}

test('explicit v7 scenario defaults remain unchanged and models validate independently',()=>{
 assert.deepEqual(scenario().costModel,ETF_V1_COST_MODEL);assert.equal(scenario().feeRate,.001);assert.deepEqual(modelFor({feeRate:0}),{...LEGACY_COST_MODEL,feeRate:0});
 const one=normalizeCostModel();one.feeRate=0;assert.equal(normalizeCostModel().feeRate,.001425);
 for(const input of [null,[],{version:'future'},modern({feeRate:NaN}).costModel,modern({feeRate:-1}).costModel,modern({minimumCommission:.5}).costModel,modern({minimumCommission:-1}).costModel,modern({sellTaxRate:.003}).costModel,modern({rounding:'round'}).costModel])assert.throws(()=>normalizeCostModel(input));
});

test('decimal-safe fee and sell-only tax flooring, including float-boundary and exponent prices',()=>{
 assert.deepEqual(transactionCosts(modern(),'buy',100000,.29),{amount:29000,fee:29,tax:0,totalCost:29,cashFlow:-29029});
 assert.deepEqual(transactionCosts(modern(),'sell',100000,.29),{amount:29000,fee:29,tax:29,totalCost:58,cashFlow:28942});
 assert.equal(transactionCosts(modern(),'sell',999,1).tax,0);assert.equal(transactionCosts(modern(),'sell',1000,1).tax,1);
 assert.equal(transactionCosts(modern(),'sell',100000000,1e-5).fee,1);
 assert.equal(transactionCosts(modern({minimumCommission:20}),'sell',1,10).fee,20);assert.equal(transactionCosts(modern({minimumCommission:20}),'sell',1,10).tax,0);
});

test('hold and cancelled zero-quantity orders charge no minimum fee or tax',()=>{
 const expected={amount:0,fee:0,tax:0,totalCost:0,cashFlow:0};for(const side of ['buy','sell','hold'])assert.deepEqual(transactionCosts(modern({minimumCommission:20}),side,0,100),expected);
 assert.deepEqual(transactionCosts(modern({minimumCommission:20}),'hold',100,100),expected);
});

test('affordable units include minimum fee and exact cash boundaries',()=>{
 assert.equal(maxAffordableQuantity(modern(),1001,100),10);assert.equal(maxAffordableQuantity(modern(),1000,100),9);
 assert.equal(maxAffordableQuantity(modern({minimumCommission:20}),1019,100),9);assert.equal(maxAffordableQuantity(modern({minimumCommission:20}),1020,100),10);
 assert.equal(maxAffordableQuantity(modern({feeRate:0}),.3,.1),3);assert.equal(maxAffordableQuantity(modern(),0,100),0);
 for(const cash of [1,19,20,21,100,999,1000,1001,10000])for(const price of [.29,1,100,120.51]){const s=modern({minimumCommission:20}),q=maxAffordableQuantity(s,cash,price);assert.ok(-transactionCosts(s,'buy',q,price).cashFlow<=cash+1e-8);assert.ok(-transactionCosts(s,'buy',q+1,price).cashFlow>cash+1e-8);}
});

test('new accounting accumulates commission and tax independently; legacy shape stays unchanged',()=>{
 const s=tiny();let state=decide(s,fresh(s),'buy',50,'買入');assert.equal(state.cash,4995);assert.equal(state.fees,5);assert.equal(state.taxes,0);assert.equal(state.totalCosts,5);
 state=decide(s,state,'sell',20,'賣出');assert.equal(state.cash,6991);assert.equal(state.fees,7);assert.equal(state.taxes,2);assert.equal(state.totalCosts,9);assert.equal(state.journal[1].fee,2);assert.equal(state.journal[1].tax,2);assert.equal(state.journal[1].totalCost,4);assert.equal(state.journal[1].costModelVersion,'tw-etf-v1');
 const old={...s,costModel:LEGACY_COST_MODEL};const legacy=decide(old,fresh(old),'buy',1,'舊模型');assert.equal('taxes' in legacy,false);assert.equal('totalCosts' in legacy,false);assert.equal('tax' in legacy.journal[0],false);assert.equal('costModelVersion' in legacy.journal[0],false);assert.equal(legacy.journal[0].fee,.1);
});

test('buy preflight and opening cancellation use same configured costs',()=>{
 const s=tiny({price:100,open:110,min:20,cash:1020});assert.throws(()=>decide(s,fresh(s),'buy',11,'不足'));
 const state=decide(s,fresh(s),'buy',10,'開盤跳空');assert.equal(state.index,1);assert.equal(state.cash,1020);assert.equal(state.shares,0);assert.equal(state.totalCosts,0);assert.equal(state.journal[0].tax,0);assert.equal(state.journal[0].fee,0);assert.equal(state.journal[0].status,'cancelled');assert.equal(state.journal[0].cancelReason,'insufficient-cash-at-open');
});

test('small sells cannot make cash negative; unexpected opening cost deficit cancels and advances',()=>{
 const rejected=tiny({price:10,open:10,min:20,cash:0});const prior={...fresh(rejected),shares:1};assert.throws(()=>decide(rejected,prior,'sell',1,'費用不足'),/賣出費稅/);assert.equal(prior.cash,0);assert.equal(prior.shares,1);
 const s=tiny({price:30,open:10,min:20,cash:0}),state=decide(s,{...fresh(s),shares:1},'sell',1,'昨收可支付');assert.equal(state.index,1);assert.equal(state.cash,0);assert.equal(state.shares,1);assert.equal(state.journal[0].quantity,0);assert.equal(state.totalCosts,0);assert.equal(state.journal[0].status,'cancelled');
});

test('benchmark includes initial buy fee only and does not invent terminal sell tax',()=>{
 const s=tiny({price:100,open:100,min:20,cash:1020});assert.equal(benchmark(s,fresh(s)),1020);const state=decide(s,fresh(s),'hold',0,'觀察');assert.equal(benchmark(s,state),1000);
});

test('v3 saves preserve new model; v1/v2 always retain legacy accounting despite injected new model',()=>{
 const s=scenario(),state=decide(s,fresh(s),'buy',100,'成本');const saved=makeSave(s,state,version);assert.equal(saved.version,3);assert.deepEqual(saved.scenario.costModel,ETF_V1_COST_MODEL);assert.deepEqual(restoreSave(JSON.stringify(saved),data,version).state,state);
 for(const mutate of [x=>delete x.scenario.costModel,x=>x.scenario.costModel.version='unknown',x=>x.scenario.costModel.sellTaxRate=0,x=>x.state.taxes=999]){const x=structuredClone(saved);mutate(x);assert.throws(()=>restoreSave(JSON.stringify(x),data,version));}
 const old=scenario(LEGACY_COST_MODEL),oldState=decide(old,fresh(old),'buy',100,'歷史');for(const v of [1,2]){const x=makeSave(old,oldState,version);x.version=v;x.scenario.costModel=DEFAULT_COST_MODEL;const restored=restoreSave(JSON.stringify(x),data,version);assert.deepEqual(restored.state,oldState);assert.equal(modelFor(restored.s).version,LEGACY_COST_MODEL.version);assert.equal(makeSave(restored.s,restored.state,version).version,3);}
});


test('persisted legacy version cannot claim a different commission rate even for an empty replay',()=>{
 const s=scenario(LEGACY_COST_MODEL),saved=makeSave(s,fresh(s),version);saved.scenario.costModel.feeRate=.02;assert.throws(()=>restoreSave(JSON.stringify(saved),data,version),/0.1%/);
 const valid=makeSave(s,fresh(s),version);assert.deepEqual(restoreSave(JSON.stringify(valid),data,version).state,fresh(s));
});

test('v8 new scenarios default to resolved ETF base rate and one-dollar minimum',()=>{
 const s=createScenario(data,{seed:'v8-default',length:20});assert.deepEqual(s.costModel,DEFAULT_COST_MODEL);assert.equal(s.assetClass,'etf');assert.equal(s.feeRate,.001425);
 const state=decide(s,fresh(s),'buy',1,'最低費');assert.equal(state.journal[0].fee,1);assert.equal(state.journal[0].tax,0);assert.equal(state.journal[0].costModelVersion,'tw-equity-v2');
});

test('v8 resolves known asset metadata and blocks mismatched or unknown classes without identity leakage',()=>{
 assert.equal(assetClassFor(data),'etf');assert.equal(assetClassFor({...data,assetClass:'stock'}),'stock');assert.throws(()=>assetClassFor({...data,instrument:'UNKNOWN'}),/缺少/);
 assert.throws(()=>assetClassFor({...data,assetClass:'bond'}),/不支援/);
 const stock=createScenario({...data,assetClass:'stock'},{seed:'v8-stock',length:20});assert.equal(stock.costModel.assetClass,'stock');assert.equal(stock.costModel.instrumentType,'stock');assert.equal(stock.costModel.sellTaxRate,.003);
 for(const [mode,assetClass] of [['stock','etf'],['etf','stock']])assert.throws(()=>resolveCostModel({version:'tw-equity-v2',mode},assetClass),error=>/不符/.test(error.message)&&!error.message.includes('0050'));
 assert.throws(()=>createScenario(data,{costModel:{version:'tw-equity-v2',mode:'stock'}}),/不符/);
});

test('v8 ETF versus stock tax and exact discounted fees share the same execution function',()=>{
 for(const [assetClass,tax] of [['etf',100],['stock',300]]) {
  const s={costModel:resolveCostModel({version:'tw-equity-v2',mode:'auto'},assetClass)};
  assert.equal(transactionCosts(s,'buy',1000,100).fee,142);assert.equal(transactionCosts(s,'buy',1000,100).tax,0);assert.equal(transactionCosts(s,'sell',1000,100).tax,tax);
 }
 const model=resolveCostModel({version:'tw-equity-v2',mode:'etf',discount:.6,minimumCommission:1},'etf');assert.equal(model.feeRate,.000855);
 assert.equal(transactionCosts({costModel:model},'buy',10000,100).fee,855);assert.equal(transactionCosts({costModel:model},'sell',1,.1).fee,1);assert.equal(transactionCosts({costModel:model},'sell',1,.1).tax,0);
 const free=resolveCostModel({version:'tw-equity-v2',discount:0,minimumCommission:0},'etf');assert.equal(transactionCosts({costModel:free},'buy',100,100).fee,0);assert.equal(transactionCosts({costModel:free},'sell',100,100).tax,10);
});

test('v8 rejects invalid discounts and mismatched derived model fields',()=>{
 const raw={version:'tw-equity-v2'};
 for(const discount of [-.1,1.01,NaN,Infinity,'0.6',null])assert.throws(()=>normalizeCostModel({...raw,discount}));
 for(const extra of [{feeRate:.001},{baseRate:.002},{sellTaxRate:.003},{instrumentType:'stock',assetClass:'etf'},{orderType:'day-trade'},{minimumCommission:1.5}])assert.throws(()=>normalizeCostModel({...raw,...extra}));
 assert.equal(resolveCostModel({...raw,discount:1,minimumCommission:0},'stock').sellTaxRate,.003);
});

test('v8 save restores canonical costs and rejects empty-save type or rate tampering',()=>{
 const s=createScenario(data,{seed:'v8-save',length:20}),state=fresh(s),save=makeSave(s,state,version);
 const loaded=restoreSave(JSON.stringify(save),data,version);assert.deepEqual(loaded.s.costModel,s.costModel);assert.deepEqual(loaded.state,state);
 for(const mutate of [x=>x.scenario.costModel.feeRate=.01,x=>x.scenario.costModel.discount=.6,x=>x.scenario.costModel=resolveCostModel({version:'tw-equity-v2',mode:'stock'},'stock'),x=>x.scenario.assetClass='stock']){const broken=structuredClone(save);mutate(broken);assert.throws(()=>restoreSave(JSON.stringify(broken),data,version));}
});

// Frozen by an independent reviewer before the v8 cost migration.
const frozenV7Golden={"save":{"format":"market-replay-save","version":3,"datasetVersion":"sha256:8b040e01132231c2624a8e549928adb207f15db587a88cc074167d39a62e72c1","createdAt":"2026-10-19T18:10:35.292Z","updatedAt":"2026-10-19T18:10:35.293Z","scenario":{"costModel":{"version":"tw-etf-v1","feeRate":0.001425,"minimumCommission":20,"sellTaxRate":0.001,"rounding":"floor-twd"},"seed":"v7-independent-frozen","startDate":"2019-11-08","requestedStartDate":"2019-11-08","startYear":"2019","length":20,"warmup":40,"blind":{"revealed":true,"everRevealed":true,"revealedAtStep":0},"indicatorSettings":{"smaEnabled":false,"smaPeriod":20,"emaEnabled":false,"emaPeriod":20,"bbEnabled":false,"bbPeriod":20,"bbDeviations":2,"rsiEnabled":false,"rsiPeriod":14,"macdEnabled":false,"macdFast":12,"macdSlow":26,"macdSignal":9,"kdEnabled":false,"kdLookback":9,"kdKSmoothing":3,"kdDSmoothing":3,"volumeMAEnabled":false,"volumeMAPeriod":20},"indicatorHistory":[{"step":0,"settings":{"smaEnabled":false,"smaPeriod":20,"emaEnabled":false,"emaPeriod":20,"bbEnabled":false,"bbPeriod":20,"bbDeviations":2,"rsiEnabled":false,"rsiPeriod":14,"macdEnabled":false,"macdFast":12,"macdSlow":26,"macdSignal":9,"kdEnabled":false,"kdLookback":9,"kdKSmoothing":3,"kdDSmoothing":3,"volumeMAEnabled":false,"volumeMAPeriod":20}}]},"state":{"index":2,"cash":93430,"shares":70,"fees":40,"receivable":0,"dividends":0,"claims":[],"splitEvents":[],"journal":[{"at":"2019-11-08T00:55:00Z","executionAt":"2019-11-08T01:00:00Z","side":"buy","requestedQuantity":100,"quantity":100,"price":93,"close":92.55,"fee":20,"status":"filled","reason":"買入","cash":90680,"shares":100,"newsIds":["jobs-20191101","cpi-20191010","jobs-20191004","cpi-20190912","jobs-20190906","cpi-20190813","jobs-20190802","cash_distribution-2019-07-19","cpi-20190711","jobs-20190705","cpi-20190612","jobs-20190607","cpi-20190510","jobs-20190503","tsmc-1991","cpi-20190410","jobs-20190405","cpi-20190312","jobs-20190308","cpi-20190213","jobs-20190201","cash_distribution-2019-01-22","cpi-20190111","jobs-20190104"],"tax":0,"totalCost":20,"costModelVersion":"tw-etf-v1"},{"at":"2019-11-11T00:55:00Z","executionAt":"2019-11-11T01:00:00Z","side":"sell","requestedQuantity":30,"quantity":30,"price":92.4,"close":91.15,"fee":20,"status":"filled","reason":"賣出","cash":93430,"shares":70,"newsIds":["jobs-20191101","cpi-20191010","jobs-20191004","cpi-20190912","jobs-20190906","cpi-20190813","jobs-20190802","cash_distribution-2019-07-19","cpi-20190711","jobs-20190705","cpi-20190612","jobs-20190607","cpi-20190510","jobs-20190503","tsmc-1991","cpi-20190410","jobs-20190405","cpi-20190312","jobs-20190308","cpi-20190213","jobs-20190201","cash_distribution-2019-01-22","cpi-20190111","jobs-20190104"],"tax":2,"totalCost":22,"costModelVersion":"tw-etf-v1"}],"equity":[100000,99935,99810.5],"finished":false,"taxes":2,"totalCosts":42},"draft":{"side":"hold","quantity":"100","reason":"","studentName":"","studentId":"","notes":"","reflection":""}},"benchmark":97872.95000000001};
test('frozen v7 save and benchmark retain their exact original accounting under v8',()=>{const restored=restoreSave(JSON.stringify(frozenV7Golden.save),data,version);assert.deepEqual(restored.state,frozenV7Golden.save.state);assert.equal(benchmark(restored.s,restored.state),frozenV7Golden.benchmark);assert.equal(restored.s.costModel.version,'tw-etf-v1');assert.deepEqual(makeSave(restored.s,restored.state,version).scenario.costModel,frozenV7Golden.save.scenario.costModel);});
