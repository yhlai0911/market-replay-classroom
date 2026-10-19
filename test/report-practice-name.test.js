import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import * as pdf from '../dist/vendor/pdf-lib.js';
import fontkit from '../dist/vendor/fontkit.js';
import {performancePdf} from '../dist/pdf-report.js';
import {learningReport} from '../dist/report.js';
import {createScenario} from '../dist/scenario.js';
import {fresh,decide} from '../dist/engine.js';
import {initializeSession} from '../dist/session.js';
import {datasetVersion,makeSave,restoreSave,emptyDraft} from '../dist/persistence.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/dataset.json',import.meta.url)));
const deps=[pdf,fontkit,fs.readFileSync(new URL('../dist/vendor/NotoSansTC-Regular.ttf',import.meta.url))];
test('two restored practices export their own name, notes and decision count without internal IDs',{skip:spawnSync('pdftotext',['-v']).error?'Poppler required for PDF text QA':false},async()=>{
 const version=await datasetVersion(data),out=process.env.PRACTICE_PDF_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'practice-pdf-'));fs.mkdirSync(out,{recursive:true});
 const records=[{name:'練習甲：耐心觀察',notes:'甲局獨有筆記 APPLE',count:1},{name:'練習乙：比較均線',notes:'乙局獨有筆記 ORANGE',count:3}];
 for(let k=0;k<records.length;k++){
  const r=records[k],other=records[1-k];const s=initializeSession(createScenario(data,{seed:'practice-'+k,startDate:'2024-08-13',startYear:'2024',warmup:260,length:20}),version);let state=fresh(s);
  for(let i=0;i<r.count;i++)state=decide(s,state,'hold',0,`${r.name}理由${i+1}`);
  const record={id:'INTERNAL-PRACTICE-ID-'+k,name:r.name,save:makeSave(s,state,version,{...emptyDraft(),notes:r.notes})};
  const loaded=restoreSave(JSON.stringify(record.save),data,version),options={...loaded.draft,practiceName:record.name};
  const file=path.join(out,`practice-${k+1}.pdf`);fs.writeFileSync(file,await performancePdf(loaded.s,loaded.state,options,deps));
  const text=execFileSync('pdftotext',[file,'-'],{encoding:'utf8'}).replace(/\s/g,'');
  assert.ok(text.includes('練習名稱：'+r.name));assert.ok(text.includes(r.notes.replace(/\s/g,'')));assert.ok(text.includes(`${r.count}/20個決策日`));assert.ok(!text.includes(other.name));assert.ok(!text.includes(other.notes.replace(/\s/g,'')));assert.ok(!text.includes(record.id));
  for(const revealed of [false,true]){loaded.s.blind.revealed=revealed;const html=learningReport(loaded.s,loaded.state,options);assert.ok(html.includes('練習名稱：'+r.name));assert.ok(html.includes(r.notes));assert.ok(!html.includes(other.name));assert.ok(!html.includes(record.id));}
 }
});
test('optional practice name is escaped in HTML and absent for old drafts',()=>{
 const s=createScenario(data,{seed:'name-escape',length:20});const st=fresh(s);
 assert.ok(!learningReport(s,st).includes('練習名稱：'));
 const html=learningReport(s,st,{practiceName:'<script>alert(1)</script>'});assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>alert'));
});
