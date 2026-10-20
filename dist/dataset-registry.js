import {validateNewsEvents} from './news-validation.js?v=preview-v15';
// Dataset identity is the canonical JSON SHA-256 already embedded in all historical saves.
// Keep snapshots immutable: changing a default never changes a saved practice's resolver.
import {datasetVersion,restoreSave} from './persistence.js?v=preview-v15';
const validDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const HASH=/^sha256:[a-f0-9]{64}$/;
export function unavailableDataset(version){const e=new Error('找不到這份練習所需的行情資料；仍可下載備份，其他練習不受影響');e.code='DATASET_UNAVAILABLE';e.datasetVersion=version;return e;}
export function validateDatasetManifest(manifest){
 if(!manifest||manifest.version!==1||!Array.isArray(manifest.datasets)||!manifest.datasets.length)throw Error('歷史資料目錄格式不正確');
 const ids=new Set(),hashes=new Set();
 for(const d of manifest.datasets){
  if(!d||typeof d.id!=='string'||!d.id||ids.has(d.id)||!HASH.test(d.hash)||hashes.has(d.hash)||typeof d.label!=='string'||!d.label||!/^\.\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.json$/.test(d.path)||d.instrument!=='0050')throw Error('歷史資料目錄項目不正確');
  if(d.coverage){const groups=[d.coverage.news?.ranges,d.coverage.corporateActions?.ranges,d.coverage.unexplainedGaps];for(const ranges of groups){if(ranges===undefined)continue;if(!Array.isArray(ranges))throw Error('資料覆蓋區間格式不正確');for(const r of ranges){if(!r||!validDay(r.start)||!validDay(r.end)||r.start>r.end)throw Error('資料覆蓋區間格式不正確');}}}
  ids.add(d.id);hashes.add(d.hash);
 }
 if(!ids.has(manifest.defaultId))throw Error('歷史資料目錄缺少預設版本');
 return structuredClone(manifest);
}
export async function createDatasetRegistry(manifest,load){
 const checked=validateDatasetManifest(manifest),byHash=new Map(),byId=new Map();
 // Fail closed on a corrupted registered snapshot; never silently substitute another version.
 for(const entry of checked.datasets){const data=await load(entry.path);if(data.newsSchemaVersion===2)validateNewsEvents(data.events);if(await datasetVersion(data)!==entry.hash)throw Error('歷史資料快照校驗失敗：'+entry.id);const snapshot={entry:Object.freeze(entry),data,scenarioData:{...data,replayCoverage:entry.coverage??data.replayCoverage,replayDataset:{id:entry.id,label:entry.label,hash:entry.hash}}};byHash.set(entry.hash,snapshot);byId.set(entry.id,snapshot);}
 for(const snapshot of byHash.values()){
  const policy=snapshot.data.newsValidation;if(!policy)continue;
  if(policy.version!==1||!Array.isArray(policy.inheritedEventIds)||new Set(policy.inheritedEventIds).size!==policy.inheritedEventIds.length)throw Error('新聞繼承驗證規則不正確');
  const parent=byHash.get(policy.inheritedFrom);if(!parent||parent===snapshot)throw Error('新聞缺少原始資料版本');
  const original=new Map((parent.data.events??[]).map(n=>[n.id,n])),inherited=new Set(policy.inheritedEventIds),events=snapshot.data.events??[];
  if(new Set(events.map(n=>n.id)).size!==events.length||[...inherited].some(id=>!events.some(n=>n.id===id)))throw Error('新聞識別碼重複或繼承資料遺漏');
  for(const n of events)if(inherited.has(n.id)&&JSON.stringify(n)!==JSON.stringify(original.get(n.id)))throw Error('繼承新聞與原始版本不同');
  validateNewsEvents(events.filter(n=>!inherited.has(n.id)));
 }
 return Object.freeze({
  manifest:checked,
  current(){return byId.get(checked.defaultId)},
  get(version){const snapshot=byHash.get(version);if(!snapshot)throw unavailableDataset(version);return snapshot},
  restore(raw){if(typeof raw!=='string'||raw.length>2000000)throw Error('存檔過大或格式不正確');let save;try{save=JSON.parse(raw)}catch{throw Error('存檔 JSON 損壞，已保留原檔')}if(!save||save.format!=='market-replay-save'||![1,2,3].includes(save.version)||!HASH.test(save.datasetVersion))throw Error('存檔格式損壞或版本不同');const {scenarioData,entry}=this.get(save.datasetVersion);return restoreSave(raw,scenarioData,entry.hash)},
  status(save){return byHash.has(save?.datasetVersion)?'available':'unavailable'},
  forNewPractice(id=checked.defaultId){const snapshot=byId.get(id);if(!snapshot)throw unavailableDataset(id);return snapshot}
 });
}
// This is a coverage statement, not a claim that all contemporary news was captured.
// Dates are deliberately omitted so this warning is safe in an anonymous exercise.
export function coverageWarning(data,start,end){
 const coverage=data.replayCoverage;
 const covers=(ranges=[])=>ranges.some(r=>r.start<=start&&r.end>=end);
 const news=coverage?.news;
 const summary=news?.summary;const summaryText=summary&&Number.isSafeInteger(summary.total)?`這份資料收錄 ${summary.total} 則精選發布，涵蓋國內外經濟、財金與政治事件；各年代與主題收錄密度不同。`:'';
 const newsText=news&&covers(news.ranges)?'本回合僅提供已收錄的精選新聞，並非完整當時消息。':'本回合新聞覆蓋尚未驗證或不完整；沒有消息不代表當時沒有事件。';
 const actions=coverage?.corporateActions;
 const actionText=actions&&covers(actions.ranges)&&actions.status==='verified'?'':'本回合配息、分割及停牌資料覆蓋尚未完整驗證，績效可能受缺漏影響。';
 const announcementText=actions?.announcementStatus==='partial'?'部分公司行動的原始公告時間尚未核實，未提供為事前消息；已核實的除息權益與發放日仍照資料計算。':'';
 const contextText='事件背景或統計數值仍可能透露年代；隱藏日期與標的名稱不代表無法推知歷史情境。';
 return [newsText,summaryText,...(news?.limitations??[]),actionText,announcementText,contextText].filter(Boolean).join(' ');
}
