# Local development

[Back to Lazer](../README.md)

The derivatives lab at `/` runs without secrets. After `npm ci`, run `npm run dev`. The wallet seed and database instructions below apply to the preserved Testnet pilot at `/legacy`.

See [the derivatives guide](DERIVATIVES.md) for the Lightning harness and funding inspectors.

## Prerequisites

Use Git, Node.js 24.19.0 within 24.x, and npm 12.2.0. CI pins those exact versions. Bitcoin Core is optional for the local UI and automated suite, and required for the separate node integration checks.

Run every command below from the repository root. The commands work in PowerShell and typical Unix shells unless labeled otherwise.

```sh
git clone https://github.com/agammann/lazer.git
cd lazer
npm install --global npm@12.2.0
npm ci
```

Use `npm ci` with the committed lockfile. A clean checkout uses the portable execution profile automatically. Managed Sites tooling can select a different local profile; that selection is ignored by Git.

## Create private configuration

The [configuration example](../.dev.vars.example) describes the only application secret. Generate a new local seed directly into `.dev.vars`:

```sh
node -e "require('node:fs').writeFileSync('.dev.vars', 'TESTNET_WALLET_SEED=' + require('node:crypto').randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 })"
```

This command does not print the seed and refuses to overwrite an existing file. If it reports `EEXIST`, keep the existing configuration. `.dev.vars` is ignored by Git. Protect it with your operating system's file permissions and retain a secure backup. On Windows, the `mode` option does not establish a Windows access control policy.

The seed must be 64 hexadecimal characters. Each independent deployment needs its own seed. Never replace an active deployment's seed or database while deposits remain. A fresh local seed cannot recover hosted balances.

## Build and initialize local storage

```sh
npm run build
npm run setup:local
npm run dev
```

`setup:local` creates a private seed only if none exists, initializes both unchanged migrations in a fresh local database, and preserves a complete existing schema. A partial schema stops setup for inspection; it is never deleted or reset. Subsequent starts normally require only `npm run dev`. The earlier manual SQL commands still work when initializing a fresh database, but are not idempotent.

Open `http://127.0.0.1:5173`. The solo lab needs no sign-in. Shared rooms and the legacy wallet use the app's sign-in link. The portable local server supplies a development identity. Hosted Sites supplies real ChatGPT identity through its dispatcher. Local balances and hosted balances are separate.

Keep the local server bound to loopback. Do not publish it through a tunnel or treat the development identity as production authentication.

## Commands

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Local development server with local sign in |
| `npm run typecheck` | TypeScript validation |
| `npm test` | Engine and API tests, with isolated authentication and chain fixtures |
| `npm run build` | Production Worker and client bundle under `dist/` |
| `npm start` | Local preview of the built Worker; not a production deployment and not the development sign in flow |
| `npm run lint` | Additional ESLint diagnostics; not currently a required CI gate |
| `npm run db:generate` | Generate a new migration after an intentional schema change; does not apply it |

Required checks before publication:

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser:local
npm run test:browser:shared
```

The local browser suite runs the actual framework with a fresh database. The shared-room browser suite bundles the production component and request handlers with the existing test-only identity seam, fictional Alice/Bob/outsider identities and real persistent D1. It runs only on loopback. The framework suite also exercises the browser's native WebMCP API with its testing feature enabled; it installs no polyfill.

The automated suite does not require faucet coins or a live Bitcoin node. For the separate Bitcoin Core integration, see [verification](VERIFICATION.md).

## Common setup problems

| Problem | Resolution |
| :--- | :--- |
| Missing `dist/server/wrangler.json` | Complete `npm run build` before the D1 initialization commands. |
| Missing SQL table | Check that both migrations ran against the same `.wrangler/state` used by the server. |
| Invalid or missing wallet seed | Check the ignored `.dev.vars` file and restart the server. Never paste its contents into an issue. |
| Sign in stays anonymous | Use `npm run dev` on localhost. The built Worker preview does not provide the portable development sign in middleware. |
| Port 5173 is occupied | Use `npm run dev -- --port 5174`; the server remains on loopback and refuses to silently select another port. |

Generated bundles, local database files, execution profiles, and test evidence under `work/` stay out of source control.

## Local backup and recovery

Stop the dev server before copying `.wrangler/state` and `.dev.vars` together into a private backup directory. Do not commit or upload them. An exported shared-room snapshot is useful for inspection, but cannot restore the server database. Export solo journals from the Journal tab before closing the tab.

Restore into a separate checkout running the same version: install its dependencies, copy the stopped database directory and exact seed to their original relative paths, build, run `npm run setup:local` to inspect the schema, then start the server and confirm the room and wallet records. Keep the original backup until verification succeeds. A different local database directory can be selected with `LAZER_LOCAL_STATE`; use the same value for setup and development. Hosted custody recovery needs the operator procedure in [deployment](DEPLOYMENT.md), including reconciliation with later chain activity.

For an upgrade, export the solo journal and take a stopped database/seed backup first. Extract the next release into a new directory and read its changelog before restoring state. v1.0.0 preserves both existing SQL migrations and wallet derivation. To roll back, use the prior source and its matching pre-upgrade state after reconciling any later transactions; never replace a seed to silence an error.
