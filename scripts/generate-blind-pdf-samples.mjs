import fs from 'node:fs';import * as pdf from '../dist/vendor/pdf-lib.js';import fontkit from '../dist/vendor/fontkit.js';import {performancePdf,reportFilename} from '../dist/pdf-report.js';import {createScenario} from '../dist/scenario.js';import {fresh,decide} from '../dist/engine.js';import {datasetVersion,makeSave,restoreSave,emptyDraft} from '../dist/persistence.js';import {initializeSession,setIndicatorSettings,revealSession} from '../dist/session.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/dataset.json',import.meta.url)));const deps=[pdf,fontkit,fs.readFileSync(new URL('../dist/vendor/NotoSansTC-Regular.ttf',import.meta.url))];const out=process.argv[2]??'output/pdf';fs.mkdirSync(out,{recursive:true});const version=await datasetVersion(data);
let s=initializeSession(createScenario(data,{seed:'classroom-integrated',startDate:'2024-08-13',startYear:'2024',warmup:260,length:20}),version),st=fresh(s);
st=decide(s,st,'buy',20,'完整決策1：依當時資料觀察，保留風險空間。');
setIndicatorSettings(s,st,{...s.indicatorSettings,emaEnabled:true,emaPeriod:30,macdEnabled:true});
setIndicatorSettings(s,st,{...s.indicatorSettings,rsiEnabled:true,rsiPeriod:9});
st=decide(s,st,'hold',0,'完整決策2：調整顯示參數後等待更多證據。');
setIndicatorSettings(s,st,{...s.indicatorSettings,emaPeriod:40});
st=decide(s,st,'hold',0,'完整決策3：區分價格變化與指標設定變化。');
const options={...emptyDraft(),studentName:'範例學生',notes:'完整操作筆記，保留原文。',reflection:'檢查資訊是否足以支持決策。',generatedAt:'2026-10-19T13:15:00Z'};
function roundtrip(){const saved=makeSave(s,st,version,options);fs.writeFileSync(`${out}/integrated-state.json`,JSON.stringify(saved,null,2));const restored=restoreSave(JSON.stringify(saved),data,version);s=restored.s;st=restored.state;}
async function write(name){roundtrip();const bytes=await performancePdf(s,st,options,deps);fs.writeFileSync(`${out}/${name}.pdf`,bytes);fs.writeFileSync(`${out}/${name}.json`,JSON.stringify(makeSave(s,st,version,options),null,2));console.log(name,bytes.length,reportFilename(s,st));}
await write('blind-progress');const blindSave=makeSave(s,st,version,options);revealSession(s,st);await write('revealed-progress');({s,state:st}=restoreSave(JSON.stringify(blindSave),data,version));while(!st.finished)st=decide(s,st,'hold',0,`完整決策${st.journal.length+1}：等待更多證據。`);await write('completed-revealed');
