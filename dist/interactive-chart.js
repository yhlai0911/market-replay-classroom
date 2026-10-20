import { movingAverageInstances, movingAverageSeriesKey } from './indicators.js?v=preview-v9';
// Local-only chart: its entire data boundary is the already revealed bars supplied by the caller.
export function clampRange(total, start = total - 60, count = 60) {
  total = Math.max(0, Math.floor(Number(total) || 0));
  count = Math.min(total, Math.max(Math.min(12, total), Math.round(Number(count) || 60)));
  start = Math.max(0, Math.min(total - count, Math.round(Number(start) || 0)));
  return { start, end: start + count, count };
}
export function zoomRange(total, range, factor, anchor = .5) {
  const count = Math.max(Math.min(12, total), Math.min(total, Math.round(range.count * factor)));
  anchor = Math.max(0, Math.min(1, anchor));
  return clampRange(total, range.start + (range.count - count) * anchor, count);
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const finite = Number.isFinite;
const number = (value, digits = 2) => finite(value) ? value.toLocaleString('zh-TW', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
const compact = value => Math.abs(value) >= 1e8 ? `${number(value / 1e8, 1)}億` : Math.abs(value) >= 1e4 ? `${number(value / 1e4, 1)}萬` : number(value, Math.abs(value) < 10 ? 2 : 0);
const COLORS = { sma:'#f5c773', ema:'#6faeff', bbMiddle:'#c59aff', bbUpper:'#a88be0', bbLower:'#a88be0', rsi:'#b79bff', macd:'#f5c773', macdSignal:'#70b6ff', k:'#f5c773', d:'#70b6ff', volumeMA:'#f5c773' };
let instance = 0;
function addStyle() {
  if (document.getElementById('replay-interactive-chart-style')) return;
  const style = document.createElement('style'); style.id = 'replay-interactive-chart-style';
  style.textContent = `.replay-chart{min-width:0;width:100%;max-width:100%;overflow:hidden;color:#a9bbcd;font:12px system-ui,sans-serif;background:#091321;border:1px solid #26384d;border-radius:12px}.replay-chart *{box-sizing:border-box}.replay-chart .rc-toolbar{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid #243346;background:#101d2c}.replay-chart .rc-legend{display:flex;flex-wrap:wrap;gap:5px 14px;padding:8px 12px 0;font-size:10px;line-height:1.5}.replay-chart .rc-legend span{white-space:nowrap}.replay-chart .rc-legend i{display:inline-block;width:13px;height:2px;margin-right:5px;vertical-align:middle;background:currentColor}.replay-chart .rc-range{font-size:11px;flex:1;min-width:100px;color:#c8d5e6}.replay-chart .rc-controls{display:flex;gap:5px;flex-shrink:0}.replay-chart .rc-controls button{min-height:30px;min-width:31px;padding:4px 9px;border:1px solid #354961;border-radius:6px;background:#192a3d;color:#dce7f7;font:12px system-ui;cursor:pointer}.replay-chart .rc-controls button:hover{background:#28425e}.replay-chart button:focus-visible,.replay-chart .rc-plot:focus-visible{outline:2px solid #77b5ff;outline-offset:-2px}.replay-chart .rc-controls button:disabled{opacity:.35;cursor:default}.replay-chart .rc-plot{position:relative;min-width:0;width:100%;touch-action:pan-y;cursor:crosshair;overflow:hidden}.replay-chart .rc-plot svg{display:block;width:100%;max-width:100%;min-width:0;min-height:0;max-height:none;aspect-ratio:auto;height:auto;user-select:none}.replay-chart .rc-plot svg text{font-size:10px}.replay-chart .rc-tooltip{position:absolute;z-index:2;pointer-events:none;top:38px;left:12px;max-width:calc(100% - 24px);padding:9px 12px;border:1px solid #4b6583;background:rgba(11,24,40,.96);border-radius:7px;box-shadow:0 6px 20px #0006;color:#dbe6f5;font-size:11px;line-height:1.8;white-space:normal}.replay-chart .rc-tooltip[hidden]{display:none}.replay-chart .rc-tooltip strong{display:block;color:#fff}.replay-chart .rc-help{padding:7px 12px;border-top:1px solid #243346;font-size:10px;line-height:1.6;color:#8298af}.replay-chart .rc-empty{padding:70px 20px;text-align:center;color:#91a8be}@media(max-width:480px){.replay-chart .rc-toolbar{padding:8px}.replay-chart .rc-legend{display:flex;flex-wrap:wrap;gap:5px 14px;padding:8px 12px 0;font-size:10px;line-height:1.5}.replay-chart .rc-legend span{white-space:nowrap}.replay-chart .rc-legend i{display:inline-block;width:13px;height:2px;margin-right:5px;vertical-align:middle;background:currentColor}.replay-chart .rc-range{flex-basis:100%}.replay-chart .rc-controls{width:100%;justify-content:flex-end}}`;
  document.head.append(style);
}
export function createInteractiveChart(container) {
  if (!container) throw new TypeError('Chart container is required');
  addStyle(); const id = `rc-${++instance}`;
  container.innerHTML = `<div class="replay-chart"><div class="rc-toolbar"><span class="rc-range" aria-live="polite"></span><div class="rc-controls"><button type="button" data-action="older" aria-label="查看較早交易日">←</button><button type="button" data-action="newer" aria-label="查看較近交易日">→</button><button type="button" data-action="in" aria-label="放大圖表">＋</button><button type="button" data-action="out" aria-label="縮小圖表">−</button><button type="button" data-action="reset">最新 60 根</button></div></div><div class="rc-legend" aria-label="指標圖例"></div><div class="rc-plot" tabindex="0" role="application" aria-label="歷史 K 線互動圖。方向鍵平移，加減鍵縮放，Home 回到最新已知資料。"><svg xmlns="http://www.w3.org/2000/svg"></svg><div class="rc-tooltip" hidden></div></div><div class="rc-help">拖曳 / 方向鍵：回看已知日線 · Ctrl / ⌘ + 滾輪或 ＋−：縮放 · Home：最新 · 觸控：橫向拖曳或雙指縮放 · 僅顯示已完成交易日</div></div>`;
  const root = container.querySelector('.replay-chart'), plot = root.querySelector('.rc-plot'), svg = plot.querySelector('svg'), tooltip = root.querySelector('.rc-tooltip'), status = root.querySelector('.rc-range'), legendElement = root.querySelector('.rc-legend');
  let bars = [], series = {}, settings = {}, label = () => '', range = clampRange(0), width = 640, height = 430, panels = [], hovered = -1, oldFirst = null;
  let colors = { ...COLORS }, seriesLabels = {};
  let drag = null, pinch = null; const pointers = new Map();
  const left = 12, right = 70;
  const plotWidth = () => Math.max(80, width - left - right);
  const x = i => left + (i - range.start + .5) / Math.max(1, range.count) * plotWidth();
  const y = (value, p) => p.bottom - (value - p.min) / (p.max - p.min) * (p.bottom - p.top);
  const safeLabel = bar => bar ? String(label(bar.date)) : '';
  const valuesFor = keys => keys.flatMap(key => (series[key] || []).slice(range.start, range.end)).filter(finite);
  const line = (key, p) => {
    let path = '', drawing = false;
    for (let i = range.start; i < range.end; i++) { const value = series[key]?.[i]; if (!finite(value)) { drawing = false; continue; } path += `${drawing ? 'L' : 'M'}${x(i).toFixed(2)},${y(value,p).toFixed(2)} `; drawing = true; }
    return `<path data-series="${esc(key)}" d="${path}" fill="none" stroke="${colors[key]}" stroke-width="1.6" clip-path="url(#${id}-${p.key})"/>`;
  };
  function clearHover() { hovered = -1; tooltip.hidden = true; tooltip.innerHTML = ''; svg.querySelector('[data-crosshair]')?.replaceChildren(); }
  function render() {
    clearHover(); width = Math.max(260, Math.round(plot.getBoundingClientRect().width || 640));
    if (!bars.length) { legendElement.innerHTML = ''; svg.setAttribute('aria-label','尚無已完成日線'); svg.setAttribute('viewBox', '0 0 640 300'); svg.innerHTML = '<text x="320" y="150" fill="#91a8be" text-anchor="middle">尚無已完成日線</text>'; status.textContent = '尚無歷史資料'; return; }
    range = clampRange(bars.length, range.start, range.count);
    const visible = bars.slice(range.start, range.end), priceKeys = [];
    colors = { ...COLORS }; seriesLabels = {};
    const averages = movingAverageInstances(settings);
    const averageLegend = averages.map((average,index) => {
      const dynamicKey = movingAverageSeriesKey(average);
      // Compatibility with callers that still supply the original study shape.
      const key = !series[dynamicKey] && average.id === `legacy-${average.type}` ? average.type : dynamicKey;
      const duplicate = averages.filter(other => other.type === average.type && other.period === average.period).length > 1;
      const suffix = duplicate ? ` · 線 ${index+1}` : '';
      const name = `${average.type === 'sma' ? 'SMA 均線' : 'EMA 指數均線'} ${average.period}${suffix}`;
      colors[key] = /^#[0-9a-f]{6}$/i.test(average.color) ? average.color : COLORS[average.type];
      seriesLabels[key] = `${average.type.toUpperCase()} ${average.period}${suffix}`;
      priceKeys.push(key);
      return [key, name, true];
    });
    if(settings.bbEnabled) priceKeys.push('bbMiddle','bbUpper','bbLower');
    const prices = [...visible.flatMap(b=>[b.low,b.high]), ...valuesFor(priceKeys)].filter(finite);
    let low = Math.min(...prices), high = Math.max(...prices); if (!finite(low)) { low = 0; high = 1; } const pad = (high-low)*.1 || Math.max(Math.abs(low)*.01,1);
    const legendEntries = [
      ...averageLegend,
      ['bbMiddle', `布林通道 ${settings.bbPeriod} × ${settings.bbDeviations}`, settings.bbEnabled],
      ['volumeMA', `換算後均量 ${settings.volumeMAPeriod}`, settings.volumeMAEnabled],
      ['rsi', 'RSI 相對強弱', settings.rsiEnabled],
      ['macd', 'MACD 快慢線差', settings.macdEnabled],
      ['macdSignal', 'MACD 訊號線', settings.macdEnabled],
      ['k', 'KD · K 線', settings.kdEnabled], ['d', 'KD · D 線', settings.kdEnabled]
    ].filter(entry=>entry[2]);
    legendElement.innerHTML = legendEntries.map(([key,text])=>`<span style="color:${colors[key]}"><i aria-hidden="true"></i>${esc(text)}</span>`).join('');
    panels = [{key:'price',title:'日 K · 分割可比價格',top:32,bottom:width<500?260:310,min:low-pad,max:high+pad,keys:priceKeys}];
    let top = panels[0].bottom + 32;
    const vols = visible.map(b=>b.comparableVolume ?? b.volume).filter(finite);
    panels.push({key:'volume',title:`成交量 · 股票分割換算後${settings.volumeMAEnabled ? ` · MA ${settings.volumeMAPeriod}`:''}`,top,bottom:top+74,min:0,max:Math.max(1,...vols,...(settings.volumeMAEnabled?valuesFor(['volumeMA']):[]))*1.12,keys:settings.volumeMAEnabled?['volumeMA']:[]}); top += 108;
    for(const [key,title,keys,enabled] of [['rsi',`RSI ${settings.rsiPeriod}`,['rsi'],settings.rsiEnabled],['macd',`MACD ${settings.macdFast}, ${settings.macdSlow}, ${settings.macdSignal}`,['macd','macdSignal'],settings.macdEnabled],['kd',`KD ${settings.kdLookback} · K / D`,['k','d'],settings.kdEnabled]]) {
      if (!enabled) continue; const vals=valuesFor(key==='macd'?[...keys,'macdHistogram']:keys); const max=key==='macd'?Math.max(.01,...vals.map(Math.abs))*1.15:100;
      panels.push({key,title: title+(vals.length?'':' · 歷史資料不足'),top,bottom:top+88,min:key==='macd'?-max:0,max,keys});top+=122;
    }
    height=panels.at(-1).bottom+34; svg.setAttribute('viewBox',`0 0 ${width} ${height}`); svg.setAttribute('aria-label',`${range.count} 根已完成日線，${safeLabel(visible[0])} 至 ${safeLabel(visible.at(-1))}`);
    const ticks=Math.max(2,Math.min(7,Math.floor(plotWidth()/100))), tickIndices=[...new Set(Array.from({length:ticks},(_,i)=>Math.round(range.start+(range.count-1)*i/(ticks-1))))];
    let html='<defs>'+panels.map(p=>`<clipPath id="${id}-${p.key}"><rect x="${left}" y="${p.top}" width="${plotWidth()}" height="${p.bottom-p.top}"/></clipPath>`).join('')+'</defs>';
    for(const p of panels) {
      html+=`<text x="${left}" y="${p.top-11}" fill="#a9bed4" font-size="11">${esc(p.title)}</text>`;
      const gridValues=p.key==='rsi'||p.key==='kd'?[0,20,50,80,100]:Array.from({length:p.key==='price'?5:3},(_,i)=>p.min+(p.max-p.min)*i/(p.key==='price'?4:2));
      for(const val of gridValues) html+=`<line x1="${left}" x2="${width-right}" y1="${y(val,p)}" y2="${y(val,p)}" stroke="#233247" stroke-width=".7"${(p.key==='rsi'||p.key==='kd')&&(val===20||val===80)?' stroke-dasharray="4 4"':''}/><text x="${width-right+8}" y="${y(val,p)+3}" fill="#849bb4" font-size="10">${esc(p.key==='volume'?compact(val):number(val,p.key==='rsi'||p.key==='kd'?0:2))}</text>`;
      for(const i of tickIndices) html+=`<line x1="${x(i)}" x2="${x(i)}" y1="${p.top}" y2="${p.bottom}" stroke="#203047" stroke-width=".6" stroke-dasharray="2 5"/>`;
      if(p.key==='price'||p.key==='volume'||p.key==='macd') {
        const bw=Math.max(.7,Math.min(18,plotWidth()/range.count*.68));
        for(let i=range.start;i<range.end;i++) { const b=bars[i], color=b.close>b.open?'#f47c86':b.close<b.open?'#39c9a0':'#9cacc2';
          if(p.key==='price'&&[b.open,b.close,b.high,b.low].every(finite)) html+=`<g clip-path="url(#${id}-price)"><line x1="${x(i)}" x2="${x(i)}" y1="${y(b.high,p)}" y2="${y(b.low,p)}" stroke="${color}"/><rect x="${x(i)-bw/2}" y="${Math.min(y(b.open,p),y(b.close,p))}" width="${bw}" height="${Math.max(1.2,Math.abs(y(b.close,p)-y(b.open,p)))}" fill="${color}"/></g>`;
          else {const v=p.key==='volume'?(b.comparableVolume??b.volume):series.macdHistogram?.[i];if(finite(v))html+=`<rect clip-path="url(#${id}-${p.key})" x="${x(i)-bw/2}" y="${Math.min(y(0,p),y(v,p))}" width="${bw}" height="${Math.max(.7,Math.abs(y(0,p)-y(v,p)))}" fill="${p.key==='macd'?(v>=0?'#f47c86':'#39c9a0'):color}" opacity=".65"/>`;}
        }
      }
      html+=p.keys.map(key=>line(key,p)).join('');
    }
    for(const [j,i] of tickIndices.entries()) html+=`<text x="${x(i)}" y="${height-10}" text-anchor="${j===0?'start':j===tickIndices.length-1?'end':'middle'}" fill="#92a8c0" font-size="10">${esc(safeLabel(bars[i]))}</text>`;
    html+='<g data-crosshair pointer-events="none"></g>';svg.innerHTML=html;
    status.textContent=`${safeLabel(visible[0])} → ${safeLabel(visible.at(-1))} · ${range.count} / ${bars.length} 根已知日線`;
    for(const button of root.querySelectorAll('[data-action]')) button.disabled=button.dataset.action==='older'?range.start===0:button.dataset.action==='newer'?range.end===bars.length:button.dataset.action==='in'?range.count<=Math.min(12,bars.length):button.dataset.action==='out'?range.count>=bars.length:false;
  }
  function hover(clientX,clientY) {
    if(!bars.length)return;const rect=svg.getBoundingClientRect(),px=(clientX-rect.left)*width/rect.width,py=(clientY-rect.top)*height/rect.height;
    if(px<left||px>width-right||py<panels[0].top||py>panels.at(-1).bottom){clearHover();return;}
    hovered=Math.max(range.start,Math.min(range.end-1,Math.floor((px-left)/plotWidth()*range.count)+range.start));const b=bars[hovered],p=panels.find(p=>py>=p.top&&py<=p.bottom);
    let overlay=`<line x1="${x(hovered)}" x2="${x(hovered)}" y1="${panels[0].top}" y2="${panels.at(-1).bottom}" stroke="#9bb5d4" stroke-dasharray="4 3"/>`;
    if(p){const value=p.max-(py-p.top)/(p.bottom-p.top)*(p.max-p.min);overlay+=`<line x1="${left}" x2="${width-right}" y1="${py}" y2="${py}" stroke="#9bb5d4" stroke-dasharray="4 3"/><rect x="${width-right}" y="${py-10}" width="${right}" height="20" fill="#365473"/><text x="${width-right+5}" y="${py+4}" fill="#fff" font-size="10">${esc(p.key==='volume'?compact(value):number(value))}</text>`;}
    svg.querySelector('[data-crosshair]').innerHTML=overlay;
    const extras=panels.flatMap(p=>p.keys).filter(key=>finite(series[key]?.[hovered])).map(key=>`<span style="color:${colors[key]}">${esc(seriesLabels[key] ?? (key==='volumeMA'?'平均成交量（換算後）':key.toUpperCase()))} ${number(series[key][hovered],key==='volumeMA'?0:2)}</span>`);
    tooltip.innerHTML=`<strong>${esc(safeLabel(b))} · 已完成日線</strong>開 ${number(b.open)}　高 ${number(b.high)}<br>低 ${number(b.low)}　收 ${number(b.close)}<br>實際成交量 ${number(b.volume,0)} 股<br>換算後成交量 ${number(b.comparableVolume??b.volume,0)} 股${extras.length?'<br>'+extras.join(' · '):''}`;
    tooltip.style.left=px>width*.52?'12px':'auto';tooltip.style.right=px>width*.52?'auto':'12px';tooltip.hidden=false;
  }
  function pan(delta){range=clampRange(bars.length,range.start+delta,range.count);render();}
  function zoom(factor,anchor=.5){range=zoomRange(bars.length,range,factor,anchor);render();}
  function reset(){range=clampRange(bars.length,bars.length-60,60);render();}
  root.querySelector('.rc-controls').addEventListener('click',event=>{const action=event.target.closest('button')?.dataset.action;if(action==='reset')reset();else if(action==='in')zoom(.8);else if(action==='out')zoom(1.25);else if(action==='older')pan(-Math.max(1,Math.round(range.count*.25)));else if(action==='newer')pan(Math.max(1,Math.round(range.count*.25)));});
  plot.addEventListener('keydown',event=>{if(['+','=','-','_','ArrowLeft','ArrowRight','Home'].includes(event.key)){event.preventDefault();if(event.key==='Home')reset();else if(event.key==='ArrowLeft')pan(-Math.max(1,Math.round(range.count*.1)));else if(event.key==='ArrowRight')pan(Math.max(1,Math.round(range.count*.1)));else zoom(event.key==='+'||event.key==='='?.8:1.25);}});
  plot.addEventListener('wheel',event=>{if(!bars.length||(!event.ctrlKey&&!event.metaKey))return;event.preventDefault();const rect=svg.getBoundingClientRect();zoom(event.deltaY<0?.85:1.18,((event.clientX-rect.left)*width/rect.width-left)/plotWidth());},{passive:false});
  plot.addEventListener('pointerdown',event=>{if(event.button!==0)return;plot.focus({preventScroll:true});pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});plot.setPointerCapture(event.pointerId);drag={x:event.clientX,start:range.start,count:range.count};if(pointers.size===2){const pts=[...pointers.values()];pinch={distance:Math.abs(pts[0].x-pts[1].x)||1,range:{...range}};}hover(event.clientX,event.clientY);});
  plot.addEventListener('pointermove',event=>{if(pointers.has(event.pointerId)){pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size===2&&pinch){const pts=[...pointers.values()];range=zoomRange(bars.length,pinch.range,pinch.distance/Math.max(1,Math.abs(pts[0].x-pts[1].x)));render();return;}if(drag&&Math.abs(event.clientX-drag.x)>4){const rect=svg.getBoundingClientRect();range=clampRange(bars.length,drag.start-(event.clientX-drag.x)*width/rect.width/plotWidth()*drag.count,drag.count);render();return;}}hover(event.clientX,event.clientY);});
  function endPointer(event){pointers.delete(event.pointerId);pinch=null;drag=null;if(pointers.size){const pt=[...pointers.values()][0];drag={x:pt.x,start:range.start,count:range.count};}if(event.type==='pointercancel')clearHover();}
  plot.addEventListener('pointerup',endPointer);plot.addEventListener('pointercancel',endPointer);plot.addEventListener('lostpointercapture',endPointer);plot.addEventListener('pointerleave',()=>{if(!drag)clearHover();});
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>render()):null;observer?.observe(plot);
  render();
  return {update(data={}){const next=Array.isArray(data.bars)?data.bars:[],follow=range.end===bars.length,changed=oldFirst!==next[0]?.date||next.length<bars.length;const previousLength=bars.length;bars=next;series=data.study?.series||{};settings=data.settings||{};label=typeof data.label==='function'?data.label:date=>`第 ${bars.findIndex(b=>b.date===date)+1} 根`;oldFirst=bars[0]?.date;if(changed||!previousLength)range=clampRange(bars.length,bars.length-60,60);else range=clampRange(bars.length,follow?bars.length-range.count:range.start,range.count);render();},reset,destroy(){observer?.disconnect();container.replaceChildren();}};
}
