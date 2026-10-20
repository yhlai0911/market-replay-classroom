import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync,execFileSync} from 'node:child_process';
import * as pdf from '../dist/vendor/pdf-lib.js';import fontkit from '../dist/vendor/fontkit.js';import {performancePdf} from '../dist/pdf-report.js';import {createScenario} from '../dist/scenario.js';import {initializeSession} from '../dist/session.js';import {fresh,decide} from '../dist/engine.js';
test('real blind PDFs show explicit N/A reasons for empty, one-return and all-cash risk estimates',{skip:spawnSync('pdftotext',['-v']).error?'Poppler required':false},async()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../dist/dataset.json',import.meta.url))),s=initializeSession(createScenario(data,{startDate:'2024-01-02',length:20,seed:'risk-pdf'})),deps=[pdf,fontkit,fs.readFileSync(new URL('../dist/vendor/NotoSansTC-Regular.ttf',import.meta.url))],dir=fs.mkdtempSync(path.join(os.tmpdir(),'risk-pdf-'));
 try{let state=fresh(s);for(let n=0;n<=2;n++){
 if(n)state=decide(s,state,'hold',0,'保留原文');const before=JSON.stringify(state),file=path.join(dir,n+'.pdf');fs.writeFileSync(file,await performancePdf(s,state,{notes:'完整筆記',reflection:'完整反思'},deps));
 const text=execFileSync('pdftotext',['-f','2','-l','2',file,'-'],{encoding:'utf8'}).replace(/\s/g,'');assert.match(text,/Sharpe/);assert.match(text,/Sortino/);assert.match(text,/N\/A/);assert.doesNotMatch(text,/NaN|Infinity|2024-|0050|元大/);
 if(n===0)assert.match(text,/尚無已完成交易日/);if(n===1)assert.match(text,/至少需要兩個每日報酬觀測/);if(n===2){assert.match(text,/每日報酬標準差為0/);assert.match(text,/下行偏差為0/);assert.match(text,/0.00%/);}
 assert.equal(JSON.stringify(state),before);
 }}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
