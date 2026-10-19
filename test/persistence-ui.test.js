import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {datasetVersion,makeSave,restoreSave,emptyDraft,SAVE_KEY} from '../dist/persistence.js';import {createScenario} from '../dist/scenario.js';import {fresh,decide} from '../dist/engine.js';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),data=JSON.parse(fs.readFileSync(new URL('../dist/dataset.json',import.meta.url))),version=await datasetVersion(data);
const s=createScenario(data,{seed:'persist-ui',startDate:'2019-11-08',length:20,startYear:'2019'});
let id=0;
async function mount(raw=null,{failWrites=false}={}){
 const values=new Map(raw===null?[]:[[SAVE_KEY,raw]]),els=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,{id,value:id==='length'?'20':id==='start-year'?'all':id==='quantity'?'100':'',innerHTML:'',textContent:'',options:[{value:''}],nextElementSibling:{},style:{},hidden:false,disabled:false,handlers:{},focus(){},addEventListener(e,f){this.handlers[e]=f},reset(){radios.forEach(r=>r.checked=r.value==='buy');els.get('quantity').value='100';els.get('reason').value=''}}]));
 const radios=['buy','sell','hold'].map(value=>({value,checked:value==='buy',handlers:{},addEventListener(e,f){this.handlers[e]=f}}));
 globalThis.document={getElementById:x=>els.get(x),querySelectorAll:()=>radios};globalThis.fetch=async()=>({ok:true,json:async()=>data});globalThis.FormData=class{get(){return radios.find(r=>r.checked).value}};globalThis.confirm=()=>true;
 globalThis.localStorage={getItem:k=>values.get(k)??null,setItem(k,v){if(failWrites)throw Error('quota');values.set(k,v)}};
 await import(`../dist/app.js?storage-ui=${id++}`);
 return {els,values,radios,submit(){els.get('decision-form').handlers.submit({preventDefault(){},target:els.get('decision-form')})}};
}
test('app restores persisted state and unsent form fields then immediately saves input and decision (DOM stub)',async()=>{
 const state=decide(s,fresh(s),'buy',100,'已完成理由');const {els,values,radios,submit}=await mount(JSON.stringify(makeSave(s,state,version,{...emptyDraft(),side:'sell',quantity:'50',reason:'未送出理由',studentName:'學生甲',notes:'舊筆記'})));
 assert.equal(els.get('shares').textContent,'100');assert.equal(els.get('reason').value,'未送出理由');assert.equal(els.get('student-name').value,'學生甲');assert.equal(radios.find(r=>r.checked).value,'sell');assert.equal(els.get('max-buy').textContent,'可賣持有量 100 單位');assert.equal(els.get('start-date').value,'2019-11-08');
 els.get('learning-notes').value='新的筆記';els.get('learning-notes').handlers.input();assert.equal(restoreSave(values.get(SAVE_KEY),data,version).draft.notes,'新的筆記');submit();assert.equal(els.get('error').textContent,'');assert.equal(restoreSave(values.get(SAVE_KEY),data,version).state.shares,50);
});
test('app does not overwrite broken or mismatched stored file on startup or autosave (DOM stub)',async()=>{
 for(const raw of ['{broken',JSON.stringify({...makeSave(s,fresh(s),version),datasetVersion:'old'})]){const {els,values}=await mount(raw);assert.match(els.get('save-status').textContent,/損壞|版本不同/);els.get('reason').value='新草稿';els.get('reason').handlers.input();assert.equal(values.get(SAVE_KEY),raw);assert.match(els.get('save-status').textContent,/已保護/);}
});
test('app shows quota failure while leaving completed decision available for manual export (DOM stub)',async()=>{
 const raw=JSON.stringify(makeSave(s,fresh(s),version));const {els,values,submit}=await mount(raw,{failWrites:true});els.get('reason').value='交易仍可執行';submit();assert.equal(els.get('shares').textContent,'100');assert.match(els.get('save-status').textContent,/保存失敗/);assert.equal(values.get(SAVE_KEY),raw);
});
test('invalid imported JSON preserves current progress and original bytes (DOM stub)',async()=>{
 const raw=JSON.stringify(makeSave(s,fresh(s),version)),{els,values}=await mount(raw);const before=values.get(SAVE_KEY);await els.get('import-save').handlers.change({target:{files:[{size:4,text:async()=>'{bad'}],value:'file'}});assert.equal(values.get(SAVE_KEY),before);assert.match(els.get('save-status').textContent,/載入失敗/);assert.equal(els.get('shares').textContent,'0');
});
test('restored hold disables quantity and cancelled new game/import retain the current game (DOM stub)',async()=>{
 const state=decide(s,fresh(s),'buy',100,'買入'),raw=JSON.stringify(makeSave(s,state,version,{...emptyDraft(),side:'hold',notes:'保留我'}));const {els,values}=await mount(raw);
 assert.match(els.get('save-status').textContent,/已恢復/);assert.equal(els.get('quantity').disabled,true);assert.equal(els.get('max-buy').textContent,'觀望不適用交易單位');
 globalThis.confirm=()=>false;els.get('reset').handlers.click();assert.equal(els.get('shares').textContent,'100');assert.equal(els.get('learning-notes').value,'保留我');assert.equal(values.get(SAVE_KEY),raw);
 const freshRaw=JSON.stringify(makeSave(s,fresh(s),version));await els.get('import-save').handlers.change({target:{files:[{size:freshRaw.length,text:async()=>freshRaw}],value:'file'}});assert.equal(els.get('shares').textContent,'100');assert.equal(values.get(SAVE_KEY),raw);
});
test('valid import restores settings/notes/mode and retains previous local backup (DOM stub)',async()=>{
 const {els,values}=await mount();const before=values.get(SAVE_KEY),state=decide(s,fresh(s),'buy',100,'已買入'),raw=JSON.stringify(makeSave(s,state,version,{...emptyDraft(),side:'hold',notes:'匯入筆記',studentName:'甲'}));
 await els.get('import-save').handlers.change({target:{files:[{size:raw.length,text:async()=>raw}],value:'file'}});
 assert.equal(els.get('shares').textContent,'100');assert.equal(els.get('length').value,'20');assert.equal(els.get('seed').value,'persist-ui');assert.equal(els.get('start-year').value,'2019');assert.equal(els.get('start-date').value,'2019-11-08');assert.equal(els.get('quantity').disabled,true);assert.equal(els.get('learning-notes').value,'匯入筆記');assert.equal(values.get('market-replay-previous-v1'),before);
});
test('completed save restores review and keeps order form hidden (DOM stub)',async()=>{
 let state=fresh(s);for(let i=0;i<20;i++)state=decide(s,state,'hold',0,'觀望');const {els}=await mount(JSON.stringify(makeSave(s,state,version)));
 assert.equal(els.get('review').hidden,false);assert.equal(els.get('decision-form').hidden,true);assert.match(els.get('game-status').textContent,/回合完成/);
});
test('automatic starts stay automatic across setup/restore, while explicit dates remain fixed (DOM stub)',async()=>{
 const automatic=createScenario(data,{seed:'auto-A',length:20,startYear:'2019'});const {els,values}=await mount(JSON.stringify(makeSave(automatic,fresh(automatic),version)));
 assert.equal(els.get('start-date').value,'');els.get('seed').value='auto-B';els.get('apply-setup').handlers.click();
 const expected=createScenario(data,{seed:'auto-B',length:20,startYear:'2019'}),restored=restoreSave(values.get(SAVE_KEY),data,version);assert.equal(restored.s.startDate,expected.startDate);assert.equal(restored.s.requestedStartDate,null);assert.equal(els.get('start-date').value,'');
 els.get('start-date').value='2019-11-08';els.get('seed').value='explicit-C';els.get('apply-setup').handlers.click();assert.equal(restoreSave(values.get(SAVE_KEY),data,version).s.startDate,'2019-11-08');assert.equal(els.get('start-date').value,'2019-11-08');
});
test('fresh UI hides identity in chart, news, source text and selectors; decline then reveal is permanent (DOM stub)',async()=>{const {els,values}=await mount();const shown=['ticker-date','clock','scenario-title','scenario-desc','asset','ohlc','news','macro','chart','data-note'].map(id=>els.get(id).innerHTML+els.get(id).textContent).join('\n');assert(!/\b0050\b|元大台灣|\b(?:19|20)\d{2}-\d{2}-\d{2}/.test(shown),shown.match(/.{0,30}(?:\b0050\b|元大台灣|\b(?:19|20)\d{2}-\d{2}-\d{2}).{0,50}/)?.[0]);assert.equal(els.get('year-field').hidden,true);assert.equal(els.get('date-field').hidden,true);assert.equal(els.get('start-date').innerHTML.includes('2019'),false);globalThis.confirm=()=>false;els.get('reveal-identity').handlers.click();assert.equal(restoreSave(values.get(SAVE_KEY),data,version).s.blind.everRevealed,false);let prevented=false;els.get('source-notice-link').handlers.click({preventDefault(){prevented=true}});assert(prevented);globalThis.confirm=()=>true;els.get('reveal-identity').handlers.click();const restored=restoreSave(values.get(SAVE_KEY),data,version);assert.equal(restored.s.blind.everRevealed,true);assert.equal(els.get('ticker-symbol').textContent,'0050');assert.equal(els.get('reveal-identity').disabled,true);});
test('actual indicator form stores same-step changes and invalid settings leave history unchanged (DOM stub)',async()=>{const {els,values}=await mount();let saved=restoreSave(values.get(SAVE_KEY),data,version),cfg={...saved.s.indicatorSettings,emaEnabled:true,emaPeriod:30,bbEnabled:true,macdEnabled:true,kdEnabled:true};globalThis.FormData=class{get(k){return k==='side'?'buy':cfg[k]}has(k){return cfg[k]===true}};const submit=()=>els.get('indicator-form').handlers.submit({preventDefault(){},target:els.get('indicator-form')});submit();cfg.emaPeriod=50;submit();saved=restoreSave(values.get(SAVE_KEY),data,version);assert.equal(saved.s.indicatorHistory.length,3);assert.equal(saved.s.indicatorHistory.at(-1).step,0);assert.equal(saved.s.indicatorSettings.emaPeriod,50);assert(els.get('chart').innerHTML.includes('EMA50'));assert(els.get('chart').innerHTML.includes('MACD / 訊號 / 柱值'));assert(els.get('indicators').innerHTML.includes('布林上軌'));cfg.macdFast=100;submit();assert.match(els.get('indicator-error').textContent,/快線/);assert.equal(restoreSave(values.get(SAVE_KEY),data,version).s.indicatorHistory.length,3);});
