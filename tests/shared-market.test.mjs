import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Miniflare } from 'miniflare';
import { env, identities } from './fixtures/runtime.mjs';
import { GET, POST } from '../work/derivatives-route.mjs';
// Short temporary path avoids Windows SQLite's path limit in deeply nested checkouts.
const origin = 'https://lazer.test', persist = mkdtempSync(join(tmpdir(), 'lazer-d1-'));
let mf, db;
async function start() {
  mf = new Miniflare({ modules:true, script:'export default { fetch(){return new Response("test")} }', d1Databases:['DB'], d1Persist:persist });
  db = await mf.getD1Database('DB'); env.DB = db;
}
before(start); after(async()=>mf?.dispose());
beforeEach(async()=>{
  await db.exec('DROP TABLE IF EXISTS exchange_sessions; DROP TABLE IF EXISTS request_limits; DROP TABLE IF EXISTS invoice_addresses;');
  for(const f of ['0000_abnormal_dragon_lord.sql','0001_overconfident_doctor_doom.sql']) for(const sql of readFileSync('drizzle/'+f,'utf8').split(';').map(x=>x.replace('--> statement-breakpoint','').trim()).filter(Boolean)) await db.prepare(sql).run();
});
const command=(room,input)=>({roomId:room.id,revision:room.revision,requestId:crypto.randomUUID(),issuedAt:Date.now(),...input});
async function post(input,owner='alice-user',headers={}) {
  const r=await identities.run(owner,()=>POST(new Request(origin+'/api/derivatives',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(input)})));
  return {status:r.status,data:await r.json()};
}
async function ok(input,owner='alice-user') { const r=await post(input,owner); assert.equal(r.status,200,JSON.stringify(r.data)); return r.data.room; }
async function get(id,owner='alice-user') { const r=await identities.run(owner,()=>GET(new Request(origin+'/api/derivatives'+(id?'?room='+id:''))));return {status:r.status,data:await r.json()}; }
async function paired() { const room=await ok({action:'create'}); return ok(command(room,{action:'join'}),'bob-user'); }
const order={action:'place',side:'long',price:60000,quantity:100,leverage:2};

test('shared API enforces sign-in, origin, size, and server-assigned actor',async()=>{
  assert.equal((await post({action:'create'},null)).status,401);
  assert.equal((await get(null,null)).status,401);
  assert.equal((await post({action:'create'},'alice-user',{origin:'https://evil.test'})).status,403);
  assert.equal((await post({action:'create',padding:'x'.repeat(5000)})).status,413);
  const room=await ok({action:'create'});
  assert.equal((await post(command(room,{...order,trader:'Bob'}))).status,400);
  assert.equal((await post(command(room,{action:'deposit',sats:99999}))).status,400);
  assert.equal((await post(command(room,{action:'mark',price:1000}))).status,400);
});
test('creation is idempotent and rooms do not expose identity or unrelated balances',async()=>{
  const rooms=await Promise.all([ok({action:'create'}),ok({action:'create'})]);assert.equal(rooms[0].id,rooms[1].id);
  assert.equal(rooms[0].market.balances.Alice,1000000);
  assert.ok(!JSON.stringify(rooms[0]).includes('alice-user'));
  assert.equal((await get(rooms[0].id,'outsider')).status,403);
  const other=await ok({action:'create'},'outsider');assert.notEqual(other.id,rooms[0].id);
  assert.equal((await get(null)).data.room.id,rooms[0].id);
});
test('only one different identity can claim Bob under concurrent joins',async()=>{
  const room=await ok({action:'create'});
  assert.equal((await post(command(room,{action:'join'}))).status,400);
  const joins=await Promise.all(['bob-user','outsider'].map(owner=>post(command(room,{action:'join'}),owner)));
  assert.deepEqual(joins.map(r=>r.status).sort(),[200,403]);
  const winner=joins[0].status===200?'bob-user':'outsider';
  assert.equal((await get(room.id,winner)).data.room.trader,'Bob');
});
test('two identities match and settle exact conserved P&L on durable state',async()=>{
  let room=await paired();room=await ok(command(room,order));
  room=await ok(command(room,{...order,side:'short'}),'bob-user');
  assert.equal(room.market.positions.length,1);assert.equal(room.account.available,916666);
  assert.equal((await post(command(room,{action:'mark',step:'up'}),'bob-user')).status,403);
  room=await ok(command(room,{action:'mark',step:'up'}));
  room=await ok(command(room,{action:'close',positionId:room.market.positions[0].id}),'bob-user');
  assert.deepEqual(room.market.balances,{Alice:1007936,Bob:992064});
  assert.equal(room.account.positionMargin,0);
  assert.equal((await get(room.id)).data.room.account.balance,1007936);
});
test('simultaneous retry is applied once, changed replay and stale commands reject',async()=>{
  const room=await ok({action:'create'}), input=command(room,order);
  const responses=await Promise.all([post(input),post(input),post(input)]);
  assert.ok(responses.every(r=>r.status===200));
  assert.equal(responses[0].data.room.revision,1);
  assert.equal((await get(room.id)).data.room.market.orders.length,1);
  assert.equal((await post({...input,quantity:200})).status,400);
  assert.equal((await post(command(room,order))).status,409);
  assert.equal((await post(command(responses[0].data.room,{...order,issuedAt:Date.now()-600000}))).status,400);
});
test('cancel ownership is enforced and outsider cannot mutate a known room',async()=>{
  let room=await paired();room=await ok(command(room,order));
  const cancel=command(room,{action:'cancel',orderId:room.market.orders[0].id});
  assert.equal((await post(cancel,'bob-user')).status,400);
  assert.equal((await post(command(room,order),'outsider')).status,403);
  room=await ok(cancel);assert.equal(room.market.orders.length,0);assert.equal(room.account.available,1000000);
});
test('accepted commands and membership survive an actual database runtime restart',async()=>{
  let room=await paired();const input=command(room,order);room=await ok(input);
  await mf.dispose();await start();
  const restored=(await get(room.id)).data.room;
  assert.deepEqual(restored,room);
  assert.equal((await get(room.id,'bob-user')).data.room.trader,'Bob');
  assert.equal((await ok(input)).revision,room.revision);
  assert.equal((await ok({action:'create'})).id,room.id);
});
test('write throttling limits room creation abuse',async()=>{
  for(let i=0;i<30;i++) assert.equal((await post({action:'create'})).status,200);
  assert.equal((await post({action:'create'})).status,429);
  assert.equal((await db.prepare("SELECT count(*) as total FROM exchange_sessions WHERE id LIKE 'derivatives-room-v1:%'").first()).total,1);
});
