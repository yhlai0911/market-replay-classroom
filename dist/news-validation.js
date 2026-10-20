// Strict checks apply only to new news-schema snapshots; immutable old snapshots stay readable.
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
export function newsTime(value){if(typeof value!=='string')return NaN;return Date.parse(value);}
export function validateNewsEvents(events){
 if(!Array.isArray(events))throw Error('新聞資料必須是清單');const ids=new Set();
 for(const n of events){
  if(!n||typeof n.id!=='string'||!n.id||ids.has(n.id))throw Error('新聞識別碼遺漏或重複');ids.add(n.id);
  for(const key of ['title','body','source','url','sourcePublishedDate','sourceTimezone'])if(typeof n[key]!=='string'||!n[key].trim())throw Error('新聞缺少 '+key);
  if(!/^https?:\/\//.test(n.url)||!UTC.test(n.availableAt)||!Number.isFinite(newsTime(n.availableAt))||new Date(n.availableAt).toISOString().replace('.000Z','Z')!==n.availableAt)throw Error('新聞可知時間或來源格式不正確');
  if(!['second','minute','date_only'].includes(n.timestampPrecision))throw Error('新聞發布時間精度不正確');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(n.sourcePublishedDate)||!Number.isFinite(Date.parse(n.sourcePublishedDate))||new Date(n.sourcePublishedDate).toISOString().slice(0,10)!==n.sourcePublishedDate)throw Error('新聞來源發布日期不正確');
  const local=new Intl.DateTimeFormat('en-CA',{timeZone:n.sourceTimezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(n.availableAt));const p=Object.fromEntries(local.map(x=>[x.type,x.value]));
  if(n.timestampPrecision==='date_only'){
   const next=new Date(Date.parse(n.sourcePublishedDate)+86400000).toISOString().slice(0,10);
   if(n.publishedAt!=null||`${p.year}-${p.month}-${p.day}`!==next||`${p.hour}:${p.minute}:${p.second}`!=='00:00:00')throw Error('僅日期新聞必須延至來源當地次日零時');
  }else{
   if(!UTC.test(n.publishedAt??'')||!Number.isFinite(newsTime(n.publishedAt))||new Date(n.publishedAt).toISOString().replace('.000Z','Z')!==n.publishedAt||newsTime(n.availableAt)<newsTime(n.publishedAt))throw Error('新聞不可早於原始發布時間');
   const releaseDay=new Intl.DateTimeFormat('en-CA',{timeZone:n.sourceTimezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(n.publishedAt));
   if(releaseDay!==n.sourcePublishedDate)throw Error('新聞發布時刻與來源當地日期不一致');
  }
 }
 return events;
}
