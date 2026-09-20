# Verification

[Back to Lazer](../README.md)

## Derivatives and Lightning milestone

The suite now includes inverse P&L, collateral conservation, price/time matching, partial fills, liquidation scenarios, and offline Lightning invoice inspection. A separate Bitcoin Core/LND regtest run completed a 100,000 sat payment and 15,000 sat return. See [the evidence](evidence/lightning-regtest.json) and [reproduction instructions](DERIVATIVES.md#lightning-regtest-verification). The Lightning test is separate from browser practice balances.

Shared-market tests now exercise real local D1 SQL and the production route handlers: separate fictional identities, racing joins/orders, duplicate and stale commands, exact P&L, ownership, rate limits, and state recovery after a database-runtime restart. See [shared rooms](SHARED-MARKET.md). Production two-person authentication still requires separate user accounts.

The historical Testnet and escrow evidence below applies to the legacy tools, not derivatives readiness.

## Automated checks

Run from the repository root:

```sh
npm run typecheck
npm test
npm run build
```

The current suite contains 49 checks covering matching, reservations, signing, ownership, concurrency, idempotent retries, Bitcoin escrow, and native ETH payment verification. API tests execute production handlers against local D1 SQL with explicitly substituted authentication and chain fixtures. They do not contact the public chain, load the deployment seed, or establish mainnet readiness.

The original public Testnet release had 26 checks. Its historical evidence below retains that count. The separate escrow implementation adds 12 Bitcoin protocol tests and 11 Ethereum verification tests. See the [escrow guide](ESCROW.md) for the Bitcoin Core escrow harness and its recorded regtest evidence.

[GitHub Actions](https://github.com/agammann/lazer/actions/workflows/verify.yml) runs these checks on pushes to main and on pull requests.

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
