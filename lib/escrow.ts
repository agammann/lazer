import { address, networks, payments, Psbt, Transaction } from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { createHash } from 'node:crypto';

// No seed, private key, RPC credential, or broadcaster belongs in this module.
export type EscrowNetwork = 'regtest' | 'testnet4';
export type SettlementKind = 'release' | 'refund';
export type KeyOrigin = { pubkey: string; masterFingerprint: string; path: string };
export type EscrowTerms = {
  tradeId: string;
  network: EscrowNetwork;
  sellerPubkey: string;
  buyerPubkey: string;
  arbitratorPubkey: string;
  sellerRefundAddress: string;
  buyerReceiveAddress: string;
  sats: number;
  feeSats: number;
  keyOrigins?: KeyOrigin[];
};
export type EscrowContract = EscrowTerms & {
  version: 1;
  termsHash: string;
  address: string;
  outputScript: string;
  witnessScript: string;
  descriptor: string;
  fundingSats: number;
};
export type FundingProof = {
  network: EscrowNetwork;
  txid: string;
  vout: number;
  sats: number;
  script: string;
  confirmations: number;
  unspent: boolean;
  coinbase: boolean;
};

function integer(n: number, min: number, max: number, label: string) {
  if (!Number.isSafeInteger(n) || n < min || n > max) throw Error('Invalid ' + label);
}
function network(name: EscrowNetwork) {
  if (name === 'regtest') return networks.regtest;
  if (name === 'testnet4') return networks.testnet;
  throw Error('Escrow supports regtest and Testnet 4 only. Mainnet is not enabled.');
}
function publicKey(key: string) {
  if (typeof key !== 'string' || !/^(02|03)[a-f0-9]{64}$/i.test(key) || !ecc.isPoint(Buffer.from(key, 'hex'))) {
    throw Error('Each participant must supply a valid compressed public key.');
  }
  return key.toLowerCase();
}
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

export function createEscrowContract(input: EscrowTerms): EscrowContract {
  const net = network(input.network);
  if (typeof input.tradeId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.tradeId)) throw Error('Invalid trade identifier');
  integer(input.sats, 1000, 1_000_000, 'Bitcoin amount');
  integer(input.feeSats, 1, 10_000, 'miner fee');
  const sellerPubkey = publicKey(input.sellerPubkey), buyerPubkey = publicKey(input.buyerPubkey), arbitratorPubkey = publicKey(input.arbitratorPubkey);
  const keys = [sellerPubkey, buyerPubkey, arbitratorPubkey].sort();
  if (new Set(keys).size !== 3) throw Error('Three distinct participant public keys are required.');
  if (input.keyOrigins !== undefined && (!Array.isArray(input.keyOrigins) || input.keyOrigins.length !== 3)) throw Error('Supply all three key origins, or omit them.');
  const keyOrigins = input.keyOrigins?.map(origin => {
    const pubkey = publicKey(origin.pubkey);
    if (!keys.includes(pubkey) || !/^[a-f0-9]{8}$/i.test(origin.masterFingerprint) ||
        typeof origin.path !== 'string' || !/^m(\/[0-9]+['h]?){1,10}$/.test(origin.path) ||
        origin.path.split('/').slice(1).some(part => Number(part.replace(/['h]$/, '')) >= 2147483648)) throw Error('Invalid wallet key origin');
    return { pubkey, masterFingerprint: origin.masterFingerprint.toLowerCase(), path: origin.path.replace(/h/g, "'") };
  }).sort((a, b) => a.pubkey.localeCompare(b.pubkey));
  if (keyOrigins && new Set(keyOrigins.map(o => o.pubkey)).size !== 3) throw Error('Duplicate wallet key origin');
  const destination = (value: string) => {
    if (typeof value !== 'string' || value.length > 100) throw Error('Invalid settlement address');
    return address.fromOutputScript(address.toOutputScript(value, net), net);
  };
  const sellerRefundAddress = destination(input.sellerRefundAddress), buyerReceiveAddress = destination(input.buyerReceiveAddress);
  if (sellerRefundAddress === buyerReceiveAddress) throw Error('Buyer and seller destinations must be distinct.');
  const redeem = payments.p2ms({ m: 2, pubkeys: keys.map(k => Buffer.from(k, 'hex')), network: net });
  const escrow = payments.p2wsh({ redeem, network: net });
  if (!escrow.address || !escrow.output || !redeem.output) throw Error('Unable to construct escrow');
  if ([sellerRefundAddress, buyerReceiveAddress].includes(escrow.address)) throw Error('Settlement cannot pay back into this escrow.');
  const terms: EscrowTerms = {
    tradeId: input.tradeId, network: input.network, sellerPubkey, buyerPubkey, arbitratorPubkey,
    sellerRefundAddress, buyerReceiveAddress, sats: input.sats, feeSats: input.feeSats,
    ...(keyOrigins ? { keyOrigins } : {}),
  };
  return {
    ...terms, version: 1,
    termsHash: createHash('sha256').update(JSON.stringify(terms)).digest('hex'),
    address: escrow.address, outputScript: hex(escrow.output), witnessScript: hex(redeem.output),
    descriptor: 'wsh(sortedmulti(2,' + keys.join(',') + '))',
    fundingSats: input.sats + input.feeSats,
  };
}

export function validateContract(value: EscrowContract) {
  const expected = createEscrowContract(value);
  for (const field of Object.keys(expected) as (keyof EscrowContract)[]) {
    if (JSON.stringify(value[field]) !== JSON.stringify(expected[field])) throw Error('Escrow contract was altered: ' + field);
  }
  return expected;
}

// The caller must obtain this proof from its own trusted Core node, not a browser claim.
export function validateFunding(contract: EscrowContract, proof: FundingProof) {
  const c = validateContract(contract);
  if (proof.network !== c.network) throw Error('Funding node is on the wrong network.');
  if (!/^[a-f0-9]{64}$/.test(proof.txid)) throw Error('Invalid funding transaction ID');
  integer(proof.vout, 0, 0xffffffff, 'funding output index');
  integer(proof.confirmations, 6, Number.MAX_SAFE_INTEGER, 'funding confirmations; six are required');
  if (proof.unspent !== true || proof.coinbase !== false) throw Error('Escrow requires an unspent noncoinbase output.');
  if (proof.sats !== c.fundingSats || proof.script !== c.outputScript) throw Error('Funding output does not match the agreed escrow and amount.');
  return c;
}

function destination(c: EscrowContract, kind: SettlementKind) {
  if (kind !== 'release' && kind !== 'refund') throw Error('Choose release or refund.');
  return kind === 'release' ? c.buyerReceiveAddress : c.sellerRefundAddress;
}

export function createSettlement(contract: EscrowContract, proof: FundingProof, kind: SettlementKind) {
  const c = validateFunding(contract, proof);
  const psbt = new Psbt({ network: network(c.network) });
  psbt.setVersion(2);
  psbt.setLocktime(0);
  psbt.addInput({
    hash: proof.txid, index: proof.vout, sequence: 0xfffffffd,
    witnessUtxo: { script: Buffer.from(c.outputScript, 'hex'), value: BigInt(c.fundingSats) },
    witnessScript: Buffer.from(c.witnessScript, 'hex'),
    sighashType: Transaction.SIGHASH_ALL,
    ...(c.keyOrigins ? { bip32Derivation: c.keyOrigins.map(o => ({ pubkey: Buffer.from(o.pubkey, 'hex'), masterFingerprint: Buffer.from(o.masterFingerprint, 'hex'), path: o.path })) } : {}),
  });
  psbt.addOutput({ address: destination(c, kind), value: BigInt(c.sats) });
  return psbt.toBase64();
}

export function inspectSettlement(contract: EscrowContract, proof: FundingProof, kind: SettlementKind, encoded: string) {
  const c = validateFunding(contract, proof);
  if (typeof encoded !== 'string' || encoded.length > 32_768) throw Error('Invalid PSBT size');
  const expected = Psbt.fromBase64(createSettlement(c, proof, kind), { network: network(c.network) });
  const psbt = Psbt.fromBase64(encoded, { network: network(c.network) });
  if (hex(psbt.data.globalMap.unsignedTx.toBuffer()) !== hex(expected.data.globalMap.unsignedTx.toBuffer())) {
    throw Error('PSBT changes the agreed input, destination, amount, fee, or transaction policy.');
  }
  const input = psbt.data.inputs[0];
  if (input.finalScriptSig || input.finalScriptWitness) throw Error('Supply a PSBT with partial signatures; do not finalize it in the wallet.');
  if (!input.witnessUtxo || input.witnessUtxo.value !== BigInt(c.fundingSats) ||
      hex(input.witnessUtxo.script) !== c.outputScript || !input.witnessScript ||
      hex(input.witnessScript) !== c.witnessScript || input.sighashType !== Transaction.SIGHASH_ALL) {
    throw Error('PSBT changed escrow signing data or sighash policy.');
  }
  const roles = new Map([[c.sellerPubkey, 'seller'], [c.buyerPubkey, 'buyer'], [c.arbitratorPubkey, 'arbitrator']]);
  const signatures = input.partialSig || [];
  const signedBy = signatures.map(sig => {
    const key = hex(sig.pubkey);
    if (!roles.has(key) || sig.signature.at(-1) !== Transaction.SIGHASH_ALL) throw Error('Unexpected signer or signature policy.');
    return roles.get(key)!;
  });
  if (new Set(signedBy).size !== signedBy.length) throw Error('Duplicate signer');
  if (signatures.length && !psbt.validateSignaturesOfInput(0, (key, hash, signature) => ecc.verify(hash, key, signature))) {
    throw Error('Invalid escrow signature');
  }
  return {
    tradeId: c.tradeId, termsHash: c.termsHash, network: c.network, kind,
    destination: destination(c, kind), sats: c.sats, feeSats: c.feeSats,
    fundingTxid: proof.txid, fundingVout: proof.vout,
    signedBy, signaturesRequired: 2, readyToFinalize: signedBy.length >= 2,
  };
}

export function combineSettlement(contract: EscrowContract, proof: FundingProof, kind: SettlementKind, parts: string[]) {
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 3) throw Error('Provide one to three signed PSBTs.');
  for (const part of parts) inspectSettlement(contract, proof, kind, part);
  const combined = Psbt.fromBase64(parts[0], { network: network(contract.network) });
  for (const part of parts.slice(1)) combined.combine(Psbt.fromBase64(part, { network: network(contract.network) }));
  // A two of three witness needs exactly two signatures, even if all three parties supplied one.
  const order = [contract.sellerPubkey, contract.buyerPubkey, contract.arbitratorPubkey].sort();
  combined.data.inputs[0].partialSig = combined.data.inputs[0].partialSig?.sort((a, b) => order.indexOf(hex(a.pubkey)) - order.indexOf(hex(b.pubkey))).slice(0, 2);
  const review = inspectSettlement(contract, proof, kind, combined.toBase64());
  if (!review.readyToFinalize) throw Error('Two distinct valid escrow signatures are required.');
  combined.finalizeAllInputs();
  const tx = combined.extractTransaction();
  return { ...review, txid: tx.getId(), raw: tx.toHex() };
}
