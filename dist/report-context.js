/** Shared presentation policy. It never edits a learner's authored text. */
export function reportContext(s,state){
  const completed=Boolean(state.finished)||state.journal.length>=s.rounds.length;
  const legacy=!s.blind||Boolean(s.blind.legacy);
  const visible=completed||legacy||Boolean(s.blind?.revealed);
  const everRevealed=legacy||Boolean(s.blind?.everRevealed)||Boolean(s.blind?.revealed);
  const history=(s.indicatorHistory??[]).map((entry,index)=>({number:index+1,step:entry.step,settings:entry.settings,legacy:Boolean(entry.legacy)}));
  const decisionConfiguration=index=>{let selected=null;for(const entry of history)if(entry.step<=index)selected=entry;return selected?.legacy?null:selected;};
  return {completed,visible,legacy,everRevealed,history,decisionConfiguration,
    status:completed?'回合完成，身份已揭露':legacy?'舊版資料，身份已知':visible?'身份已主動揭露':'匿名盲測進行中',
    reveal:legacy?'舊版資料，視為曾揭露':everRevealed?(s.blind?.restoredPriorReveal?`此回合曾於完成 ${s.blind.priorRevealStep??'未記錄'} 筆決策後揭露；目前恢復至 ${state.journal.length} 筆進度，保留曾揭露標記`:`曾主動揭露；記錄位置：完成 ${s.blind?.revealedAtStep??'未記錄'} 筆決策後`):'未曾主動揭露',
    date:(value,index)=>visible?String(value??''):index===undefined?'歷史時間已隱藏':`第 ${index+1} 決策日`,
    filename:visible?`market-replay-performance-${s.startDate}.pdf`:'market-replay-performance-blind.pdf',
  };
}
export function settingsText(settings){
  if(!settings||!Object.keys(settings).length)return '未記錄（舊版資料）';
  const show=value=>Array.isArray(value)?value.map(show).join(', '):value&&typeof value==='object'?Object.entries(value).map(([k,v])=>`${k}: ${show(v)}`).join(' / '):typeof value==='boolean'?(value?'開啟':'關閉'):String(value);
  const groups=[['SMA',['smaEnabled','smaPeriod']],['EMA',['emaEnabled','emaPeriod']],['布林通道',['bbEnabled','bbPeriod','bbDeviations']],['RSI',['rsiEnabled','rsiPeriod']],['MACD',['macdEnabled','macdFast','macdSlow','macdSignal']],['KD',['kdEnabled','kdLookback','kdKSmoothing','kdDSmoothing']],['均量',['volumeMAEnabled','volumeMAPeriod']]];
  const labels={smaPeriod:'週期',emaPeriod:'週期',bbPeriod:'週期',bbDeviations:'標準差倍數',rsiPeriod:'週期',macdFast:'快線週期',macdSlow:'慢線週期',macdSignal:'訊號週期',kdLookback:'回看週期',kdKSmoothing:'K 平滑',kdDSmoothing:'D 平滑',volumeMAPeriod:'週期'};
  const used=new Set(),lines=[];
  for(const [label,keys]of groups){const present=keys.filter(key=>Object.hasOwn(settings,key));if(!present.length)continue;lines.push(`${label}：`+present.map(key=>{used.add(key);return `${labels[key]?labels[key]+' ':''}${show(settings[key])}`;}).join('；'));}
  for(const [key,value]of Object.entries(settings))if(!used.has(key))lines.push(`${key}: ${show(value)}`);
  return lines.join('\n');
}
export function reportConfiguration(s,state){
  const c=reportContext(s,state);
  return [`身份狀態：${c.status}`,`揭露紀錄：${c.reveal}`,`種子：${s.seed??'未記錄'}`,`資料版本：${s.datasetVersion??'未記錄（舊版資料）'}`,`回合長度：${s.rounds.length} 個決策日；已完成 ${state.journal.length} 日；暖機資料 ${s.warmup??s.history?.length??'未記錄'} 日`,`初始資金：${s.initialCash} ${s.currency??'TWD'}；雙向費率：${s.feeRate*100}%`,c.visible?`真實標的：${s.asset}\n真實開始日期：${s.startDate}\n起點年份設定：${s.startYear}\n指定起點：${s.requestedStartDate??"自動抽樣"}\n情境 ID：${s.id}`:'標的、真實日期、年份與來源連結在結束或主動揭露後顯示。', '種子需配合相同資料版本與回合設定才能復現。匿名僅是教學介面遮罩，不是加密或防作弊措施。','姓名、種子、理由與筆記等自由輸入原文不改寫，可能自行透露日期或標的。'].join('\n');
}
