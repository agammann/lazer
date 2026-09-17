import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { Transaction } from 'bitcoinjs-lib';
import { env, identities } from './fixtures/runtime.mjs';
import { GET, POST } from '../work/exchange-route.mjs';
import { wallet, accountId } from '../work/bitcoin.mjs';
import { invariant } from '../work/engine.mjs';

// Real D1 SQL and production request handlers; the chain provider is an explicit fixture.
const seed = '33'.repeat(32), depositId = 'aa'.repeat(32), block = 'bb'.repeat(32);
const origin = 'https://lazer.test';
let mf, db, confirmations, broadcastCount, transactions, spent, hideBroadcast;
const originalFetch = globalThis.fetch;
before(async () => {
  mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test"); } }', d1Databases: ['DB'] });
  db = await mf.getD1Database('DB'); env.DB = db; env.TESTNET_WALLET_SEED = seed;
  globalThis.fetch = async (url, init = {}) => {
    assert.ok(String(url).startsWith('https://mempool.space/testnet4/api/'), 'Tests cannot call external services');
    const path = String(url).slice('https://mempool.space/testnet4/api'.length);
    if (path === '/blocks/tip/height') return Response.json(100 + confirmations - 1);
    if (path === `/block/${block}/status`) return Response.json({ in_best_chain: true });
    if (path === '/v1/fees/recommended') return Response.json({ hourFee: 1 });
    if (path === '/tx' && init.method === 'POST') {
      const tx = Transaction.fromHex(init.body); broadcastCount++;
      const id = tx.getId(); transactions.set(id, { txid: id, status: { confirmed: false }, vin: [{}], vout: tx.outs.map(o => ({ value: Number(o.value), scriptpubkey: Buffer.from(o.script).toString('hex') })) });
      for (const input of tx.ins) spent.add(Buffer.from(input.hash).reverse().toString('hex') + ':' + input.index);
      return new Response(id);
    }
    const outspend = path.match(/^\/tx\/([a-f0-9]{64})\/outspend\/(\d+)$/);
    if (outspend) return Response.json({ spent: spent.has(outspend[1] + ':' + outspend[2]) });
    const id = path.slice(4), tx = hideBroadcast && id !== depositId ? null : transactions.get(id);
    return tx ? Response.json(tx) : new Response('Not found', { status: 404 });
  };
});
after(async () => { globalThis.fetch = originalFetch; await mf?.dispose(); });
beforeEach(async () => {
  await db.exec('DROP TABLE IF EXISTS exchange_sessions; DROP TABLE IF EXISTS request_limits; DROP TABLE IF EXISTS invoice_addresses;');
  for (const file of ['0000_abnormal_dragon_lord.sql', '0001_overconfident_doctor_doom.sql']) {
    for (const sql of readFileSync('drizzle/' + file, 'utf8').split(';').map(x => x.replace('--> statement-breakpoint', '').trim()).filter(Boolean)) await db.prepare(sql).run();
  }
  confirmations = 6; broadcastCount = 0; transactions = new Map(); spent = new Set(); hideBroadcast = false;
  const script = wallet(seed, accountId('owner', 'Alice')).script;
  transactions.set(depositId, { txid: depositId, status: { confirmed: true, block_hash: block, block_height: 100 }, vin: [{}], vout: [{ value: 200000, scriptpubkey: script }] });
});
function request(body, overrides = {}) { return { ...body, issuedAt: Date.now(), requestId: crypto.randomUUID(), ...overrides }; }
async function post(body, owner = 'owner', headers = {}) {
  const response = await identities.run(owner, () => POST(new Request(origin + '/api/exchange', { method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })));
  return { status: response.status, data: await response.json() };
}
async function action(body, owner = 'owner') { const result = await post(request(body), owner); assert.equal(result.status, 200, JSON.stringify(result.data)); return result.data; }
async function read(owner = 'owner') { return identities.run(owner, async () => (await GET()).json()); }
async function funded() { await action({ action: 'open' }); return action({ action: 'deposit', person: 'Alice', txid: depositId }); }
async function rawState() { return JSON.parse((await db.prepare('SELECT state FROM exchange_sessions').first()).state); }

test('API rejects unauthenticated, cross origin, expired and changed replay requests', async () => {
  assert.equal((await post(request({ action: 'open' }), null)).status, 401);
  assert.equal((await post(request({ action: 'open' }), 'owner', { origin: 'https://other.test' })).status, 403);
  assert.equal((await post(request({ action: 'open' }, { issuedAt: Date.now() - 600000 }))).status, 400);
  const body = request({ action: 'open' }); assert.equal((await post(body)).status, 200);
  assert.equal((await post({ ...body, action: 'cancel' })).status, 400);
});

test('API isolates identities and serializes simultaneous deposits without double credit', async () => {
  await action({ action: 'open' }); await action({ action: 'open' }, 'other');
  const results = await Promise.all([1, 2, 3].map(() => post(request({ action: 'deposit', person: 'Alice', txid: depositId }))));
  assert.ok(results.every(x => x.status === 200));
  const own = await read(), other = await read('other'), anonymous = await read(null);
  assert.equal(own.accounts[0].sats, 200000); assert.equal(own.deposits.length, 1);
  assert.equal(other.accounts[0].sats, 0); assert.equal(other.deposits.length, 0);
  assert.equal(anonymous.accounts.length, 0); assert.equal(anonymous.deposits.length, 0);
  invariant(await rawState());
});

test('API waits for six confirmations and blocks overspending during concurrent orders', async () => {
  confirmations = 5; const pending = await funded(); assert.equal(pending.accounts[0].sats, 0);
  const unchanged = await action({ action: 'deposit', person: 'Alice', txid: depositId });
  assert.equal(unchanged.revision, pending.revision, 'Unchanged confirmation checks must not grow the ledger');
  confirmations = 6; await action({ action: 'deposit', person: 'Alice', txid: depositId });
  const results = await Promise.all([1, 2].map(() => post(request({ action: 'place', person: 'Alice', side: 'sell', price: 60000, sats: 150000 }))));
  assert.deepEqual(results.map(x => x.status).sort(), [200, 400]);
  const state = await read(); assert.equal(state.book.length, 1); assert.equal(state.accounts[0].availableSats, 50000);
  invariant(await rawState());
});

test('API deposit, matching, withdrawal replay, broadcast retry and confirmation settle exactly once', async () => {
  await funded(); await action({ action: 'place', person: 'Alice', side: 'sell', price: 60000, sats: 20000 });
  await action({ action: 'place', person: 'Bob', side: 'buy', price: 60000, sats: 20000 });
  const destination = wallet(seed, 'external').address;
  const quote = await action({ action: 'quote', person: 'Bob', address: destination, sats: 15000 });
  const body = request({ action: 'withdraw', person: 'Bob', address: destination, sats: 15000, feeLimit: quote.fee });
  const reservations = await Promise.all([post(body), post(body)]);
  assert.ok(reservations.every(x => x.status === 200));
  let state = await read(); assert.equal(state.withdrawals.length, 1);
  const w = state.withdrawals[0]; assert.equal(state.accounts[1].sats, 5000 - quote.fee);
  assert.equal('raw' in w, false); assert.equal('inputs' in w, false);
  await action({ action: 'broadcast', person: 'Bob', withdrawalId: w.id });
  await action({ action: 'broadcast', person: 'Bob', withdrawalId: w.id });
  assert.equal(broadcastCount, 1);
  const beforeRefresh = await read();
  const pendingRefresh = await action({ action: 'refreshWithdrawal', person: 'Bob', withdrawalId: w.id });
  assert.equal(pendingRefresh.revision, beforeRefresh.revision);
  transactions.get(w.txid).status = { confirmed: true, block_hash: block, block_height: 100 };
  state = await action({ action: 'refreshWithdrawal', person: 'Bob', withdrawalId: w.id });
  assert.equal(state.withdrawals[0].status, 'confirmed'); assert.equal(state.withdrawals[0].confirmations, 6);
  assert.equal(state.accounts[0].sats, 180000); assert.equal(state.accounts[1].sats, 5000 - quote.fee);
  invariant(await rawState());
});

test('API competing withdrawals cannot reserve the same backing input', async () => {
  await funded(); await action({ action: 'place', person: 'Alice', side: 'sell', price: 60000, sats: 100000 });
  await action({ action: 'place', person: 'Bob', side: 'buy', price: 60000, sats: 100000 });
  const destination = wallet(seed, 'external').address;
  const results = await Promise.all(['Alice', 'Bob'].map(person => post(request({ action: 'withdraw', person, address: destination, sats: 10000, feeLimit: 1000 }))));
  assert.deepEqual(results.map(x => x.status).sort(), [200, 400]);
  const state = await read(); assert.equal(state.withdrawals.length, 1);
  assert.equal(state.accounts.reduce((n, a) => n + a.sats, 0), 200000 - 10000 - state.withdrawals[0].fee);
  invariant(await rawState());
});

test('API keeps older open orders visible and cancellable after recent history fills', async () => {
  await funded();
  const placed = await action({ action: 'place', person: 'Alice', side: 'sell', price: 60000, sats: 1000 });
  const original = placed.orders[0], state = await rawState();
  for (let i = 0; i < 110; i++) state.orders.push({ ...original, id: crypto.randomUUID(), seq: ++state.sequence, cancelled: true });
  invariant(state);
  await db.prepare('UPDATE exchange_sessions SET state=?').bind(JSON.stringify(state)).run();
  const visible = await read();
  assert.ok(visible.orders.some(o => o.id === original.id), 'An open reservation must remain reachable from Your orders');
  const cancelled = await action({ action: 'cancel', person: 'Alice', orderId: original.id });
  assert.equal(cancelled.accounts[0].reservedSats, 0);
  assert.equal(cancelled.accounts[0].availableSats, 200000);
});

test('API preserves an acknowledged broadcast when explorer indexing is delayed', async () => {
  await funded();
  const data = await action({ action: 'withdraw', person: 'Alice', address: wallet(seed, 'external').address, sats: 15000, feeLimit: 1000 });
  const w = data.withdrawals[0]; hideBroadcast = true;
  const sent = await action({ action: 'broadcast', person: 'Alice', withdrawalId: w.id });
  assert.equal(sent.withdrawals[0].status, 'broadcast'); assert.equal(broadcastCount, 1);
  const refreshing = await action({ action: 'refreshWithdrawal', person: 'Alice', withdrawalId: w.id });
  assert.equal(refreshing.withdrawals[0].status, 'broadcast');
  assert.equal(refreshing.accounts[0].sats, 200000 - 15000 - w.fee);
  hideBroadcast = false;
  const indexed = await action({ action: 'refreshWithdrawal', person: 'Alice', withdrawalId: w.id });
  assert.equal(indexed.withdrawals[0].status, 'broadcast'); assert.equal(broadcastCount, 1);
  invariant(await rawState());
});
