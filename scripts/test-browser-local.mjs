import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, cp } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(root, 'work', 'browser-local');
await mkdir(directory, {recursive:true});
const output = await mkdtemp(join(directory, 'run-'));
const port = Number(process.env.LAZER_DEV_PORT || 53783);
const origin = `http://127.0.0.1:${port}`;
const key = 'lazer-derivatives-practice-v1';
const report = {startedAt:new Date().toISOString(), scope:'Actual portable framework server, ordinary browser practice and development sign-in, local D1 and native WebMCP. No hosted authentication or funded trading claim.', checks:[], layouts:[], pageErrors:[], consoleErrors:[], failedRequests:[]};
const log = [];
let child, browser;
const stateRoot=await mkdtemp(join(tmpdir(),'lazer-framework-'));
let stateDirectory=join(stateRoot,'database');
report.databaseDirectories={stateRoot};
function check(name) { report.checks.push(name); console.log('PASS '+name); }
async function start() {
  child = spawn(process.execPath, ['scripts/run-framework.mjs','dev','--host','127.0.0.1','--port',String(port)], {cwd:root,windowsHide:true,env:{...process.env,LAZER_LOCAL_STATE:stateDirectory,WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',x=>log.push(x.toString())); child.stderr.on('data',x=>log.push(x.toString()));
  for(let i=0;i<120;i++) {
    if(child.exitCode!==null) throw Error('Local server exited before readiness.');
    try { const r=await fetch(origin,{signal:AbortSignal.timeout(1000)}); if(r.status===200)return; } catch {}
    await new Promise(r=>setTimeout(r,500));
  }
  throw Error('Local server did not become ready.');
}
async function stop() {
  if(!child || child.exitCode!==null)return;
  if(process.platform==='win32') {try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}
  else child.kill('SIGTERM');
  await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);
  if(child.exitCode===null)child.kill('SIGKILL');
}
async function pageFor() {
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
  const page=await context.newPage();
  page.on('pageerror',e=>report.pageErrors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
  page.on('requestfailed',r=>report.failedRequests.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
  return page;
}
async function journal(page) {return page.evaluate(k=>JSON.parse(sessionStorage.getItem(k)),key);}
async function openJournal(page) {await page.getByRole('button',{name:'Journal',exact:true}).first().click();await page.getByRole('button',{name:'Export journal',exact:true}).waitFor();}
async function download(page,name,filename) {
  const waiting=page.waitForEvent('download'); await page.getByRole('button',{name,exact:true}).click();
  const file=await waiting;await file.saveAs(join(output,filename));return JSON.parse(await readFile(join(output,filename),'utf8'));
}
try {
  for(const file of ['0000_abnormal_dragon_lord.sql','0001_overconfident_doctor_doom.sql'])execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',stateDirectory,'--file','drizzle/'+file],{cwd:root,windowsHide:true,stdio:'pipe'});
  await start();
  browser=await chromium.launch({headless:true,args:['--enable-features=WebMCPTesting'],...(process.env.LAZER_BROWSER_CHANNEL?{channel:process.env.LAZER_BROWSER_CHANNEL}:{})});
  report.browser=browser.version();
  const page=await pageFor();await page.goto(origin,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Place practice long',exact:true}).click();
  await page.getByRole('combobox',{name:'Active trader',exact:true}).selectOption('Bob');
  await page.getByRole('button',{name:'Short',exact:true}).click();
  await page.getByRole('button',{name:'Place practice short',exact:true}).click();
  await page.getByRole('button',{name:/Price \+5%/}).click();
  await page.getByRole('button',{name:'Settle both sides',exact:true}).click();
  assert.match(await page.locator('.lz-footer').innerText(),/992,064 sats/);
  await page.getByRole('combobox',{name:'Active trader',exact:true}).selectOption('Alice');
  assert.match(await page.locator('.lz-footer').innerText(),/1,007,936 sats/);
  assert.equal((await journal(page)).commands.length,4);check('Ordinary solo browser matches and settles exact conserved practice balances');
  await page.reload({waitUntil:'networkidle'});assert.match(await page.getByRole('status').innerText(),/Restored 4 practice commands/);
  await openJournal(page);const saved=await download(page,'Export journal','journal.json');
  const other=await pageFor();await other.goto(origin,{waitUntil:'networkidle'});await openJournal(other);
  await other.locator('input[type=file]').setInputFiles({name:'journal.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...saved,result:{balances:{Alice:999999999}}}))});
  await other.getByRole('status').filter({hasText:'Replayed 4 commands'}).waitFor();assert.match(await other.locator('.lz-footer').innerText(),/1,007,936 sats/);
  const before=await journal(other);
  await other.locator('input[type=file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":2,"commands":[]}')});
  await other.getByRole('alert').waitFor();assert.deepEqual(await journal(other),before);
  check('Export/replay recalculates balances and invalid import preserves the current journal');
  const restarted=await download(other,'Export & restart','restart-journal.json');assert.deepEqual(restarted.commands,saved.commands);
  assert.match(await other.locator('.lz-footer').innerText(),/1,000,000 sats/);assert.equal((await journal(other)).commands.length,0);
  check('Export and restart saves the previous journal before resetting practice');
  await other.getByRole('button',{name:'Trade',exact:true}).click();
  await other.getByRole('button',{name:'Place practice long',exact:true}).focus();await other.keyboard.press('Enter');
  await other.getByRole('group',{name:'Account views'}).getByRole('button',{name:'Orders',exact:true}).click();
  await other.getByRole('button',{name:'Cancel',exact:true}).focus();await other.keyboard.press('Enter');
  assert.equal((await journal(other)).commands.length,2);check('Keyboard order submission and cancellation release reserved margin');
  for(const width of [1440,390,320]) {await page.setViewportSize({width,height:950});const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.equal(geometry.scrollWidth,width);report.layouts.push(geometry);await page.screenshot({path:join(output,`solo-${width}.png`),fullPage:true});}
  check('Solo layouts fit desktop and 390/320-pixel viewports');
  const corrupt=await pageFor();await corrupt.addInitScript(k=>sessionStorage.setItem(k,'{bad journal'),key);await corrupt.goto(origin,{waitUntil:'networkidle'});
  assert.match(await corrupt.getByRole('alert').innerText(),/could not be restored/);assert.match(await corrupt.locator('.lz-footer').innerText(),/1,000,000 sats/);
  await openJournal(corrupt);await download(corrupt,'Export & restart','corrupt-restart.json');assert.equal((await journal(corrupt)).commands.length,0);
  check('Corrupt stored journal offers an explicit fresh-session recovery');
  const blocked=await pageFor();await blocked.goto(origin,{waitUntil:'networkidle'});
  await blocked.evaluate(()=>{window.originalStorageWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Storage test quota','QuotaExceededError');};});
  await blocked.getByRole('button',{name:'Place practice long',exact:true}).click();
  report.storageFailureMessage=await blocked.getByRole('alert').innerText();
  assert.match(report.storageFailureMessage,/Browser storage is unavailable/);
  assert.match(await blocked.locator('.lz-footer').innerText(),/1,000,000 sats/);assert.equal(await journal(blocked),null);
  await blocked.evaluate(()=>Storage.prototype.setItem=window.originalStorageWrite);
  await blocked.getByRole('button',{name:'Place practice long',exact:true}).click();assert.equal((await journal(blocked)).commands.length,1);
  check('Failed storage write preserves balances and a retry works after storage recovery');
  for(const finished of [page,other,corrupt,blocked])await finished.context().close();
  await browser.close();
  browser=await chromium.launch({headless:true,args:['--enable-features=WebMCPTesting'],...(process.env.LAZER_BROWSER_CHANNEL?{channel:process.env.LAZER_BROWSER_CHANNEL}:{})});
  const legacy=await pageFor();const exchange=legacy.waitForResponse(r=>new URL(r.url()).pathname==='/api/exchange'&&r.request().method()==='GET');
  await legacy.goto(origin+'/legacy',{waitUntil:'domcontentloaded'});const response=await exchange;assert.equal(response.status(),200);const expected=await response.json();assert.equal(expected.authenticated,false);
  await legacy.waitForFunction(async()=>typeof document.modelContext?.getTools==='function'&&(await document.modelContext.getTools()).some(t=>t.name==='read_lazer'));
  const beforeNativeErrors=report.consoleErrors.length;
  const native=await legacy.evaluate(async()=>{const tools=await document.modelContext.getTools();const tool=tools.find(t=>t.name==='read_lazer');const result=await document.modelContext.executeTool(tool,'{}');let rejected=false;try{await document.modelContext.executeTool(tool,'{"unexpected":true}');}catch{rejected=true;}return {result,rejected,count:tools.filter(t=>t.name==='read_lazer').length};});
  let payload=typeof native.result==='string'?JSON.parse(native.result):native.result;if(payload?.content)payload=JSON.parse(payload.content.find(t=>t.type==='text').text);
  assert.equal(native.count,1);assert.equal(native.rejected,true);assert.equal(payload.network,'testnet4');assert.equal(payload.usdIsSimulated,true);assert.deepEqual(payload.state,expected);
  const nativeErrors=report.consoleErrors.slice(beforeNativeErrors);
  assert.ok(nativeErrors.every(m=>m==='WebMCP tool execution failed: Uncaught Error: Expected an empty object.'));
  report.expectedArgumentRejectionConsole=nativeErrors;
  check('Actual native WebMCP registration/invocation matches anonymous exchange GET and rejects extra arguments');
  await legacy.goto(origin+'/market');await legacy.getByRole('heading',{name:'Trade a test scenario together.',exact:true}).waitFor();
  assert.ok(!(await legacy.evaluate(async()=>(await document.modelContext.getTools()).map(t=>t.name))).includes('read_lazer'));
  check('Native legacy tool disappears after navigation');
  await legacy.getByRole('link',{name:'Sign in with ChatGPT',exact:true}).click();
  await legacy.getByRole('button',{name:'Open my room',exact:true}).waitFor();
  const create=legacy.waitForResponse(r=>new URL(r.url()).pathname==='/api/derivatives'&&r.request().method()==='POST');await legacy.getByRole('button',{name:'Open my room',exact:true}).click();
  const created=await create;assert.equal(created.status(),200);const room=(await created.json()).room;
  await legacy.reload();await legacy.getByRole('button',{name:'Export snapshot',exact:true}).waitFor();
  assert.equal((await legacy.evaluate(async()=>fetch('/api/derivatives').then(r=>r.json()))).room.id,room.id);
  await browser.close();await stop();await start();
  browser=await chromium.launch({headless:true,args:['--enable-features=WebMCPTesting'],...(process.env.LAZER_BROWSER_CHANNEL?{channel:process.env.LAZER_BROWSER_CHANNEL}:{})});
  const resumed=await pageFor();await resumed.goto(origin+'/market');await resumed.getByRole('link',{name:'Sign in with ChatGPT',exact:true}).click();
  await resumed.getByRole('button',{name:'Export snapshot',exact:true}).waitFor();
  assert.equal((await resumed.evaluate(async()=>fetch('/api/derivatives').then(r=>r.json()))).room.id,room.id);
  check('Documented portable development sign-in creates a persistent room that survives framework restart');
  await browser.close();await stop();await cp(stateDirectory,join(stateRoot,'database-backup'),{recursive:true,errorOnExist:true});
  stateDirectory=join(stateRoot,'restored-database');await cp(join(stateRoot,'database-backup'),stateDirectory,{recursive:true,errorOnExist:true});
  await start();browser=await chromium.launch({headless:true,args:['--enable-features=WebMCPTesting'],...(process.env.LAZER_BROWSER_CHANNEL?{channel:process.env.LAZER_BROWSER_CHANNEL}:{})});
  const restored=await pageFor();await restored.goto(origin+'/market');await restored.getByRole('link',{name:'Sign in with ChatGPT',exact:true}).click();
  await restored.getByRole('button',{name:'Export snapshot',exact:true}).waitFor();
  assert.deepEqual((await restored.evaluate(async()=>fetch('/api/derivatives').then(r=>r.json()))).room,room);
  check('Stopped local database backup restores exact room state in a separate directory');
  assert.deepEqual(report.pageErrors,[]);
  assert.deepEqual(report.failedRequests,[]);
  assert.ok(report.consoleErrors.every(m=>/status of 401/.test(m)||report.expectedArgumentRejectionConsole.includes(m)),JSON.stringify(report.consoleErrors));
  check('No browser runtime failures or unexpected transport/console errors');report.passed=true;
} catch(error) {report.passed=false;report.error={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;console.error(error.message);}
finally {await browser?.close();await stop();report.finishedAt=new Date().toISOString();await writeFile(join(output,'server.log'),log.join(''));await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await writeFile(join(directory,'latest-run.txt'),output+'\n');console.log('Evidence: '+output);}
