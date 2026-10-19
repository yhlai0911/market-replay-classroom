import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as pdf from '../dist/vendor/pdf-lib.js';
import fontkit from '../dist/vendor/fontkit.js';
import {performancePdf} from '../dist/pdf-report.js';
import {createScenario} from '../dist/scenario.js';
import {fresh,decide} from '../dist/engine.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/dataset.json',import.meta.url)));
const dependencies=[pdf,fontkit,fs.readFileSync(new URL('../dist/vendor/NotoSansTC-Regular.ttf',import.meta.url))];
test('same browser renderer creates real A4 PDF with embedded font, metadata and no decisions',async()=>{
 const s=createScenario(data,{seed:'pdf-test',startDate:'2024-01-02',length:20,startYear:'2024'});
 const bytes=await performancePdf(s,fresh(s),{studentName:'繁體中文𠮷😀',notes:'保留文字與罕見字',generatedAt:'2026-10-19T13:00:00Z'},dependencies);
 assert.equal(Buffer.from(bytes).subarray(0,5).toString(),'%PDF-');const doc=await pdf.PDFDocument.load(bytes);
 assert.equal(doc.getTitle(),'時光交易所｜交易練習報告');assert.ok(doc.getPageCount()>=4);
 for(const p of doc.getPages()){assert.ok(Math.abs(p.getWidth()-595.28)<.01);assert.ok(Math.abs(p.getHeight()-841.89)<.01);assert.ok(p.node.Resources().lookup(pdf.PDFName.of('Font')).keys().length>0);}
});
test('renderer flows long notes and rationale across extra pages without changing state',async()=>{
 const s=createScenario(data,{seed:'pdf-long',startDate:'2024-01-02',length:20,startYear:'2024'});const st=decide(s,fresh(s),'hold',0,'理由完整保留'.repeat(120));const before=JSON.stringify(st);
 const bytes=await performancePdf(s,st,{notes:'長筆記完整保留。'.repeat(1200)+'LONGTOKEN'.repeat(120),reflection:'反思尾記'},dependencies);
 const doc=await pdf.PDFDocument.load(bytes);assert.ok(doc.getPageCount()>8);assert.equal(JSON.stringify(st),before);
});
test('UI direct PDF path disables repeated clicks, restores button and keeps recoverable error',()=>{
 const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 assert.match(app,/await performancePdf/);assert.match(app,/'application\/pdf'/);assert.match(app,/if\(button.disabled\)return/);assert.match(app,/finally\{button.disabled=false/);assert.match(app,/PDF 匯出失敗/);assert.doesNotMatch(app,/window.print|learningReport/);assert.match(html,/下載交易練習報告（PDF）/);assert.doesNotMatch(html,/HTML／列印 PDF/);
});
