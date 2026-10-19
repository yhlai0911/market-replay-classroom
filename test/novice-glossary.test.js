import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const newsTerms=vm.runInNewContext(app.slice(app.indexOf('function newsTerms('))+';newsTerms');
test('BLS source metadata enables plain-language glossary without exposing raw source dates/identity',()=>{
 const html=newsTerms({title:'消費者物價變化',body:'原始公布數據',source:'官方精選發布'},{source:'U.S. Bureau of Labor Statistics',publishedAt:'2020-01-01',url:'https://example.com/0050'});
 assert.match(html,/CPI 是什麼/);assert.match(html,/BLS 是什麼/);assert.doesNotMatch(html,/2020-01-01|https:|0050|Bureau of Labor Statistics/);
});
test('irrelevant news has no glossary; FOMC explanation does not predict stock returns',()=>{assert.equal(newsTerms({title:'一般企業公告',body:'會議時間'}),'');const html=newsTerms({title:'FOMC 決議',body:'政策公告'});assert.match(html,/貨幣政策/);assert.match(html,/當時可取得/);});
