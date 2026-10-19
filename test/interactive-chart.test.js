import test from 'node:test';
import assert from 'node:assert/strict';
import {clampRange,zoomRange} from '../dist/interactive-chart.js';
test('interactive chart opens latest 60 known bars without future padding',()=>{
 assert.deepEqual(clampRange(300),{start:240,end:300,count:60});
 assert.deepEqual(clampRange(5),{start:0,end:5,count:5});
 assert.deepEqual(clampRange(0),{start:0,end:0,count:0});
});
test('panning is clamped to revealed history',()=>{
 assert.deepEqual(clampRange(300,-50,60),{start:0,end:60,count:60});
 assert.deepEqual(clampRange(300,500,60),{start:240,end:300,count:60});
 assert.deepEqual(clampRange(300,5,999),{start:0,end:300,count:300});
});
test('zoom retains anchor and respects min/max range',()=>{
 assert.deepEqual(zoomRange(300,clampRange(300),.5,1),{start:270,end:300,count:30});
 assert.deepEqual(zoomRange(300,clampRange(300),.5,0),{start:240,end:270,count:30});
 assert.equal(zoomRange(300,clampRange(300),.001).count,12);
 assert.equal(zoomRange(300,clampRange(300),100).count,300);
 assert.deepEqual(zoomRange(0,clampRange(0),.5),{start:0,end:0,count:0});
});
test('every pan and zoom stays inside known history',()=>{
 for(let n=0;n<400;n+=7) for(const start of [-900,0,90,1000]) for(const count of [1,12,60,1000]) {
  const r=clampRange(n,start,count);assert.ok(r.start>=0&&r.end<=n&&r.end-r.start===r.count);
  for(const f of [.1,.8,1.2,10]) {const z=zoomRange(n,r,f);assert.ok(z.start>=0&&z.end<=n&&z.end-z.start===z.count);}
 }
});

import {createInteractiveChart} from '../dist/interactive-chart.js';
import {calculateIndicators,defaultIndicatorSettings} from '../dist/indicators.js';

// Small deterministic DOM surface; dispatches real chart event handlers, not range-helper substitutes.
class FakeElement {
 constructor(){this.innerHTML='';this.textContent='';this.style={};this.hidden=false;this.disabled=false;this.dataset={};this.handlers={};this.attributes={};this.children=[];this.lookup={};}
 addEventListener(name,fn){(this.handlers[name]??=[]).push(fn);}
 dispatch(name,props={}){const event={type:name,button:0,pointerId:1,clientX:100,clientY:100,preventDefault(){this.prevented=true;},...props};for(const handler of this.handlers[name]??[])handler(event);return event;}
 querySelector(selector){return this.lookup[selector]??null;}
 querySelectorAll(selector){return selector==='[data-action]'?this.buttons??[]:[];}
 setAttribute(key,value){this.attributes[key]=value;}
 getBoundingClientRect(){return {width:375,height:Number(this.attributes.viewBox?.split(' ')[3]??700),left:0,top:0};}
 replaceChildren(...children){this.children=children;this.innerHTML='';}
 append(child){this.children.push(child);}
 focus(){this.focused=true;}
 setPointerCapture(id){this.captured=id;}
 closest(selector){return selector==='button'?this:null;}
}
function mountChart({allEnabled=true}={}) {
 const previousDocument=globalThis.document;
 const container=new FakeElement(),root=new FakeElement(),plot=new FakeElement(),svg=new FakeElement(),tooltip=new FakeElement(),status=new FakeElement(),legend=new FakeElement(),controls=new FakeElement(),crosshair=new FakeElement();
 container.lookup['.replay-chart']=root;
 root.lookup={'.rc-plot':plot,'.rc-tooltip':tooltip,'.rc-range':status,'.rc-legend':legend,'.rc-controls':controls};plot.lookup.svg=svg;svg.lookup['[data-crosshair]']=crosshair;
 root.buttons=['older','newer','in','out','reset'].map(action=>{const b=new FakeElement();b.dataset.action=action;return b;});
 const head=new FakeElement();globalThis.document={head,getElementById:id=>head.children.find(e=>e.id===id),createElement:()=>new FakeElement()};
 const chart=createInteractiveChart(container);
 const bars=Array.from({length:200},(_,i)=>({date:new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10),ticker:'HIDDEN-TICKER',open:100+i*.2,high:103+i*.2,low:99+i*.2,close:102+i*.2,volume:10000+i*100,comparableVolume:20000+i*200}));
 const settings={...defaultIndicatorSettings(),smaEnabled:allEnabled,rsiEnabled:allEnabled,volumeMAEnabled:allEnabled,emaEnabled:allEnabled,bbEnabled:allEnabled,macdEnabled:allEnabled,kdEnabled:allEnabled};
 const label=date=>`暖機第 ${Math.round((Date.parse(date)-Date.UTC(2020,0,1))/86400000)+1} 日`;
 const update=(next=bars)=>chart.update({bars:next,study:calculateIndicators(next,settings),settings,label});
 update();
 return {chart,bars,settings,root,plot,svg,tooltip,status,legend,crosshair,update,click(action){const target=root.buttons.find(b=>b.dataset.action===action);controls.dispatch('click',{target});},cleanup(){chart.destroy();globalThis.document=previousDocument;}};
}

test('actual chart buttons pan, zoom, disable at bounds, and reset to latest sixty',()=>{
 const m=mountChart();try {
  assert.match(m.status.textContent,/暖機第 141 日 → 暖機第 200 日 · 60 \/ 200/);
  assert.equal(m.root.buttons.find(b=>b.dataset.action==='newer').disabled,true);
  m.click('in');assert.match(m.status.textContent,/48 \/ 200/);
  m.click('older');assert.match(m.status.textContent,/暖機第 135 日 → 暖機第 182 日/);
  m.click('newer');assert.match(m.status.textContent,/暖機第 147 日 → 暖機第 194 日/);
  m.click('out');assert.match(m.status.textContent,/60 \/ 200/);
  m.click('reset');assert.match(m.status.textContent,/暖機第 141 日 → 暖機第 200 日/);
 } finally {m.cleanup();}
});

test('actual keyboard and wheel handlers zoom and pan without future padding',()=>{
 const m=mountChart();try {
  assert.equal(m.plot.dispatch('keydown',{key:'+'}).prevented,true);assert.match(m.status.textContent,/48 \/ 200/);
  m.plot.dispatch('keydown',{key:'ArrowLeft'});assert.match(m.status.textContent,/暖機第 142 日/);
  m.plot.dispatch('keydown',{key:'Home'});assert.match(m.status.textContent,/暖機第 141 日 → 暖機第 200 日/);
  const beforeWheel=m.status.textContent;assert.notEqual(m.plot.dispatch('wheel',{deltaY:-100,clientX:305}).prevented,true);assert.equal(m.status.textContent,beforeWheel);
  assert.equal(m.plot.dispatch('wheel',{deltaY:-100,clientX:305,ctrlKey:true}).prevented,true);assert.match(m.status.textContent,/51 \/ 200/);
  m.plot.dispatch('wheel',{deltaY:100,metaKey:true});assert.match(m.status.textContent,/60 \/ 200/);
 } finally {m.cleanup();}
});

test('actual pointer tooltip is blind-safe and dragging changes the shared window',()=>{
 const m=mountChart();try {
  m.plot.dispatch('pointermove',{clientX:160,clientY:130});
  assert.equal(m.tooltip.hidden,false);assert.match(m.tooltip.innerHTML,/暖機第 \d+ 日/);assert.match(m.tooltip.innerHTML,/實際成交量/);assert.match(m.tooltip.innerHTML,/換算後成交量/);assert.match(m.crosshair.innerHTML,/<line/);
  assert.doesNotMatch(m.tooltip.innerHTML+m.svg.innerHTML+JSON.stringify(m.svg.attributes),/\d{4}-\d{2}-\d{2}|HIDDEN-TICKER/);
  const prior=m.status.textContent;m.plot.dispatch('pointerdown',{clientX:100});m.plot.dispatch('pointermove',{clientX:180});m.plot.dispatch('pointerup',{clientX:180});assert.notEqual(m.status.textContent,prior);assert.equal(m.tooltip.hidden,true);
  m.plot.dispatch('pointermove',{clientX:160,clientY:130});m.plot.dispatch('pointerleave');assert.equal(m.tooltip.hidden,true);
 } finally {m.cleanup();}
});

test('every enabled panel uses identical visible x ticks and readable colored legends',()=>{
 const m=mountChart();try {
  for(const key of ['price','volume','rsi','macd','kd'])assert.match(m.svg.innerHTML,new RegExp(`rc-\\d+-${key}`));
  const grids=[...m.svg.innerHTML.matchAll(/<line x1="([\d.]+)" x2="\1" y1="([\d.]+)" y2="([\d.]+)" stroke="#203047"/g)];
  const byPanel=Object.groupBy?Object.groupBy(grids,g=>g[2]):grids.reduce((all,g)=>((all[g[2]]??=[]).push(g),all),{});
  const positions=Object.values(byPanel).map(lines=>lines.map(line=>line[1]));assert.equal(positions.length,5);for(const ticks of positions)assert.deepEqual(ticks,positions[0]);
  assert.match(m.legend.innerHTML,/color:#f5c773.*SMA 均線/);assert.match(m.legend.innerHTML,/color:#6faeff.*EMA 指數均線/);assert.match(m.legend.innerHTML,/color:#c59aff.*布林通道/);
  assert.doesNotMatch(m.svg.innerHTML,/NaN|Infinity|undefined/);
 } finally {m.cleanup();}
});

test('updates only use supplied history and erase stale tooltip content',()=>{
 const m=mountChart();try {
  m.plot.dispatch('pointermove',{clientX:280,clientY:130});assert.equal(m.tooltip.hidden,false);
  m.update(m.bars.slice(0,100));assert.match(m.status.textContent,/暖機第 41 日 → 暖機第 100 日 · 60 \/ 100/);assert.equal(m.tooltip.hidden,true);assert.equal(m.tooltip.innerHTML,'');
  assert.doesNotMatch(m.svg.innerHTML,/暖機第 200 日/);
  m.update(m.bars.slice(0,101));assert.match(m.status.textContent,/暖機第 42 日 → 暖機第 101 日/);
  m.click('older');const before=m.status.textContent.split(' · ')[0];m.update(m.bars.slice(0,102));assert.equal(m.status.textContent.split(' · ')[0],before);
  m.update([]);assert.match(m.status.textContent,/尚無歷史資料/);assert.doesNotMatch(m.svg.innerHTML,/暖機第/);
 } finally {m.cleanup();}
});

test('three same-type averages have independent paths, colors, legends and hover values',()=>{
 const m=mountChart({allEnabled:false});try {
  m.settings.movingAverages=[{id:'fast',type:'sma',period:5,color:'#ffaa11'},{id:'medium',type:'sma',period:20,color:'#11aaff'},{id:'slow',type:'sma',period:60,color:'#aa11ff'}];
  // Explicit arrays are authoritative even when legacy settings are still enabled.
  m.settings.smaEnabled=true;m.settings.emaEnabled=true;m.update();
  const study=calculateIndicators(m.bars,m.settings);
  assert.equal((m.svg.innerHTML.match(/<path /g)||[]).length,3);
  for(const avg of m.settings.movingAverages) {
   assert.match(m.svg.innerHTML,new RegExp(`<path data-series="ma_${avg.id}"[^>]+stroke="${avg.color}"`));
   assert.match(m.legend.innerHTML,new RegExp(`color:${avg.color}[^>]*>.*?SMA 均線 ${avg.period}`));
  }
  m.plot.dispatch('pointermove',{clientX:160,clientY:130});
  const barIndex=Number(m.tooltip.innerHTML.match(/暖機第 (\d+) 日/)[1])-1;
  for(const avg of m.settings.movingAverages) {
   const expected=study.series['ma_'+avg.id][barIndex].toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2});
   assert.ok(m.tooltip.innerHTML.includes(`color:${avg.color}">SMA ${avg.period} ${expected}</span>`));
  }
  assert.doesNotMatch(m.tooltip.innerHTML+m.legend.innerHTML,/EMA|HIDDEN-TICKER|\d{4}-\d{2}-\d{2}/);
  const unchanged=study.series.ma_medium.slice();m.settings.movingAverages[0].period=10;m.settings.movingAverages.pop();m.update();
  assert.equal((m.svg.innerHTML.match(/<path /g)||[]).length,2);assert.doesNotMatch(m.svg.innerHTML+m.legend.innerHTML,/ma_slow|SMA 均線 60/);
  assert.deepEqual(calculateIndicators(m.bars,m.settings).series.ma_medium,unchanged);
 } finally {m.cleanup();}
});

test('duplicate-period instances retain distinct labels and every dynamic line fits price scale',()=>{
 const m=mountChart({allEnabled:false});try {
  m.settings.movingAverages=[{id:'one',type:'ema',period:5,color:'#123456'},{id:'two',type:'ema',period:5,color:'#654321'}];
  const study=calculateIndicators(m.bars,m.settings);
  study.series.ma_one=Array(200).fill(1000);study.series.ma_two=Array(200).fill(1);
  m.chart.update({bars:m.bars,study,settings:m.settings,label:()=> '已知交易日'});
  assert.match(m.legend.innerHTML,/EMA 指數均線 5 · 線 1/);assert.match(m.legend.innerHTML,/EMA 指數均線 5 · 線 2/);
  for(const key of ['ma_one','ma_two']) {
   const path=m.svg.innerHTML.match(new RegExp(`data-series="${key}" d="([^"]+)"`))[1];
   for(const match of path.matchAll(/[ML][\d.]+,([\d.]+)/g))assert.ok(Number(match[1])>=32&&Number(match[1])<=260,`${key} outside price panel`);
  }
  m.plot.dispatch('pointermove',{clientX:160,clientY:130});assert.match(m.tooltip.innerHTML,/EMA 5 · 線 1 1,000.00/);assert.match(m.tooltip.innerHTML,/EMA 5 · 線 2 1.00/);
 } finally {m.cleanup();}
});

test('legacy study arrays are rendered once and explicit empty instances remove all averages',()=>{
 const m=mountChart({allEnabled:false});try {
  m.settings.smaEnabled=true;m.settings.emaEnabled=true;
  const study=calculateIndicators(m.bars,m.settings);delete study.series['ma_legacy-sma'];delete study.series['ma_legacy-ema'];
  m.chart.update({bars:m.bars,study,settings:m.settings,label:()=> '已知交易日'});
  assert.equal((m.svg.innerHTML.match(/<path /g)||[]).length,2);assert.match(m.svg.innerHTML,/data-series="sma"/);assert.match(m.svg.innerHTML,/data-series="ema"/);
  m.settings.movingAverages=[];m.update();assert.equal((m.svg.innerHTML.match(/<path /g)||[]).length,0);assert.equal(m.legend.innerHTML,'');
 } finally {m.cleanup();}
});
