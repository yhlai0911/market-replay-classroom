import {createPracticeStore,PRACTICE_STORE_KEY} from '../dist/practice-store.js';
import {initializeSession,setIndicatorSettings} from '../dist/session.js';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {datasetVersion,makeSave,restoreSave,emptyDraft,SAVE_KEY} from '../dist/persistence.js';import {createScenario} from '../dist/scenario.js';import {fresh,decide} from '../dist/engine.js';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),data=JSON.parse(fs.readFileSync(new URL('../dist/dataset.json',import.meta.url))),version=await datasetVersion(data);
const s=createScenario(data,{seed:'persist-ui',startDate:'2019-11-08',length:20,startYear:'2019'});
function activeRaw(values){const raw=values.get(PRACTICE_STORE_KEY);if(!raw)return values.get(SAVE_KEY);const x=JSON.parse(raw),save=structuredClone(x.records.find(r=>r.id===x.activeId)?.save);if(!save)return null;delete save.practice;return JSON.stringify(save);}
let id=0;
async function mount(raw=null,{failWrites=false,library=null}={}){
 const values=new Map(raw===null?[]:[[SAVE_KEY,raw]]),els=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,{id,value:id==='length'?'20':id==='start-year'?'all':id==='quantity'?'100':'',innerHTML:'',textContent:'',options:[{value:''}],nextElementSibling:{},style:{},hidden:false,disabled:false,handlers:{},focus(){},addEventListener(e,f){this.handlers[e]=f},reset(){radios.forEach(r=>r.checked=r.value==='buy');els.get('quantity').value='100';els.get('reason').value=''}}]));
 if(library)values.set(PRACTICE_STORE_KEY,library);
 const radios=['buy','sell','hold'].map(value=>({value,checked:value==='buy',handlers:{},addEventListener(e,f){this.handlers[e]=f}}));
 globalThis.document={getElementById:x=>els.get(x),querySelectorAll:()=>radios};globalThis.fetch=async()=>({ok:true,json:async()=>data});globalThis.FormData=class{get(){return radios.find(r=>r.checked).value}};globalThis.confirm=()=>true;
 if(failWrites&&raw){const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};createPracticeStore(storage,{validate:r=>restoreSave(r,data,version)}).read();}
 globalThis.localStorage={getItem:k=>values.get(k)??null,setItem(k,v){if(failWrites)throw Error('quota');values.set(k,v)}};
 await import(`../dist/app.js?storage-ui=${id++}`);
 return {els,values,radios,submit(){els.get('decision-form').handlers.submit({preventDefault(){},target:els.get('decision-form')})}};
}
test('app restores persisted state and unsent form fields then immediately saves input and decision (DOM stub)',async()=>{
 const state=decide(s,fresh(s),'buy',100,'已完成理由');const {els,values,radios,submit}=await mount(JSON.stringify(makeSave(s,state,version,{...emptyDraft(),side:'sell',quantity:'50',reason:'未送出理由',studentName:'學生甲',notes:'舊筆記'})));
 assert.equal(els.get('shares').textContent,'100');assert.equal(els.get('reason').value,'未送出理由');assert.equal(els.get('student-name').value,'學生甲');assert.equal(radios.find(r=>r.checked).value,'sell');assert.equal(els.get('max-buy').textContent,'可賣持有量 100 單位');assert.equal(els.get('start-date').value,'2019-11-08');
 els.get('learning-notes').value='新的筆記';els.get('learning-notes').handlers.input();assert.equal(restoreSave(activeRaw(values),data,version).draft.notes,'新的筆記');submit();assert.equal(els.get('error').textContent,'');assert.equal(restoreSave(activeRaw(values),data,version).state.shares,50);
});
test('app does not overwrite broken or mismatched stored file on startup or autosave (DOM stub)',async()=>{
 for(const raw of ['{broken',JSON.stringify({...makeSave(s,fresh(s),version),datasetVersion:'old'})]){const {els,values}=await mount(raw);assert.match(els.get('save-status').textContent,/損壞|版本不同/);els.get('reason').value='新草稿';els.get('reason').handlers.input();assert.equal(activeRaw(values),raw);assert.match(els.get('save-status').textContent,/損壞|版本不同|保留|保護/);}
});
test('app shows quota failure while leaving completed decision available for manual export (DOM stub)',async()=>{
 const raw=JSON.stringify(makeSave(s,fresh(s),version,{...emptyDraft(),side:'buy'}));const {els,values,submit}=await mount(raw,{failWrites:true});els.get('reason').value='交易仍可執行';submit();assert.equal(els.get('shares').textContent,'100');assert.match(els.get('save-status').textContent,/保存失敗/);assert.equal(activeRaw(values),raw);
});
test('invalid imported JSON preserves current progress and original bytes (DOM stub)',async()=>{
 const raw=JSON.stringify(makeSave(s,fresh(s),version)),{els,values}=await mount(raw);const before=activeRaw(values);await els.get('import-save').handlers.change({target:{files:[{size:4,text:async()=>'{bad'}],value:'file'}});assert.equal(activeRaw(values),before);assert.match(els.get('save-status').textContent,/載入失敗/);assert.equal(els.get('shares').textContent,'0');
});
test('restored hold disables quantity and cancelled new game/import retain the current game (DOM stub)',async()=>{
 const state=decide(s,fresh(s),'buy',100,'買入'),raw=JSON.stringify(makeSave(s,state,version,{...emptyDraft(),side:'hold',notes:'保留我'}));const {els,values}=await mount(raw);
 assert.match(els.get('save-status').textContent,/已恢復/);assert.equal(els.get('quantity').disabled,true);assert.equal(els.get('max-buy').textContent,'觀望不適用交易單位');
 globalThis.confirm=()=>false;els.get('random-start').handlers.click();assert.equal(els.get('shares').textContent,'100');assert.equal(els.get('learning-notes').value,'保留我');assert.equal(activeRaw(values),raw);
 const freshRaw=JSON.stringify(makeSave(s,fresh(s),version));await els.get('import-save').handlers.change({target:{files:[{size:freshRaw.length,text:async()=>freshRaw}],value:'file'}});assert.equal(els.get('shares').textContent,'100');assert.equal(activeRaw(values),raw);
});
test('valid import restores settings/notes/mode and retains both independent practices (DOM stub)',async()=>{
 const {els,values}=await mount();const before=activeRaw(values),state=decide(s,fresh(s),'buy',100,'已買入'),raw=JSON.stringify(makeSave(s,state,version,{...emptyDraft(),side:'hold',notes:'匯入筆記',studentName:'甲'}));
 await els.get('import-save').handlers.change({target:{files:[{size:raw.length,text:async()=>raw}],value:'file'}});
 assert.equal(els.get('shares').textContent,'100');assert.equal(els.get('length').value,'20');assert.equal(els.get('seed').value,'persist-ui');assert.equal(els.get('start-year').value,'2019');assert.equal(els.get('start-date').value,'2019-11-08');assert.equal(els.get('quantity').disabled,true);assert.equal(els.get('learning-notes').value,'匯入筆記');assert.equal(JSON.parse(values.get(PRACTICE_STORE_KEY)).records.length,2);assert(JSON.parse(values.get(PRACTICE_STORE_KEY)).records.some(r=>r.save.state.journal.length===0));
});
test('completed save restores review and keeps order form hidden (DOM stub)',async()=>{
 let state=fresh(s);for(let i=0;i<20;i++)state=decide(s,state,'hold',0,'觀望');const {els}=await mount(JSON.stringify(makeSave(s,state,version)));
 assert.equal(els.get('review').hidden,false);assert.equal(els.get('decision-form').hidden,true);assert.match(els.get('game-status').textContent,/回合完成/);
});
test('automatic starts stay automatic across setup/restore, while explicit dates remain fixed (DOM stub)',async()=>{
 const automatic=createScenario(data,{seed:'auto-A',length:20,startYear:'2019'});const {els,values}=await mount(JSON.stringify(makeSave(automatic,fresh(automatic),version)));
 assert.equal(els.get('start-date').value,'');els.get('seed').value='auto-B';els.get('apply-setup').handlers.click();
 const expected=createScenario(data,{seed:'auto-B',length:20,startYear:'2019'}),restored=restoreSave(activeRaw(values),data,version);assert.equal(restored.s.startDate,expected.startDate);assert.equal(restored.s.requestedStartDate,null);assert.equal(els.get('start-date').value,'');
 els.get('start-date').value='2019-11-08';els.get('seed').value='explicit-C';els.get('apply-setup').handlers.click();assert.equal(restoreSave(activeRaw(values),data,version).s.startDate,'2019-11-08');assert.equal(els.get('start-date').value,'2019-11-08');
});
test('fresh UI hides identity in chart, news, source text and selectors; decline then reveal is permanent (DOM stub)',async()=>{const {els,values}=await mount();const shown=['ticker-date','clock','scenario-title','scenario-desc','asset','ohlc','news','macro','chart','data-note'].map(id=>els.get(id).innerHTML+els.get(id).textContent).join('\n');assert(!/\b0050\b|元大台灣|\b(?:19|20)\d{2}-\d{2}-\d{2}/.test(shown),shown.match(/.{0,30}(?:\b0050\b|元大台灣|\b(?:19|20)\d{2}-\d{2}-\d{2}).{0,50}/)?.[0]);assert.equal(els.get('year-field').hidden,true);assert.equal(els.get('date-field').hidden,true);assert.equal(els.get('start-date').innerHTML.includes('2019'),false);globalThis.confirm=()=>false;els.get('reveal-identity').handlers.click();assert.equal(restoreSave(activeRaw(values),data,version).s.blind.everRevealed,false);let prevented=false;els.get('source-notice-link').handlers.click({preventDefault(){prevented=true}});assert(prevented);globalThis.confirm=()=>true;els.get('reveal-identity').handlers.click();const restored=restoreSave(activeRaw(values),data,version);assert.equal(restored.s.blind.everRevealed,true);assert.equal(els.get('ticker-symbol').textContent,'0050');assert.equal(els.get('reveal-identity').disabled,true);});
test('on-chart selected indicator editing preserves other choices, history and restored preferences (DOM stub)',async()=>{
 const {els,values}=await mount();let saved=restoreSave(activeRaw(values),data,version),cfg={...saved.s.indicatorSettings,emaPeriod:30};
 assert.equal(Object.entries(saved.s.indicatorSettings).filter(([k,v])=>k.endsWith('Enabled')&&v).length,0);
 assert.match(els.get('indicator-chips').innerHTML,/純 K 線/);assert.equal(els.get('indicators').innerHTML,'');
 globalThis.FormData=class{get(k){return k==='side'?'buy':cfg[k]}has(k){return cfg[k]===true}};
 const open=(g,instance)=>els.get('indicator-options').handlers.click({target:{closest:()=>({dataset:{indicator:g,instance}})}});
 const submit=()=>els.get('indicator-form').handlers.submit({preventDefault(){},target:els.get('indicator-form')});
 open('ema');assert.equal(els.get('indicator-editor').hidden,false);assert.match(els.get('indicator-fields').innerHTML,/emaPeriod/);assert(!els.get('indicator-fields').innerHTML.includes('macdFast'));submit();cfg.emaPeriod=50;submit();
 open('bb');submit();saved=restoreSave(activeRaw(values),data,version);assert.equal(saved.s.indicatorHistory.length,4);assert.equal(saved.s.indicatorHistory.at(-1).step,0);assert.equal(saved.s.indicatorSettings.movingAverages[0].period,50);const emaId=saved.s.indicatorSettings.movingAverages[0].id;assert.equal(saved.s.indicatorSettings.movingAverages[0].type,'ema');assert.equal(saved.s.indicatorSettings.bbEnabled,true);assert.equal(saved.s.indicatorSettings.rsiEnabled,false);assert(els.get('indicators').innerHTML.includes('布林上軌'));
 open('macd');cfg.macdFast=100;submit();assert.match(els.get('indicator-error').textContent,/快線/);assert.equal(restoreSave(activeRaw(values),data,version).s.indicatorHistory.length,4);
 open('ema',emaId);const focusChip={focus(){this.focused=true}};els.get('indicator-chips').querySelector=()=>focusChip;els.get('close-indicator').handlers.click();assert.equal(focusChip.focused,true);assert.equal(els.get('indicator-editor').hidden,true);open('ema',emaId);focusChip.focused=false;els.get('indicator-editor').handlers.keydown({key:'Escape'});assert.equal(focusChip.focused,true);open('ema',emaId);els.get('remove-indicator').handlers.click();saved=restoreSave(activeRaw(values),data,version);assert.equal(saved.s.indicatorSettings.emaEnabled,false);assert.equal(saved.s.indicatorSettings.bbEnabled,true);assert.equal(saved.s.indicatorHistory.length,5);assert(!els.get('indicator-chips').innerHTML.includes('data-indicator="ema"'));
 const restored=await mount(activeRaw(values));assert.match(restored.els.get('indicator-chips').innerHTML,/布林通道/);assert(!restored.els.get('indicator-chips').innerHTML.includes('data-indicator="ema"'));assert.match(restored.els.get('indicator-options').innerHTML,/EMA 均線/);
});
test('legacy UI distinguishes previously known identity from manual reveal before and after completion (DOM stub)',async()=>{
 for(const complete of [false,true]){
  let state=fresh(s);if(complete)for(let i=0;i<s.length;i++)state=decide(s,state,'hold',0,'舊版決策');
  const old=makeSave(s,state,version);old.version=1;for(const key of ['warmup','blind','indicatorSettings','indicatorHistory'])delete old.scenario[key];
  let mounted=await mount(JSON.stringify(old));const expected=(complete?'回合完成 · ':'')+'舊版資料，身分已知';
  assert.equal(mounted.els.get('blind-status').textContent,expected);assert(!mounted.els.get('blind-status').textContent.includes('主動揭露'));
  mounted.els.get('reason').handlers.input();mounted=await mount(activeRaw(mounted.values));
  assert.equal(mounted.els.get('blind-status').textContent,expected);
 }
});
test('new UI keeps automatic completion and manual disclosure labels distinct (DOM stub)',async()=>{
 let mounted=await mount();assert.equal(mounted.els.get('blind-status').textContent,'盲測模式 · 標的與日期隱藏');
 const initial=restoreSave(activeRaw(mounted.values),data,version);let state=initial.state;for(let i=0;i<initial.s.length;i++)state=decide(initial.s,state,'hold',0,'完成');
 mounted=await mount(JSON.stringify(makeSave(initial.s,state,version)));assert.equal(mounted.els.get('blind-status').textContent,'回合完成 · 身分自動揭曉');
 initial.s.blind={revealed:true,everRevealed:true,revealedAtStep:0};mounted=await mount(JSON.stringify(makeSave(initial.s,initial.state,version)));assert.equal(mounted.els.get('blind-status').textContent,'本回合曾主動揭露');
 mounted=await mount(JSON.stringify(makeSave(initial.s,state,version)));assert.equal(mounted.els.get('blind-status').textContent,'回合完成 · 本回合曾主動揭露');
});

test('three-line preset, independent edit/remove and backup round trip preserve every MA instance (DOM stub)',async()=>{
 const {els,values}=await mount();
 els.get('indicator-options').handlers.click({target:{closest:()=>({dataset:{preset:'5,20,60'}})}});
 let saved=restoreSave(activeRaw(values),data,version),lines=saved.s.indicatorSettings.movingAverages;
 assert.deepEqual(lines.map(x=>x.period),[5,20,60]);assert.equal(new Set(lines.map(x=>x.id)).size,3);assert.equal(new Set(lines.map(x=>x.color)).size,3);
 const original=structuredClone(lines),id=lines[1].id;globalThis.FormData=class{get(k){return k==='side'?'buy':k==='smaPeriod'?30:k==='maColor'?'#ff8844':null}};
 els.get('indicator-chips').handlers.click({target:{closest:()=>({dataset:{indicator:'sma',instance:id}})}});
 els.get('indicator-form').handlers.submit({preventDefault(){},target:els.get('indicator-form')});
 saved=restoreSave(activeRaw(values),data,version);lines=saved.s.indicatorSettings.movingAverages;assert.deepEqual(lines[0],original[0]);assert.deepEqual(lines[2],original[2]);assert.equal(lines[1].id,id);assert.equal(lines[1].period,30);assert.equal(lines[1].color,'#ff8844');
 const restored=await mount(activeRaw(values));for(const line of lines)assert(restored.els.get('indicator-chips').innerHTML.includes(line.id));
 restored.els.get('indicator-chips').handlers.click({target:{closest:()=>({dataset:{indicator:'sma',instance:id}})}});restored.els.get('remove-indicator').handlers.click();
 const removed=restoreSave(activeRaw(restored.values),data,version);assert.deepEqual(removed.s.indicatorSettings.movingAverages,[original[0],original[2]]);assert.equal(removed.s.indicatorHistory.length,4);
});

test('new practice defaults to hold without trading; explicitly saved buy drafts remain unchanged',async()=>{
 const freshMount=await mount();assert.equal(freshMount.radios.find(r=>r.checked).value,'hold');assert.equal(freshMount.els.get('quantity').disabled,true);const before=freshMount.els.get('round').textContent;freshMount.submit();assert.equal(freshMount.els.get('round').textContent,before);assert.match(freshMount.els.get('error').textContent,/判斷依據/);freshMount.els.get('reason').value='先觀察';freshMount.submit();assert.equal(freshMount.els.get('shares').textContent,'0');assert.match(freshMount.els.get('last-result').textContent,/觀望/);
 const raw=JSON.stringify(makeSave(s,fresh(s),version,{...emptyDraft(),side:'buy',quantity:'77',reason:'原先規劃的買入'})),restored=await mount(raw);assert.equal(restored.radios.find(r=>r.checked).value,'buy');assert.equal(restored.els.get('quantity').value,'77');assert.equal(restored.els.get('reason').value,'原先規劃的買入');assert.equal(restored.els.get('quantity').disabled,false);
});

test('prior version two backup renders positive before-practice labels after restore without altering progress',async()=>{
 const scenario=initializeSession(createScenario(data,{seed:'old-label-save',length:20,warmup:260}));let state=decide(scenario,fresh(scenario),'buy',10,'原始買入');state=decide(scenario,state,'hold',0,'觀察');setIndicatorSettings(scenario,state,{...scenario.indicatorSettings,smaEnabled:true,smaPeriod:10});const raw=JSON.stringify(makeSave(scenario,state,version,{...emptyDraft(),side:'buy',quantity:'10'}));
 const {els}=await mount(raw);assert.equal(els.get('shares').textContent,'10');assert.match(els.get('round').textContent,/3 \/ 20/);for(const id of ['ohlc','chart','news'])assert.doesNotMatch(els.get(id).innerHTML,/暖機第|練習前 -/);assert.match(els.get('chart').innerHTML,/練習前 \d+ 日/);assert.match(els.get('build-version').textContent,/v6.*已載入/);
});

test('every confirmed decision starts a clean hold draft while notes and journal reasons survive refresh',async()=>{
 for(const side of ['buy','sell','hold']){
  const initial=side==='sell'?decide(s,fresh(s),'buy',10,'先前買入'):fresh(s);
  const raw=JSON.stringify(makeSave(s,initial,version,{...emptyDraft(),side,quantity:'5',reason:'本次完整理由',studentName:'甲',notes:'學習筆記',reflection:'反思保留'}));
  const m=await mount(raw);m.submit();assert.equal(m.els.get('error').textContent,'');
  const saved=restoreSave(activeRaw(m.values),data,version);
  assert.equal(saved.state.journal.at(-1).side,side);assert.equal(saved.state.journal.at(-1).reason,'本次完整理由');
  assert.equal(saved.draft.side,'hold');assert.equal(saved.draft.quantity,'1');assert.equal(saved.draft.reason,'');assert.equal(saved.draft.notes,'學習筆記');assert.equal(saved.draft.reflection,'反思保留');
  const refreshed=await mount(activeRaw(m.values));assert.equal(refreshed.radios.find(r=>r.checked).value,'hold');assert.equal(refreshed.els.get('quantity').value,'1');assert.equal(refreshed.els.get('quantity').disabled,true);
 }
});

test('cancelled decisions and unsent edited drafts are never reset',async()=>{
 const raw=JSON.stringify(makeSave(s,fresh(s),version,{...emptyDraft(),side:'buy',quantity:'7',reason:'尚未送出'}));const m=await mount(raw);globalThis.confirm=()=>false;m.submit();assert.equal(activeRaw(m.values),raw);assert.equal(m.radios.find(r=>r.checked).value,'buy');assert.equal(m.els.get('quantity').value,'7');assert.equal(m.els.get('reason').value,'尚未送出');
 m.els.get('quantity').value='8';m.els.get('quantity').handlers.input();const reloaded=await mount(activeRaw(m.values));assert.equal(reloaded.radios.find(r=>r.checked).value,'buy');assert.equal(reloaded.els.get('quantity').value,'8');assert.equal(reloaded.els.get('reason').value,'尚未送出');
});

test('plain-language chart definitions explain historical data, OHLCV and split adjustment',()=>{
 assert.match(html,/開盤、最高、最低、收盤價格/);assert.match(html,/不是當天實際成交股數/);assert.match(html,/只按模擬日已生效/);assert.match(html,/不需要在這些日子做決策/);assert.match(html,/下一日會回到觀望/);
});

const archive=m=>JSON.parse(m.values.get(PRACTICE_STORE_KEY));
const recordAction=async(m,action,id)=>m.els.get('records-list').handlers.click({target:{closest:()=>({dataset:{practiceAction:action,id},disabled:false})}});
test('practice manager makes same-seed independent games, renames, switches notes and safely restores deletion',async()=>{
 const m=await mount();const first=archive(m).activeId;m.els.get('learning-notes').value='第一局筆記';m.els.get('learning-notes').handlers.input();
 m.els.get('apply-setup').handlers.click();const second=archive(m).activeId;assert.notEqual(first,second);assert.equal(archive(m).records.length,2);
 globalThis.prompt=()=>'<我的第二局>';await recordAction(m,'rename',second);assert.equal(archive(m).records.find(r=>r.id===second).name,'<我的第二局>');assert.match(m.els.get('records-list').innerHTML,/&lt;我的第二局&gt;/);
 await recordAction(m,'open',first);assert.equal(m.els.get('learning-notes').value,'第一局筆記');assert.equal(archive(m).activeId,first);
 await recordAction(m,'trash',first);assert.equal(archive(m).activeId,null);assert(archive(m).records.find(r=>r.id===first).deletedAt);m.els.get('tab-trade').handlers.click();assert.equal(m.els.get('view-records').hidden,false);
 m.els.get('records-toggle').handlers.click();await recordAction(m,'restore',first);assert.equal(archive(m).records.find(r=>r.id===first).deletedAt,null);m.els.get('records-toggle').handlers.click();await recordAction(m,'open',first);assert.equal(m.els.get('learning-notes').value,'第一局筆記');
 const refreshed=await mount(null,{library:m.values.get(PRACTICE_STORE_KEY)});assert.equal(archive(refreshed).records.length,2);assert.equal(refreshed.els.get('learning-notes').value,'第一局筆記');
});
test('duplicate backup ID imports as separate game and export targets selected nonactive practice',async()=>{
 const m=await mount();const first=archive(m).activeId;m.els.get('learning-notes').value='A局';m.els.get('learning-notes').handlers.input();const original=archive(m).records[0].save,raw=JSON.stringify(original);
 await m.els.get('import-save').handlers.change({target:{files:[{size:raw.length,text:async()=>raw}],value:'file'}});const second=archive(m).activeId;assert.notEqual(first,second);assert.equal(archive(m).records.length,2);m.els.get('learning-notes').value='B局';m.els.get('learning-notes').handlers.input();
 let blob;globalThis.URL.createObjectURL=b=>{blob=b;return 'blob:test'};globalThis.URL.revokeObjectURL=()=>{};document.createElement=()=>({click(){}});await recordAction(m,'json',first);const exported=JSON.parse(await blob.text());assert.equal(exported.practice.id,first);assert.equal(exported.draft.notes,'A局');assert.equal(archive(m).activeId,second);
 assert.doesNotMatch(m.els.get('records-list').innerHTML,/0050|元大|20\d\d-\d\d-\d\d/);
});
test('archive failures do not switch visible game, lose records, or claim deletion success',async()=>{
 const m=await mount();const id=archive(m).activeId,before=m.values.get(PRACTICE_STORE_KEY),round=m.els.get('round').textContent;globalThis.localStorage.setItem=()=>{throw Error('quota')};
 m.els.get('apply-setup').handlers.click();assert.equal(m.values.get(PRACTICE_STORE_KEY),before);assert.equal(m.els.get('round').textContent,round);assert.match(m.els.get('setup-error').textContent,/未保存/);
 await recordAction(m,'trash',id);assert.equal(m.values.get(PRACTICE_STORE_KEY),before);assert.match(m.els.get('records-error').textContent,/未保存/);
});
test('deleted active game stays deleted after reload and cannot be silently recreated by stage buttons',async()=>{
 const m=await mount();await recordAction(m,'trash',archive(m).activeId);const reloaded=await mount(null,{library:m.values.get(PRACTICE_STORE_KEY)});assert.equal(archive(reloaded).activeId,null);assert.equal(archive(reloaded).records.length,1);assert.equal(reloaded.els.get('view-records').hidden,false);reloaded.els.get('tab-trade').handlers.click();assert.equal(reloaded.els.get('view-records').hidden,false);
});

test('visible new-practice actions create independent games and cancellation preserves all records',async()=>{
 const m=await mount(),before=m.values.get(PRACTICE_STORE_KEY);globalThis.confirm=()=>false;m.els.get('records-new').handlers.click();assert.equal(m.values.get(PRACTICE_STORE_KEY),before);globalThis.confirm=()=>true;m.els.get('records-new').handlers.click();assert.equal(archive(m).records.length,2);m.els.get('new-practice').handlers.click();assert.equal(archive(m).records.length,3);assert.doesNotMatch(html,/會取代目前進度|套用會清除目前決策/);
});

test('small transaction fees are visible to cents in estimate, result, journal and totals',async()=>{
 const raw=JSON.stringify(makeSave(s,fresh(s),version,{...emptyDraft(),side:'buy',quantity:'1',reason:'買一單位'}));const m=await mount(raw);assert.match(m.els.get('order-estimate').textContent,/費用 \$0\.\d{2}/);m.submit();const saved=restoreSave(activeRaw(m.values),data,version),fee=saved.state.journal[0].fee;assert(fee>0&&fee<1);const formatted=new Intl.NumberFormat('zh-TW',{style:'currency',currency:'TWD',minimumFractionDigits:2,maximumFractionDigits:2}).format(fee);for(const id of ['last-result','return'])assert(m.els.get(id).textContent.includes(formatted));assert(m.els.get('journal').innerHTML.includes(formatted));
});

test('new practice second-write quota failure is visible on records page and keeps active game',async()=>{
 const m=await mount();m.els.get('open-records').handlers.click();const before=archive(m),setItem=globalThis.localStorage.setItem;let writes=0;globalThis.localStorage.setItem=(k,v)=>{if(k===PRACTICE_STORE_KEY&&++writes===2)throw Error('quota');setItem(k,v);};m.els.get('records-new').handlers.click();assert.equal(writes,2);assert.equal(archive(m).records.length,before.records.length);assert.equal(archive(m).activeId,before.activeId);assert.equal(m.els.get('view-records').hidden,false);assert.match(m.els.get('records-error').textContent,/保存失敗/);
});
