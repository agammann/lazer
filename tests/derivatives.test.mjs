import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshPractice, applyPractice, account, margin, longPnl, assertPractice, liquidationPrice } from '../work/derivatives.mjs';
const order = (trader, side, price = 60_000, quantity = 100, leverage = 2) => ({ action: 'place', trader, side, price, quantity, leverage });
function pair(leverage = 2) { return applyPractice(applyPractice(freshPractice(), order('Alice', 'long', 60_000, 100, leverage)), order('Bob', 'short', 60_000, 100, leverage)); }

test('inverse P&L rounds once and matches independently calculated examples', () => {
  assert.equal(margin(100, 60_000, 2), 83_334);
  assert.equal(longPnl(100, 60_000, 63_000), 7_936);
  assert.equal(longPnl(100, 60_000, 57_000), -8_771);
  assert.equal(longPnl(100, 60_000, 60_000), 0);
});
test('limit reservations, paired margin and realized settlement conserve sats', () => {
  let s = applyPractice(freshPractice(), order('Alice', 'long'));
  assert.equal(account(s, 'Alice').available, 916_666); assert.equal(s.positions.length, 0);
  s = applyPractice(s, order('Bob', 'short')); assert.equal(s.orders.length, 0);
  assert.equal(account(s, 'Alice').positionMargin, 83_334);
  s = applyPractice(s, { action: 'mark', price: 63_000 });
  assert.equal(account(s, 'Alice').unrealized, 7936); assert.equal(account(s, 'Bob').unrealized, -7936);
  s = applyPractice(s, { action: 'close', trader: 'Alice', positionId: s.positions[0].id });
  assert.deepEqual(s.balances, { Alice: 1_007_936, Bob: 992_064 });
  assert.equal(account(s, 'Alice').available, 1_007_936); assertPractice(s);
});
test('same-trader crossing orders never self-match', () => {
  const s = applyPractice(applyPractice(freshPractice(), order('Alice', 'long')), order('Alice', 'short'));
  assert.equal(s.positions.length, 0); assert.equal(s.orders.length, 2);
});
test('price priority and partial fills execute at the maker price', () => {
  let s = applyPractice(freshPractice(), order('Bob', 'short', 61_000, 100));
  s = applyPractice(s, order('Bob', 'short', 60_000, 50));
  s = applyPractice(s, order('Alice', 'long', 62_000, 75));
  assert.deepEqual(s.positions.map(p => [p.entry, p.quantity]), [[60_000, 50], [61_000, 25]]);
  assert.equal(s.orders[0].remaining, 75); assertPractice(s);
});
test('orders at the same price fill oldest first', () => {
  let s = applyPractice(freshPractice(), order('Bob', 'short', 60_000, 50, 2));
  const first = s.orders[0].id;
  s = applyPractice(s, order('Bob', 'short', 60_000, 100, 3));
  s = applyPractice(s, order('Alice', 'long', 60_000, 75));
  assert.equal(s.positions[0].shortMargin, margin(50, 60_000, 2));
  assert.ok(!s.orders.some(o => o.id === first)); assert.equal(s.orders[0].remaining, 75);
});
test('cancellation releases margin and rejects a different trader', () => {
  const s = applyPractice(freshPractice(), order('Alice', 'long'));
  assert.throws(() => applyPractice(s, { action: 'cancel', trader: 'Bob', orderId: s.orders[0].id }));
  const next = applyPractice(s, { action: 'cancel', trader: 'Alice', orderId: s.orders[0].id });
  assert.equal(account(next, 'Alice').available, 1_000_000);
});
test('invalid inputs and insufficient collateral leave original state unchanged', () => {
  const s = freshPractice(), before = JSON.stringify(s);
  for (const bad of [order('Alice', 'long', 60_000, 10_000), order('Eve', 'long'), order('Alice', 'up'), order('Alice', 'long', NaN), order('Alice', 'long', 60_000, .5), order('Alice', 'long', 60_000, 100, 6)]) assert.throws(() => applyPractice(s, bad));
  assert.equal(JSON.stringify(s), before);
});
test('a buy that needs more sats at a lower maker price fails atomically', () => {
  const s = applyPractice(freshPractice(), order('Bob', 'short', 50_000, 1500, 5));
  const before = JSON.stringify(s);
  assert.throws(() => applyPractice(s, order('Alice', 'long', 100_000, 1500, 2)), /insufficient/);
  assert.equal(JSON.stringify(s), before);
});
test('liquidation is bilateral; a gap cannot spend unreserved collateral', () => {
  let s = pair(5); s = applyPractice(s, { action: 'mark', price: 1000 });
  assert.equal(s.positions[0].status, 'closed'); assert.equal(s.positions[0].reason, 'liquidation');
  assert.deepEqual(s.balances, { Alice: 966_666, Bob: 1_033_334 }); assertPractice(s);
  assert.throws(() => applyPractice(s, { action: 'close', trader: 'Alice', positionId: s.positions[0].id }));
});
test('short liquidation and liquidation estimate work in the opposite direction', () => {
  let s = pair(5); const liq = liquidationPrice(s.positions[0], 'short'); assert.ok(liq > 60_000 && liq < 80_000);
  s = applyPractice(s, { action: 'mark', price: 1_000_000 });
  assert.deepEqual(s.balances, { Alice: 1_033_334, Bob: 966_666 }); assertPractice(s);
});
test('scenario replay is deterministic and never calls a financial provider', () => {
  const commands = [order('Alice', 'long'), order('Bob', 'short'), { action: 'mark', price: 63_000 }];
  const run = () => commands.reduce(applyPractice, freshPractice());
  assert.deepEqual(run(), run());
  assert.throws(() => applyPractice(freshPractice(), { action: 'deposit', sats: 100 }));
  assert.throws(() => applyPractice({ ...freshPractice(), mode: 'mainnet' }, commands[0]));
});
test('many deterministic price paths conserve equity and respect collateral bounds', () => {
  for (let leverage = 1; leverage <= 5; leverage++) for (let i = 1; i <= 50; i++) {
    const price = 1000 + i * 19000;
    let s = applyPractice(pair(leverage), { action: 'mark', price });
    if (s.positions[0].status === 'open') s = applyPractice(s, { action: 'close', trader: 'Bob', positionId: s.positions[0].id });
    assertPractice(s); assert.equal(s.balances.Alice + s.balances.Bob, 2_000_000);
  }
});
