# Shared test rooms

[Open shared rooms](https://lazer.alx21.chatgpt.site/market) · [Back to Lazer](../README.md)

Two different people can now trade a BTC/USD test scenario against each other. The server saves the room, matches orders and calculates balances. Each role starts with 1,000,000 **practice sats**. These are not Lightning funds and cannot be withdrawn.

## Trade together

1. Sign in with ChatGPT and choose **Open my room**. You become Alice. This reopens the same room on future visits; it does not reset your history.
2. Give the room code to your trading partner. Treat it as an invitation: the first other signed-in person to use **Join as Bob** claims that role permanently. No email or account identifier is displayed to your partner.
3. Your partner signs in with their own account, enters the code, and chooses **Join as Bob**. One identity cannot control both roles. A second browser tab with the same sign-in still represents the same person.
4. Alice places a long: $60,000, 100 contracts, 2×. Bob places the matching short. Each reserves 83,334 practice sats. Refresh if the other person's change has not appeared yet.
5. Alice presses **Price +5%**. The server moves the scenario to $63,000. Bob can see the result but cannot move the scenario price.
6. Either participant selects **Settle both sides**. Alice finishes with 1,007,936 practice sats and Bob with 992,064. This bilateral test settlement closes the whole pair, not just one participant's exposure.
7. Export a snapshot for your records. Reopening or refreshing the room retrieves its authoritative state from the server. Bob should keep the code and use **Join as Bob** to reopen the room; joining again does not reset it.

The solo terminal at `/` remains useful for testing both roles yourself without signing in. Its browser journal and balances are separate from shared rooms. There is no import into a shared room and no conversion of existing Testnet balances.

## Consistency and access

- Signed-in identity determines the trader on the server. Supplying a different trader, balance or whole market state cannot change the authoritative account.
- Only the two participants can read or mutate a room. A room code is a one-time invitation to the open Bob slot; once filled, other identities cannot join or view it.
- Each accepted mutation saves membership, market state, and its request receipt in a single conditional database update. A revision check rejects stale trade/price submissions rather than silently trading against a different state.
- After a transport failure the UI offers **Retry same request** and disables new mutations until that request is resolved. Duplicate accepted requests do not create duplicate orders. Reusing a request ID with a different payload is rejected.
- Creator room creation is idempotent even across concurrent requests. A crash between creating its index and initial state can be recovered by reopening the room.
- Reads refresh every five seconds while the page is visible. A slower response cannot replace a newer revision of the same room. Clicking **Refresh** fetches immediately.
- Limits: one created room per identity; 30 writes and 60 reads per minute per identity; request body 4 KB; 1,000 accepted actions per room, plus the practice engine's order/position/event limits. Full rooms remain readable/exportable, but cannot accept further actions. There is currently no room reset, deletion, or participant replacement.

## Storage and deployment

`/api/derivatives` stores new rows in the existing D1 `exchange_sessions` table. Keys start with `derivatives-owner-v1:` and `derivatives-room-v1:`. The legacy `lazer-testnet4-v2` row and wallet seed are not used by this API. Existing migrations already create the tables; there is no destructive database migration.

Production identity comes from the Sites authentication gateway through `app/chatgpt-auth.ts`. Self-hosting must install a trusted authentication gateway that strips visitor-supplied identity headers and sets verified ones. **Do not expose a raw local Worker with those headers trusted.** Local automated tests inject explicit fictional identities through a test-only module; there is no production debug-login endpoint.

Run `npm test` to exercise the actual route handlers against local D1 SQL. Shared-market tests cover identity isolation, competing joins, exact settlement, duplicate requests, stale commands, cancellation ownership, rate limits, and reopening the same database after disposing and recreating its runtime. This is local integration evidence; it does not substitute for a two-person production sign-in test.

## Lightning boundary

Lightning is Lazer's only planned funding network. The Bitcoin Core/LND regtest payment harness remains available and its previous successful payment evidence is retained. These shared rooms are deliberately unfunded: there is no deposit endpoint, withdraw endpoint, fake payment confirmation, or mainnet switch.

The next funded test milestone requires an independently operated LND service and a durable collateral ledger: bind each invoice to an account, credit only node-confirmed settlement once, reconcile missed settlements, reserve withdrawals and fees before payment, and recover unknown/in-flight payments after restart. An invoice parser alone does not provide any of these guarantees. Continuous pricing, perpetual funding, independent close orders, liquidation and liquidity operations also remain required before a live derivatives market.
