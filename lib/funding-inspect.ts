import { parsePaymentRequest } from 'invoices';

export type Rail = 'lightning';
export type Environment = 'mainnet' | 'test' | 'regtest';
/** Offline encoding inspection only. Never creates keys, requests a payment, or credits collateral. */
export function inspectFunding(rail: Rail, value: string, environment: Environment, now = Math.floor(Date.now() / 1000)) {
  if (!['mainnet', 'test', 'regtest'].includes(environment)) throw Error('Choose mainnet, test, or regtest for inspection.');
  if (typeof value !== 'string' || !value || value.length > 5000 || /\s/.test(value)) throw Error('Expected an address or invoice without whitespace.');
  const base = { rail, environment, transfersEnabled: false, ownershipVerified: false, collateralCredited: false } as const;
  if (rail === 'lightning') {
    const decoded = parsePaymentRequest({ request: value });
    const expected = environment === 'mainnet' ? 'bitcoin' : environment === 'regtest' ? 'regtest' : 'testnet';
    if (decoded.network !== expected) throw Error('Lightning invoice network does not match the selected environment.');
    if (!decoded.destination || !decoded.id) throw Error('Incomplete BOLT11 invoice.');
    if (!decoded.mtokens || BigInt(decoded.mtokens) <= BigInt(0)) throw Error('Amountless or zero amount invoices are not supported.');
    const expiresAt = Date.parse(decoded.expires_at) / 1000;
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(expiresAt) || expiresAt <= now) throw Error('Lightning invoice expired or has no valid expiry.');
    return { ...base, amountMsats: decoded.mtokens, paymentHash: decoded.id, expiresAt,
      note: environment === 'test' ? 'lntb does not distinguish Signet from other Bitcoin test networks. Verify the receiving node chain separately.' : 'Decoded BOLT11 only. No payment or settlement verification.' };
  }
  throw Error('Only Lightning is supported.');
}
