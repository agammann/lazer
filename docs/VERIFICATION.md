# Verification

[Back to Lazer](../README.md)

## Derivatives and Lightning milestone

The suite now includes inverse P&L, collateral conservation, price/time matching, partial fills, liquidation scenarios, and offline Lightning invoice inspection. A separate Bitcoin Core/LND regtest run completed a 100,000 sat payment and 15,000 sat return. See [the evidence](evidence/lightning-regtest.json) and [reproduction instructions](DERIVATIVES.md#lightning-regtest-verification). The Lightning test is separate from browser practice balances.

Shared-market tests now exercise real local D1 SQL and the production route handlers: separate fictional identities, racing joins/orders, duplicate and stale commands, exact P&L, ownership, rate limits, and state recovery after a database-runtime restart. See [shared rooms](SHARED-MARKET.md). Distinct-account production Sign in with ChatGPT, matching and settlement remain unverified.

The historical Testnet and escrow evidence below applies to the legacy tools, not derivatives readiness.

## Automated checks

Run from the repository root:

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser:local
npm run test:browser:shared
```

The current suite contains 72 checks covering matching, reservations, signing, ownership, concurrency, idempotent retries, Bitcoin escrow, native ETH payment verification, inverse derivatives P&L, collateral conservation, liquidation scenarios, Lightning invoice inspection, and shared-room access and restart recovery. API tests execute production handlers against local D1 SQL with explicitly substituted authentication and chain fixtures. They do not contact the public chain, load the deployment seed, or establish mainnet readiness.

The original public Testnet release had 26 checks. Its historical evidence below retains that count. The separate escrow implementation adds 12 Bitcoin protocol tests and 11 Ethereum verification tests. See the [escrow guide](ESCROW.md) for the Bitcoin Core escrow harness and its recorded regtest evidence.

[GitHub Actions](https://github.com/agammann/lazer/actions/workflows/verify.yml) runs these checks on pushes to main and on pull requests.

## October 2, 2026 browser verification

A fresh checkout of commit `1598851d76e88b0476055b692193300d5fc9b1a4` passed all 71 tests, TypeScript validation, and the production build on Windows with Node.js 24.19.0. The published solo terminal was exercised in an isolated Edge browser: Alice and Bob matched 100 contracts at $60,000 and 2× leverage, reserving 83,334 practice sats each. Moving the scenario price to $63,000 and settling produced balances of 1,007,936 sats for Alice and 992,064 for Bob.

Reload restored the four-command journal. Export and import into a fresh browser context reproduced the balances; an invalid journal was rejected without changing the existing balance. Export and restart saved the prior journal before returning to the initial practice balance. The inspected 1440-, 390-, and 320-pixel layouts had no horizontal overflow. The anonymous shared-room page displayed its sign-in gate.

A local D1 regression reproduced an existing Bob being unable to reopen a room at its 1,000-action limit. The fix permits that existing member to reopen without changing the room, while new joins and mutations remain blocked at capacity. The regression failed before the fix; all 72 tests, TypeScript validation, and the production build passed afterward.

The public-browser pass blocked non-read network requests. A follow-up against published version 10 repeated settlement, reload, the anonymous sign-in gate, and the three viewport checks successfully, with no page runtime errors. It did not sign in to a production shared room, verify two-person production trading, or move Testnet funds. Local shared-room tests use fictional identities and do not establish production authentication.

A separate [isolated shared-room browser check](verification/shared-room-browser-2026-10-02.json) passed 16 checks using the production page component and API handlers, separate browser sessions with controlled test identities, and fresh local D1 storage. It covered joining, matching, exact settlement, export, persistence after a database runtime restart, ownership, room isolation, and concurrent retries. The same check reproduced and verified fixes for a cramped room-code field at tablet widths and low-contrast sign-in text; layouts were checked at 1440, 797, 650, 390, and 320 pixels. This does not close the separate production two-account Sign in with ChatGPT verification gap.

### Production sign-in and native WebMCP follow-up

On October 2, one real ChatGPT account was tested in normal and private Chrome windows. Both reopened the same saved room as Alice, and joining that room as Bob was rejected. A 100-contract long order at $60,000 and 2× leverage reserved 83,334 practice sats; both sessions displayed the same order and revision. On published version 12, **Sign out** returned the private window to the anonymous page while the original window remained signed in. Canceling from the original window restored 1,000,000 available sats and zero reserved sats; reload preserved the room, role, journal and balance. Sign-out followed by sign-in also restored the saved room, and a downloaded snapshot matched its visible balance and journal.

Six read-only checks also passed on the published anonymous `/legacy` page in Edge 154 with native WebMCP enabled. The browser registered and executed `read_lazer`; its result matched the public exchange API, unexpected arguments were rejected, and navigating to shared rooms removed the tool. No browser API was replaced or polyfilled, no application mutations or page runtime errors were observed, and the wallet was untouched.

These production checks cover one account across two sessions and an anonymous native read tool. They do not establish distinct-account production authentication, cross-account isolation, or two-person matching and settlement. Those multi-identity scenarios retain the separate local D1 and 16-check browser evidence above.

## October 2, 2026 local chain verification

Three separate integration checks passed against Bitcoin Core 31.1 on fresh, isolated regtest chains. Lightning used two LND 0.21.3-beta wallets. The application source was commit `681ba0f28d104ccf2a8eb7fcfb4e943dffbe69a4`.

- [Deposit, trade and withdrawal](evidence/regtest-2026-10-02.json): deposit 200,000 sats, match a 20,000-sat trade, then sign and broadcast a 15,000-sat withdrawal. Core accepted it and the receiving wallet confirmed the exact amount after six blocks.
- [Two-signature escrow](evidence/escrow-regtest-2026-10-02.json): seller/buyer release and seller/arbitrator refund each paid 100,000 sats after six confirmations. The operator alone could not finalize either settlement. The refund also exercised the command-line create, inspect, prepare and combine flow.
- [Lightning payment and return](evidence/lightning-regtest-2026-10-02.json): a 100,000-sat payment and a 15,000-sat return both reached `SUCCEEDED` at the sender and `SETTLED` at the receiver, leaving 85,000 sats at the receiving node.

The test processes shut down after completion. These checks used local regtest coins and a direct Lightning channel. They do not establish public routing, production custody, or a connection between Lightning payments and the practice-room ledger. The public Testnet round-trip evidence below remains historical.

## Bitcoin Core regtest

Install Bitcoin Core and put `bitcoind` and `bitcoin-cli` on PATH, or set `BITCOIN_CLI` to the CLI executable. Use a separate data directory. Do not point the harness at an existing wallet directory.

PowerShell example, from the repository root:

```powershell
New-Item -ItemType Directory -Force work/core-regtest
$env:CORE_REGTEST_DATADIR = (Resolve-Path work/core-regtest).Path
$env:CORE_REGTEST_PORT = '18845'
bitcoind "-datadir=$env:CORE_REGTEST_DATADIR" -regtest -server=1 -listen=0 -rpcport=18845 -fallbackfee=0.00001000
```

The node stays in that terminal. In a second PowerShell terminal, also at the repository root:

```powershell
$env:CORE_REGTEST_DATADIR = (Resolve-Path work/core-regtest).Path
$env:CORE_REGTEST_PORT = '18845'
npm test
node scripts/regtest-integration.mjs
```

For a Unix shell, create the directory with `mkdir -p work/core-regtest`, use `export CORE_REGTEST_DATADIR="$PWD/work/core-regtest"` and `export CORE_REGTEST_PORT=18845` in both terminals, and pass `-datadir="$CORE_REGTEST_DATADIR"` to the same node command.

The script refuses chains other than regtest. It creates unique mining and receiving wallets, mines local blocks, deposits coins, matches Alice and Bob, signs a withdrawal using the application wallet code, checks Bitcoin Core mempool acceptance, and verifies Bob's receipt after six blocks. It writes results to ignored `work/regtest-evidence.json`. It uses no public Testnet or mainnet funds.

Stop that isolated node after testing:

```powershell
bitcoin-cli "-datadir=$env:CORE_REGTEST_DATADIR" -regtest -rpcport=18845 stop
```

## Verify a public Testnet receipt

Use a synchronized Bitcoin Core Testnet 4 node with the receiving wallet loaded. Replace the four arguments with the actual transaction ID, destination address, amount in sats, and receiving wallet name:

```sh
node scripts/core-verify.mjs TXID TESTNET_ADDRESS SATOSHIS WALLET
```

Optional environment variables are `BITCOIN_CLI`, `CORE_DATADIR`, and `CORE_RPC_PORT`. Set them in the same terminal as the script. If you use Core's default Testnet 4 paths and ports and the CLI is on PATH, they can be omitted.

This read only script checks the chain, synchronization state, exact destination script, exact amount, and confirmations. It uses `gettransaction`, so the selected wallet must know the transaction.

| Exit code | Meaning |
| :--- | :--- |
| 0 | Exact receipt found with at least six confirmations |
| 2 | Exact receipt found but fewer than six confirmations |
| 1 | Invalid input, wrong chain, node error, conflicting transaction, or no exact matching output |

## Public Testnet evidence

This is a historical verification of the public app at commit `c41e420021e478587d690a8bcde5f1b9255b9cf4`, recorded on September 17, 2026. Confirmation counts below are observations at that time, not live counters.

| Step | Observed result |
| :--- | :--- |
| Alice deposit | 100,000 sats, credited after eight confirmations |
| Alice sells to Bob | 20,000 sats at 60,000 dUSD/BTC, worth 12 dUSD |
| Bob withdrawal | 15,000 sats, 143 sat network fee |
| Independent Core receipt | Exact Bob output verified with seven confirmations |
| Lazer withdrawal state | Confirmed, with six confirmations observed by the app |
| Retry | Same withdrawal transaction reused without another debit |
| Final Alice balance | 80,000 sats and 100,012 dUSD |
| Final Bob balance | 4,857 sats and 99,988 dUSD |

Inspect the [deposit transaction](https://mempool.space/testnet4/tx/2c6f5b332db2ee7ad8c8fea103946001f8936bc7c30a20c4767c0916cae4eee9) and [withdrawal transaction](https://mempool.space/testnet4/tx/12725c98f37cabc56472e1db8bcc9ca99bc70de74c96f1a2b46691edd9f05786). The exchange trade is an internal ledger event; it is not a separate blockchain transaction.

The [machine readable evidence](evidence/testnet-round-trip.json), [verified CI run](https://github.com/agammann/lazer/actions/runs/35182771859), and [Testnet release](https://github.com/agammann/lazer/releases/tag/v0.1.3-testnet) record the same release. Evidence contains public test transaction details, not credentials or wallet seeds.

Passing fixtures, regtest, or a public Testnet round trip does not certify mainnet custody, recovery procedures, or financial settlement. See [deployment readiness](DEPLOYMENT.md#network-readiness).

## v1.0.0 source verification

The prepared v1 source was checked with Node.js 24.19.0 and npm 12.2.0. All 72 engine/API/protocol tests and the production build passed after dependency maintenance. The actual portable framework browser workflow exercised solo matching, exact settlement, export/replay, invalid and corrupt journals, keyboard cancellation, storage-write failure and retry, narrow layouts, native WebMCP API parity and argument rejection, local development sign-in, database restart and stopped backup restoration. Its test database is separate from the operator's local database.

The shared-room browser suite uses the existing test-only authentication seam and production React component/API handlers with persistent local D1. Its 16 groups cover fictional Alice/Bob/outsider identities, room isolation, exact margin and P&L, ownership, duplicate/stale requests, export, reload, database-runtime restart and five layout widths. These identities are explicitly controlled local fixtures.

A fresh isolated Bitcoin Core 31.1 regtest run verified a 200,000 sat deposit, 20,000 sat trade and signed 15,000 sat withdrawal with six confirmations, and reran the separate escrow harness. These checks are local protocol evidence; the earlier Lightning and public Testnet records above keep their original dates and scope. Release CI repeats source and extracted-package checks on Windows and Linux.
