import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bech32 } from 'bech32';
import { inspectFunding } from '../work/funding-inspect.mjs';
const now = 1_800_000_000;
// Signed, fixed-key BOLT11 fixtures with an explicit payee key. Tests only decode them.
const invoice = 'lntb10u1p45n5sqpp5424242424242424242424242424242424242424242424242424qdqaf3sh5etjypnxj7r5w4ex2gr0dek8jxqrrssnp4qvdcf32k0vfxgsyet5ldt246q4jaw8scx3sysx0lnstlt6w4m5rc7cqpfmgnae9fuk69qv83rymf4t4ustcres53kxvlpllv6fdxgw6chnskpn7572l4j89fejfxhg3lsj74zrwdd9aaycnr5quzy5x3scgqaefgq0pg4dc';
const amountlessInvoice = 'lntb1p45n5sqpp5424242424242424242424242424242424242424242424242424qdqaf3sh5etjypnxj7r5w4ex2gr0dek8jxqrrssnp4qvdcf32k0vfxgsyet5ldt246q4jaw8scx3sysx0lnstlt6w4m5rc7cqpfknw6grhqrgrnclc92a9uy6tkxs677c2jpe5cxvqc7kk6jqrzfj332gjp7uz0zxryqqsfnt4psnmtejfv8ggwsx6az75jjv84m8xmmrsqe0xzzy';
const regtestInvoice = 'lnbcrt10u1p45n5sqpp5424242424242424242424242424242424242424242424242424qdqaf3sh5etjypnxj7r5w4ex2gr0dek8jxqrrssnp4qvdcf32k0vfxgsyet5ldt246q4jaw8scx3sysx0lnstlt6w4m5rc7cqpfrsrxdwrfcu4tk6mppmg3fvcx3thksn24qufqy642k6ctklazu8549aptfg3yxjcm063kmgh59jk4stex3epve09ymspz4480h36735gq9frv83';
test('Lightning inspection decodes amount and rejects wrong network or expiry', () => {
  const result = inspectFunding('lightning', invoice, 'test', now);
  assert.equal(result.amountMsats, '1000000'); assert.equal(result.transfersEnabled, false); assert.equal(result.collateralCredited, false);
  assert.equal(result.paymentHash, 'aa'.repeat(32));
  assert.equal(result.expiresAt, now + 3600);
  assert.equal(inspectFunding('lightning', regtestInvoice, 'regtest', now).amountMsats, '1000000');
  assert.throws(() => inspectFunding('lightning', invoice, 'mainnet', now), /network/);
  assert.throws(() => inspectFunding('lightning', invoice, 'test', now + 3600), /expired/);
  assert.throws(() => inspectFunding('lightning', amountlessInvoice, 'test', now), /Amountless/);
});
test('Lightning inspection rejects a changed signed invoice with a valid checksum', () => {
  const { prefix, words } = bech32.decode(invoice, 5000);
  words[30] ^= 1;
  const tampered = bech32.encode(prefix, words, 5000);
  assert.throws(() => inspectFunding('lightning', tampered, 'test', now), /InvalidSignature/);
});
test('unsupported inputs never enable transfers', () => {
  assert.throws(() => inspectFunding('other', 'anything', 'test'));
  assert.throws(() => inspectFunding('lightning', 'a'.repeat(5001), 'test'));
  assert.throws(() => inspectFunding('lightning', 'two words', 'test'));
  assert.throws(() => inspectFunding('lightning', 'anything', 'unknown'));
});
