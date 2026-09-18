# Contributing to Lazer

[Back to Lazer](README.md)

Start with [local development](docs/DEVELOPMENT.md). Use a separate local wallet seed and database. Do not reuse the public deployment's configuration.

## Changes and validation

Keep changes focused and explain the user visible problem, resulting behavior, and verification in the pull request. Run `npm run typecheck`, `npm test`, and `npm run build` before requesting review.

Changes to balances, matching, deposit confirmation, signing, or retry behavior need tests for the relevant failure and concurrent request cases. The API fixture suite is separate from Bitcoin Core and public Testnet verification. State which checks you actually ran.

Preserve applied SQL migrations. Add a new migration for intentional schema changes, review its data impact, and describe the backup and upgrade procedure. Do not modify deployed wallet derivation or namespaces without an explicit migration design.

Update the relevant guide when a command, prerequisite, limit, or user flow changes. Check relative links and public destinations. Keep the public GitHub website field and README pointed at the current hosted app.

## Bug reports

Include the expected behavior, observed behavior, steps to reproduce, operating system, Node version, and relevant sanitized error text. Identify whether the issue concerns local development, regtest, or the public Testnet site.

Never include wallet seeds, private keys, RPC credentials, cookies, authorization headers, private database exports, or unredacted account data in an issue or pull request. Public Testnet transaction IDs can help diagnose chain behavior.

For a suspected exploitable security issue, use GitHub's private vulnerability reporting option if the repository offers it. If it is unavailable, request a private contact without posting exploit details or secrets publicly.

## Repository hygiene

Commit source, the lockfile, documentation, and intentional public verification evidence. Keep `.dev.vars`, `.env*`, node data, generated builds, local state, and temporary files ignored. The tracked `.dev.vars.example` is a placeholder, never a usable secret.

Preserve upstream license files under `build/` and `vendor/`. Public repository visibility does not itself establish an additional project license.
