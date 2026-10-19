import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const manifest=JSON.parse(fs.readFileSync('.publication/release-manifest.json','utf8'));
if(!manifest.review_basis||!manifest.no_blanket_third_party_license_claim)throw Error('Missing educational data-source disclosure.');
for(const f of ['SOURCES.md','dist/source-notice.html'])if(!fs.existsSync(f))throw Error('Missing attribution file: '+f);
const digest=crypto.createHash('sha256').update(fs.readFileSync('dist/dataset.json')).digest('hex');
if(digest!==manifest.dataset_sha256)throw Error('Publication blocked: release dataset hash does not match.');
const allowed=['.nojekyll','index.html','style.css','app.js','chart.js','blind.js','session.js','indicators.js','report-context.js','engine.js','scenario.js','persistence.js','report.js','performance.js','pdf-report.js','dataset.json','source-notice.html'];
for(const name of fs.readdirSync('dist').filter(n=>n!=='vendor'))if(!allowed.includes(name)||!fs.lstatSync('dist/'+name).isFile())throw Error('Unreviewed publication file: '+name);
for(const name of allowed)if(!fs.existsSync('dist/'+name))throw Error('Missing publication file: '+name);
for(const name of allowed.filter(n=>n.endsWith('.js')))execFileSync(process.execPath,['--check','dist/'+name],{stdio:'inherit'});
JSON.parse(fs.readFileSync('dist/dataset.json','utf8'));
console.log('Release manifest, dataset hash and attribution, JSON and JavaScript syntax checks passed.');

const vendors=JSON.parse(fs.readFileSync('dist/vendor/manifest.json','utf8'));
for(const [name,digest] of Object.entries(vendors.files)){if(crypto.createHash('sha256').update(fs.readFileSync('dist/vendor/'+name)).digest('hex')!==digest)throw Error('Vendor hash mismatch: '+name);}
for(const name of fs.readdirSync('dist/vendor'))if(name!=='manifest.json'&&!Object.hasOwn(vendors.files,name))throw Error('Unreviewed vendor file: '+name);
console.log('Pinned PDF vendor files and licenses verified.');
