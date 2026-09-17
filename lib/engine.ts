export type Person = 'Alice' | 'Bob';
export type Side = 'buy' | 'sell';
export type Account = { id: string; person: Person; sats: number; usd: number; address: string; script: string };
export type Order = { id: string; account: string; person: Person; seq: number; side: Side; price: number; quantity: number; remaining: number; createdAt: string; cancelled: boolean };
export type Trade = { id: string; seq: number; buyer: string; seller: string; price: number; sats: number; usd: number; createdAt: string };
export type Coin = { id: string; txid: string; vout: number; sats: number; account: string; script: string; spentBy?: string };
export type Deposit = { id: string; account: string; txid: string; sats: number; confirmations: number; credited: boolean; checkedAt: string };
export type Withdrawal = { id: string; account: string; address: string; sats: number; fee: number; txid: string; raw: string; inputs: string[]; change: number; createdAt: string; status: 'prepared' | 'broadcast' | 'confirmed'; confirmations: number };
export type State = { version: 2; sequence: number; walletId: string; accounts: Record<string, Account>; orders: Order[]; trades: Trade[]; coins: Coin[]; deposits: Deposit[]; withdrawals: Withdrawal[]; commands: { id: string; payload: string; time: number }[]; events: { seq: number; time: string; text: string; accounts: string[] }[]; frozen: string | null };
export const START_USD = 100_000 * 1_000_000;
export const btc = (sats: number) => (sats / 100_000_000).toFixed(8);
// Whole dollar price ticks and 1,000 satoshi lots make microdollar accounting exact.
export const quote = (price: number, sats: number) => price * sats / 100;
export function fresh(): State { return { version: 2, sequence: 0, walletId: '', accounts: {}, orders: [], trades: [], coins: [], deposits: [], withdrawals: [], commands: [], events: [], frozen: null }; }
export function integer(value: unknown, min: number, max: number, name: string): asserts value is number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw Error(`${name} must be a whole number between ${min} and ${max}.`); }
export function participant(value: unknown): asserts value is Person { if (value !== 'Alice' && value !== 'Bob') throw Error('Select Alice or Bob.'); }
export function event(s: State, text: string, accounts: string[], now: string) { s.events.push({ seq: ++s.sequence, time: now, text, accounts }); s.events = s.events.slice(-1000); }
export function account(s: State, id: string) { const a = s.accounts[id]; if (!a) throw Error('Open your trading accounts first.'); return a; }
export function balance(s: State, id: string) { const a = account(s, id); let reservedSats = 0, reservedUSD = 0; for (const o of s.orders) if (o.account === id && !o.cancelled) { if (o.side === 'buy') reservedUSD += quote(o.price, o.remaining); else reservedSats += o.remaining; } return { sats: a.sats, usd: a.usd, reservedSats, reservedUSD, availableSats: a.sats - reservedSats, availableUSD: a.usd - reservedUSD }; }
export function openAccount(s: State, a: Account, walletId: string) { if (s.walletId && s.walletId !== walletId) throw Error('Wallet configuration changed. Restore the original wallet secret.'); if (s.accounts[a.id]) return; if (Object.keys(s.accounts).length >= 200) throw Error('The Testnet pilot has reached its account capacity.'); s.walletId = walletId; s.accounts[a.id] = { ...a, sats: 0, usd: START_USD }; }
export function place(s: State, id: string, side: Side, price: number, sats: number, now: string) {
 if (s.frozen) throw Error(s.frozen); const a = account(s, id); if (side !== 'buy' && side !== 'sell') throw Error('Choose buy or sell.'); integer(price, 1, 1_000_000, 'Price'); integer(sats, 1000, 1_000_000, 'Satoshis'); if (sats % 1000) throw Error('Use lots of 1,000 satoshis.');
 const b = balance(s, id); if (side === 'buy' ? quote(price, sats) > b.availableUSD : sats > b.availableSats) throw Error(side === 'buy' ? 'Not enough available simulated USD.' : 'Deposit confirmed Testnet Bitcoin before selling.');
 if (s.orders.filter(o => o.remaining && !o.cancelled).length >= 500) throw Error('Order book capacity reached. Cancel an open order first.');
 const o: Order = { id: crypto.randomUUID(), account: id, person: a.person, seq: ++s.sequence, side, price, quantity: sats, remaining: sats, createdAt: now, cancelled: false }; s.orders.push(o);
 const makers = s.orders.filter(x => x.account !== id && !x.cancelled && x.remaining && x.side !== side && (side === 'buy' ? x.price <= price : x.price >= price)).sort((x, y) => (side === 'buy' ? x.price - y.price : y.price - x.price) || x.seq - y.seq);
 for (const maker of makers) { if (!o.remaining) break; const quantity = Math.min(o.remaining, maker.remaining), usd = quote(maker.price, quantity); const buyer = account(s, side === 'buy' ? id : maker.account), seller = account(s, side === 'sell' ? id : maker.account); buyer.usd -= usd; buyer.sats += quantity; seller.usd += usd; seller.sats -= quantity; o.remaining -= quantity; maker.remaining -= quantity; s.trades.push({ id: crypto.randomUUID(), seq: ++s.sequence, buyer: buyer.id, seller: seller.id, price: maker.price, sats: quantity, usd, createdAt: now }); event(s, `${btc(quantity)} tBTC traded at ${maker.price} dUSD. Balances settled.`, [buyer.id, seller.id], now); }
 event(s, `${a.person} placed a ${side} order for ${btc(sats)} tBTC.`, [id], now);
 s.orders = s.orders.filter(x => x.remaining && !x.cancelled || s.orders.indexOf(x) >= s.orders.length - 1000); s.trades = s.trades.slice(-2000);
}
export function cancel(s: State, id: string, orderId: string, now: string) { const o = s.orders.find(x => x.id === orderId && x.account === id); if (!o || o.cancelled || !o.remaining) throw Error('No open order found for this account.'); o.cancelled = true; event(s, 'Unfilled order cancelled. Reserved balance released.', [id], now); }
export type Proof = { txid: string; outputs: { script: string; value: number }[]; confirmations: number; inBestChain: boolean; blockHeight?: number; coinbase?: boolean };
export function creditDeposit(s: State, id: string, proof: Proof, now: string) {
 const a = account(s, id), matched = proof.outputs.map((x, vout) => ({ ...x, vout })).filter(x => x.script === a.script); if (!matched.length) throw Error('This transaction does not pay your deposit address.'); if (proof.coinbase) throw Error('Send a regular wallet transaction. Direct mining rewards are not supported.');
 const depositId = id + ':' + proof.txid; let d = s.deposits.find(x => x.id === depositId); if (!d) { if (s.deposits.length >= 2000) throw Error('Deposit capacity reached for this Testnet pilot. Withdrawals remain available.'); d = { id: depositId, account: id, txid: proof.txid, sats: matched.reduce((n, x) => n + x.value, 0), confirmations: 0, credited: false, checkedAt: now }; s.deposits.push(d); }
 d.confirmations = proof.inBestChain ? proof.confirmations : 0; d.checkedAt = now;
 if (d.credited && d.confirmations < 6) { s.frozen = 'A credited deposit lost confirmations. Trading and withdrawals are paused until backing is verified.'; return; }
 if (d.confirmations < 6 || d.credited) return;
 for (const output of matched) { integer(output.value, 1, 2_100_000_000_000_000, 'Deposit value'); const coinId = `${proof.txid}:${output.vout}`; if (s.coins.some(c => c.id === coinId)) throw Error('This transaction output was already credited.'); s.coins.push({ id: coinId, txid: proof.txid, vout: output.vout, sats: output.value, account: id, script: a.script }); a.sats += output.value; }
 d.credited = true; event(s, `Deposit credited: ${btc(d.sats)} tBTC after ${d.confirmations} confirmations.`, [id], now);
}
export function reserveWithdrawal(s: State, w: Withdrawal, changeScript: string, now: string) {
 if (s.frozen) throw Error(s.frozen); const a = account(s, w.account); integer(w.sats, 1000, 1_000_000, 'Withdrawal satoshis'); integer(w.fee, 1, 100_000, 'Network fee'); if (w.sats + w.fee > balance(s, w.account).availableSats) throw Error('Insufficient available Bitcoin including the network fee.');
 if (s.withdrawals.some(x => x.account === w.account && x.status === 'prepared')) throw Error('Retry your prepared withdrawal before creating another.'); if (s.withdrawals.length >= 2000) throw Error('Withdrawal storage capacity reached. Contact the operator.');
 if (!w.inputs.length || new Set(w.inputs).size !== w.inputs.length) throw Error('Invalid withdrawal inputs.'); let input = 0;
 for (const key of w.inputs) { const coin = s.coins.find(c => c.id === key); if (!coin || coin.spentBy) throw Error('Wallet changed. Refresh the withdrawal quote.'); input += coin.sats; }
 if (input !== w.sats + w.fee + w.change) throw Error('Withdrawal accounting mismatch.');
 a.sats -= w.sats + w.fee; for (const key of w.inputs) s.coins.find(c => c.id === key)!.spentBy = w.id;
 if (w.change) s.coins.push({ id: `${w.txid}:1`, txid: w.txid, vout: 1, sats: w.change, account: 'treasury', script: changeScript }); s.withdrawals.push(w); event(s, `Withdrawal prepared: ${btc(w.sats)} tBTC plus ${w.fee} sat fee.`, [w.account], now);
}
export function invariant(s: State) {
 let liabilities = 0, usd = 0; for (const a of Object.values(s.accounts)) { const b = balance(s, a.id); for (const v of [a.sats, a.usd, b.availableSats, b.availableUSD]) if (!Number.isSafeInteger(v) || v < 0) throw Error('Balance invariant violated.'); liabilities += a.sats; usd += a.usd; }
 if (usd !== Object.keys(s.accounts).length * START_USD) throw Error('USD conservation violated.'); if (liabilities !== s.coins.filter(c => !c.spentBy).reduce((n, c) => n + c.sats, 0)) throw Error('Bitcoin conservation violated.');
}
export function applyCommand(original: State, id: string, payload: string, mutate: (s: State) => void): State { const old = original.commands.find(x => x.id === id); if (old) { if (old.payload !== payload) throw Error('Request identifier was reused for another action.'); return original; } const next = structuredClone(original); mutate(next); invariant(next); next.commands = next.commands.filter(x => x.time > Date.now() - 86_400_000); next.commands.push({ id, payload, time: Date.now() }); if (JSON.stringify(next).length > 1_800_000) throw Error('Testnet pilot storage limit reached. Contact the operator.'); return next; }
