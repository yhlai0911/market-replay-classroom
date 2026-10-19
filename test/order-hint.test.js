import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const data=JSON.parse(fs.readFileSync(new URL('../dist/dataset.json',import.meta.url)));

async function mount(){
  let side='buy';
  const defaults={'start-year':'all',length:'20',quantity:'100',seed:'hint-regression','start-date':'2019-11-08'};
  const els=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,{
    id,value:defaults[id]??'',innerHTML:'',textContent:'',options:[{value:''},{value:'2019-11-08'}],
    nextElementSibling:{},style:{},hidden:false,disabled:false,handlers:{},focus(){},
    addEventListener(ev,fn){this.handlers[ev]=fn},
    reset(){side='buy';els.get('quantity').value='100';els.get('reason').value=''}
  }]));
  const radios=['buy','sell','hold'].map(value=>({value,get checked(){return side===value},set checked(v){if(v)side=value},handlers:{},addEventListener(ev,fn){this.handlers[ev]=fn}}));
  globalThis.document={getElementById:id=>els.get(id),querySelectorAll:()=>radios};
  const storageValues=new Map();globalThis.localStorage={getItem:k=>storageValues.get(k)??null,setItem:(k,v)=>storageValues.set(k,v)};globalThis.fetch=async()=>({ok:true,json:async()=>data});
  globalThis.confirm=()=>true;
  globalThis.FormData=class{get(){return side}};
  await import(`../dist/app.js?hint-test=${mount.count++}`);
  const select=value=>{side=value;radios.find(r=>r.value===value).handlers.change()};
  const submit=quantity=>{els.get('quantity').value=String(quantity);els.get('reason').value='測試委託提示';els.get('decision-form').handlers.submit({preventDefault(){},target:els.get('decision-form')})};
  els.get('apply-setup').handlers.click();select('buy');
  return {els,select,submit,hint:()=>els.get('max-buy').textContent};
}
mount.count=0;

test('order hint follows buy/sell/hold changes, trades and reset (DOM stub)',async()=>{
  const {els,select,submit,hint}=await mount();
  assert.match(hint(),/^昨收估算可買上限 [\d,]+ 單位$/);
  select('sell');assert.equal(hint(),'可賣持有量 0 單位');
  select('hold');assert.equal(hint(),'觀望不適用交易單位');assert.equal(els.get('quantity').disabled,true);
  select('buy');assert.equal(els.get('quantity').disabled,false);
  const initial=hint();submit(100);assert.equal(els.get('error').textContent,'');assert.notEqual(hint(),initial);
  select('sell');assert.equal(hint(),'可賣持有量 100 單位');
  submit(50);assert.equal(els.get('error').textContent,'');assert.equal(hint(),'觀望不適用交易單位');select('sell');assert.equal(hint(),'可賣持有量 50 單位');
  select('hold');submit(999);assert.equal(hint(),'觀望不適用交易單位');assert.equal(els.get('quantity').disabled,true);
  els.get('random-start').handlers.click();assert.equal(hint(),'觀望不適用交易單位');assert.equal(els.get('quantity').disabled,true);
  select('sell');assert.equal(hint(),'可賣持有量 0 單位');
});

test('hint changes preserve cash and oversell blocking with no day advancement (DOM stub)',async()=>{
  const {els,select,submit,hint}=await mount();
  const round=els.get('round').textContent;
  submit(1000000);assert.match(els.get('error').textContent,/可用現金不足/);assert.equal(els.get('round').textContent,round);
  select('sell');submit(1);assert.match(els.get('error').textContent,/持有單位不足/);assert.equal(hint(),'可賣持有量 0 單位');assert.equal(els.get('round').textContent,round);
  select('buy');submit(100);select('sell');
  const nextRound=els.get('round').textContent;submit(101);
  assert.match(els.get('error').textContent,/持有單位不足/);assert.equal(hint(),'可賣持有量 100 單位');assert.equal(els.get('round').textContent,nextRound);
});

test('long journal has a bounded keyboard-accessible scroll region and direct completion link (static)',()=>{
  const css=fs.readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
  assert.match(html,/<div id="journal" tabindex="0" role="region" aria-label="[^"]+">/);
  assert.match(css,/\.journal #journal\{max-height:480px;overflow-y:auto;/);
  assert.match(css,/@media\(max-width:560px\)\{\.journal #journal\{max-height:360px\}\}/);
  assert.match(html,/<div id="complete" hidden>.*?<a href="#review">查看回合結算/);
  assert.match(html,/id="quantity" aria-describedby="max-buy"/);
});

test('zero and insufficient holdings never preview negative shares or proceeds and disable submit',async()=>{
 const {els,select,submit}=await mount();select('sell');assert.equal(els.get('submit').disabled,true);assert.equal(els.get('quantity').disabled,true);assert.match(els.get('order-estimate').textContent,/目前沒有持倉可賣/);assert.doesNotMatch(els.get('order-estimate').textContent,/入帳|持有 -/);
 select('buy');assert.equal(els.get('submit').disabled,false);submit(10);select('sell');els.get('quantity').value='11';els.get('quantity').handlers.input();assert.equal(els.get('submit').disabled,true);assert.match(els.get('order-estimate').textContent,/最多可賣 10/);assert.doesNotMatch(els.get('order-estimate').textContent,/入帳|持有 -/);
 els.get('quantity').value='10';els.get('quantity').handlers.input();assert.equal(els.get('submit').disabled,false);assert.doesNotMatch(els.get('order-estimate').textContent,/跳空現金不足/);submit(10);select('sell');assert.equal(els.get('submit').disabled,true);assert.match(els.get('order-estimate').textContent,/沒有持倉/);select('hold');assert.equal(els.get('submit').disabled,false);
});
