# Architecture and limits

[Back to Lazer](../README.md)

## Runtime and trust boundaries

The frontend uses React and vinext. Cloudflare Workers executes the API, and D1 persists the ledger. Hosted identity comes from the Sites dispatcher. The portable development server supplies a local mock identity on loopback only.

The public API view exposes the shared book and anonymized trade aliases. Account balances, deposits, withdrawals, and account events are scoped to the authenticated owner's Alice and Bob subaccounts. Private keys and signed transaction internals are not returned in that view.

Chain data and broadcasting use the fixed mempool.space Testnet 4 API. The application trusts that provider's answers. The separate Bitcoin Core verification script provides an independent receipt check; Core is not the hosted app's chain backend. Public market candles come from Coinbase and are reference data only.

## Matching and ledger

[The engine](../lib/engine.ts) stores money as integer satoshis and integer microdollars. Prices use whole dUSD ticks. Orders use multiples of 1,000 sats, up to 1,000,000 sats per order.

Matching uses price priority, then time priority, at the resting order's price. Resting buys reserve dUSD; resting sells reserve deposited Bitcoin. Trades update both balances atomically. Cancellation releases the unfilled reservation. Alice and Bob may trade with one another; an account cannot trade against itself.

[Persistence](../lib/store.ts) serializes a shared JSON ledger with D1 compare and swap revisions. Concurrent writes retry against the current revision. Idempotency receipts last 24 hours, and new API requests expire after five minutes. Withdrawal identifiers remain unique even after their short term command receipts expire. Signed in identities are limited to 30 new requests per minute.

## Bitcoin custody

[Wallet code](../lib/bitcoin.ts) derives Testnet keys from a server secret. The secret stays outside clients and source control. This is server custody of test coins, not a connection to each user's private Bitcoin Core keys.

Deposits require six confirmations and matching outputs. Duplicate outpoints cannot be credited again. Mainnet address encodings are rejected. Testnet 3 and Testnet 4 addresses share an encoding, so users must select the right chain in Core.

Withdrawals are signed as native SegWit transactions and persisted with their debit and input reservations before broadcast. Uncertain broadcast results never automatically refund or replace a transaction. An acknowledged broadcast stays sent while the explorer indexes it. Treasury change needs six confirmations before reuse.

Detected confirmation loss can freeze trading. Checks run in response to user actions, refreshes, or visible page polling. This is not continuous, comprehensive reorganization monitoring.

## Capacity

| Resource | Current bound |
| :--- | ---: |
| Subaccounts | 200 |
| Open orders | 500 |
| Deposits | 2,000 |
| Withdrawals | 2,000 |
| Eligible unspent wallet inputs | 100 |
| Serialized ledger | 1.8 MB |
| Recent trade history | 2,000 |
| Recent events | 1,000 |

Recent completed orders and account views are bounded, while every open order remains visible and cancellable regardless of age. Capacity limits can prevent new writes, including withdrawals. Operators must monitor headroom and migrate before reaching the bounds. This architecture is not suitable for an unlimited financial service.

The historical `invoice_addresses` table remains in the applied schema and migration snapshots. It is not the current trading custody model. Applied migrations are preserved to avoid rewriting deployed database history.

For backup requirements and deployment boundaries, see [operations](DEPLOYMENT.md).
