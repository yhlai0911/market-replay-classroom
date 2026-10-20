import {newsView} from './blind.js?v=preview-v11';
import {reportContext,reportConfiguration,settingsText,movingAverageSummary,reportNumber,reportPercent,reportSettingsIndex,settingsDelta,reportCostLabel,reportCostDescription,reportCostSources,reportHasTax,reportDatasetLabel,reportDataCoverage,reportTaxRecalculation} from './report-context.js?v=preview-v11';
import {performanceModel} from './performance.js?v=preview-v11';
import {visible} from './engine.js?v=preview-v11';
const F=reportNumber;
const P=reportPercent;
const modelLegacy=s=>!reportHasTax(s);
const labels={buy:'買入',sell:'賣出',hold:'觀望',filled:'成交',held:'觀望',cancelled:'取消'};
let resources;
async function loadResources(){
  if(!resources)resources=Promise.all([import('./vendor/pdf-lib.js'),import('./vendor/fontkit.js'),fetch(new URL('./vendor/NotoSansTC-Regular.ttf',import.meta.url)).then(r=>{if(!r.ok)throw Error('PDF 字型載入失敗，請確認網路後再試。');return r.arrayBuffer();})]).catch(e=>{resources=null;throw e;});
  return resources;
}
export function reportFilename(s,state){return reportContext(s,state).filename;}
/** Same renderer in the browser and QA. Only supplied, already-visible state is serialized. */
export async function performancePdf(s,state,options={},dependencies){
  const [lib,fontkit,fontBytes]=dependencies??await loadResources();
  const {PDFDocument,rgb}=lib,doc=await PDFDocument.create();doc.registerFontkit(fontkit.default??fontkit);
  const font=await doc.embedFont(fontBytes,{subset:true});
  const supported=new Set(font.getCharacterSet());
  const clean=v=>Array.from(String(v??'')).map(c=>c==='\n'||supported.has(c.codePointAt(0))?c:`[U+${c.codePointAt(0).toString(16).toUpperCase()}]`).join('');
  const C={ink:rgb(.09,.15,.22),muted:rgb(.36,.42,.48),blue:rgb(.12,.33,.57),teal:rgb(.04,.46,.43),red:rgb(.72,.23,.25),line:rgb(.84,.88,.91),pale:rgb(.95,.97,.98),white:rgb(1,1,1)};
  const W=595.28,H=841.89,M=44,CW=W-2*M;let page,y,section='';const pages=[];
  const text=(v,x,top,size=10,color=C.ink)=>page.drawText(clean(v),{x,y:H-top-size,font,size,color});
  const line=(x1,t1,x2,t2,color=C.line,width=.6)=>page.drawLine({start:{x:x1,y:H-t1},end:{x:x2,y:H-t2},color,thickness:width});
  const rect=(x,t,w,h,color)=>page.drawRectangle({x,y:H-t-h,width:w,height:h,color});
  function newPage(label=section){section=label;page=doc.addPage([W,H]);pages.push(page);rect(0,0,W,6,C.teal);text('時光交易所  /  MARKET REPLAY',M,22,8,C.muted);text(label,370,22,8,C.muted);line(M,43,W-M,43);y=63;}
  function need(h){if(y+h>H-57)newPage();}
  const glyphWidths=new Map();
  function wrap(value,width,size){const result=[];const measure=ch=>{if(!glyphWidths.has(ch))glyphWidths.set(ch,font.widthOfTextAtSize(ch,1));return glyphWidths.get(ch)*size;};for(const raw of clean(value).split('\n')){let row='',used=0;const tokens=raw.match(/[A-Za-z0-9_#\[\].:\/-]+|./gu)??[];for(const token of tokens){const tw=Array.from(token).reduce((sum,ch)=>sum+measure(ch),0);if(tw<=width){if(row&&used+tw>width){result.push(row);row='';used=0;}row+=token;used+=tw;}else{for(const ch of token){const cw=measure(ch);if(row&&used+cw>width){result.push(row);row='';used=0;}row+=ch;used+=cw;}}}result.push(row);}return result;}

  function para(value,{size=10,color=C.ink,width=CW,indent=0,gap=9}={}){for(const row of wrap(value,width,size)){need(size*1.65);text(row,M+indent,y,size,color);y+=size*1.65;}y+=gap;}
  function heading(n,title){need(40);text(n,M,y,10,C.teal);text(title,M+30,y-3,17);y+=31;}
  function rows(headers,data,widths){const draw=(cells,head=false)=>{const lines=cells.map((v,i)=>wrap(v,widths[i]-14,head?8.5:9));const h=Math.max(...lines.map(a=>a.length))*14+14;if(y+h>H-57){newPage();draw(headers,true);}if(head)rect(M,y,CW,h,C.ink);else if(rowIndex%2===0)rect(M,y,CW,h,C.pale);let x=M;lines.forEach((ls,i)=>{ls.forEach((v,k)=>text(v,x+7,y+6+k*14,head?8.5:9,head?C.white:C.ink));x+=widths[i];});y+=h;};let rowIndex=0;draw(headers,true);for(const r of data){draw(r);rowIndex++;}y+=14;}
  function chart(points,keys,title,{height=175,percent=false,drawdown=false}={}){need(height+44);text(title,M,y,12);y+=26;const top=y,left=M+47,right=W-M-9,bottom=top+height-30;let values=points.flatMap(p=>keys.map(k=>p[k]));let lo=Math.min(...values),hi=Math.max(...values);if(hi===lo){lo-=1;hi+=1;}const pad=(hi-lo)*.1;lo-=pad;hi=drawdown?0:hi+pad;const X=i=>left+i/Math.max(1,points.length-1)*(right-left),Y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top);for(let i=0;i<4;i++){const v=lo+(hi-lo)*i/3;line(left,Y(v),right,Y(v));text(F(v)+(percent?'%':''),M,Y(v)-5,7.3,C.muted);}keys.forEach((key,j)=>{const c=j?C.blue:C.teal;for(let i=1;i<points.length;i++)line(X(i-1),Y(points[i-1][key]),X(i),Y(points[i][key]),c,1.6);if(points.length===1)page.drawCircle({x:X(0),y:H-Y(points[0][key]),size:2,color:c});});text('初始',left,bottom+9,8,C.muted);text(points.at(-1).date??'尚無決策',right-75,bottom+9,8,C.muted);y=top+height+9;}
  const m=performanceModel(s,state),v=visible(s,state),j=state.journal,generated=options.generatedAt??new Date().toISOString(),context=reportContext(s,state),settingIndex=reportSettingsIndex(s,state);
  if(!context.visible)m.points=m.points.map(p=>({...p,date:p.index?`第 ${p.index} 日`:'初始'}));
  const period=j.length?(context.visible?`${s.startDate} 至 ${j.at(-1).at.slice(0,10)}`:`第 1 至第 ${j.length} 決策日`):'尚未完成決策';
  doc.setTitle('時光交易所｜交易練習報告');doc.setAuthor('Market Replay Classroom');doc.setSubject('含費用、含配息權利之教學模擬績效');
  newPage('績效總覽');text('TRADING PRACTICE REVIEW',M,y,10,C.teal);y+=24;text('交易練習報告',M,y,29);y+=47;
  para(`${state.finished?'已完成回合':'練習尚未完成'}  ·  ${j.length} / ${s.rounds.length} 個決策日  ·  ${context.visible?s.asset:'匿名標的'}`,{size:11});
  para(`${options.studentName||'未填姓名'}  /  學號 ${options.studentId||'未填寫'}\n觀測期間：${period}  /  ${context.status}`,{color:C.muted});
  if(String(options.practiceName??'').trim())para(`練習名稱：${options.practiceName}`,{size:10,color:C.muted});
  if(s.taxRecalculation)para(reportTaxRecalculation(s),{size:9,color:C.muted});
  if(!modelLegacy(s))para(reportCostLabel(s),{size:9,color:C.teal,gap:5});
  const cards=[[modelLegacy(s)?'淨報酬（未含證交稅）':'投資組合淨報酬',P(m.portfolioReturn)],['買入持有基準',P(m.benchmarkReturn)],['相對基準報酬差',`${F(m.relativeReturn)} 個百分點`],['淨損益（TWD）',`${m.currentAssets-m.initialAssets>0?'+':''}${F(m.currentAssets-m.initialAssets)}`],['收盤最大回撤',`${F(m.maxDrawdown)}%`],['累計費稅合計（TWD）',F(m.totalCosts)]];
  const cardW=(CW-20)/3,cardY=y;cards.forEach(([label,value],i)=>{const x=M+(i%3)*(cardW+10),t=cardY+Math.floor(i/3)*82;rect(x,t,cardW,72,C.pale);text(label,x+12,t+11,9,C.muted);text(value,x+12,t+35,i===2?13:18,C.ink);});y+=177;
  chart(m.points,['portfolioReturn','benchmarkReturn'],'累積報酬走勢  /  共同起點 0%',{height:190,percent:true});
  para('綠線：投資組合（已扣本局模型費稅）   藍線：買入持有基準',{size:8.5,color:C.muted});
  rows(['初始資產 TWD','目前／期末總資產 TWD','買入持有基準資產 TWD'],[[F(m.initialAssets),F(m.currentAssets),F(m.benchmarkAssets)]],[CW/3,CW/3,CW/3]);
  para('報酬含已取得配息權利；未強制清算。單一短期樣本不能證明策略有效，報酬差亦不代表風險調整後超額報酬。',{size:9,color:C.muted});
  newPage('風險、成本與部位');heading('01','資產配置與執行分析');
  rows(['資產組成','金額（TWD）','占總資產'],[['可用現金',F(m.cash),`${F(m.cash/m.currentAssets*100)}%`],['持倉市值',F(m.holdingValue),`${F(m.currentExposure)}%`],['應收配息',F(m.receivables),`${F(m.receivables/m.currentAssets*100)}%`],['總資產',F(m.currentAssets),'100.00%']],[CW*.42,CW*.3,CW*.28]);
  if(modelLegacy(s))para(reportCostDescription(s),{size:9,color:C.muted});
  rows(['執行與成本指標','數值'],[['已成交 / 買入 / 賣出',`${m.counts.fills} / ${m.counts.buys} / ${m.counts.sells}`],['觀望 / 取消委託',`${m.counts.holds} / ${m.counts.cancelled}`],['持有單位',String(m.shares)],['平均收盤股票曝險',j.length?`${F(m.meanExposure)}%`:'N/A（尚無收盤觀測）'],['累計成交金額 / 初始資產',`${F(m.grossNotional)} TWD / ${F(m.turnoverPercent)}%`],['累計手續費',`${F(m.totalFees)} TWD`],['累計證交稅',`${F(m.totalTaxes)} TWD${modelLegacy(s)?'（未計證交稅）':''}`],['費稅合計 / 初始資產',`${F(m.totalCosts)} TWD / ${F(m.totalCosts/m.initialAssets*100)}%`],['累計取得配息權利',`${F(m.dividends)} TWD`]],[CW*.6,CW*.4]);
  chart(m.points,['drawdown','benchmarkDrawdown'],'收盤回撤  /  距離各自歷史高點',{height:155,percent:true,drawdown:true});
  para('綠線：投資組合   藍線：基準。最大回撤採初始資產及每次已完成決策後的收盤總資產，不反映盤中損失。平均曝險為各已完成收盤持倉市值／當期總資產之算術平均。',{size:9,color:C.muted});
  newPage('完整操作明細');heading('02','逐筆委託與成交紀錄');para('觀望與取消保留在完整決策紀錄中，不列為成交筆數。金額單位：TWD。SMA 為簡單移動平均，EMA 為指數移動平均；後方數字是日數。均線識別碼、顏色與參數記錄見設定明細。',{size:9,color:C.muted});
  rows(['# / 決策日','方向 / 狀態','委託 / 成交','成交價','手續費 / 稅 / 合計','收盤資產'],j.map((r,i)=>[`${i+1} · ${context.date(r.at.slice(0,10),i)}`,labels[r.side]===labels[r.status]?labels[r.side]:`${labels[r.side]}·${labels[r.status]}`,`${r.requestedQuantity??r.quantity} / ${r.quantity}`,r.status==='filled'?F(r.price):'不適用',`${F(r.fee)} / ${modelLegacy(s)?'未計':F(r.tax??0)} / ${F(r.totalCost??r.fee)}`,F(m.points[i+1].equity)]),[83,62,68,56,123,CW-392]);
  if(!j.length)para('尚無已完成決策。');
  if(j.length){need(200);section='逐筆決策與完整筆記';heading('03','決策依據與當時資訊');}
  const news=new Map(v.news.map(n=>[n.id,n])),refs=new Map();
  const learnerText=[...j.map(r=>r.reason),options.notes,options.reflection,options.reason].join('\n');
  const detailedNews=new Set(v.news.filter(n=>(n.availableAt??n.publishedAt)>=s.rounds[0].at || [n.id,n.url,n.title].some(t=>t&&learnerText.includes(t))).map(n=>n.id));
  // Keep the ledger as the numeric overview; concise complete facts accompany each reason.
  para('以下每筆保留完整理由與當時資訊；均線及其他參數由設定編號連至設定明細，不逐日重複列印。',{size:9,color:C.muted,gap:6});
  j.forEach((r,i)=>{const configuration=context.decisionConfiguration(i),p=m.points[i+1];
    const timing=`決策 ${context.date(r.at,i)}${context.visible?'':' 開盤前'} / 成交 ${r.status==='filled'?(context.visible?r.executionAt:'當日開盤'):'無成交'}`;
    const balances=`收盤：持倉 ${p.shares} 單位 / 市值 ${F(p.holdingValue)}；現金 ${F(p.cash)}；應收 ${F(p.receivables)}；資產 ${F(p.equity)}`;
    need(Math.min(500,65+wrap(timing,CW,8.5).length*14.025+wrap(balances,CW,8.5).length*14.025+wrap(r.reason,CW,10).length*16.5));
    text(`決策 ${String(i+1).padStart(3,'0')} / ${labels[r.side]} · ${labels[r.status]} / ${configuration?'設定 #'+configuration.number:'設定未記錄'}`,M,y,11,C.teal);y+=20;
    para(timing,{size:8.5,color:C.muted,gap:3});
    para(balances,{size:8.5,color:C.muted,gap:5});
    para(r.reason,{size:10,gap:5});
    const ids=[...new Set(r.newsIds??[])].filter(id=>news.has(id)&&(news.get(id).availableAt??news.get(id).publishedAt)<=r.at);const listed=ids.filter(id=>detailedNews.has(id));const nums=listed.map(id=>{if(!refs.has(id))refs.set(id,refs.size+1);return refs.get(id);}).sort((a,b)=>a-b);
    const compressed=[];for(let k=0;k<nums.length;k++){const start=nums[k];let end=start;while(k+1<nums.length&&nums[k+1]===end+1)end=nums[++k];compressed.push(start===end?`${start}`:`${start}-${end}`);}
    para(`當時可見資訊 ${ids.length} 則；相關新聞：${compressed.length?'附錄 '+compressed.join('、'):'無新增或明確提及參照'}。`,{size:8,color:C.muted,gap:5});line(M,y,W-M,y);y+=11;});
  need(110);section='學生筆記與反思';para('以下保留使用者原文，不改寫。自由輸入可能自行透露日期、標的或其他身份資訊。',{size:9,color:C.muted});heading('04','完整操作筆記');para(options.notes||'（未填寫）');heading('05','事後反思');para(options.reflection||'（未填寫）');
  if(String(options.reason??'').trim()){heading('06','尚未送出的決策草稿');para(`方向：${labels[options.side]??options.side}；委託單位：${options.side==='hold'?'不適用':options.quantity}\n此草稿尚未執行，不計入績效。`,{color:C.muted});para(options.reason);}
  newPage('計算口徑與資料來源');heading('07','方法與限制');para(`資料版本：${reportDatasetLabel(s,state)}`,{size:10,color:C.teal});para(reportDataCoverage(s,state),{size:9.5});
  const methods=[`總資產＝現金＋持倉市值＋應收配息。${state.finished?'期末使用最後完成交易日收盤價':'目前使用當時已知昨收價'}，未扣假設平倉費用。淨損益＝總資產－初始資產；報酬＝淨損益／初始資產。本局模型費稅已於交易時扣除，不重複扣減。`,'買入持有基準：首日開盤以相同初始資金買入可負擔整數單位，使用相同買入手續費規則（含適用最低費及取整），保留零頭現金；計入分割與取得的配息權利，不再投資。相對報酬為兩個報酬率之差，單位為百分點。','圖表只使用初始資產和已完成決策收盤觀測。成交金額為買賣成交價×成交單位的絕對金額總和；周轉指標以其除以初始資產，並非雙邊平均資產周轉率。','不提供年化報酬、Sharpe 或交易勝率：短期樣本與未平倉部位不足以支持可靠年化或完整已實現損益歸因。',reportCostDescription(s),reportCostSources(context.visible),'配息以除息前持倉取得權利；發放日開盤前入帳為教學簡化，未驗證券商實際時刻。','新聞為精選子集，不代表完整當時資訊；歷史存檔可能有重發或修訂。僅列當時已可見資料，不含未揭露行情。來源機構不為本教學報告背書。報告可自行產生，不是經驗證的交易或考試憑證。',`${context.visible?'情境：'+s.title+'\n資料可見截止：'+v.cutoff:'匿名報告：真實情境與歷史截止日期已隱藏'}\n產生時間（UTC）：${generated}`];methods.forEach(x=>para(x,{size:9.5}));
  newPage('設定明細與資料依據');heading('08','設定明細與資料依據');para(reportConfiguration(s,state),{size:9.5});
  heading('09','設定歷程與參數版本');para('每次調整均保留；完成 N 筆後的設定適用下一筆，同一步最後一筆生效。P 編號代表完整參數版本，相同內容只列一次。每筆決策仍以原設定 # 編號核對。',{size:9,color:C.muted});
  if(!settingIndex.timeline.length)para('未記錄指標歷程；不能回推當時設定。',{size:9});
  else rows(['設定編號','完成幾筆後生效','參數版本 / 註記'],settingIndex.timeline.map(entry=>[`#${entry.number}`,String(entry.step),`${entry.profileId}${entry.legacy?' / 此設定為載入時預設，未記錄當時設定':''}`]),[95,145,CW-240]);
  para(`匯出當下參數：${settingIndex.currentProfileId??'未記錄'}。完整版本定義如下；JSON 備份另保留原始完整設定。`,{size:9,color:C.teal});
  for(let index=0;index<settingIndex.profiles.length;index++){
    const profile=settingIndex.profiles[index],previous=settingIndex.profiles[index-1],delta=settingsDelta(previous?.settings,profile.settings);
    const detail=settingsText(delta.changed)+(delta.removed.length?'\n移除欄位：'+delta.removed.join('、'):'');
    need(Math.min(650,wrap(detail,CW,9).length*14.85+40));
    para(`${profile.id}${previous?' / 承接 '+previous.id+'，僅以下欄位變更（其餘完全相同）':' / 完整初始參數'}`,{size:10,color:C.teal,gap:5});
    para(detail,{size:9,gap:10});
  }
  if(context.visible){heading('11','已揭露行情來源');[...new Set(v.bars.map(b=>b.sourceUrl).filter(Boolean))].forEach(url=>para(url,{size:8,color:C.blue}));
  heading('12','新聞來源範圍');para('起點前的歷史可見新聞僅按來源彙總，不將系統可見集合當作學生閱讀紀錄。逐筆理由、操作筆記及反思均完整保留。下列詳列回合開始後已公開事件，以及筆記以完整新聞標題、ID 或網址明確提及的來源；自由描述無法可靠自動匹配。完整可見 ID 集合請參照 JSON 備份。',{size:9,color:C.muted});
  const providers=new Map();for(const n of v.news){const key=n.source??'原始來源';if(!providers.has(key))providers.set(key,{count:0,urls:new Set()});const p=providers.get(key);p.count++;try{p.urls.add(new URL(n.url).origin);}catch{}}for(const [name,p]of providers)para(`${name}：${p.count} 則可見資訊\n${[...p.urls].join('  ')}`,{size:9});
  if(refs.size){need(160);section='新聞來源附錄';heading('13','回合相關新聞參照');para('各決策以附錄編號引用；連續編號使用區間表示。每則來源只列一次。時間為原始發布或保守可用時間。',{size:9,color:C.muted});for(const [id,nr]of refs){const n=news.get(id);need(64);para(`[${nr}] ${n.title}`,{size:10,gap:4});if(n.body)para(n.body,{size:9});para(`來源編號：${id}\n可見時間：${n.availableAt??n.publishedAt} / ${n.source??'原始來源'}\n${n.url??''}${n.vintageNote?'\n'+n.vintageNote:''}${n.vintageCaveats?.length?'\n歷史存檔有重發、更正或特殊統計口徑註記，請核對原文。':''}`,{size:8,color:C.muted});}}
  }else{heading('11','來源保護');para('盲測中的相關新聞以去識別化內容呈現，保留統計數值。真實日期、標的與原始來源連結於結束或主動揭露後顯示。',{size:9});
    if(refs.size){need(160);section='匿名新聞參照';heading('12','當時資訊與統計數值');for(const [id,nr]of refs){const n=newsView(s,state,news.get(id));need(65);para(`[${nr}] ${n.title}`,{size:10,color:C.teal});para(`${n.availableAt} / ${n.source}`,{size:8,color:C.muted});if(n.body)para(n.body,{size:9});if(n.vintageNote)para(n.vintageNote,{size:8,color:C.muted});}}
  }
  pages.forEach((p,i)=>{page=p;line(M,H-40,W-M,H-40);text('教育模擬  ·  非投資建議  ·  TWD',M,H-29,7,C.muted);text(`${i+1} / ${pages.length}`,W-M-45,H-29,8,C.muted);});
  return doc.save();
}
