// Recompute reports from a normal UI JSON backup. Never modify the source file.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createDatasetRegistry} from '../dist/dataset-registry.js';
import {performanceModel,RISK_ASSUMPTIONS,RISK_METHODS} from '../dist/performance.js';
import {performancePdf} from '../dist/pdf-report.js';
import {learningReport} from '../dist/report.js';
import * as pdf from '../dist/vendor/pdf-lib.js';
import fontkit from '../dist/vendor/fontkit.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const input=process.argv[2],output=process.argv[3];
if(!input||!output)throw Error('Usage: node scripts/recompute-session.mjs ORIGINAL_BACKUP.json NEW_OUTPUT_DIRECTORY');
const source=fs.readFileSync(input),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const registry=await createDatasetRegistry(JSON.parse(fs.readFileSync(path.join(root,'dist/dataset-manifest.json'))),file=>JSON.parse(fs.readFileSync(path.join(root,'dist',file.slice(2)))));
const {s,state,draft}=registry.restore(source.toString('utf8')),saved=JSON.parse(source),before=JSON.stringify({s,state,draft});
const model=performanceModel(s,state),generatedAt=new Date().toISOString();
// A new output directory prevents overwriting an earlier report or the input backup.
fs.mkdirSync(output,{recursive:false});
const prefix=`market-replay-${state.journal.length}-day`;
const options={...draft,practiceName:saved.practice?.name??'',generatedAt};
const bytes=await performancePdf(s,state,options,[pdf,fontkit,fs.readFileSync(path.join(root,'dist/vendor/NotoSansTC-Regular.ttf'))]);
fs.writeFileSync(path.join(output,`${prefix}-risk-report.pdf`),bytes);
fs.writeFileSync(path.join(output,`${prefix}-risk-report.html`),learningReport(s,state,options));
fs.writeFileSync(path.join(output,'original-session-backup.json'),source);
fs.writeFileSync(path.join(output,'recomputed-performance.json'),JSON.stringify({format:'market-replay-derived-performance',version:1,generatedAt,sourceSha256:sha(source),datasetVersion:s.datasetVersion,assumptions:RISK_ASSUMPTIONS,methods:RISK_METHODS,performance:model},null,2)+'\n');
if(JSON.stringify({s,state,draft})!==before||sha(fs.readFileSync(input))!==sha(source))throw Error('Session changed during report generation');
console.log(JSON.stringify({output,sourceSha256:sha(source),decisions:model.completed,strategy:model.currentAssets,buyHold:model.benchmarkAssets},null,2));
