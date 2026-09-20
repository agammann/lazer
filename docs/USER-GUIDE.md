# Using Lazer

[Back to Lazer](../README.md)

> This guide covers the preserved Testnet 4 pilot at `/legacy`. For the current derivatives rebuild, read [the derivatives specification](DERIVATIVES.md).

## Before you start

Use [the hosted app](https://lazer.alx21.chatgpt.site/legacy) and Bitcoin Core running on **Testnet 4**. Testnet 3, signet, regtest, and mainnet are different networks. A test address alone cannot distinguish Testnet 3 from Testnet 4.

Start Bitcoin Core with `-testnet4`, let it synchronize, and create or load a Testnet wallet. Obtain free test coins from a Testnet 4 faucet, such as [coinfaucet.eu](https://coinfaucet.eu/en/btc-testnet4/). Faucet availability and confirmation time vary.

Sign in to Lazer with ChatGPT and choose **Open Alice and Bob accounts**. These are two subaccounts under your own identity. Other visitors receive their own subaccounts. Each starts with 100,000 simulated dUSD and zero test Bitcoin.

## Deposit, trade, and withdraw

1. Select Alice and open **Deposit / Withdraw**. Copy the deposit address shown by your own account. Do not send to an address copied from an example or verification report.
2. In your Testnet 4 Bitcoin Core wallet, send a small amount to that address. For the example below, 100,000 sats is 0.001 BTC. Keep enough test coins in Core for its sending fee.
3. Paste the transaction ID into Lazer's deposit form and check it. Credit requires six confirmations. A broadcast or one confirmation does not yet produce a spendable Lazer balance.
4. As Alice, sell 20,000 sats at 60,000 dUSD per BTC. As Bob, buy the same amount at that price. If those orders match, the trade is worth 12 dUSD. The public book uses price and time priority, so another order can fill first or produce a partial fill.
5. In Bob's external Bitcoin Core wallet, create a new receiving address. Select Bob in Lazer and request a withdrawal, for example 15,000 sats. His available balance must cover the withdrawal plus the displayed fee.
6. Review the destination, amount, and fee before confirming. Follow the transaction in **Transfers** and in Bitcoin Core. Lazer marks the withdrawal confirmed after six confirmations.

Prices use whole dUSD increments. Orders use multiples of 1,000 sats, from 1,000 to 1,000,000 sats. One Bitcoin is 100,000,000 sats. The chart is reference market data, not a guarantee of an executable price in Lazer's book.

## Orders and transfers

A resting order reserves funds. Cancel its unfilled portion to release the reservation. A partly filled order retains its completed trade and releases only the remaining reservation.

Pending transfers are checked in rotation approximately every minute while the page is visible. You can also refresh them manually. Closing the page stops those automatic checks; there is no unattended server chain monitor in this release.

A prepared withdrawal already has its amount and fee reserved and its signed transaction stored. Use its existing retry action after a failed or uncertain broadcast. That action retries the same transaction rather than charging the account again. Do not create another withdrawal to work around an ambiguous response.

Use the activity export to retain an account record. An export does not contain wallet keys and cannot restore the operator's wallet or full database.

## Troubleshooting

| Symptom | What to check |
| :--- | :--- |
| Deposit still pending | Confirm the sending wallet is on Testnet 4, the transaction pays your displayed deposit address, and it has six confirmations. |
| Address rejected | Use an external Testnet address. Mainnet and Lazer's own deposit or treasury destinations are rejected for withdrawals. |
| Not enough available funds | Open orders reserve balances. A withdrawal also requires its network fee. |
| Withdrawal cannot find eligible inputs | Treasury change must reach six confirmations before reuse, even when your account has a balance. |
| Broadcast succeeded but explorer cannot find it yet | Allow indexing time and refresh the existing transfer. Do not assume a missing explorer result means failure. |
| Too many requests | Wait one minute before retrying. The limit is 30 new requests per identity per minute. |
| Trading paused or ledger frozen | Stop submitting new actions and contact the repository maintainer. The operator must reconcile the ledger and chain state. |

For an independent receipt check with Bitcoin Core, follow the [verification guide](VERIFICATION.md#verify-a-public-testnet-receipt).
