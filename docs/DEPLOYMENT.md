# Deployment and operations

[Back to Lazer](../README.md)

> This guide covers the preserved Testnet 4 pilot at `/legacy`. For the current derivatives rebuild, read [the derivatives specification](DERIVATIVES.md).

## Network readiness

| Network | Current status |
| :--- | :--- |
| Bitcoin Testnet 4 | Deployed public pilot. Deposit, trade, and withdrawal have completed on the public chain. |
| Bitcoin regtest | Separate local integration harness. It does not deploy a public exchange. |
| Bitcoin mainnet | Unsupported. No mainnet launch configuration, valuable asset custody approval, or mainnet transaction verification is included. |

There is no supported switch that converts this release into a mainnet exchange. The code fixes wallet derivation, chain provider, storage namespace, and UI to Testnet 4.

Every account in the existing hosted order book receives free simulated dUSD. Allowing it to purchase valuable mainnet Bitcoin would create unbacked purchasing power. The selected replacement model is individual Bitcoin escrow trades paid in native ETH on Ethereum, with the Lazer operator as arbitrator. The separate protocol tools are described in [BTC for ETH escrow](ESCROW.md); they do not convert the deployed ledger or enable mainnet. A network flag alone cannot supply the missing workflow and operational requirements.

## Existing hosted deployment

The public app is [Lazer](https://lazer.alx21.chatgpt.site/). Its source is [agammann/lazer](https://github.com/agammann/lazer). GitHub Actions verifies source changes; a GitHub push does **not** by itself deploy the website.

The current app uses OpenAI Sites with Cloudflare Workers, D1 binding `DB`, and dispatcher provided ChatGPT identity. [Hosting metadata](../.openai/hosting.json) identifies the existing Sites project. Reuse that project when updating Lazer. Do not create a replacement project or overwrite its identity as a routine release step.

For a separate installation, use your own Sites project, database, and secret. Copying this repository does not grant access to the existing deployment. A generic static host cannot execute the API or provide its trusted authentication boundary.

## Release procedure

These steps require access to the Sites owner tools and private runtime settings. There is intentionally no fabricated one command deployment in this repository.

1. Review the diff and run `npm run typecheck`, `npm test`, and `npm run build`.
2. Confirm the target is the existing Testnet project and its audience remains public. Preserve its D1 database and `TESTNET_WALLET_SEED`.
3. Back up the database and secret before any state or schema change. Apply only new, reviewed SQL migrations in order. Do not reapply the initial table creation files to an initialized database.
4. Commit and push the exact source to GitHub and the source repository connected to Sites. Record the full commit SHA.
5. With the Sites hosting tooling, package that source's validated build output, save a version against the pushed commit, and deploy that saved version. Wait for a terminal successful deployment result.
6. Verify the hosted app and its API, then record the version, commit, checks, and production URL in the release notes. A successful build or saved version is not deployment evidence.

The generated `dist/server/wrangler.json` contains a placeholder D1 ID for local execution and Sites binding resolution. Do not use it as a standalone Cloudflare production configuration. A different hosting platform needs a real database binding and a trusted authentication implementation before exposing the API.

## Postdeployment checks

1. Open the public page while signed out. The public book can be visible, but private account balances, deposits, withdrawals, and events must not appear.
2. Sign in and confirm existing Alice and Bob balances and transfer records survived.
3. Check the active network label and deposit destination against the existing deployment. Never substitute a new seed to make a configuration error disappear.
4. Confirm new order, cancellation, and transfer activity works when releasing changes that affect those paths. A full deposit and withdrawal check requires actual Testnet coins and confirmations.
5. Verify GitHub Actions for the published commit. Document separately what was tested with fixtures, regtest, and public Testnet.

## Backups and incidents

Retain secure backups of both the full D1 ledger and the exact wallet seed. Account exports and GitHub source cannot recover custody state by themselves. Keep backups outside this public repository.

Before upgrading storage or restoring data, prevent concurrent writes using the hosting operator controls. Retain signed withdrawal records, transaction IDs, reservations, and command history. Restoring a database snapshot without reconciling later blockchain transactions can create an incorrect balance. Verify backups in an isolated environment before relying on them for recovery.

Monitor storage capacity, pending transfers, provider failures, and Bitcoin backing. This release has no unattended chain monitor, admin recovery console, or completed disaster recovery certification. If the ledger freezes or backing is uncertain, stop new activity, preserve evidence, and reconcile the chain and ledger before reopening. Do not delete state, refund an uncertain broadcast, or rotate a seed as an incident shortcut.

## Remaining work for mainnet

A future mainnet release needs implemented and verified controls, not checklist assertions:

1. A funded settlement model with no free purchasing power against valuable Bitcoin.
2. Separate production identities, storage, wallet derivation, secrets, and network validation.
3. A custody and signing design with withdrawal authorization, operational limits, and recovery procedures.
4. Continuous chain reconciliation, reorganization handling, monitoring, and an operator response path.
5. Storage that can retain financial history and continue withdrawals under expected capacity.
6. Backup restoration and failure testing, independent security review, and the operating requirements appropriate to the service.

The current Testnet verification report does not establish any of those mainnet properties.
