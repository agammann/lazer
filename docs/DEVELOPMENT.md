# Local development

[Back to Lazer](../README.md)

The derivatives lab at `/` runs without secrets. After `npm ci`, run `npm run dev`. The wallet seed and database instructions below apply to the preserved Testnet pilot at `/legacy`.

See [the derivatives guide](DERIVATIVES.md) for the Lightning harness and funding inspectors.

## Prerequisites

Use Git, Node.js 22.13 or later, and npm. CI uses Node.js 22. Bitcoin Core is optional for the local UI and automated suite, and required for the separate node integration checks.

Run every command below from the repository root. The commands work in PowerShell and typical Unix shells unless labeled otherwise.

```sh
git clone https://github.com/agammann/lazer.git
cd lazer
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
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --file drizzle/0000_abnormal_dragon_lord.sql --persist-to .wrangler/state
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --file drizzle/0001_overconfident_doctor_doom.sql --persist-to .wrangler/state
npm run dev
```

Apply those two SQL files once, in that order, to a fresh local database. They are initialization commands, not an idempotent migration runner. An existing table error means you must inspect the current schema rather than delete data and repeat the setup. Subsequent starts normally require only `npm run dev`.

Open the loopback URL printed by the server, normally `http://localhost:5173`. Sign in using the app's sign in link, then open Alice and Bob. The portable local server supplies a development identity. Hosted Sites supplies real ChatGPT identity through its dispatcher. Local balances and hosted balances are separate.

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
```

The automated suite does not require faucet coins or a live Bitcoin node. For the separate Bitcoin Core integration, see [verification](VERIFICATION.md).

## Common setup problems

| Problem | Resolution |
| :--- | :--- |
| Missing `dist/server/wrangler.json` | Complete `npm run build` before the D1 initialization commands. |
| Missing SQL table | Check that both migrations ran against the same `.wrangler/state` used by the server. |
| Invalid or missing wallet seed | Check the ignored `.dev.vars` file and restart the server. Never paste its contents into an issue. |
| Sign in stays anonymous | Use `npm run dev` on localhost. The built Worker preview does not provide the portable development sign in middleware. |
| Port 5173 is occupied | Stop the conflicting development process, or use the URL printed for an available port. |

Generated bundles, local database files, execution profiles, and test evidence under `work/` stay out of source control.
