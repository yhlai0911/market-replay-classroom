import test from 'node:test';
import assert from 'node:assert/strict';
import { createPracticeStore, PRACTICE_STORE_KEY } from '../dist/practice-store.js';
const SAVE_KEY='market-replay-save-v1',BACKUP_KEY='market-replay-previous-v1';
function memory(initial={}) {
 const values=new Map(Object.entries(initial));let writes=0,throwWrite=false,throwRead=false;
 return {values,get writes(){return writes;},set throwWrite(value){throwWrite=value;},set throwRead(value){throwRead=value;},getItem(key){if(throwRead)throw Error('read denied');return values.get(key)??null;},setItem(key,value){if(throwWrite)throw Error('quota');writes++;values.set(key,value);}};
}
const save=(seed='same',completed=false)=>({format:'test-save',version:2,updatedAt:'2026-10-19T12:00:00.000Z',scenario:{seed},state:{completed,journal:[]},draft:{notes:'完整保留筆記'},unknown:{nested:['keep',42]}});
const validate=raw=>{const value=JSON.parse(raw);assert.equal(value.format,'test-save');assert.equal(value.version,2);return {state:value.state};};
const create=storage=>createPracticeStore(storage,{validate});
const activeId=store=>JSON.parse(store.raw()).practice.id;

test('empty store is lazy; writes create and update stable UUID records with export metadata',()=>{
 const storage=memory(),store=create(storage);assert.equal(store.read(),null);assert.equal(storage.writes,0);assert.deepEqual(store.list(),[]);
 const input=save();assert.equal(store.write(input),input.updatedAt);const id=activeId(store);
 assert.match(id,/^[0-9a-f-]{36}$/);assert.equal(input.practice.id,id);assert.equal(store.list()[0].save.practice.id,id);
 const changed=save();changed.draft.notes='新筆記';store.write(changed);assert.equal(activeId(store),id);assert.equal(store.list().length,1);assert.equal(store.list()[0].save.draft.notes,'新筆記');
 assert.equal(JSON.parse(storage.getItem(PRACTICE_STORE_KEY)).revision,2);
});

test('replace always adds a new UUID for same seeds, different seeds and duplicate imported identities',()=>{
 const store=create(memory());store.read();const input=save();store.write(input);const first=activeId(store);
 store.write(JSON.parse(store.raw()),{replace:true});const second=activeId(store);assert.notEqual(first,second);
 store.write(save('other',true),{replace:true});const third=activeId(store);assert.notEqual(third,first);assert.notEqual(third,second);
 assert.equal(store.list().length,3);assert.ok(store.list().some(r=>r.save.state.completed));assert.ok(store.list().some(r=>!r.save.state.completed));
});

test('legacy current and identical backup migrate into two records without touching original keys',()=>{
 const raw=JSON.stringify(save()),storage=memory({[SAVE_KEY]:raw,[BACKUP_KEY]:raw}),store=create(storage);
 const active=JSON.parse(store.read());assert.equal(store.list().length,2);assert.equal(storage.writes,1);assert.equal(storage.getItem(SAVE_KEY),raw);assert.equal(storage.getItem(BACKUP_KEY),raw);assert.equal(store.previous(),raw);
 assert.notEqual(store.list()[0].id,store.list()[1].id);assert.equal(store.list().find(r=>r.id===active.practice.id).save.draft.notes,'完整保留筆記');
 for(const record of store.list()){const {practice,...preserved}=record.save;assert.deepEqual(preserved,JSON.parse(raw));assert.deepEqual(practice,{id:record.id,name:record.name});}
 assert.equal(create(storage).read(),store.raw());assert.equal(storage.writes,1);
});

test('backup-only legacy data is retained and activated',()=>{
 const raw=JSON.stringify(save('backup')),storage=memory({[BACKUP_KEY]:raw}),store=create(storage);
 assert.equal(JSON.parse(store.read()).scenario.seed,'backup');assert.equal(store.list().length,1);assert.equal(storage.getItem(BACKUP_KEY),raw);
});

test('rename, activate, trash and restore preserve records and metadata without automatic activation',()=>{
 const store=create(memory());store.read();store.write(save());const first=activeId(store);store.write(save('second'),{replace:true});const second=activeId(store);
 const renamed=store.rename(first,'  第一次練習  ');assert.equal(renamed.name,'第一次練習');assert.deepEqual(renamed.save.practice,{id:first,name:'第一次練習'});
 assert.equal(JSON.parse(store.activate(first)).practice.name,'第一次練習');assert.equal(store.trash(first),null);assert.equal(store.raw(),null);assert.equal(store.list().length,1);assert.equal(store.list({deleted:true}).length,1);
 assert.throws(()=>store.activate(first),e=>e.code==='DELETED');const restored=store.restore(first);assert.equal(restored.deletedAt,null);assert.equal(store.raw(),null);assert.equal(store.list().length,2);
 store.activate(second);store.trash(first);assert.equal(activeId(store),second);store.rename(first,'垃圾桶也可改名');assert.equal(store.list({deleted:true})[0].name,'垃圾桶也可改名');
 for(const name of ['', ' ', 'x'.repeat(101),null])assert.throws(()=>store.rename(second,name));
});

test('returned lists and raw objects cannot mutate internal memory',()=>{
 const store=create(memory());store.read();store.write(save());const row=store.list()[0];row.save.draft.notes='外部改動';row.name='改動';assert.equal(store.list()[0].save.draft.notes,'完整保留筆記');assert.notEqual(store.list()[0].name,'改動');
});

test('every mutation rejects another-tab envelope changes, including explicit replace',()=>{
 for(const operation of ['write','replace','activate','rename','trash','restore']) {
  const storage=memory(),one=create(storage);one.read();one.write(save());const id=activeId(one),two=create(storage);two.read();
  one.rename(id,'分頁一最新名稱');const latest=storage.getItem(PRACTICE_STORE_KEY),oldMemory=two.raw();
  const actions={write:()=>two.write(save()),replace:()=>two.write(save(),{replace:true}),activate:()=>two.activate(id),rename:()=>two.rename(id,'分頁二'),trash:()=>two.trash(id),restore:()=>two.restore(id)};
  assert.throws(actions[operation],e=>e.code==='CONFLICT',operation);assert.equal(storage.getItem(PRACTICE_STORE_KEY),latest);assert.equal(two.raw(),oldMemory);
 }
});

test('setItem failures never change memory, active selection, caller metadata, or persisted data',()=>{
 const storage=memory(),store=create(storage);store.read();store.write(save());const first=activeId(store);store.write(save('two'),{replace:true});const before=store.raw(),envelope=storage.getItem(PRACTICE_STORE_KEY),rows=store.list();
 const input=save();storage.throwWrite=true;
 for(const action of [()=>store.write(input),()=>store.write(input,{replace:true}),()=>store.activate(first),()=>store.rename(first,'failed'),()=>store.trash(first),()=>store.restore(first)]) {
  assert.throws(action,e=>e.code==='STORAGE_WRITE');assert.equal(store.raw(),before);assert.deepEqual(store.list(),rows);assert.equal(storage.getItem(PRACTICE_STORE_KEY),envelope);assert.equal(input.practice,undefined);
 }
 storage.throwWrite=false;store.rename(first,'retry success');assert.equal(store.list().find(r=>r.id===first).name,'retry success');
});

test('migration failure retains all legacy data and safely retries',()=>{
 const raw=JSON.stringify(save()),storage=memory({[SAVE_KEY]:raw,[BACKUP_KEY]:raw}),store=create(storage);storage.throwWrite=true;
 assert.throws(()=>store.read(),e=>e.code==='STORAGE_WRITE');assert.equal(storage.getItem(PRACTICE_STORE_KEY),null);assert.equal(storage.getItem(SAVE_KEY),raw);assert.equal(storage.getItem(BACKUP_KEY),raw);
 storage.throwWrite=false;store.read();assert.equal(store.list().length,2);
});

test('corrupt envelope or any corrupt legacy save blocks all overwrite, including replace',()=>{
 for(const initial of [{[PRACTICE_STORE_KEY]:'broken'}, {[SAVE_KEY]:'broken'}, {[SAVE_KEY]:JSON.stringify(save()),[BACKUP_KEY]:'broken'}]) {
  const storage=memory(initial),store=create(storage);assert.throws(()=>store.read());assert.throws(()=>store.write(save(),{replace:true}));assert.equal(storage.writes,0);for(const [key,value] of Object.entries(initial))assert.equal(storage.getItem(key),value);
 }
});

test('read validates every saved record including deleted records and rejects metadata disagreement',()=>{
 const storage=memory(),store=create(storage);store.read();store.write(save());const id=activeId(store);store.write(save('second'),{replace:true});store.trash(id);
 let calls=0;const reader=createPracticeStore(storage,{validate:raw=>{calls++;return validate(raw);}});reader.read();assert.equal(calls,2);
 const broken=JSON.parse(storage.getItem(PRACTICE_STORE_KEY));broken.records.find(r=>r.id===id).save.format='bad';const raw=JSON.stringify(broken);storage.values.set(PRACTICE_STORE_KEY,raw);
 assert.throws(()=>reader.read());assert.throws(()=>reader.write(save(),{replace:true}),e=>e.code==='CORRUPT');assert.equal(storage.getItem(PRACTICE_STORE_KEY),raw);
 broken.records.find(r=>r.id===id).save.format='test-save';broken.records[0].save.practice.name='different';storage.values.set(PRACTICE_STORE_KEY,JSON.stringify(broken));assert.throws(()=>create(storage).read());
});

test('lock forbids implicit mutations and permits only explicit replacement without deleting history',()=>{
 const store=create(memory());store.read();store.write(save());const first=activeId(store);store.lock();assert.throws(()=>store.write(save()),e=>e.code==='LOCKED');assert.throws(()=>store.rename(first,'bad'),e=>e.code==='LOCKED');assert.throws(()=>store.activate(first),e=>e.code==='LOCKED');
 store.write(save(),{replace:true});assert.equal(store.list().length,2);assert.notEqual(activeId(store),first);store.write(save());
});

test('read failures and invalid input saves do not create or modify the envelope',()=>{
 const storage=memory(),store=create(storage);storage.throwRead=true;assert.throws(()=>store.read(),e=>e.code==='STORAGE_READ');storage.throwRead=false;store.read();assert.throws(()=>store.write({format:'invalid'}));assert.equal(storage.writes,0);assert.equal(store.raw(),null);
});

test('malformed envelope identities, revisions and deleted active IDs are rejected without writes',()=>{
 const storage=memory(),store=create(storage);store.read();store.write(save());const original=storage.getItem(PRACTICE_STORE_KEY);
 for(const mutate of [x=>x.revision=-1,x=>x.version=2,x=>x.activeId='missing',x=>x.records.push({...x.records[0]}),x=>x.records[0].id='not-uuid',x=>x.records[0].deletedAt='invalid-date',x=>x.records[0].deletedAt='2026-10-19T00:00:00Z']) {
  const broken=JSON.parse(original);mutate(broken);const raw=JSON.stringify(broken);storage.values.set(PRACTICE_STORE_KEY,raw);const writes=storage.writes;
  assert.throws(()=>create(storage).read());assert.equal(storage.writes,writes);assert.equal(storage.getItem(PRACTICE_STORE_KEY),raw);
 }
});

test('a legacy edit during validation aborts migration instead of committing a stale snapshot',()=>{
 const old=JSON.stringify(save()),latest=JSON.stringify(save('edited-by-other-tab')),storage=memory({[SAVE_KEY]:old});let changed=false;
 const store=createPracticeStore(storage,{validate:raw=>{const result=validate(raw);if(!changed){changed=true;storage.values.set(SAVE_KEY,latest);}return result;}});
 assert.throws(()=>store.read(),e=>e.code==='CONFLICT');assert.equal(storage.getItem(PRACTICE_STORE_KEY),null);assert.equal(storage.getItem(SAVE_KEY),latest);assert.equal(storage.writes,0);
});

test('real persistence validator accepts metadata and preserves unfinished/completed replay accounting',async()=>{
 const fs=await import('node:fs');
 const {makeSave,restoreSave,datasetVersion}=await import('../dist/persistence.js');
 const {createScenario}=await import('../dist/scenario.js');const {fresh,decide}=await import('../dist/engine.js');
 const data=JSON.parse(fs.readFileSync(new URL('../dist/dataset.json',import.meta.url))),version=await datasetVersion(data);
 const scenario=createScenario(data,{seed:'practice-store-real',startDate:'2019-11-08',length:20,startYear:'2019'});
 const unfinished=decide(scenario,fresh(scenario),'buy',100,'驗證第一筆');let finished=unfinished;
 for(let i=1;i<20;i++)finished=decide(scenario,finished,'hold',0,'觀望');
 const current=JSON.stringify(makeSave(scenario,unfinished,version)),backup=JSON.stringify(makeSave(scenario,finished,version));
 const storage=memory({[SAVE_KEY]:current,[BACKUP_KEY]:backup}),store=createPracticeStore(storage,{validate:raw=>restoreSave(raw,data,version)});
 assert.deepEqual(restoreSave(store.read(),data,version).state,unfinished);assert.equal(store.list().length,2);
 const completed=store.list().find(record=>record.save.state.journal.length===20);assert.deepEqual(restoreSave(store.activate(completed.id),data,version).state,finished);
 store.write(JSON.parse(current),{replace:true});assert.equal(store.list().length,3);assert.deepEqual(restoreSave(store.raw(),data,version).state,unfinished);
 assert.equal(storage.getItem(SAVE_KEY),current);assert.equal(storage.getItem(BACKUP_KEY),backup);
});

test('imported duplicate names get distinguishable editable suffixes within 100 characters',()=>{
 const store=create(memory());store.read();const original=save();original.practice={name:'A'.repeat(100)};store.write(original,{replace:true});const first=JSON.parse(store.raw());store.write(first,{replace:true});store.write(first,{replace:true});const rows=store.list();assert.equal(new Set(rows.map(r=>r.name)).size,3);assert(rows.every(r=>r.name.length<=100));assert.match(rows[0].name,/（副本 3）$/);assert.match(rows[1].name,/（副本 2）$/);store.rename(rows[0].id,'可再命名');assert.equal(store.list()[0].name,'可再命名');
});
