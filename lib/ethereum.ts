import { createHash } from 'node:crypto';
import { validateContract, type EscrowContract } from './escrow';

export type EthNetwork = 'sepolia' | 'local';
export type EthPaymentTerms = {
  network: EthNetwork;
  buyerAddress: string;
  sellerAddress: string;
  wei: string;
  notBefore: number;
  expiresAt: number;
};
export type EscrowTrade = {
  version: 1;
  bitcoin: EscrowContract;
  payment: EthPaymentTerms;
  chainId: number;
  paymentData: string;
};
export type Rpc = (method: string, params?: unknown[]) => Promise<any>;
const CHAINS = { sepolia: 11155111, local: 31337 } as const;
const hashPattern = /^0x[a-f0-9]{64}$/i;
function ethAddress(input: string) {
  if (typeof input !== 'string' || !/^0x[a-f0-9]{40}$/i.test(input) || /^0x0{40}$/i.test(input)) throw Error('Enter a nonzero Ethereum address.');
  // Accept lowercase addresses only until a checksummed address UI is integrated.
  if (input !== input.toLowerCase()) throw Error('Use a verified lowercase Ethereum address.');
  return input;
}
function quantity(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^0x(0|[1-9a-f][a-f0-9]{0,63})$/i.test(value)) throw Error('Invalid Ethereum ' + label);
  return BigInt(value);
}

export function createEscrowTrade(bitcoin: EscrowContract, input: EthPaymentTerms): EscrowTrade {
  const c = validateContract(bitcoin);
  if (input.network !== 'sepolia' && input.network !== 'local') throw Error('ETH payments support Sepolia or a local test chain only. Mainnet is not enabled.');
  if (input.network === 'local' && c.network !== 'regtest') throw Error('Local Ethereum requires Bitcoin regtest.');
  const buyerAddress = ethAddress(input.buyerAddress), sellerAddress = ethAddress(input.sellerAddress);
  if (buyerAddress === sellerAddress) throw Error('Buyer and seller Ethereum addresses must differ.');
  if (typeof input.wei !== 'string' || !/^[1-9][0-9]{0,20}$/.test(input.wei) || BigInt(input.wei) > BigInt('100000000000000000000')) throw Error('Enter the exact ETH amount as a positive integer in wei, up to 100 test ETH.');
  if (!Number.isSafeInteger(input.notBefore) || !Number.isSafeInteger(input.expiresAt) || input.notBefore < 1 ||
      input.expiresAt <= input.notBefore || input.expiresAt - input.notBefore > 604800) throw Error('Payment window must be positive and no longer than seven days.');
  const payment: EthPaymentTerms = { network: input.network, buyerAddress, sellerAddress, wei: input.wei, notBefore: input.notBefore, expiresAt: input.expiresAt };
  const chainId = CHAINS[payment.network];
  const paymentData = '0x' + createHash('sha256').update('lazer:btc-eth:escrow:v1:' + JSON.stringify({ bitcoinTermsHash: c.termsHash, chainId, payment })).digest('hex');
  return { version: 1, bitcoin: c, payment, chainId, paymentData };
}
export function validateTrade(trade: EscrowTrade) {
  const expected = createEscrowTrade(trade.bitcoin, trade.payment);
  if (trade.version !== expected.version || trade.chainId !== expected.chainId || trade.paymentData !== expected.paymentData) throw Error('Trade payment terms were altered.');
  return expected;
}
export function paymentRequest(trade: EscrowTrade) {
  const t = validateTrade(trade);
  return { chainId: '0x' + t.chainId.toString(16), from: t.payment.buyerAddress, to: t.payment.sellerAddress, value: '0x' + BigInt(t.payment.wei).toString(16), data: t.paymentData };
}

// This is a read only verifier. It neither signs ETH nor releases Bitcoin.
export async function verifyEthPayment(trade: EscrowTrade, txid: string, rpc: Rpc) {
  const t = validateTrade(trade);
  if (typeof txid !== 'string' || !hashPattern.test(txid)) throw Error('Enter a 32 byte Ethereum transaction hash.');
  txid = txid.toLowerCase();
  if (quantity(await rpc('eth_chainId'), 'chain ID') !== BigInt(t.chainId)) throw Error('Ethereum node is on the wrong network.');
  const [tx, receipt] = await Promise.all([rpc('eth_getTransactionByHash', [txid]), rpc('eth_getTransactionReceipt', [txid])]);
  if (!tx || !receipt || !tx.blockHash || tx.blockNumber === null) throw Error('ETH payment is missing or pending.');
  if (tx.hash?.toLowerCase() !== txid || receipt.transactionHash?.toLowerCase() !== txid || !hashPattern.test(tx.blockHash) ||
      tx.blockHash.toLowerCase() !== receipt.blockHash?.toLowerCase() || tx.blockNumber !== receipt.blockNumber) throw Error('Ethereum transaction and receipt disagree.');
  if (quantity(receipt.status, 'receipt status') !== BigInt(1)) throw Error('ETH payment reverted.');
  if (tx.from?.toLowerCase() !== t.payment.buyerAddress || tx.to?.toLowerCase() !== t.payment.sellerAddress ||
      receipt.from?.toLowerCase() !== t.payment.buyerAddress || receipt.to?.toLowerCase() !== t.payment.sellerAddress) throw Error('ETH payer or recipient does not match this trade.');
  if (quantity(tx.value, 'value') !== BigInt(t.payment.wei)) throw Error('ETH payment amount does not match this trade.');
  if (tx.input?.toLowerCase() !== t.paymentData) throw Error('ETH payment is not bound to this trade.');
  if (tx.chainId !== undefined && quantity(tx.chainId, 'transaction chain ID') !== BigInt(t.chainId)) throw Error('Transaction chain ID does not match.');
  const blockNumber = quantity(receipt.blockNumber, 'block number');
  const [canonical, finalized, code] = await Promise.all([
    rpc('eth_getBlockByNumber', [receipt.blockNumber, false]),
    rpc('eth_getBlockByNumber', ['finalized', false]),
    rpc('eth_getCode', [t.payment.sellerAddress, receipt.blockNumber]),
  ]);
  if (!canonical || !finalized || !hashPattern.test(canonical.hash) || !hashPattern.test(finalized.hash) ||
      canonical.hash.toLowerCase() !== receipt.blockHash.toLowerCase() || quantity(canonical.number, 'canonical block') !== blockNumber) throw Error('Payment block is not canonical or finality is unavailable.');
  if (quantity(finalized.number, 'finalized block') < blockNumber) throw Error('ETH payment is not finalized yet.');
  if (quantity(finalized.number, 'finalized block') === blockNumber && finalized.hash.toLowerCase() !== canonical.hash.toLowerCase()) throw Error('Finalized block disagrees with the payment block.');
  if (code !== '0x') throw Error('This pilot requires a plain receiving account; contract and delegated accounts are not supported.');
  const timestamp = quantity(canonical.timestamp, 'block timestamp');
  if (timestamp < BigInt(t.payment.notBefore) || timestamp > BigInt(t.payment.expiresAt)) throw Error('ETH payment is outside the agreed payment window.');
  return {
    network: t.payment.network, chainId: t.chainId, txid,
    buyerAddress: t.payment.buyerAddress, sellerAddress: t.payment.sellerAddress,
    wei: t.payment.wei, paymentData: t.paymentData,
    blockNumber: blockNumber.toString(), blockHash: receipt.blockHash.toLowerCase(),
    finalizedBlock: quantity(finalized.number, 'finalized block').toString(),
    finalized: true, checkedAt: new Date().toISOString(),
  };
}

export function ethereumRpc(endpoint: string, fetcher: typeof fetch = fetch): Rpc {
  const url = new URL(endpoint);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) throw Error('Use HTTPS for Ethereum RPC, or HTTP on loopback for local testing.');
  const allowed = new Set(['eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getBlockByNumber', 'eth_getCode']);
  let sequence = 0;
  return async (method, params = []) => {
    if (!allowed.has(method)) throw Error('Only payment verification RPC methods are allowed.');
    const id = ++sequence;
    const response = await fetcher(url.toString(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.timeout(12000), redirect: 'error',
    });
    if (!response.ok) throw Error('Ethereum RPC is unavailable.');
    const reader = response.body?.getReader();
    if (!reader) throw Error('Empty Ethereum RPC response.');
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.length;
      if (size > 1_000_000) { await reader.cancel(); throw Error('Ethereum RPC response is too large.'); }
      chunks.push(part.value);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (payload.jsonrpc !== '2.0' || payload.id !== id || payload.error || !Object.hasOwn(payload, 'result')) throw Error('Ethereum RPC returned an invalid response.');
    return payload.result;
  };
}
