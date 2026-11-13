import test from 'node:test';
import assert from 'node:assert/strict';
import * as ecc from '@bitcoinerlab/secp256k1';

const bytes = value => Buffer.from(value, 'hex');

// Public test vectors only; these keys must never hold funds.
// ECDSA: https://github.com/bitcoinerlab/secp256k1/blob/v2.0.0/test/fixtures/ecdsa.json
test('ECDSA signs the known digest and rejects altered or malformed inputs', () => {
  const key = bytes('0000000000000000000000000000000000000000000000000000000000000001');
  const digest = bytes('06ef2b193b83b3d701f765f1db34672ab84897e1252343cc2197829af3a30456');
  const expected = bytes('33a69cd2065432a30f3d1ce4eb0d59b8ab58c74f27c41a7fdb5696ad4e6108c96f807982866f785d3f6418d24163ddae117b7db4d5fdf0071de069fa54342262');
  const pubkey = ecc.pointFromScalar(key, true);
  assert.deepEqual(Buffer.from(ecc.sign(digest, key)), expected);
  assert.equal(ecc.verify(digest, pubkey, expected), true);
  const changed = Buffer.from(digest); changed[0] ^= 1;
  assert.equal(ecc.verify(changed, pubkey, expected), false);
  assert.throws(() => ecc.sign(digest, Buffer.alloc(32)), /Expected Private/);
  assert.throws(() => ecc.verify(digest, Buffer.alloc(33), expected), /Expected Point/);
});

// BIP-340 test vector 0 (fixed auxiliary randomness):
// https://github.com/bitcoin/bips/blob/master/bip-0340/test-vectors.csv
test('BIP-340 signing and verification match the published vector', () => {
  const key = bytes('0000000000000000000000000000000000000000000000000000000000000003');
  const digest = Buffer.alloc(32);
  const pubkey = bytes('f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9');
  const signature = bytes('e907831f80848d1069a5371b402410364bdf1c5f8307b0084c55f1ce2dca821525f66a4a85ea8b71e482a74f382d2ce5ebeee8fdb2172f477df4900d310536c0');
  assert.deepEqual(Buffer.from(ecc.xOnlyPointFromScalar(key)), pubkey);
  assert.deepEqual(Buffer.from(ecc.signSchnorr(digest, key, Buffer.alloc(32))), signature);
  assert.equal(ecc.verifySchnorr(digest, pubkey, signature), true);
  const changed = Buffer.from(signature); changed[0] ^= 1;
  assert.equal(ecc.verifySchnorr(digest, pubkey, changed), false);
});
