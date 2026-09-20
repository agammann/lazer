import { test } from 'node:test';
import assert from 'node:assert/strict';
import bolt11 from 'bolt11';
import { ArkAddress } from '@arkade-os/sdk';
import liquid from 'liquidjs-lib';
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
test('Arkade SDK validates address encoding with explicit test-family limitation', () => {
  const encoded = new ArkAddress(Buffer.from('11'.repeat(32), 'hex'), Buffer.from('22'.repeat(32), 'hex'), 'tark').encode();
  const result = inspectFunding('ark', encoded, 'test'); assert.equal(result.serverPublicKey, '11'.repeat(32));
  assert.equal(result.ownershipVerified, false); assert.throws(() => inspectFunding('ark', encoded, 'mainnet'), /network/);
  assert.throws(() => inspectFunding('ark', encoded.slice(0, -1), 'test'));
});
test('Liquid library distinguishes mainnet, testnet and regtest addresses', () => {
  for (const [environment, network] of [['mainnet', liquid.networks.liquid], ['test', liquid.networks.testnet], ['regtest', liquid.networks.regtest]]) {
    const encoded = liquid.payments.p2wpkh({ hash: Buffer.alloc(20, 1), network }).address;
    const result = inspectFunding('liquid', encoded, environment); assert.equal(result.confidential, false);
    assert.equal(result.script, '0014' + '01'.repeat(20));
    assert.throws(() => inspectFunding('liquid', encoded, environment === 'mainnet' ? 'test' : 'mainnet'));
  }
});
test('unsupported inputs never enable transfers', () => {
  assert.throws(() => inspectFunding('other', 'anything', 'test'));
  assert.throws(() => inspectFunding('ark', 'a'.repeat(5001), 'test'));
  assert.throws(() => inspectFunding('ark', 'two words', 'test'));
  assert.throws(() => inspectFunding('ark', 'anything', 'unknown'));
});
