// Optional browser acceptance: npm/Node tests do not require Playwright.
// Uses a separate browser context and only normal UI actions; never imports a personal save.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const url=process.argv[2]||'http://127.0.0.1:4173/';
const output=process.argv[3];if(!output)throw Error('Usage: node scripts/accept-news-boundary.cjs URL NEW_EVIDENCE_DIRECTORY');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/dataset-0050-news-20261019.json')));
const boj=data.events.find(n=>n.id==='global-2024-03-19-42'),cbc=data.events.find(n=>n.id==='tw-cbc-2024-03-21');
assert(boj&&cbc);assert.equal(boj.availableAt,'2024-03-19T03:35:00Z');assert.equal(cbc.availableAt,'2024-03-21T16:00:00Z');
const normalizedTime=text=>text.replace(/\s+/g,' ').trim();
const localTime=iso=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
(async()=>{
 fs.mkdirSync(output,{recursive:false});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1100},acceptDownloads:true});const errors=[],steps=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const card=event=>page.locator('#news .news-item').filter({has:page.getByRole('heading',{name:event.title,exact:true})});
 async function anonymous(){assert.equal(await page.locator('#ticker-symbol').innerText(),'標的 A');for(const selector of ['#clock','#ticker-date','#news'])assert.doesNotMatch(await page.locator(selector).innerText(),/\b(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}/);}
 async function record(label,bojPresent,cbcPresent){assert.equal(await card(boj).count(),bojPresent?1:0,label+' BOJ');assert.equal(await card(cbc).count(),cbcPresent?1:0,label+' CBC');steps.push({label,clock:await page.locator('#clock').innerText(),bojPresent,cbcPresent});}
 async function reveal(){await page.locator('#tab-setup').click();await page.locator('#reveal-identity').click();await page.locator('#tab-trade').click();}
 async function hold(){await page.locator('#reason').fill('UI acceptance: validate as-of news availability.');await page.locator('[name=side][value=hold]').check();await page.locator('#submit').click();assert.equal(await page.locator('#error').innerText(),'');}
 try{
  await page.goto(url,{waitUntil:'networkidle'});await page.locator('#tab-setup').click();await page.locator('#new-dataset').selectOption('0050-news-20261019');await page.locator('#reveal-identity').click();
  const setup=page.locator('details.setup');if(await setup.count()&&(await setup.getAttribute('open'))===null)await setup.locator('summary').click();
  await page.locator('#seed').fill('news-boundary-publication');await page.locator('#length').selectOption('20');await page.locator('#start-date').selectOption('2024-03-18');await page.locator('#apply-setup').click();assert.equal(await page.locator('#setup-error').innerText(),'');
  await anonymous();await record('decision 1 / 2024-03-18 00:55Z',false,false);await page.reload({waitUntil:'networkidle'});await anonymous();await record('refresh before either event',false,false);
  await reveal();assert((await page.locator('#clock').innerText()).includes('2024/03/18'));await hold();assert((await page.locator('#clock').innerText()).includes('2024/03/19'));await record('decision 2 before BOJ intraday release',false,false);
  await page.reload({waitUntil:'networkidle'});await anonymous();await hold();await anonymous();await record('decision 3 / 2024-03-20 first eligible BOJ cutoff',true,false);await page.screenshot({path:path.join(output,'boj-first-eligible-anonymous.png')});
  await page.reload({waitUntil:'networkidle'});await anonymous();await record('refresh after BOJ arrival preserves anonymity and availability',true,false);await reveal();assert((await page.locator('#clock').innerText()).includes('2024/03/20'));
  const bojTime=await card(boj).locator('time').innerText();assert(normalizedTime(bojTime).includes(normalizedTime(localTime(boj.availableAt))));await card(boj).screenshot({path:path.join(output,'boj-exact-availability-revealed.png')});
  await hold();assert((await page.locator('#clock').innerText()).includes('2024/03/21'));await record('decision 4 before CBC date-only availability',true,false);
  await hold();assert((await page.locator('#clock').innerText()).includes('2024/03/22'));await record('decision 5 / 2024-03-22 first eligible CBC cutoff',true,true);const cbcTime=await card(cbc).locator('time').innerText();assert(normalizedTime(cbcTime).includes(normalizedTime(localTime(cbc.availableAt))));await card(cbc).screenshot({path:path.join(output,'cbc-exact-availability-revealed.png')});
  await page.reload({waitUntil:'networkidle'});await anonymous();await record('refresh after CBC arrival restores anonymous display',true,true);assert((await card(cbc).innerText()).includes('2%'));
  await page.locator('#tab-report').click();const next=page.waitForEvent('download');await page.locator('#export').click();const download=await next;const backup=path.join(output,'separate-test-session.json');await download.saveAs(backup);const save=JSON.parse(fs.readFileSync(backup));assert.equal(save.scenario.startDate,'2024-03-18');assert.equal(save.state.journal.length,4);assert.equal(save.scenario.blind.everRevealed,true);assert.equal(save.datasetVersion,'sha256:4868342513f0f40a188900de6b2e4347f8ff58fcd9cf7117ba22875d740faf10');assert.equal(errors.length,0,errors.join('\n'));
  const result={status:'PASS',url,events:[{id:boj.id,availableAt:boj.availableAt,displayedAvailableTime:bojTime,firstEligibleDecision:3},{id:cbc.id,availableAt:cbc.availableAt,displayedAvailableTime:cbcTime,firstEligibleDecision:5}],steps,pageErrors:errors,separateTestSession:true,normalUiActionsOnly:true,originalPersonalSessionImported:false};fs.writeFileSync(path.join(output,'acceptance-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
