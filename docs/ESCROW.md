# BTC for ETH escrow

[Back to Lazer](../README.md)

## Selected product model

Alice sells Bitcoin. Bob pays Alice in native ETH on Ethereum. Each trade locks Bitcoin in a native SegWit two of three multisignature output. Alice, Bob, and the Lazer operator hold independent keys. The operator uses a separate Bitcoin Core wallet and can participate in a disputed release or refund, but cannot spend alone.

ETH is sent directly to Alice. It is not held in a second escrow, and the exchange is not an atomic swap. Two key holders can authorize a Bitcoin spend, including outside Lazer; the Bitcoin script cannot evaluate an Ethereum receipt. The application's payment verifier is an additional policy check, not a cross chain consensus rule. Collusion between two signers, unavailable signers, and arbitration errors remain material risks.

## What is available now

| Component | Status |
| :--- | :--- |
| Bitcoin contract and PSBT validation | Implemented with tests |
| Independent Bitcoin Core signing | Release and refund verified on regtest, with six confirmations |
| Operator acting alone | Rejected by the two signature threshold |
| Native ETH verification | Implemented with fixture tests |
| Public Sepolia ETH settlement | Not yet verified |
| Complete escrow website and participant onboarding | Not yet implemented |
| Mainnet execution | Disabled |

The existing public website remains the earlier Testnet 4 order book. These tools are a separate developer and operator workflow. They do not read its wallet seed, migrate its funds, or use simulated dUSD.

The [recorded Core result](evidence/escrow-regtest.json) contains local regtest transactions. Those IDs will not appear on a public explorer.

## Bitcoin design

A contract includes the trade ID, three public keys, the seller's refund address, the buyer's receiving address, the trade amount, and an agreed fixed miner fee. The seller funds exactly the trade amount plus that fee. Release sends the trade amount to the buyer; refund sends it to the seller. The remainder is the miner fee. There is no platform fee in this implementation.

The tools validate six Bitcoin confirmations, the exact unspent output, and the selected chain. They reject changed settlement inputs, destinations, values, fees, signing policies, foreign signatures, and invalid signatures. Every accepted signature must cover the whole transaction using `SIGHASH_ALL`.

Use fresh Bitcoin keys for every trade. Reusing the same three public keys produces the same escrow address even if the trade ID differs. The pure protocol library does not maintain a global trade registry or prevent a human from reusing those keys. The future coordinator must enforce key and funding outpoint uniqueness.

Core descriptor wallets need the public key's derivation path and master fingerprint to locate their signing key. These are exported as public metadata by the helper; private keys are never exported.

There is no automatic timed refund. A plain two of three output always requires two signatures. The Ethereum payment deadline does not change the Bitcoin script. Participants need a defined process for disputes, unavailable signers, backups, and recovery before a mainnet rollout.

## Ethereum policy

The intended mainnet payment is native ETH on Ethereum, not WETH or an ERC20 token. Current tools accept only Sepolia, chain ID 11155111, or a local chain with ID 31337 paired with Bitcoin regtest.

Amounts are decimal integer strings in wei. One ETH is 1,000,000,000,000,000,000 wei. The verifier requires:

1. The selected Ethereum chain.
2. The exact buyer and seller addresses and exact native ETH value.
3. A successful receipt in the canonical block.
4. An inclusion block at or below the node's finalized block.
5. A block timestamp inside the agreed payment window.
6. The trade's unique reference in the transaction data.
7. A plain receiving account with no contract or delegation code at the payment block.

The transaction data commits to the Bitcoin terms and Ethereum payment terms. An ordinary transfer with empty data will not satisfy this protocol, even if its value matches. Token transfers, payments from an unexpected sender, and contract recipients are not supported in this first version.

The verifier trusts the configured Ethereum node. It does not independently prove Ethereum consensus. A successful ETH check alone does not move Bitcoin. The CLI rechecks payment and Bitcoin funding when preparing and combining a release. Refund decisions require human review; the program cannot prove that no ETH payment exists.

Do not pay before independently checking confirmed Bitcoin funding. Do not send a late or unreferenced ETH payment. The tools cannot reverse ETH transfers or automatically refund them. Do not sign conflicting release and refund transactions for the same escrow.

## Configuration

Run from the repository root after `npm ci` and `npm test`. The test command builds the protocol modules into ignored `work/`.

Set these variables privately in your terminal:

| Variable | Purpose |
| :--- | :--- |
| `BITCOIN_CLI` | Path to the Bitcoin Core CLI, or leave unset if on PATH |
| `CORE_DATADIR` | The selected test node's data directory |
| `CORE_RPC_PORT` | Its RPC port when different from Core's default |
| `ETH_RPC_URL` | Your Sepolia RPC endpoint; HTTPS required except on loopback |

For the separate regtest harness, use `CORE_REGTEST_DATADIR` and `CORE_REGTEST_PORT` instead, as described in [verification](VERIFICATION.md#bitcoin-core-regtest).

Keep node RPC private. Never put an Ethereum RPC access key in a committed file, browser input, issue, or shared terminal output. The ETH helper only permits read methods; it cannot sign or send Ethereum transactions.

## Prepare participant keys

Each participant runs this against their own loaded test wallet. The operator does the same against the separate arbitrator wallet:

```sh
node scripts/escrow-cli.mjs core-key testnet4 YOUR_WALLET work/participant-key.json
```

This generates a new test receiving key and exports its address, public key, and key origin. It does not export private keys. Share the public information with the other participants over an authenticated channel. Each participant must independently verify the final saved contract; a website showing an address is not sufficient agreement.

Use `regtest` in place of `testnet4` when running against an isolated local chain.

## Create a trade

Create a private local terms file shaped like this. Replace every placeholder with the participants' verified public data. Replace the timestamps with the agreed Unix seconds; the payment window must be positive and at most seven days.

```json
{
  "bitcoin": {
    "tradeId": "YOUR_UNIQUE_TRADE_ID",
    "network": "testnet4",
    "sellerPubkey": "SELLER_COMPRESSED_PUBLIC_KEY",
    "buyerPubkey": "BUYER_COMPRESSED_PUBLIC_KEY",
    "arbitratorPubkey": "OPERATOR_COMPRESSED_PUBLIC_KEY",
    "keyOrigins": [
      {"pubkey": "SELLER_COMPRESSED_PUBLIC_KEY", "masterFingerprint": "SELLER_FINGERPRINT", "path": "SELLER_DERIVATION_PATH"},
      {"pubkey": "BUYER_COMPRESSED_PUBLIC_KEY", "masterFingerprint": "BUYER_FINGERPRINT", "path": "BUYER_DERIVATION_PATH"},
      {"pubkey": "OPERATOR_COMPRESSED_PUBLIC_KEY", "masterFingerprint": "OPERATOR_FINGERPRINT", "path": "OPERATOR_DERIVATION_PATH"}
    ],
    "sellerRefundAddress": "SELLER_TESTNET_ADDRESS",
    "buyerReceiveAddress": "BUYER_TESTNET_ADDRESS",
    "sats": 100000,
    "feeSats": 1000
  },
  "payment": {
    "network": "sepolia",
    "buyerAddress": "BUYER_ETH_ADDRESS_IN_LOWERCASE",
    "sellerAddress": "SELLER_ETH_ADDRESS_IN_LOWERCASE",
    "wei": "1000000000000000",
    "notBefore": 1,
    "expiresAt": 3601
  }
}
```

The numeric values above are an example, not a market quote. Verify Ethereum addresses in the wallet before entering the lowercase form. Check the fee against current test network conditions; there is no automated fee negotiation.

```sh
node scripts/escrow-cli.mjs create work/terms.json work/trade.json
```

All three parties retain and compare their own copy of `trade.json`, including the Bitcoin terms hash, escrow address, ETH payment reference, amounts, and destinations. Output files are created exclusively and never overwritten.

## Fund and pay

Alice sends the contract's exact `fundingSats` to its Bitcoin escrow address from her own wallet. After six confirmations, Bob verifies the funding outpoint using his own Core node:

```sh
node scripts/escrow-cli.mjs payment-request work/trade.json FUNDING_TXID VOUT
```

The output is the Ethereum chain ID, sender, recipient, value in hexadecimal wei, and required transaction data. Bob reviews those fields in his own Ethereum wallet and approves the test payment there. Lazer does not hold his Ethereum key or send the payment for him. Wallets that cannot set transaction data cannot use this initial flow.

After the payment finalizes:

```sh
node scripts/escrow-cli.mjs verify-eth work/trade.json ETH_TXID
node scripts/escrow-cli.mjs prepare work/trade.json release FUNDING_TXID VOUT work/release.json ETH_TXID
```

A pending, reverted, unfinalized, late, or mismatched payment prevents release preparation.

## Sign and combine

The generated intent contains a `psbt` field and a readable review. Copy only the base64 PSBT into a local file such as `work/unsigned.psbt`.

Each signing participant reviews the intent against their saved trade and signs in their own Core wallet. The last `false` argument keeps partial signatures available for independent validation.

PowerShell example:

```powershell
$escrowPsbt = (Get-Content work/release.json -Raw | ConvertFrom-Json).psbt
$escrowSigned = & $env:BITCOIN_CLI -testnet4 "-datadir=$env:CORE_DATADIR" "-rpcport=$env:CORE_RPC_PORT" -rpcwallet=YOUR_WALLET walletprocesspsbt $escrowPsbt true ALL true false | ConvertFrom-Json
$escrowSigned.psbt | Set-Content -Encoding ascii work/your-partial.psbt
```

For that example, set the three environment variables explicitly first. Use `-regtest` with the corresponding node configuration for local testing. Unlock an encrypted wallet privately when needed; do not put a passphrase in a shared command or message.

Inspect each partial transaction:

```sh
node scripts/escrow-cli.mjs inspect work/trade.json work/release.json work/your-partial.psbt
```

After both participants supply their partial signatures:

```sh
node scripts/escrow-cli.mjs combine work/trade.json work/release.json work/alice-partial.psbt work/bob-partial.psbt work/settlement.json
```

The result contains the exact signed Bitcoin transaction and transaction ID. The tools do not broadcast automatically. Review it, test it with your Core node, and broadcast from your own wallet workflow. Signed transactions are spend authorizations; share them only as intended and keep them out of public issues.

For a refund, prepare `refund` instead of `release` and omit the ETH transaction argument. A refund still needs two signatures. The operator must review payment evidence and the dispute before signing; absence of a supplied transaction hash is not proof of nonpayment.

## Reproduce the Core test

Start an isolated Core regtest node using the [node instructions](VERIFICATION.md#bitcoin-core-regtest), then run:

```sh
npm test
npm run test:escrow:core
```

The harness creates independent seller, buyer, and operator wallets on that local test node. It verifies the descriptor address against Core, creates fresh keys per case, mines funding confirmations, signs inside Core without exporting keys, checks mempool acceptance, broadcasts, and verifies six confirmation receipts for release and refund.

All test wallets in this harness share one local machine. That verifies signing compatibility and thresholds, not production isolation of the three key holders. Results go to ignored `work/escrow-regtest-evidence.json`.

## Remaining before public escrow use

The website still needs separate participant enrollment and key ownership verification, persistent trade and dispute records, unique funding and payment claims, protected operator signing procedures, chain monitoring, and recovery handling. The complete Bitcoin Testnet 4 plus Sepolia payment flow needs a public network test. Mainnet remains disabled until those workflows and their operational controls are implemented and reviewed.

Protocol references: [Bitcoin escrow and arbitration](https://developer.bitcoin.org/devguide/contracts.html#escrow-and-arbitration), [Bitcoin Core PSBT signing](https://bitcoincore.org/en/doc/30.0.0/rpc/wallet/walletprocesspsbt/), and [Ethereum JSON RPC](https://ethereum.org/en/developers/docs/apis/json-rpc/).
