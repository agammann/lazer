# Lazer

A cyberpunk Bitcoin Testnet 4 trading terminal. Deposit test Bitcoin, trade on a shared limit order book as Alice and Bob, and withdraw to Bitcoin Core.

[Open Lazer](https://lazer.alx21.chatgpt.site/) · [Current release](https://github.com/agammann/lazer/releases/tag/v0.1.3-testnet) · [Verification workflow](https://github.com/agammann/lazer/actions/workflows/verify.yml)

**Lazer currently runs on Testnet 4 with simulated dollars (dUSD). Mainnet Bitcoin and real USD are not supported.** Test coins and dUSD have no redeemable monetary value in Lazer. This is a bounded public pilot, not a production custody service.

## Try it

1. [Open Lazer](https://lazer.alx21.chatgpt.site/), sign in with ChatGPT, and open your Alice and Bob accounts.
2. Deposit Testnet 4 Bitcoin from Bitcoin Core. Deposits become available after six confirmations.
3. Place a sell order as Alice and a matching buy order as Bob. Buy orders reserve dUSD; sell orders reserve deposited Bitcoin.
4. Withdraw Bob's Bitcoin to an external Testnet 4 wallet and follow its confirmations in Transfers.

Each subaccount starts with 100,000 dUSD and zero Bitcoin. There are no trading fees. Withdrawals pay a Bitcoin network fee. Other visitors use the same order book and may fill an order before your other subaccount does.

Read the [complete user guide](docs/USER-GUIDE.md) for the walkthrough, amounts, and troubleshooting.

## Build and operate

| Guide | What it covers |
| :--- | :--- |
| [Local development](docs/DEVELOPMENT.md) | Prerequisites, private configuration, database setup, commands, local sign in |
| [Deployment and operations](docs/DEPLOYMENT.md) | Sites deployment, backups, release checks, Testnet and mainnet status |
| [Verification](docs/VERIFICATION.md) | Automated checks, Bitcoin Core regtest, recorded public Testnet receipts |
| [Architecture](docs/ARCHITECTURE.md) | Matching, custody, storage, authentication, capacity limits |
| [Contributing](CONTRIBUTING.md) | Change scope, validation, bug reports, secret handling |

For a fresh checkout, start with the local development guide. It includes the required wallet seed and database steps; installing dependencies alone does not create a working trading environment.

## What has been verified

The public Testnet cycle completed on September 17, 2026: a 100,000 sat deposit, a 20,000 sat Alice to Bob trade, and a 15,000 sat withdrawal to Bob's Bitcoin Core wallet. The withdrawal paid a 143 sat network fee and was independently observed with seven confirmations. See the [recorded evidence and its limits](docs/VERIFICATION.md#public-testnet-evidence).

The automated suite covers the matching engine and production API handlers, including concurrent requests and withdrawal retries. GitHub Actions runs type checking, tests, and a production build.

## Project structure

```text
app/             Trading interface, API routes, hosted authentication
lib/             Matching engine, Bitcoin signing, ledger persistence
db/              Database schema and binding helpers
drizzle/         Applied SQL migrations and schema history
tests/           Engine and isolated API tests
scripts/         Build helpers and Bitcoin Core verification
docs/            User, developer, and operator guides
components/ui/   Bundled reusable UI components
build/           Sites integration and its upstream license
vendor/          Vendored styling and its upstream license
```

Engineering inspiration: Jane Street's [Building an Exchange](https://www.janestreet.com/tech-talks/building-an-exchange/). Lazer is independently developed and is not affiliated with Jane Street.
