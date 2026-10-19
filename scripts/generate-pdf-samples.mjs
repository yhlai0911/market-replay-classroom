import fs from 'node:fs';
import * as pdf from '../dist/vendor/pdf-lib.js';
import fontkit from '../dist/vendor/fontkit.js';
import {performancePdf} from '../dist/pdf-report.js';
import {datasetVersion,restoreSave} from '../dist/persistence.js';
import {createScenario} from '../dist/scenario.js';
import {fresh,decide} from '../dist/engine.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/dataset.json',import.meta.url)));
const deps=[pdf,fontkit,fs.readFileSync(new URL('../dist/vendor/NotoSansTC-Regular.ttf',import.meta.url))];
const out=process.argv[2]??'output/pdf';fs.mkdirSync(out,{recursive:true});
const version=await datasetVersion(data);
const backup=process.argv[3];
const loaded=backup?restoreSave(fs.readFileSync(backup,'utf8'),data,version):null;
async function write(name,s,state,draft){const bytes=await performancePdf(s,state,{...draft,generatedAt:'2026-10-19T13:00:00Z'},deps);fs.writeFileSync(`${out}/${name}.pdf`,bytes);console.log(name,bytes.length);}
if(loaded)await write('actual-backup',loaded.s,loaded.state,loaded.draft);
const s=createScenario(data,{seed:'pdf-stress-120',startDate:'2024-01-02',length:120,startYear:'2024'});let st=fresh(s);
await write('zero-decisions',s,st,{studentName:'尚未交易測試'});
for(let i=0;i<s.rounds.length;i++){const side=i%4===0?'buy':i%4===2?'sell':'hold';st=decide(s,st,side,side==='hold'?0:10,`第 ${i+1} 筆完整決策理由。`+'觀察當時已公布的資訊，記錄風險與下一步判斷。'.repeat(i===37?35:4)+`完整尾記${i+1}`);}
await write('full-120-decisions',s,st,{studentName:'長篇排版測試',studentId:'QA-120',notes:'操作筆記逐字保留。\n'+'跨頁完整筆記：保留風險觀察及操作依據。'.repeat(500)+'\n'+'LONGTOKEN'.repeat(120)+'\n筆記完整結尾',reflection:'反思紀錄。'.repeat(300)+'反思完整結尾',reason:'未送出草稿完整結尾',side:'hold'});
