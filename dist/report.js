import {wealth, benchmark, visible, mark} from './engine.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => Number.isFinite(value) ? value.toLocaleString('zh-TW', {minimumFractionDigits:2, maximumFractionDigits:2}) : '資料不足';
const percent = value => `${number(value)}%`;
const time = value => { const d = new Date(value); return Number.isNaN(d.valueOf()) ? esc(value) : `${esc(value)}（台北 ${new Intl.DateTimeFormat('zh-TW', {timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)}）`; };
function link(url, label) {
  try { const u = new URL(url); if (['https:', 'http:'].includes(u.protocol)) return `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`; } catch {}
  return `${esc(label)}（無可用安全連結）`;
}
function equityChart(values) {
  const low = Math.min(...values), high = Math.max(...values), span = high-low || Math.max(Math.abs(high)*.01, 1);
  const x = i => 100 + i / Math.max(values.length-1, 1) * 570;
  const y = v => 175 - (v-low)/span*140;
  const points = values.map((v,i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  return `<svg viewBox="0 0 700 215" role="img" aria-labelledby="equity-title equity-desc"><title id="equity-title">收盤總資產曲線</title><desc id="equity-desc">初始資產及每次已完成決策後的收盤總資產，共 ${values.length} 個觀測值。逐筆數值見下方表格。</desc><line x1="100" y1="175" x2="670" y2="175" stroke="#999"/><text x="0" y="40">${number(high)}</text><text x="0" y="175">${number(low)}</text><polyline points="${points}" fill="none" stroke="#245d8c" stroke-width="3"/>${values.map((v,i)=>`<circle cx="${x(i).toFixed(2)}" cy="${y(v).toFixed(2)}" r="3" fill="#245d8c"><title>第 ${i} 筆：${number(v)}</title></circle>`).join('')}<text x="100" y="205">初始</text><text x="600" y="205">${values.length-1} 次決策</text></svg>`;
}

/** A standalone, offline report. Never serialize the scenario or unrevealed data. */
export function learningReport(s, state, {studentName='', studentId='', notes='', reflection='', reason='', side='buy', quantity='', generatedAt=new Date().toISOString()}={}) {
  const snapshot = visible(s,state), current = wealth(s,state), base = benchmark(s,state);
  const journal = state.journal;
  const values = state.equity.slice(0,journal.length+1);
  if (!values.length) values.push(s.initialCash);
  let peak = values[0], drawdown = 0;
  for (const value of values) { peak = Math.max(peak,value); if (peak>0) drawdown = Math.max(drawdown,(peak-value)/peak); }
  const ret = (current/s.initialCash-1)*100, bret = (base/s.initialCash-1)*100;
  const money = n => `${esc(s.currency ?? 'TWD')} ${number(n)}`;
  const metric = (id,label,value) => `<div class="metric"><dt>${label}</dt><dd id="${id}">${value}</dd></div>`;
  const newsById = new Map(snapshot.news.map(n=>[n.id,n]));
  const referencedNews = new Map();
  let priorIds = new Set();
  const decisions = journal.map((j,i) => {
    const refs = [...new Set(j.newsIds ?? [])].map(id=>newsById.get(id)).filter(n=>n && (n.availableAt??n.publishedAt)<=j.at);
    const added = refs.filter(n=>!priorIds.has(n.id));
    refs.forEach(n=>referencedNews.set(n.id,n));
    priorIds = new Set(refs.map(n=>n.id));
    return `<article class="decision"><h3>決策 ${i+1} · ${esc(({buy:'買入',sell:'賣出',hold:'觀望'})[j.side] ?? j.side)}</h3><p>決策時間：${time(j.at)}<br>模擬成交時間：${j.status==='filled'?time(j.executionAt):'無成交'}</p><table><thead><tr><th>委託單位</th><th>實際成交單位</th><th>成交價</th><th>費用</th><th>狀態</th></tr></thead><tbody><tr><td>${esc(j.requestedQuantity??j.quantity)}</td><td>${esc(j.quantity)}</td><td>${j.status==='filled'?money(j.price):'—（無成交）'}</td><td>${money(j.fee)}</td><td>${esc(({filled:'已成交',held:'觀望，未交易',cancelled:'已取消：開盤跳空後現金不足'})[j.status]??j.status)}</td></tr></tbody></table><h4>當時填寫的判斷依據</h4><p class="prewrap">${esc(j.reason)}</p><h4>當時可見新聞參照</h4><p>當時完整參照共 ${refs.length} 則。${i===0?'首日基底 ID':'較前次決策新增可見 ID'}：${added.length?added.map(n=>esc(n.id)).join('、'):'無'}。來源詳見新聞附錄；完整當時 ID 集合可在 HTML 展開，列印不包含展開清單。</p><details class="no-print"><summary>展開當時完整新聞 ID 集合（${refs.length} 則）</summary><p class="news-ids">${refs.length?refs.map(n=>esc(n.id)).join('、'):'沒有可核對的當時新聞參照；不代表當時沒有其他新聞。'}</p></details></article>`;
  }).join('');
  const appendix = [...referencedNews.values()].map(n=>`<li class="news-reference"><strong>${esc(n.title)}</strong><br>ID：${esc(n.id)} · 可見時間：${time(n.availableAt??n.publishedAt)}<br>${link(n.url,n.source??'原始來源')}${n.vintageNote?`<br>${esc(n.vintageNote)}`:''}${n.vintageCaveats?.length?'<br>歷史存檔有重發、更正或特殊統計口徑註記，請核對原文。':''}</li>`).join('');
  const draft = String(reason).trim() ? `<section><h2>尚未送出的決策草稿（非已完成操作）</h2><p>方向：${esc(({buy:'買入',sell:'賣出',hold:'觀望'})[side]??side)} · 委託單位：${side==='hold'?'不適用':esc(quantity)}</p><p class="prewrap">${esc(reason)}</p><p>此草稿未執行，不計入決策次數、資產與績效。</p></section>` : '';
  const sourceUrls = [...new Set(snapshot.bars.map(b=>b.sourceUrl).filter(Boolean))];
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>時光交易所｜學習報告</title><style>
*{box-sizing:border-box}body{margin:0;background:#edf1f5;color:#17202b;font:16px/1.65 system-ui,sans-serif}main{max-width:980px;margin:24px auto;padding:36px;background:white}h1,h2,h3{line-height:1.3}h2{border-bottom:2px solid #b6c7d5;padding-bottom:8px;margin-top:32px}p,li,td,dd{overflow-wrap:anywhere}a{color:#174b78}button{padding:12px 18px;font:inherit;cursor:pointer}.notice{padding:12px;background:#f0f4f8;border-left:4px solid #245d8c}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.metric{border:1px solid #ccd4dc;padding:12px}dt{font-size:14px}dd{margin:4px 0;font-weight:700}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #ccd4dc;padding:8px;text-align:left}thead{display:table-header-group}.decision{margin-bottom:28px}h3,h4{break-after:avoid}.prewrap,.editable{white-space:pre-wrap}.editable{min-height:110px;border:1px solid #879caf;padding:12px}.editable:focus{outline:3px solid #c0d7ed}svg{width:100%;height:auto}svg text{font-size:13px}small{color:#435364}@media(max-width:650px){main{margin:0;padding:18px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}table{font-size:12px}th,td{padding:4px}}@page{size:A4;margin:16mm}@media print{body,main{background:#fff;color:#000}main{max-width:none;margin:0;padding:0;font-size:10pt}.no-print{display:none}.metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.metric,svg,tr{break-inside:avoid}h2{margin-top:20px}.editable{min-height:65px;overflow:visible}a{color:#000;text-decoration:underline}.notice{background:#fff;border:1px solid #999}svg{max-height:65mm}}
</style></head><body><main>
<header><h1>時光交易所｜學習報告</h1><p class="notice">${state.finished?'已完成回合':'進行中快照（尚未完成回合）'} · 已完成 ${journal.length} / ${s.rounds.length} 個決策日</p><button class="no-print" type="button" onclick="window.print()">列印／另存 PDF</button><p>可在下方補寫筆記與反思，再按「列印／另存 PDF」，於列印視窗選擇「另存為 PDF」。編輯不會自動儲存，也不會回寫原始下載檔；重新開啟會還原。離開前請列印保存。</p></header>
<section><h2>學生與回合資料</h2><p>姓名：${esc(studentName)||'（未填寫）'}<br>學號：${esc(studentId)||'（未填寫）'}</p><p>情境：${esc(s.title)}<br>情境 ID：${esc(s.id)}<br>標的：${esc(s.asset)}<br>種子：${esc(s.seed)}<br>起點年份設定：${esc(s.startYear)}<br>開始日期：${esc(s.startDate)}<br>預定長度：${s.rounds.length} 個決策日<br>已完成長度：${journal.length} 個決策日<br>模擬開始時間：${time(s.rounds[0].at)}<br>資料可見截止時間：${time(snapshot.cutoff)}<br>最後已完成決策：${journal.length?time(journal.at(-1).at):'尚無決策'}<br>報告產生時間：${time(generatedAt)}</p></section>
<section><h2>資產與績效</h2><dl class="metrics">${metric('initial-assets','初始資產',money(s.initialCash))}${metric('current-assets',state.finished?'期末總資產':'目前總資產',money(current))}${metric('portfolio-return','含息權利報酬率',percent(ret))}${metric('benchmark-assets','買入持有基準資產',money(base))}${metric('benchmark-return','買入持有基準報酬率',percent(bret))}${metric('relative-return','相對基準報酬差',`${number(ret-bret)} 個百分點`)}${metric('max-drawdown','收盤資產最大回撤',percent(drawdown*100))}${metric('total-fees','累計交易費用',money(state.fees))}${metric('cash','可用現金',money(state.cash))}${metric('holdings','持有單位',esc(state.shares))}${metric('holding-value','持倉估值',money(state.shares*mark(s,state)))}${metric('receivables','應收配息',money(state.receivable??0))}</dl><p>總資產＝現金＋持倉估值＋應收配息。${state.finished?'期末以最後已完成交易日收盤價估值':'進行中以當時已知的昨收參考價估值'}，未強制清算、不扣假設賣出費用。基準使用首日開盤整數單位買入、相同買入費率及應得配息，不再投資；尚無決策時基準為初始現金。</p><p>最大回撤按初始資產及每次已完成決策的收盤資產計算，不代表盤中最大損失。相對績效以報酬率相減，單位為百分點。</p></section>
<section><h2>資產曲線與逐期數值</h2>${equityChart(values)}<table><thead><tr><th>觀測點</th><th>總資產（${esc(s.currency??'TWD')}）</th></tr></thead><tbody>${values.map((v,i)=>`<tr><td>${i===0?'初始資產':`決策 ${i} · ${esc(journal[i-1]?.at?.slice(0,10))} 收盤`}</td><td>${number(v)}</td></tr>`).join('')}</tbody></table></section>
<section><h2>完整決策紀錄</h2>${decisions||'<p>尚無已完成的決策。</p>'}</section>
${draft}
<section><h2>學生筆記</h2><div class="editable" contenteditable="true" role="textbox" aria-multiline="true" aria-label="學生筆記">${esc(notes)}</div><h2>學生反思</h2><p>可思考：哪些決策有當時可見的證據？成交與預期有何差異？若換一個起點，結論是否仍成立？以下保留給學生自行填寫。</p><div class="editable" contenteditable="true" role="textbox" aria-multiline="true" aria-label="學生反思">${esc(reflection)}</div></section>
<section><h2>新聞參照附錄（每則只列一次）</h2><p>各決策的新聞 ID 可在此對照。可見時間依原始發布時間或保守可用時間；不是完整新聞資料庫。</p><ul>${appendix||'<li>沒有已引用的可見新聞。</li>'}</ul></section>
<footer><h2>資料來源與教學限制</h2><p>本報告僅列出已揭露日線的來源及各決策當時已知的新聞參照，不含尚未揭露的行情與新聞。新聞是精選子集，不代表完整當時資訊；歷史存檔也可能含後續修訂。原始來源連結須連網才能開啟，報告閱讀與列印本身不需網路。</p><ul>${sourceUrls.map((url,i)=>`<li>${link(url,`TWSE 已揭露日線來源 ${i+1}`)}</li>`).join('')}</ul><p>整數單位、不可放空或槓桿，雙向費率 ${percent(s.feeRate*100)}，未計稅、滑價、最低手續費或流動性限制，非真實零股撮合。除息前持倉取得配息權利；入帳採發放日開盤前的簡化模型，未驗證實際券商時刻。分割按已生效日期換算。全日成交量採下一交易日上午的保守可見時間。單次回合績效不能證明策略有效，也不能證明新聞造成漲跌。本機報告可編輯，並非經驗證的考試或交易憑證。本報告為獨立教育用事實整理，非來源機構背書；未宣稱取得所有來源的個別書面授權。來源與加工說明見遊戲頁的「資料來源與使用說明」。</p></footer>
</main></body></html>`;
}
