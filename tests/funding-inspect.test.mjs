import { test } from 'node:test';
import assert from 'node:assert/strict';
import bolt11 from 'bolt11';
import { inspectFunding } from '../work/funding-inspect.mjs';
const key = '01'.repeat(32), now = 1_800_000_000;
function invoice(prefix = 'tb', amount = 1000) {
  return bolt11.sign(bolt11.encode({ network: { bech32: prefix, pubKeyHash: 111, scriptHash: 196, validWitnessVersions: [0, 1] }, satoshis: amount, timestamp: now, tags: [{ tagName: 'payment_hash', data: 'aa'.repeat(32) }, { tagName: 'description', data: 'Lazer fixture only' }, { tagName: 'expire_time', data: 3600 }] }), key).paymentRequest;
}
test('Lightning inspection decodes amount and rejects wrong network or expiry', () => {
  const encoded = invoice(), result = inspectFunding('lightning', encoded, 'test', now);
  assert.equal(result.amountMsats, '1000000'); assert.equal(result.transfersEnabled, false); assert.equal(result.collateralCredited, false);
  assert.throws(() => inspectFunding('lightning', encoded, 'mainnet', now), /network/);
  assert.throws(() => inspectFunding('lightning', encoded, 'test', now + 3600), /expired/);
  assert.throws(() => inspectFunding('lightning', invoice('tb', null), 'test', now), /Amountless/);
});
test('unsupported inputs never enable transfers', () => {
  assert.throws(() => inspectFunding('other', 'anything', 'test'));
  assert.throws(() => inspectFunding('lightning', 'a'.repeat(5001), 'test'));
  assert.throws(() => inspectFunding('lightning', 'two words', 'test'));
  assert.throws(() => inspectFunding('lightning', 'anything', 'unknown'));
});
