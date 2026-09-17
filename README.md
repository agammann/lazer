# Lazer

A cyberpunk Bitcoin Testnet 4 trading terminal with funded accounts, a shared limit order book, simulated USD, and Bitcoin Core deposits and withdrawals.

[Open Lazer](https://lazer.alx21.chatgpt.site) · [Source](https://github.com/agammann/lazer) · [Verification workflow](https://github.com/agammann/lazer/actions/workflows/verify.yml)

Lazer is a Testnet pilot. It does not accept mainnet Bitcoin or real USD. Test coins and dUSD have no redeemable monetary value here.

## Using Lazer

1. Sign in with ChatGPT and open your Alice and Bob subaccounts. Each starts with 100,000 simulated dUSD and zero tBTC.
2. Run Bitcoin Core with `-testnet4`. Let the node synchronize. Obtain Testnet 4 coins from a faucet such as [coinfaucet.eu](https://coinfaucet.eu/en/btc-testnet4/).
3. Open Alice's Deposit / Withdraw panel. Send test Bitcoin from Core to the displayed deposit address. Paste the transaction ID and check after six confirmations.
4. Place Alice's sell order. Select Bob, choose Buy, and use the same quantity and price. The shared book uses price and time priority; another user may fill your order first.
5. Withdraw Bob's acquired tBTC to his external Bitcoin Core receiving address. Review the amount and network fee before confirming.
6. Check Transfers for transaction links and confirmation status. Pending transfers are checked in rotation every minute while the page is visible, or immediately with Refresh. A prepared withdrawal retries the same signed transaction without charging again.

Alice and Bob are separate subaccounts under your authenticated identity. Other signed in visitors have their own accounts. Resting buys reserve dUSD; resting sells reserve deposited tBTC. Trades settle both balances atomically. Cancellation releases the unfilled reservation. No trading fee is charged; withdrawals pay the Bitcoin miner fee.

## Running locally

Requires Node.js 22.13 or later and npm. Install with `npm ci`.

Create an ignored `.dev.vars` file with `TESTNET_WALLET_SEED=` followed by a cryptographically random 32 byte hex secret. For example, generate one locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep it private and backed up. Use a distinct secret for a separate deployment. Never change an active deployment's secret while it holds deposits.

Run `npm run build`, then apply the schema to the local D1 database:

```sh
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --file drizzle/0000_abnormal_dragon_lord.sql --persist-to .wrangler/state
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --file drizzle/0001_overconfident_doctor_doom.sql --persist-to .wrangler/state
npm run dev
```

Open the preview URL printed by the dev server. The local sign in is a development identity; hosted Sites uses dispatch-owned ChatGPT authentication. Do not expose the development server to the public Internet or trust identity headers outside the Sites dispatcher.

Validation: `npm run typecheck`, `npm test`, `npm run build`. GitHub Actions runs all three. The 25 automated checks cover the matching engine, signed transactions, and complete production API handlers against local D1 SQL. Concurrent deposit, order and withdrawal requests verify atomic balances and idempotent retries. Withdrawal identifiers remain unique even after short term request receipts expire. API tests explicitly replace authentication and chain data in an isolated test bundle; they never call the public network or load a deployment secret. These checks are distinct from public Testnet transactions and the Bitcoin Core integration test below.

## Architecture and operating limits

The server uses Cloudflare D1 compare-and-swap revisions to serialize the shared ledger. Money uses integer satoshis and integer microdollars. Price ticks are whole dUSD and order sizes are multiples of 1,000 sats, up to 1,000,000 sats per order. Idempotency receipts are retained for 24 hours; new requests expire after five minutes. Signed in identities are limited to 30 new requests per minute.

Testnet deposit keys derive from the secret on the server. Private keys never reach clients or source control. Withdrawals are signed as native SegWit transactions, persisted together with their balance debit and input reservations, and then explicitly broadcast. Uncertain broadcast results never trigger refunds or replacement transactions automatically. Change must reach six confirmations before reuse.

Chain data and broadcasting use the fixed mempool.space Testnet 4 API. The application trusts that provider's answers; the bundled Bitcoin Core verification script provides an independent check. Bitcoin addresses cannot distinguish Testnet 3 from Testnet 4 by encoding, so use Core's `-testnet4` flag. Mainnet address encodings are rejected. Public market candles come from Coinbase and are reference data only.

This intentionally bounded pilot supports 200 subaccounts, 500 open orders, 2,000 deposits, 2,000 withdrawals, and 100 unspent wallet inputs. The JSON ledger is limited to 1.8 MB. Recent completed order, trade, and event views are bounded. Every open order remains visible and cancellable regardless of its age. Export activity regularly. This architecture is not intended as an unlimited or high throughput financial service.

The operator must back up both D1 and the wallet secret, monitor capacity and network-provider failures, and reconcile Bitcoin backing. Detected confirmation loss pauses trading; frozen ledgers require operator reconciliation. Verification runs when users act, refresh, or leave the page visible for automatic pending transfer checks. There is no unattended server chain monitor. Never reset the database or rotate the wallet secret to clear an error while deposits remain.

Mainnet operation, fiat rails, regulatory onboarding, disaster recovery certification, and an independent security audit are outside this Testnet release. There is no claim of readiness to custody valuable assets.

Engineering inspiration: Jane Street's [Building an Exchange](https://www.janestreet.com/tech-talks/building-an-exchange/). Lazer is independently developed and is not affiliated with Jane Street.

## Bitcoin Core integration test

Run a separate Bitcoin Core regtest node with RPC on loopback only. Set `BITCOIN_CLI` to your executable path, `CORE_REGTEST_DATADIR` to its data directory, and `CORE_REGTEST_PORT` to its RPC port (default 18845). Run `npm test` to generate the test bundles, then `node scripts/regtest-integration.mjs`.

The integration script refuses any chain other than regtest. It creates uniquely named mining and receiving wallets, mines local blocks, deposits coins, executes Alice's sell and Bob's buy, signs a withdrawal with the same wallet code used by the application, submits it to Bitcoin Core's mempool validation, and verifies Bob's exact receipt after six blocks. It does not use mainnet or Testnet 4 funds. Results are written to ignored `work/regtest-evidence.json`.

For an independent public Testnet receipt check, use `node scripts/core-verify.mjs TXID TESTNET_ADDRESS SATOSHIS WALLET`. Optional environment variables are `BITCOIN_CLI`, `CORE_DATADIR`, and `CORE_RPC_PORT`. This read only script requires a synchronized Testnet 4 node and reports the exact output and confirmations.
