# Releases and support

[Back to Lazer](../README.md)

v1.0.0 is the MIT source release of the practice app and developer starter. The public website is maintained separately; publishing a GitHub release does not deploy Sites or change its database.

## Install a source release

Download `lazer_1.0.0_source.zip`, its `.sha256` file, `release-manifest.json` and `SHA256SUMS` from the tagged GitHub release. Check the ZIP and manifest hashes against `SHA256SUMS` before extraction. PowerShell users can use `Get-FileHash -Algorithm SHA256`; Unix users can use `sha256sum -c SHA256SUMS` with those files in the same directory.

Extract into a new directory and open `lazer-1.0.0`. Use Node.js 24.19.0 and npm 12.2.0, then follow [local setup](DEVELOPMENT.md). No LLM, provider API key or faucet coins are needed for practice. Browser verification downloads Chromium once. Bitcoin Core and LND are optional for their separate protocol harnesses.

The ZIP contains the exact committed source, lockfile, MIT license and upstream notices. It excludes installed dependencies, builds, wallet seeds, local databases, browser profiles and backups. The manifest identifies the version, source commit and tree. Linux and Windows CI install and check both the source checkout and a freshly extracted source ZIP. The publisher guards the checked main commit, tag and complete asset digests before publishing an immutable release.

## Update and recover

Read the changelog, export the solo journal and follow the stopped database/seed backup procedure in [development](DEVELOPMENT.md). Keep the previous source and matching state until the upgrade is verified. Never rewrite an applied SQL migration, wallet seed or storage namespace as an update shortcut.

## Get help or build on it

Report reproducible bugs at [GitHub Issues](https://github.com/agammann/lazer/issues) with the Lazer version, operating system, Node/npm versions, route, expected and observed behavior, and sanitized error text. Keep seeds, private keys, cookies, account data and database backups private. Start developer changes with [CONTRIBUTING](../CONTRIBUTING.md) and the documented practice engine/API tests.
