import test from 'node:test';import assert from 'node:assert/strict';
import {validateNewsEvents} from '../dist/news-validation.js';import {relativeDay,blindText,newsView} from '../dist/blind.js';import {visible} from '../dist/engine.js';
const event={id:'release-1',title:'發布消息',body:'僅當時內容',source:'原始機關',url:'https://example.org/release',sourcePublishedDate:'2024-03-10',sourceTimezone:'America/New_York',publishedAt:null,availableAt:'2024-03-11T04:00:00Z',timestampPrecision:'date_only'};
test('date-only gate uses next local midnight with DST and rejects guessed earlier time',()=>{assert.equal(validateNewsEvents([event]).length,1);assert.throws(()=>validateNewsEvents([{...event,availableAt:'2024-03-11T05:00:00Z'}]));assert.throws(()=>validateNewsEvents([{...event,publishedAt:event.availableAt}]));assert.throws(()=>validateNewsEvents([event,event]));assert.throws(()=>validateNewsEvents([{...event,availableAt:'2024-03-11'}]));});
test('precise release cannot be available before publication',()=>{const n={...event,timestampPrecision:'minute',sourcePublishedDate:'2024-03-11',publishedAt:'2024-03-11T04:01:00Z'};assert.throws(()=>validateNewsEvents([n]));assert.equal(validateNewsEvents([{...n,availableAt:n.publishedAt}]).length,1);});
test('Taipei relative dates cross UTC midnight correctly without shifting plain bar dates',()=>{const s={history:[{date:'2024-03-08'}],rounds:[{bar:{date:'2024-03-11'}},{bar:{date:'2024-03-12'}}]};assert.equal(relativeDay(s,'2024-03-10T16:00:00Z'),'第 1 交易日');assert.equal(relativeDay(s,'2024-03-11'),'第 1 交易日');});
test('date masking handles ROC dates English dates and ticker suffix without changing economic numeric values',()=>{assert.equal(blindText('民國113年1月13日 September 15, 2008 0050.TW',{}),'[日期隱藏] [日期隱藏] 標的 A');assert.equal(blindText('非農增加2008人，利率1.25%',{}),'非農增加2008人，利率1.25%');const s={blind:{revealed:false},history:[{date:'2008-09-12'}],rounds:[{bar:{date:'2008-09-15'}}]};assert.equal(newsView(s,{}, {...event,title:'2008 金融危機',blindTitle:'金融危機消息'}).title,'金融危機消息');});
test('engine news gate compares instants and excludes malformed and not-yet-public releases',()=>{const s={history:[],rounds:[{at:'2024-03-11T00:55:00Z',priceAt:'2024-03-08T05:30:00Z',price:100,news:[]}],news:[{id:'before',availableAt:'2024-03-11T08:54:59+08:00'},{id:'equal',availableAt:'2024-03-11T00:55:00Z'},{id:'future',availableAt:'2024-03-11T00:55:01Z'},{id:'bad',availableAt:'garbage'}]};assert.deepEqual(visible(s,{index:0,finished:false}).news.map(n=>n.id).sort(),['before','equal']);});
import {createDatasetRegistry} from '../dist/dataset-registry.js';import {datasetVersion} from '../dist/persistence.js';
test('candidate inherited news must exactly match registered original while additions use strict validation',async()=>{
 const base={events:[{id:'legacy-event',title:'原公告',publishedAt:'2020-01-01T00:00:00Z'}]},baseHash=await datasetVersion(base);
 const candidate={events:[...base.events,event],newsValidation:{version:1,inheritedFrom:baseHash,inheritedEventIds:['legacy-event']}};
 async function load(c){const hash=await datasetVersion(c);return createDatasetRegistry({version:1,defaultId:'base',datasets:[{id:'base',instrument:'0050',label:'原資料',path:'./base.json',hash:baseHash},{id:'candidate',instrument:'0050',label:'新聞資料',path:'./candidate.json',hash}]},async path=>path==='./base.json'?base:c);}
 assert.equal((await load(candidate)).current().entry.id,'base');const forged=structuredClone(candidate);forged.events[0].title='修改歷史';await assert.rejects(load(forged),/原始版本不同/);const early=structuredClone(candidate);early.events[1].availableAt='2024-03-10T04:00:00Z';await assert.rejects(load(early),/次日零時/);
});
test('standalone calendar months are hidden without changing rates or durations',()=>{
 assert.equal(blindText('10月、1 月份與12月；October、SEPTEMBER、May、MAY、in may',{}),'該月、該月與該月；該月、該月、該月、該月、in 該月');
 assert.equal(blindText('利率10%，持續10個月、12 months，may increase，非農2008人',{}),'利率10%，持續10個月、12 months，may increase，非農2008人');
});
test('08:55 gate includes exact publication, not one second later, across successive decisions',()=>{
 const s={history:[],rounds:['2024-03-08','2024-03-11'].map(day=>({at:day+'T00:55:00Z',news:[]})),news:[{id:'before',availableAt:'2024-03-08T00:54:59Z'},{id:'equal',availableAt:'2024-03-08T00:55:00Z'},{id:'after',availableAt:'2024-03-08T00:55:01Z'},{id:'weekend',availableAt:'2024-03-10T08:00:00Z'},{id:'monday-future',availableAt:'2024-03-11T00:55:01Z'}]};
 assert.deepEqual(visible(s,{index:0}).news.map(n=>n.id),['equal','before']);
 assert.deepEqual(visible(s,{index:1}).news.map(n=>n.id),['weekend','after','equal','before']);
});
test('date-only release appears at conservative local midnight and not before',()=>{
 const n={...event,sourcePublishedDate:'2024-03-08',sourceTimezone:'Asia/Taipei',availableAt:'2024-03-08T16:00:00Z'};validateNewsEvents([n]);
 const s={history:[],news:[n],rounds:['2024-03-08T15:59:59Z','2024-03-08T16:00:00Z','2024-03-11T00:55:00Z'].map(at=>({at,news:[]}))};
 assert.equal(visible(s,{index:0}).news.length,0);assert.equal(visible(s,{index:1}).news.length,1);assert.equal(visible(s,{index:2}).news.length,1);
});
