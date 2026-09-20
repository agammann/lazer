# Bitcoin derivatives, settled in sats

[Back to Lazer](../README.md)

## Product decision

Lazer is being rebuilt as an independent BTC/USD derivatives market, with Lightning first and Ark and Liquid as additional funding/withdrawal options. BTC/ETH escrow and asset swaps are no longer the primary product. LN Markets is a product reference, not the execution backend.

Users take long or short Bitcoin price exposure. Bitcoin provides collateral and the settlement unit. A dollar contract size does not create a dollar balance or promise fiat redemption.

The September 19, 2026 milestone is a local practice terminal with separately tested Lightning transport. It does not accept real collateral and is not a public multiuser derivatives exchange.

## Current contract and test behavior

- Inverse BTC/USD: one contract represents $1 of exposure.
- Whole dollar prices from $1,000 to $1,000,000; 1–10,000 contracts per order.
- Isolated initial margin, integer leverage 1–5×. Each practice role starts with 1,000,000 nonredeemable sats.
- Required margin = ceiling(contracts × 100,000,000 / entry price / leverage).
- Long P&L = contracts × 100,000,000 × (1 / entry price − 1 / exit price).
- Compute P&L with BigInt rational arithmetic, round once toward zero, and negate that exact integer for the short. No independently rounded counterpart balance.
- Price/time priority, resting order execution price, partial fills, no same-trader match, cancellation releases reserves.
- Reserve collateral before matching. An incoming buy may require more sats at a lower execution price. If it cannot cover all resulting reservations, reject the entire command without partial mutation.
- Scenario maintenance is 1% of entry notional in sats, rounded up. Either participant crossing maintenance settles the pair.
- Scenario gap losses are capped at the losing side's posted margin. The other participant's gain is capped by that same amount. This is a bounded accounting experiment, not an insurance fund or production liquidation solution.
- Manual settlement closes both sides together at the scenario price. Independent market exits and reduce-only close orders are not implemented.
- No perpetual funding, trading fees, price feed, stop orders, market maker, external liquidity, or real collateral in this milestone.

The UI calls `lib/derivatives.ts` locally. It does not invoke the legacy money-moving API. A browser-tab `sessionStorage` journal contains commands. On reload or import, Lazer validates and replays those commands from an empty practice state, rather than trusting imported result balances. Import replaces the current practice session. Export the current journal first if it needs to be kept.

Limits are 100 resting orders, 500 historical positions, 2,000 events, and 1,000 commands per session. Export before restarting. The journal is a reproducible local test artifact, not a signed regulatory or tamper-proof audit record.

## Funding packages

These packages are pinned in `package-lock.json`. Their upstream repositories and licenses were checked during selection. This is a compatibility choice, not a security audit of every dependency.

| Rail | Package/source | Role in this repository |
| :--- | :--- | :--- |
| Lightning | [`bitcoinjs/bolt11`](https://github.com/bitcoinjs/bolt11), `bolt11@1.4.1`, MIT | Decode test invoices, check amount/network/expiry |
| Lightning node | [`lightningnetwork/lnd`](https://github.com/lightningnetwork/lnd), v0.21.3-beta, MIT | Actual local payment harness backed by Bitcoin Core |
| Ark | [`arkade-os/ts-sdk`](https://github.com/arkade-os/ts-sdk), `@arkade-os/sdk@0.4.74`, MIT | Offline Ark address inspection |
| Liquid | [`vulpemventures/liquidjs-lib`](https://github.com/vulpemventures/liquidjs-lib), `6.0.2-liquid.38`, MIT | Offline network, script and confidentiality inspection |

Additional candidates, not installed or connected: [Alby Bitcoin Connect](https://github.com/getAlby/bitcoin-connect) for the user's Lightning wallet interface, [Liquid Wallet Kit](https://github.com/Blockstream/lwk) for durable Liquid wallet operations, and [Arkade Boltz integration](https://github.com/arkade-os/ts-sdk) for an explicit funding conversion where needed. A conversion belongs in the funding workflow; users do not perform one for every trade.

LN Markets provides a [TypeScript SDK](https://github.com/ln-markets/sdk-typescript) and a [Signet API](https://docs.lnmarkets.com/en/api), but Lazer does not use either for execution. Its liquidity and risk systems are not supplied by those SDKs.

### Offline inspection

```sh
npm run funding:inspect -- lightning regtest <BOLT11_INVOICE>
npm run funding:inspect -- ark test <ARK_ADDRESS>
npm run funding:inspect -- liquid test <LIQUID_TESTNET_ADDRESS>
```

Replace bracketed arguments with a public invoice/address. Do not enter seed phrases, keys, macaroons, or wallet connection credentials. Run from the repository root. No external request is made by this command. Mainnet encodings can be inspected with `mainnet`, but inspection never enables payment or funding.

The result always reports `transfersEnabled: false`, `ownershipVerified: false`, and `collateralCredited: false`.

Network boundaries matter:

- An `lntb` invoice does not distinguish Signet from another Bitcoin test network. Pin the receiving LND chain independently.
- An Ark `tark` address similarly identifies a test family. Verify the Ark server's identity and chain, then VTXO state, expiry and exit conditions.
- A Liquid address does not identify an asset. Crediting L-BTC requires verifying the expected asset ID and unblinding confirmed outputs. L-BTC must remain a distinct collateral asset from BTC unless an explicit conversion actually settles.
- Payment preimages supplied by a browser are not sufficient deposit evidence. Only a reconciled server/node settlement can back a real ledger credit.

## Lightning regtest verification

Install verified official [Bitcoin Core](https://bitcoincore.org/en/download/) and [LND](https://github.com/lightningnetwork/lnd/releases/tag/v0.21.3-beta) binaries. The recorded run used Bitcoin Core 31.1 and LND 0.21.3-beta on Windows. The LND archive SHA256 was compared with the release manifest: `de9d5941bcd4e169a12bcdfbc862d5d75d393facb8eb1e09026d3065743d3948`. This records checksum verification; it does not claim a GPG signature check was performed.

PowerShell, with paths adjusted to your installations:

```powershell
$env:BITCOIND='C:/tools/bitcoin/bin/bitcoind.exe'
$env:BITCOIN_CLI='C:/tools/bitcoin/bin/bitcoin-cli.exe'
$env:LND='C:/tools/lnd/lnd.exe'
$env:LNCLI='C:/tools/lnd/lncli.exe'
npm run test:lightning:core
```

Unix shells can export the same four variables with native executable paths. Only the Windows run has been verified here.

The script creates new ignored directories under `work/lightning-regtest-<timestamp>`, uses only a fresh regtest chain, mines local test coins, funds Alice's LND wallet, opens a direct channel, waits for a usable route, pays a 100,000 sat invoice to Lazer, and returns 15,000 sats. It checks sender success, receiver settlement, exact amounts, and the remaining 85,000 sat Lazer channel balance. It then shuts down its own nodes and writes [public evidence](evidence/lightning-regtest.json). The command replaces that evidence file with the latest successful run.

Reserve these loopback ports: Core RPC 18846, ZMQ 28346/28347, LND RPC 10019/10020, REST 10119/10120, peer 19735/19736. Do not run concurrent copies. The script does not publish ports or use the existing Testnet wallet seed. Logs, test keys, macaroons and RPC credentials remain ignored locally. Its `noseedbackup` configuration is exclusively for disposable regtest wallets and must never be copied into a real-money deployment.

This verifies Lightning transport on a direct local channel, not public routing reliability, a trading collateral bridge, or Ark/Liquid transfers.

## Implementation sequence

1. **Completed in this milestone:** bounded practice engine, functional browser terminal, replayable scenarios, offline funding inspectors, actual local Lightning round trip.
2. **Durable server market:** authenticated independent participants, transactionally stored orders/fills/positions, monotonic sequence IDs, idempotent mutations, restart/replay recovery, withdrawals restricted to free verified collateral. Browser input must never select the authoritative price or balance.
3. **Lightning collateral bridge:** scoped LND credentials held by a separate service, exact invoice/account binding, settlement subscriptions plus backfill, unique payment-hash credits, durable withdrawal reservations, explicit fee limits, in-flight recovery, node-to-ledger reconciliation. Use regtest end to end before a funded public test network.
4. **Derivatives risk service:** documented index/mark methodology with stale-feed halt, funding schedule, live exit orders, continuous liquidation independent of browser sessions, market maker accounts, price bands and exposure limits. Specify gap losses, insurance and default resolution; do not reuse the practice loss cap as a live risk model.
5. **Ark and Liquid:** enable one rail at a time after round-trip tests and recovery tests. Ark needs server compatibility and exit monitoring. Liquid needs confidential output/asset verification, reorg handling, fee funding and peg/conversion accounting. Do not assume Testnet 4, Bitcoin Signet, Ark test chains and Liquid testnet interoperate.
6. **Public test release:** multiple independent accounts, real test collateral only, deposit → trade → exit → withdrawal evidence, restart and outage tests, reconciled balances, limits and operational monitoring.
7. **Mainnet candidate:** independent security review, resolved findings, backed liquidity, key custody and recovery rehearsals, incident response, and the operator's jurisdiction/product obligations resolved. There is no mainnet switch in the practice lab.

The web interface can be hosted on Sites. LND, an Ark watcher, Liquid wallet services, and continuous risk workers require separately operated persistent services. Browser timers or a static website cannot operate those services reliably.

## Preserve the legacy pilot

`/legacy` retains the prior Testnet 4 spot UI. `/api/exchange`, the D1 `lazer-testnet4-v2` state, and `TESTNET_WALLET_SEED` are unchanged. No migration converts old dUSD or Testnet balances into derivatives collateral. Existing users must retain access to their withdrawals.

`lib/escrow.ts`, `lib/ethereum.ts`, and the [escrow guide](ESCROW.md) remain historical development tools with their own tests. They are not imported into the derivatives terminal.
