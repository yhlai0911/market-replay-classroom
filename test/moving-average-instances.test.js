import test from 'node:test';import assert from 'node:assert/strict';
import {calculateIndicators,normalizeIndicatorSettings,requiredWarmup,movingAverageInstances,movingAverageSeriesKey} from '../dist/indicators.js';
const line=(id,type,period,color='#f5c773')=>({id,type,period,color});
const bars=values=>values.map(close=>({close,high:close+1,low:close-1,volume:100}));
test('same-type SMA short and long lines reveal a causal crossing independently',()=>{
 const input=bars([10,9,8,7,8,10,12,14,16]),settings={movingAverages:[line('short','sma',2),line('long','sma',4,'#6faeff'),line('medium','sma',3,'#c59aff')]},full=calculateIndicators(input,settings);
 const short=full.series.ma_short,long=full.series.ma_long;assert(short[4]<long[4]);assert(short[5]>long[5]);assert.equal(full.series.ma_medium[2],9);
 for(let count=1;count<=input.length;count++){const prefix=calculateIndicators(input.slice(0,count),settings);for(const l of settings.movingAverages)assert.deepEqual(prefix.series[movingAverageSeriesKey(l)],full.series[movingAverageSeriesKey(l)].slice(0,count));}
 assert.equal(requiredWarmup(settings),4);
});
test('EMA three instances have independent seeds and stable id/color normalization',()=>{
 const settings=normalizeIndicatorSettings({movingAverages:[line('fast','ema',2,'#AABBCC'),line('middle','ema',3),line('slow','ema',5)]});assert.equal(settings.movingAverages[0].color,'#aabbcc');
 const result=calculateIndicators(bars([1,2,3,4,5,6]),settings);assert.equal(result.series.ma_fast[1],1.5);assert.equal(result.series.ma_middle[2],2);assert.equal(result.series.ma_slow[4],3);assert.equal(result.series.ma_slow[3],null);assert.equal(requiredWarmup(settings),5);
});
test('legacy single-line settings migrate only on request; explicit instances override legacy aliases',()=>{
 const legacy=normalizeIndicatorSettings({smaEnabled:true,smaPeriod:5,emaEnabled:true,emaPeriod:20});assert(!Object.hasOwn(legacy,'movingAverages'));assert.deepEqual(movingAverageInstances(legacy).map(x=>x.id),['legacy-sma','legacy-ema']);
 const cfg=normalizeIndicatorSettings({...legacy,movingAverages:[line('only','sma',3)]});assert.equal(requiredWarmup(cfg),3);assert.equal(calculateIndicators(bars([1,2,3]),cfg).latest.ma_only,2);assert.equal(calculateIndicators(bars([1,2,3]),cfg).latest.sma,null);
 assert.equal(requiredWarmup({...legacy,movingAverages:[]}),0);
});
test('invalid or duplicate instances cannot enter history/import; cap is eight total',()=>{
 for(const movingAverages of [[line('x','sma',2),line('x','ema',3)],[line('x','bad',2)],[line('x','sma',121)],[line('x','sma',2,'red')],[line('<script>','sma',2)],Array.from({length:9},(_,i)=>line('x'+i,'sma',5))])assert.throws(()=>normalizeIndicatorSettings({movingAverages}));
 assert.equal(normalizeIndicatorSettings({movingAverages:Array.from({length:8},(_,i)=>line('x'+i,'sma',5))}).movingAverages.length,8);
});
