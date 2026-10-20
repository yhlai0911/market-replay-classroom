import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const manifest=JSON.parse(fs.readFileSync('.publication/release-manifest.json','utf8'));
if(!manifest.review_basis||!manifest.no_blanket_third_party_license_claim)throw Error('Missing educational data-source disclosure.');
for(const f of ['SOURCES.md','dist/source-notice.html'])if(!fs.existsSync(f))throw Error('Missing attribution file: '+f);
const digest=crypto.createHash('sha256').update(fs.readFileSync('dist/dataset.json')).digest('hex');
if(digest!==manifest.dataset_sha256)throw Error('Publication blocked: release dataset hash does not match.');
const allowed=['.nojekyll','index.html','style.css','app.js','chart.js','interactive-chart.js','blind.js','session.js','indicators.js','report-context.js','engine.js','costs.js','cost-replay.js','scenario.js','persistence.js','practice-store.js','report.js','performance.js','pdf-report.js','dataset.json','dataset-0050-20040211-20261019.json','dataset-registry.js','dataset-manifest.json','source-notice.html'];
for(const name of fs.readdirSync('dist').filter(n=>n!=='vendor'))if(!allowed.includes(name)||!fs.lstatSync('dist/'+name).isFile())throw Error('Unreviewed publication file: '+name);
for(const name of allowed)if(!fs.existsSync('dist/'+name))throw Error('Missing publication file: '+name);
for(const name of allowed.filter(n=>n.endsWith('.js')))execFileSync(process.execPath,['--check','dist/'+name],{stdio:'inherit'});
JSON.parse(fs.readFileSync('dist/dataset.json','utf8'));
console.log('Release manifest, dataset hash and attribution, JSON and JavaScript syntax checks passed.');

const vendors=JSON.parse(fs.readFileSync('dist/vendor/manifest.json','utf8'));
for(const [name,digest] of Object.entries(vendors.files)){if(crypto.createHash('sha256').update(fs.readFileSync('dist/vendor/'+name)).digest('hex')!==digest)throw Error('Vendor hash mismatch: '+name);}
for(const name of fs.readdirSync('dist/vendor'))if(name!=='manifest.json'&&!Object.hasOwn(vendors.files,name))throw Error('Unreviewed vendor file: '+name);
console.log('Pinned PDF vendor files and licenses verified.');

const {createDatasetRegistry}=await import('../dist/dataset-registry.js');
await createDatasetRegistry(JSON.parse(fs.readFileSync('dist/dataset-manifest.json','utf8')),path=>JSON.parse(fs.readFileSync('dist/'+path.slice(2),'utf8')));
console.log('Dataset registry snapshots verified.');

if(crypto.createHash('sha256').update(fs.readFileSync('dist/dataset-manifest.json')).digest('hex')!==manifest.dataset_catalog_sha256)throw Error('Dataset catalog hash does not match release review.');

if(crypto.createHash('sha256').update(fs.readFileSync('dist/dataset-0050-20040211-20261019.json')).digest('hex')!==manifest.expanded_dataset_sha256)throw Error('Expanded snapshot differs from reviewed bytes');
const evidence=JSON.parse(fs.readFileSync('.publication/history-release-evidence.json'));
if(evidence.status!=='PASS_CHECKED_SCOPE'||evidence.hardErrors!==0||evidence.unresolvedFlags!==0||evidence.canonicalHash!==manifest.expanded_dataset_canonical_hash||evidence.byteSha256!==manifest.expanded_dataset_sha256)throw Error('Expanded history review gate failed');
