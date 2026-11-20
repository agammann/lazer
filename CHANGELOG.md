# Changelog

## 1.0.4

Publication requires a passing dependency audit with zero findings.

- Update Next.js to 16.4.6, beyond the patched 16.4.5 floor for [GHSA-mfr8-8qww-v76h](https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h) and [GHSA-vc7v-qv4w-wrv8](https://github.com/vercel/next.js/security/advisories/GHSA-vc7v-qv4w-wrv8).
- Update Vite to 8.3.8 with a patched Rolldown dependency for [GHSA-p4f5-76q4-ffq7](https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7). The advisory concerns network-exposed development servers.
- Update invoices to 6.3.4 and tiny-secp256k1 to 2.2.5 for [GHSA-hj9c-qx2w-g7mh](https://github.com/advisories/GHSA-hj9c-qx2w-g7mh).
- Correct the required lint and audit instructions and remove a stale consumer test count.

## 1.0.3

- Refresh locked application and local verification dependencies to patched compatible versions, and remove unused form and schema packages.
- Preserve practice and shared-room behavior with passing dependency, unit, build and isolated worker checks.

## 1.0.2

- Require lint in the source and consumer check gate, resolve provider response types and hook findings, and exclude generated verification output.
- Keep the legacy wallet QR tied to its selected account and reject late withdrawal quotes after inputs change, including changes away and back.
- Preserve portable document navigation and use short native runtime paths for shared-room browser verification on Windows.
- Add browser regression coverage for account-specific QR modules and delayed quote responses. Historical funded protocol evidence keeps its original source and scope.

## 1.0.1

- Replace the unbounded brace dependency with a maintained compatibility package that preserves ordinary glob behavior and the upstream license.
- Reject excessive brace, parenthesis and AST-array nesting before stack exhaustion.
- Require dependency audits without accepted advisories and verify the replacement in freshly installed source distributions.

## 1.0.0

- Deliver the Bitcoin derivatives practice app and developer starter as a versioned MIT source package with checksums and an exact source manifest.
- Apply available dependency updates and adapt local database tests and development commands to the current runtime.
- Preserve practice balances when a browser storage write fails, show a clear recovery message, and allow a retry when storage becomes available.
- Add guarded local setup, explicit fresh-database browser workflows, native WebMCP verification, source consumer checks and Linux/Windows release gates.
- Preserve existing wallet derivation, storage namespaces, SQL migrations, protocol harnesses and historical verification evidence.
