import {blindText} from './blind.js?v=preview-v15';
import {modelFor} from './costs.js?v=preview-v15';
/** Shared presentation policy. It never edits a learner's authored text. */
export function reportContext(s,state){
  const completed=Boolean(state.finished)||state.journal.length>=s.rounds.length;
  const legacy=!s.blind||Boolean(s.blind.legacy);
  const visible=completed||legacy||Boolean(s.blind?.revealed);
  const everRevealed=legacy||Boolean(s.blind?.everRevealed)||Boolean(s.blind?.revealed);
  const history=(s.indicatorHistory??[]).map((entry,index)=>({number:index+1,step:entry.step,settings:entry.settings,legacy:Boolean(entry.legacy)}));
  const decisionConfiguration=index=>{let selected=null;for(const entry of history)if(entry.step<=index)selected=entry;return selected?.legacy?null:selected;};
  return {completed,visible,legacy,everRevealed,history,decisionConfiguration,
    status:completed?'回合完成，身份已揭露':legacy?'身分已知，無法視為匿名練習':visible?'身份已主動揭露':'匿名盲測進行中',
    reveal:legacy?'身分已知，無法視為匿名練習':everRevealed?(s.blind?.restoredPriorReveal?`同一歷史情境曾於完成 ${s.blind.priorRevealStep??'未記錄'} 筆決策後揭露；此局目前為 ${state.journal.length} 筆進度，保留曾揭露標記`:(s.blind?.revealedAtStep==null?'曾主動揭露；揭露時的進度未記錄':`曾主動揭露；記錄位置：完成 ${s.blind.revealedAtStep} 筆決策後`)):'未曾主動揭露',
    date:(value,index)=>visible?String(value??''):index===undefined?'歷史時間已隱藏':`第 ${index+1} 決策日`,
    filename:visible?`market-replay-performance-${s.startDate}.pdf`:'market-replay-performance-blind.pdf',
  };
}
export function settingsText(settings){
  if(!settings||!Object.keys(settings).length)return '未記錄';
  const show=value=>Array.isArray(value)?value.map(show).join(', '):value&&typeof value==='object'?Object.entries(value).map(([k,v])=>`${k}: ${show(v)}`).join(' / '):typeof value==='boolean'?(value?'開啟':'關閉'):String(value);
  const groups=[['SMA',['smaEnabled','smaPeriod']],['EMA',['emaEnabled','emaPeriod']],['布林通道',['bbEnabled','bbPeriod','bbDeviations']],['RSI',['rsiEnabled','rsiPeriod']],['MACD',['macdEnabled','macdFast','macdSlow','macdSignal']],['KD',['kdEnabled','kdLookback','kdKSmoothing','kdDSmoothing']],['均量',['volumeMAEnabled','volumeMAPeriod']]];
  const labels={smaPeriod:'週期',emaPeriod:'週期',bbPeriod:'週期',bbDeviations:'標準差倍數',rsiPeriod:'週期',macdFast:'快線週期',macdSlow:'慢線週期',macdSignal:'訊號週期',kdLookback:'回看週期',kdKSmoothing:'K 平滑',kdDSmoothing:'D 平滑',volumeMAPeriod:'週期'};
  const used=new Set(),lines=[];
  const multi=Array.isArray(settings.movingAverages);
  if(multi){used.add('movingAverages');lines.push(`多條均線：共 ${settings.movingAverages.length} 條（以此清單為準）`);settings.movingAverages.forEach((line,index)=>{const extras=Object.entries(line).filter(([key])=>!['id','type','period','color','enabled'].includes(key)).map(([key,value])=>`${key}: ${show(value)}`).join('；');lines.push(`均線 ${index+1}：${String(line.type??'未記錄').toUpperCase()}；週期 ${line.period??'未記錄'}；識別碼 ${line.id??'未記錄'}；色碼 ${line.color??'未記錄'}${Object.hasOwn(line,'enabled')?'；'+show(line.enabled):''}${extras?'；'+extras:''}`);});}

  for(const [label,keys]of groups){const present=keys.filter(key=>Object.hasOwn(settings,key));if(!present.length)continue;lines.push(`${label}${multi&&['SMA','EMA'].includes(label)?'（單條均線設定）':''}：`+present.map(key=>{used.add(key);return `${labels[key]?labels[key]+' ':''}${show(settings[key])}`;}).join('；'));}
  for(const [key,value]of Object.entries(settings))if(!used.has(key))lines.push(`${key}: ${show(value)}`);
  return lines.join('\n');
}
export function reportConfiguration(s,state){
  const c=reportContext(s,state);
  return [`身份狀態：${c.status}`,`揭露紀錄：${c.reveal}`,`重播代碼：${s.seed??'未記錄'}`,`教材資料：${reportDatasetLabel(s,state)}`,reportDataCoverage(s,state),reportTaxRecalculation(s),`回合長度：${s.rounds.length} 個決策日；已完成 ${state.journal.length} 日；練習前參考資料 ${s.warmup??s.history?.length??'未記錄'} 日`,`初始資金：${s.initialCash} ${s.currency??'TWD'}`,reportCostDescription(s),c.visible?`真實標的：${s.asset}\n真實開始日期：${s.startDate}\n起點年份設定：${s.startYear==='all'?'全部年份':s.startYear??'未記錄'}\n指定起點：${s.requestedStartDate??"自動抽樣"}`:'標的、真實日期、年份與來源連結在結束或主動揭露後顯示。', '重播代碼需配合相同教材資料與練習設定，才能重現相同回合。匿名僅是教學介面遮罩，不是加密或防作弊措施。','姓名、種子、理由與筆記等自由輸入原文不改寫，可能自行透露日期或標的。'].join('\n');
}

/** Student-facing summary. Full identifiers and colors remain in settingsText's technical appendix. */
export function movingAverageSummary(settings){
 if(!settings)return '未記錄';
 if(Array.isArray(settings.movingAverages))return settings.movingAverages.length?settings.movingAverages.map((line,index)=>`均線 ${index+1}：${String(line.type??'').toUpperCase()}${line.period}${line.enabled===false?'（關閉）':''}`).join('\n'):'無啟用均線';
 const old=[];if(settings.smaEnabled)old.push(`SMA${settings.smaPeriod}`);if(settings.emaEnabled)old.push(`EMA${settings.emaPeriod}`);return old.length?old.map((label,index)=>`均線 ${index+1}：${label}`).join('\n')+'\n（單條均線設定）':'未啟用均線';
}
/** Normalize values that round to zero before adding any sign. */
export const reportDisplayValue=value=>Number.isFinite(value)&&Math.abs(value)<0.005?0:value;
export const reportNumber=value=>Number.isFinite(value)?reportDisplayValue(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'N/A';
export const reportPercent=value=>`${reportDisplayValue(value)>0?'+':''}${reportNumber(value)}%`;

/** Exact, reversible deduplication: every history event remains in timeline. */
export function reportSettingsIndex(s,state){
 const canonical=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const profiles=[],byValue=new Map();
 const register=settings=>{if(!settings)return null;const key=JSON.stringify(canonical(settings));if(!byValue.has(key)){const id=`P${profiles.length+1}`;profiles.push({id,settings});byValue.set(key,id);}return byValue.get(key);};
 const timeline=reportContext(s,state).history.map(entry=>({...entry,profileId:register(entry.settings)}));
 const currentProfileId=register(s.indicatorSettings);
 return {profiles,timeline,currentProfileId};
}
export function settingsDelta(previous,current){
 if(!previous)return {changed:current,removed:[]};
 const changed=Object.fromEntries(Object.entries(current).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(previous[key])));
 return {changed,removed:Object.keys(previous).filter(key=>!Object.hasOwn(current,key))};
}

/** Model-specific cost disclosure; no historical instrument or dates. */
export function reportHasTax(s){return modelFor(s).version!=='legacy-0.1%-no-tax';}
export function reportCostLabel(s){const m=modelFor(s);return m.version==='tw-legacy-tax-v1'?'已含賣出證交稅':m.version==='tw-equity-v2'?`台灣證券簡化費稅模型｜${m.instrumentType==='stock'?'個股一般交易（非當沖）':'ETF'}`:m.version==='tw-etf-v1'?'台灣ETF簡化費稅模型':'未含證交稅';}
export function reportCostDescription(s){
 const m=modelFor(s),legacy=m.version==='legacy-0.1%-no-tax';
 const exactPercent=value=>Number((value*100).toFixed(8)).toString()+'%';
 if(m.version==='tw-legacy-tax-v1')return `買賣手續費各${exactPercent(m.feeRate)}；賣出證交稅${exactPercent(m.sellTaxRate)}。手續費不取整、最低費為0；賣出稅額無條件捨去至整元，買入不課證交稅。`;
 if(legacy)return `買賣手續費各${exactPercent(m.feeRate)}；未計證交稅`;
 const setup=m.version==='tw-equity-v2'?`標的類型：${m.instrumentType==='stock'?'個股一般交易（非當沖）':'ETF'}；類型選擇：${({auto:'依標的自動判定',etf:'ETF',stock:'一般個股'})[m.mode]??'未記錄'}；依標的資料確認類型，類型不符不得開局。\n手續費基準 ${exactPercent(m.baseRate)} × 折扣比例 ${exactPercent(m.discount)} ＝ 有效雙向費率 ${exactPercent(m.feeRate)}。每筆最低手續費 ${m.minimumCommission} TWD。此基準、折扣與最低費是零股參考方案，可調整折扣與最低費，非全台統一收費。\n賣出證交稅率 ${exactPercent(m.sellTaxRate)}；買入不課證交稅；個股未套用當沖優惠。成交方式：以日線開盤價按整數股數成交的零股簡化，不代表真實零股撮合或交割。\n`:'';
 return `${reportCostLabel(s)}。成本設定整局固定。\n`+setup+(legacy?`買賣手續費各${exactPercent(m.feeRate)}；未計證交稅`:`雙向手續費率 ${exactPercent(m.feeRate)}；每筆最低手續費 ${m.minimumCommission} TWD；賣出證交稅率 ${exactPercent(m.sellTaxRate)}，買入不課證交稅。手續費＝成交額×費率無條件捨去至整元後套最低費；證交稅＝賣出成交額×稅率無條件捨去至整元。最低費為 0 時是教學假設；費率及最低費為自訂模擬值，非全市場統一標準。`)+`\n成交額＝數量×開盤價的理論成交額，未模擬真實零股獨立撮合、逐筆交割取整、滑價或流動性限制；不含股利所得稅。整數單位，不可放空或槓桿。基準只在首日買入，沒有虛擬期末賣出或賣出稅。`;
}
export function reportCostSources(visible){return '費稅參考：證券交易稅條例第 2 條（個股一般交易賣方 0.3%、ETF 賣方 0.1%）；臺灣證券交易所 ETF 交易規則（ETF 賣方證交稅）；營業細則第 94 條（券商自訂手續費與最低費）。'+(visible?'\nhttps://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=G0340078\nhttps://www.twse.com.tw/zh/products/securities/etf/overview/rules.html\nhttps://twse-regulation.twse.com.tw/TW/law/DOC01.aspx?FLCODE=FL007304&FLNO=94':'來源連結於揭露後顯示。');}

/** Coverage is dataset metadata, never a fabricated historical news item. */
export function reportDatasetLabel(s,state){
 const raw=String(s.datasetLabel??'本回合歷史資料');
 const label=/擴充|較長期間/.test(raw)?'較長期間的歷史資料':/原始|原有/.test(raw)?'原有練習資料':raw.replace(/候選|待檢查|待價格檢查/g,'').replace(/（\s*）/g,'').trim()||'本回合歷史資料';
 return reportContext(s,state).visible?label:label.replace(/0050|元大(?:台灣|臺灣)?\s*(?:50|五十)/gi,'匿名標的').replace(/https?:\/\/\S+/gi,'[連結隱藏]').replace(/(?:19|20)\d{2}(?:[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?)?/g,'[日期隱藏]');
}
export function reportDataCoverage(s,state){
 const c=reportContext(s,state),coverage=s.dataCoverage;
 if(!coverage)return '資料覆蓋：此版本未附完整覆蓋註記；新聞與公司行動是否齊全尚無足夠資料判定。沒有消息不代表當時沒有事件。';
 const start=s.rounds[0]?.at?.slice(0,10)??s.startDate,end=s.rounds.at(-1)?.at?.slice(0,10)??start;
 const covers=ranges=>(ranges??[]).some(r=>r.start<=start&&r.end>=end);
 const news=coverage.news,actions=coverage.corporateActions,gaps=coverage.unexplainedGaps??[];
 const lines=[covers(news?.ranges)?'新聞覆蓋：本回合位於已收錄的精選新聞區間，仍非完整當時資訊。':'新聞覆蓋不足：本回合部分或全部期間不在已收錄的精選新聞區間；未提供新聞不代表當時沒有事件。',actions?.status==='verified'&&covers(actions.ranges)?'公司行動：本回合位於已核實的權益資料覆蓋區間。':'公司行動：本回合配息、分割及停牌資料覆蓋尚未完整驗證，績效可能受缺漏影響。'];
 if(actions?.announcementStatus==='partial')lines.push('部分公司行動原始公告時間尚未核實，不預先列為可見消息；已核實的股息權益與發放日仍依資料計算。');
 if(gaps.some(g=>g.start<=end&&g.end>=start))lines.push('警示：本回合與未解釋的價格資料缺口重疊，不宜視為連續完整樣本。');
 else if(gaps.length)lines.push('此資料版本含未解釋的價格缺口；本回合未跨越已標記缺口。');
 if(c.visible){const ranges=(items=[])=>items.map(r=>`${r.start} 至 ${r.end}`).join('；')||'未提供';lines.push(`版本新聞收錄區間：${ranges(news?.ranges)}`,`公司行動核實區間：${ranges(actions?.ranges)}；${actions?.status==='verified'?'權益資料已核實':'權益資料仍有待核實'}；${actions?.announcementStatus==='partial'?'部分公告時間尚未核實':actions?.announcementStatus==='verified'?'公告時間已核實':'公告時間完整性尚待確認'}`);}
 const newsDetails=reportNewsCoverage(s,state);if(newsDetails)lines.push(newsDetails);
 return lines.join('\n');
}

export function reportTaxRecalculation(s){return s.taxRecalculation?`此練習由「${s.taxRecalculation.sourcePracticeName||'原練習'}」補計證交稅另存；手續費設定相同。`:'';}


/** Whole-material statistics, distinct from information visible at a decision. */
export function reportNewsCoverage(s,state){
 const news=s.dataCoverage?.news;if(!news)return '';
 const visible=reportContext(s,state).visible,summary=news.summary,lines=[];
 const count=n=>Number.isSafeInteger(n)&&n>=0;
 const safe=text=>visible?String(text):blindText(text,s).replace(/\b(?:19|20)\d{2}\b/g,'[年份隱藏]');
 const regions={TW:'台灣',US:'美國',CN:'中國',EU:'歐洲',JP:'日本',GB:'英國',UK:'英國',GLOBAL:'全球',global:'全球',international:'國際'};
 const categories={politics:'政治',political:'政治',election:'選舉',elections:'選舉',policy:'政策',monetary_policy:'貨幣政策',interest_rate:'利率',rates:'利率',inflation:'通膨',employment:'就業',gdp:'經濟成長',economy:'經濟',economic:'經濟',macro:'總體經濟',trade:'貿易',trade_policy:'貿易政策',geopolitics:'國際政經',market:'金融市場',markets:'金融市場',finance:'金融',public_health:'公共衛生',health:'公共衛生',corporate:'企業',corporate_action:'公司行動',other:'其他'};
 const distribution=(items,labels,fallback)=>{const groups=new Map();for(const [key,n]of Object.entries(items??{})){if(!count(n))continue;const label=labels[key]??(/[\u3400-\u9fff]/u.test(key)?safe(key):fallback);groups.set(label,(groups.get(label)??0)+n);}return [...groups].map(([label,n])=>`${label} ${n} 則`).join('、');};
 if(summary){if(count(summary.total))lines.push(`教材共收錄 ${summary.total} 則公告與新聞精選；以下是整份教材的分布，不代表本局當時可見、已閱讀或引用的則數。`);const regional=distribution(summary.regions,regions,'其他地區'),categorical=distribution(summary.categories,categories,'其他類別');if(regional)lines.push('地區分布：'+regional+'。');if(categorical)lines.push('主題分布：'+categorical+'。');const precision=[];if(count(summary.precise))precision.push(`有明確發布時刻 ${summary.precise} 則`);if(count(summary.dateOnly))precision.push(`僅有發布日期 ${summary.dateOnly} 則`);if(precision.length)lines.push('發布時間資料：'+precision.join('；')+'。僅有日期的消息採保守可見時間。');}
 if(Array.isArray(news.limitations))for(const limitation of news.limitations)if(typeof limitation==='string'&&limitation.trim())lines.push(safe(limitation));
 if(summary||news.limitations?.length)lines.push('公告與新聞是精選材料，不是完整歷史新聞庫。即使隱藏日期與標的，政治事件及背景仍可能讓人推知年代。');
 if(visible&&news.yearCounts){const years=Object.entries(news.yearCounts).filter(([year,n])=>/^\d{4}$/.test(year)&&count(n)).sort(([a],[b])=>a.localeCompare(b));if(years.length)lines.push('新聞年份分布：'+years.map(([year,n])=>`${year} 年 ${n} 則`).join('、')+'。');}
 return lines.join('\n');
}
