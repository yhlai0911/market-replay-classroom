import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {learningReport} from '../dist/report.js';
import {fresh,decide,wealth,benchmark} from '../dist/engine.js';
import {createScenario} from '../dist/scenario.js';

const generatedAt='2026-10-19T10:00:00Z';
const render=(s,st,options={})=>learningReport(s,st,{generatedAt,...options});
const metric=(html,id)=>html.match(new RegExp(`<dd id="${id}">([^<]*)</dd>`))?.[1];
function scenario(){
  const bars=[100,110,90,120].map((close,i)=>({date:`2024-01-0${i+2}`,openAt:`2024-01-0${i+2}T01:00:00Z`,closeAt:`2024-01-0${i+2}T05:30:00Z`,open:100,close,high:Math.max(close,100),low:Math.min(close,100),volume:1000,sourceUrl:`https://example.test/known-${i}`}));
  return {id:'test-scenario',title:'測試回放',seed:'teacher-1',startYear:'2024',startDate:'2024-01-02',asset:'0050',currency:'TWD',initialCash:1000,feeRate:.001,history:[],corporateActions:[],news:[{id:'early',title:'早期新聞',availableAt:'2024-01-01T00:00:00Z',source:'官方',url:'https://example.test/early'},{id:'later',title:'第二天才可知',availableAt:'2024-01-03T00:00:00Z',url:'https://example.test/later'},{id:'future',title:'禁止揭露未來新聞',availableAt:'2030-01-01T00:00:00Z',url:'https://example.test/future'}],rounds:bars.map((bar,i)=>({at:bar.date+'T00:55:00Z',executionAt:bar.openAt,executionPrice:bar.open,price:i?bars[i-1].close:100,priceAt:i?bars[i-1].closeAt:'2024-01-01T05:30:00Z',close:bar.close,closeAt:bar.closeAt,revealAt:`2024-01-0${i+3}T00:55:00Z`,bar,news:[]}))};
}

test('fresh report is an in-progress zero-decision snapshot with editable blank student sections',()=>{
  const s=scenario(),html=render(s,fresh(s));
  assert.match(html,/進行中快照/);assert.match(html,/已完成 0 \/ 4/);assert.match(html,/尚無已完成的決策/);
  assert.equal(metric(html,'current-assets'),'TWD 1,000.00');assert.equal(metric(html,'benchmark-return'),'0.00%');assert.equal(metric(html,'max-drawdown'),'0.00%');
  assert.match(html,/aria-label="學生反思"><\/div>/);assert.match(html,/aria-label="學生筆記"><\/div>/);assert.match(html,/不會自動儲存/);assert.match(html,/另存為 PDF/);
  assert.match(html,/teacher-1/);assert.match(html,/起點年份設定：2024/);assert.match(html,/2026-10-19T10:00:00Z/);
  assert.doesNotMatch(html,/NaN|Infinity|禁止揭露未來新聞|known-0/);
});

test('metrics, drawdown, journal and completed status agree with engine',()=>{
  const s=scenario();let st=decide(s,fresh(s),'buy',5,'先買入');
  st=decide(s,st,'hold',0,'觀察');st=decide(s,st,'sell',2,'減少持倉');st=decide(s,st,'hold',0,'完成');
  const html=render(s,st);
  assert.match(html,/已完成回合/);assert.match(html,/已完成 4 \/ 4/);assert.equal((html.match(/class="decision"/g)||[]).length,4);
  assert.equal(wealth(s,st),1059.3);assert.equal(metric(html,'current-assets'),'TWD 1,059.30');
  assert.equal(metric(html,'portfolio-return'),'5.93%');assert.equal(metric(html,'benchmark-assets'),'TWD 1,179.10');assert.equal(metric(html,'benchmark-return'),'17.91%');assert.equal(metric(html,'relative-return'),'-11.98 個百分點');
  assert.equal(metric(html,'total-fees'),'TWD 0.70');assert.equal(metric(html,'cash'),'TWD 699.30');assert.equal(metric(html,'holdings'),'3');assert.equal(metric(html,'holding-value'),'TWD 360.00');
  assert.equal(metric(html,'max-drawdown'),`${((1049.5-969.3)/1049.5*100).toFixed(2)}%`);
  assert.match(html,/<svg /);assert.match(html,/共 5 個觀測值/);assert.match(html,/2024-01-05 收盤/);assert.match(html,/先買入/);assert.match(html,/無成交/);
});

test('snapshot does not expose future bars, prices, source links or future news, including forged future news IDs',()=>{
  const s=scenario();s.rounds[3].bar.close=987654321;s.rounds[3].close=987654321;
  const st=decide(s,fresh(s),'buy',1,'only first');st.journal[0].newsIds.push('later','future','missing');
  const html=render(s,st);
  assert.match(html,/早期新聞/);assert.match(html,/known-0/);
  assert.doesNotMatch(html,/第二天才可知|禁止揭露未來新聞|987654321|known-1|known-2|known-3|example.test\/future|example.test\/later/);
  assert.match(html,/已完成 1 \/ 4/);
});

test('each decision news reference is gated by its own historical cutoff',()=>{
  const s=scenario();let st=decide(s,fresh(s),'hold',0,'first');st=decide(s,st,'hold',0,'second');
  st.journal[0].newsIds.push('later');const html=render(s,st),sections=[...html.matchAll(/<article class="decision">([\s\S]*?)<\/article>/g)].map(m=>m[1]);
  assert.doesNotMatch(sections[0],/later/);assert.match(sections[1],/later/);assert.equal((html.match(/第二天才可知/g)||[]).length,1);
});

test('canceled orders preserve requested and actual quantities, fees and reason without claiming a fill',()=>{
  const s=scenario();s.rounds[0].executionPrice=200;
  const st=decide(s,fresh(s),'buy',9,'gap risk'),html=render(s,st);
  assert.match(html,/<td>9<\/td><td>0<\/td><td>—（無成交）<\/td><td>TWD 0.00/);assert.match(html,/已取消：開盤跳空後現金不足/);assert.match(html,/gap risk/);assert.equal(metric(html,'total-fees'),'TWD 0.00');
});

test('user text, source metadata, attributes and textarea-breaking payloads are escaped',()=>{
  const s=scenario(),attack='</div></textarea><script>alert("x")</script><img src=x onerror=alert(1)> & \' "';
  s.title=attack;s.id=attack;s.seed=attack;s.asset=attack;s.currency=attack;s.startYear=attack;s.startDate=attack;
  s.news[0].title=attack;s.news[0].source=attack;s.news[0].vintageNote=attack;s.news[0].url='javascript:alert(1)';
  const st=decide(s,fresh(s),'hold',0,attack),html=render(s,st,{studentName:attack,studentId:attack,notes:attack,reflection:attack,generatedAt:attack});
  assert.doesNotMatch(html,/<script|<img|<textarea|javascript:|onerror="|onerror='|<\/textarea>/i);
  assert.match(html,/&lt;script&gt;/);assert.match(html,/&quot;x&quot;/);assert.match(html,/&#39;/);assert.match(html,/無可用安全連結/);
  assert.equal((html.match(/contenteditable="true"/g)||[]).length,2);
});

test('only absolute http(s) source links survive; URLs cannot break attributes',()=>{
  for(const bad of ['javascript:alert(1)','data:text/html,evil','file:///secret','//example.test','/relative','blob:https://example.test/id']){
    const s=scenario();s.news[0].url=bad;s.rounds[0].bar.sourceUrl=bad;
    const html=render(s,decide(s,fresh(s),'hold',0,'wait'));
    assert.doesNotMatch(html,/<a href=/);
  }
  const s=scenario();s.news[0].url='https://example.test/?x="&y=<test>';
  const html=render(s,decide(s,fresh(s),'hold',0,'wait'));
  assert.match(html,/href="https:\/\/example.test\/\?x=%22&amp;y=%3Ctest%3E"/);assert.match(html,/rel="noopener noreferrer"/);
});

test('standalone report has no remote assets, modules, network API, storage or extra script; print is the only handler',()=>{
  const s=scenario(),html=render(s,fresh(s));
  assert.match(html,/^<!doctype html>/);assert.match(html,/<html lang="zh-Hant">/);assert.match(html,/@page\{size:A4/);assert.match(html,/@media print/);
  assert.doesNotMatch(html,/<script|<link|<iframe|<img|<form|@import|url\(|fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|type="module"/i);
  assert.deepEqual([...html.matchAll(/\son\w+="([^"]*)"/g)].map(m=>m[1]),['window.print()']);
});

test('real dividend/split dataset retains exact engine valuation without mutating inputs',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../dist/dataset.json',import.meta.url)));
  for(const startDate of ['2024-07-15','2025-06-09']){
    const s=createScenario(data,{startDate,length:20,seed:'report'});let st=decide(s,fresh(s),'buy',100,'持有');
    st=decide(s,st,'hold',0,'等待');const before=JSON.stringify({s,st}),html=render(s,st);
    const money=v=>`TWD ${v.toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    assert.equal(metric(html,'current-assets'),money(wealth(s,st)));assert.equal(metric(html,'benchmark-assets'),money(benchmark(s,st)));assert.equal(metric(html,'receivables'),money(st.receivable));
    assert.equal(JSON.stringify({s,st}),before);
  }
});

test('120-day report deduplicates news details, retains each full historical ID set and stays below 1 MB',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../dist/dataset.json',import.meta.url)));
  const s=createScenario(data,{startDate:'2025-07-01',length:120,seed:'report-size'});let st=fresh(s);
  while(!st.finished)st=decide(s,st,'hold',0,'觀察');
  const html=render(s,st),allIds=new Set(st.journal.flatMap(j=>j.newsIds));
  assert.equal((html.match(/class="news-reference"/g)||[]).length,allIds.size);
  const lists=[...html.matchAll(/<p class="news-ids">([^<]*)<\/p>/g)].map(m=>m[1].split('、'));
  assert.equal(lists.length,120);
  lists.forEach((ids,i)=>assert.deepEqual(ids,st.journal[i].newsIds));
  assert.equal((html.match(/<details class="no-print">/g)||[]).length,120);
  assert.match(html,/首日基底 ID/);assert.match(html,/較前次決策新增可見 ID/);
  assert.match(html,/列印不包含展開清單/);
  const bytes=Buffer.byteLength(html);assert(bytes<1000000,`Report is ${bytes} bytes`);
});

test('unsent draft is optional, escaped and clearly separate from completed actions',()=>{
  const s=scenario(),st=fresh(s),html=render(s,st,{reason:'<script>unsent</script>',side:'sell',quantity:'5" onload="bad'});
  assert.match(html,/尚未送出的決策草稿（非已完成操作）/);assert.match(html,/此草稿未執行/);assert.match(html,/方向：賣出/);
  assert.match(html,/&lt;script&gt;unsent&lt;\/script&gt;/);assert.match(html,/5&quot; onload=&quot;bad/);assert.match(html,/已完成 0 \/ 4/);
  assert.doesNotMatch(render(s,st),/尚未送出的決策草稿/);
});
