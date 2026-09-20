# Lazer

An independent Bitcoin derivatives project. Trade BTC/USD exposure, post collateral in sats, and settle profit or loss in sats. Lightning is the sole planned funding and withdrawal network.

[Open Lazer](https://lazer.alx21.chatgpt.site/) · [Build specification](docs/DERIVATIVES.md) · [Verification workflow](https://github.com/agammann/lazer/actions/workflows/verify.yml)

**Current milestone: a solo practice terminal and server-saved shared test rooms, plus separately verified local Lightning payments. This is not a funded derivatives venue.** Shared rooms let two signed-in people trade as Alice and Bob. All derivatives balances are practice sats and cannot be withdrawn.

## Trade with another person

[Open shared test rooms](https://lazer.alx21.chatgpt.site/market). Sign in, choose **Open my room**, and give your room code to a second person. They sign in separately and choose **Join as Bob**. Orders, balances and the room journal are saved on the server. Read the [shared-room walkthrough](docs/SHARED-MARKET.md).

## Try the solo derivatives lab

1. As Alice, place a **Long** at $60,000 with 100 contracts and 2× leverage.
2. Switch to Bob and place a **Short** with the same values. Each trader reserves 83,334 practice sats.
3. Press **Price +5%**. At $63,000, Alice gains 7,936 sats and Bob loses 7,936 sats.
4. Press **Settle both sides** to realize the result and release unused margin.
5. Open **Journal** to export, replay, or restart the test. Try partial fills, canceled orders, and adverse price movements.

The order book uses price then time priority and prevents same-trader matches. Margin and P&L calculations use integer arithmetic. Sessions survive reloads within the same tab. Closing the tab can discard the session; export a journal to preserve it.

The scenario mechanism settles both sides of a pair together. It does not model a production perpetual market's funding payments, independent close orders, insurance fund, or continuous liquidation process.

## What works today

| Component | Verified behavior | Current limit |
| :--- | :--- | :--- |
| Derivatives lab | Limit orders, partial fills, reserved margin, inverse P&L, bilateral settlement, liquidation scenarios, journal replay | Local practice balances and scenario prices |
| Shared test rooms | Signed-in roles, durable orders/balances, revision checks, idempotent commands, restart recovery | Two-person scenarios with practice sats; creator controls test prices |
| Lightning | Bitcoin Core 31.1 + LND 0.21.3: 100,000 sat payment and 15,000 sat return, both settled | Separate local regtest harness; not wired to trading accounts |
| Legacy pilot | Public Testnet 4 deposit, spot trade against simulated USD, withdrawal to Bitcoin Core | Preserved at `/legacy`; separate ledger and wallet |

See [Lightning payment evidence](docs/evidence/lightning-regtest.json) and the [verification guide](docs/VERIFICATION.md). The previous BTC/ETH escrow experiment is retained for reference; it is not the new product direction.

## Run locally

Use Node.js 22.13 or later and npm:

```sh
git clone https://github.com/agammann/lazer.git
cd lazer
npm ci
npm run dev
```

Open the URL printed by the dev server. The derivatives lab needs no wallet seed or API keys. Read [local development](docs/DEVELOPMENT.md) for legacy Testnet wallet setup.

```sh
npm run typecheck
npm test
npm run build
```

For actual local Lightning payment verification, install Bitcoin Core and LND, then follow [the regtest instructions](docs/DERIVATIVES.md#lightning-regtest-verification). No mainnet funds are needed.

## Existing Testnet funds

[Open the legacy Testnet wallet](https://lazer.alx21.chatgpt.site/legacy). Its signing seed, D1 ledger, deposit addresses, API, and withdrawal path are preserved. No existing balance is copied into the derivatives lab. The [legacy user guide](docs/USER-GUIDE.md) explains withdrawals.

## Build direction

Lazer will operate its own market, rather than execute trades through LN Markets. Server-saved practice rooms are now implemented. The next milestone connects verified Lightning collateral to the market, with deposit reconciliation, withdrawal reservations, price feeds, and settlement workers. See the [implementation sequence and release criteria](docs/DERIVATIVES.md#implementation-sequence).

The intended additions are clear risk previews, a replayable trading journal, and Lightning payments with explicit fees and settlement status. The repository makes no claim to better liquidity, execution speed, or mainnet readiness than an existing venue.

| Guide | Purpose |
| :--- | :--- |
| [Derivatives specification](docs/DERIVATIVES.md) | Product, contracts, funding packages, integration sequence, test harness |
| [Development](docs/DEVELOPMENT.md) | Runtime and legacy configuration |
| [Deployment](docs/DEPLOYMENT.md) | Public hosting and legacy wallet operations |
| [Verification](docs/VERIFICATION.md) | Checks and recorded evidence |
| [Legacy architecture](docs/ARCHITECTURE.md) | Existing Testnet spot book and custody limits |
| [Contributing](CONTRIBUTING.md) | Validation and secret handling |

Lazer is independently developed and is not affiliated with [LN Markets](https://lnmarkets.com/) or Jane Street. LN Markets is a product reference; no LN Markets private API, account, or execution service is connected.
