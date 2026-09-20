/** Deterministic practice market. No deposits, withdrawals, or redeemable balances. */
export type Trader = 'Alice' | 'Bob';
export type Direction = 'long' | 'short';
export type Order = { id: number; trader: Trader; side: Direction; price: number; quantity: number; remaining: number; leverage: number };
export type Position = { id: number; long: Trader; short: Trader; quantity: number; entry: number; longMargin: number; shortMargin: number; status: 'open' | 'closed'; exit?: number; pnl?: number; reason?: 'manual' | 'liquidation' };
export type Event = { seq: number; message: string; price: number };
export type Practice = { version: 1; mode: 'practice'; price: number; seq: number; balances: Record<Trader, number>; orders: Order[]; positions: Position[]; events: Event[]; prices: number[] };
export type Command = { action: 'place'; trader: Trader; side: Direction; price: number; quantity: number; leverage: number } | { action: 'cancel'; trader: Trader; orderId: number } | { action: 'close'; trader: Trader; positionId: number } | { action: 'mark'; price: number };
export const START_SATS = 1_000_000;
const SATS = BigInt(100_000_000);
const B = BigInt;
function integer(value: number, min: number, max: number, label: string) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw Error(`${label} must be a whole number from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}.`);
}
function actor(trader: Trader) { if (trader !== 'Alice' && trader !== 'Bob') throw Error('Choose Alice or Bob.'); }
function priceCheck(price: number) { integer(price, 1_000, 1_000_000, 'Price'); }
function ceil(n: bigint, d: bigint) { return Number((n + d - B(1)) / d); }

/** One contract is $1 of inverse BTC/USD exposure; all balances remain integer sats. */
export function margin(quantity: number, price: number, leverage: number) {
  integer(quantity, 1, 10_000, 'Contracts'); priceCheck(price); integer(leverage, 1, 5, 'Leverage');
  return ceil(B(quantity) * SATS, B(price) * B(leverage));
}
export function longPnl(quantity: number, entry: number, exit: number) {
  integer(quantity, 1, 10_000, 'Contracts'); priceCheck(entry); priceCheck(exit);
  // Round once toward zero, then negate for the counterparty: conservation is exact.
  return Number(B(quantity) * SATS * (B(exit) - B(entry)) / (B(entry) * B(exit)));
}
export function maintenance(position: Position) { return ceil(B(position.quantity) * SATS, B(position.entry) * B(100)); }
export function pnlAt(position: Position, price: number) {
  return Math.max(-position.longMargin, Math.min(position.shortMargin, longPnl(position.quantity, position.entry, price)));
}
export function liquidationPrice(position: Position, side: Direction) {
  const k = position.quantity * 100_000_000, reserve = maintenance(position);
  const denominator = k / position.entry + (side === 'long' ? position.longMargin - reserve : reserve - position.shortMargin);
  return denominator > 0 ? k / denominator : null;
}
export function account(state: Practice, trader: Trader) {
  actor(trader);
  const orderMargin = state.orders.filter(o => o.trader === trader && o.remaining > 0).reduce((sum, o) => sum + margin(o.remaining, o.price, o.leverage), 0);
  const open = state.positions.filter(p => p.status === 'open');
  const positionMargin = open.reduce((sum, p) => sum + (p.long === trader ? p.longMargin : p.shortMargin), 0);
  const unrealized = open.reduce((sum, p) => sum + (p.long === trader ? 1 : -1) * pnlAt(p, state.price), 0);
  return { balance: state.balances[trader], available: state.balances[trader] - orderMargin - positionMargin, orderMargin, positionMargin, unrealized, realized: state.balances[trader] - START_SATS };
}
export function freshPractice(): Practice {
  return { version: 1, mode: 'practice', price: 60_000, seq: 0, balances: { Alice: START_SATS, Bob: START_SATS }, orders: [], positions: [], events: [], prices: [60_000] };
}
function event(state: Practice, message: string) { state.events.push({ seq: ++state.seq, message, price: state.price }); }
function settle(state: Practice, position: Position, reason: 'manual' | 'liquidation') {
  const pnl = pnlAt(position, state.price);
  state.balances[position.long] += pnl; state.balances[position.short] -= pnl;
  Object.assign(position, { status: 'closed', exit: state.price, pnl, reason });
  event(state, `Position ${position.id} settled at $${state.price}: ${position.long} ${pnl >= 0 ? '+' : ''}${pnl} sats; ${position.short} ${-pnl >= 0 ? '+' : ''}${-pnl} sats (${reason}).`);
}
function liquidate(state: Practice) {
  for (const p of state.positions.filter(p => p.status === 'open')) {
    const pnl = longPnl(p.quantity, p.entry, state.price), min = maintenance(p);
    if (p.longMargin + pnl <= min || p.shortMargin - pnl <= min) settle(state, p, 'liquidation');
  }
}
export function assertPractice(state: Practice) {
  if (state.version !== 1 || state.mode !== 'practice') throw Error('Unsupported practice state.');
  priceCheck(state.price);
  for (const trader of ['Alice', 'Bob'] as const) {
    integer(state.balances[trader], 0, START_SATS * 2, 'Balance');
    if (account(state, trader).available < 0) throw Error(`${trader} has insufficient available practice sats for this order or execution price.`);
  }
  if (state.balances.Alice + state.balances.Bob !== START_SATS * 2) throw Error('Practice collateral is not conserved.');
}
/** Copy before mutation, so rejected orders cannot leave partial fills or reservations. */
export function applyPractice(current: Practice, command: Command): Practice {
  assertPractice(current);
  const state: Practice = structuredClone(current);
  if (state.events.length >= 2_000) throw Error('This practice session is full. Export the journal and start a new local session.');
  if (command.action === 'place') {
    actor(command.trader);
    if (command.side !== 'long' && command.side !== 'short') throw Error('Choose long or short.');
    margin(command.quantity, command.price, command.leverage);
    if (state.orders.filter(o => o.remaining).length >= 100 || state.positions.length >= 500) throw Error('Practice order or position capacity reached.');
    const order: Order = { id: ++state.seq, trader: command.trader, side: command.side, price: command.price, quantity: command.quantity, remaining: command.quantity, leverage: command.leverage };
    state.orders.push(order);
    // Reserve the entire resting limit order before considering executions.
    assertPractice(state);
    const makers = state.orders.filter(o => o.id !== order.id && o.remaining > 0 && o.trader !== order.trader && o.side !== order.side && (order.side === 'long' ? o.price <= order.price : o.price >= order.price))
      .sort((a, b) => (order.side === 'long' ? a.price - b.price : b.price - a.price) || a.id - b.id);
    for (const maker of makers) {
      if (!order.remaining) break;
      if (state.positions.length >= 500) throw Error('Practice position capacity reached.');
      const quantity = Math.min(order.remaining, maker.remaining), entry = maker.price;
      const long = order.side === 'long' ? order : maker, short = order.side === 'short' ? order : maker;
      const p: Position = { id: ++state.seq, long: long.trader, short: short.trader, quantity, entry, longMargin: margin(quantity, entry, long.leverage), shortMargin: margin(quantity, entry, short.leverage), status: 'open' };
      maker.remaining -= quantity; order.remaining -= quantity; state.positions.push(p);
      assertPractice(state);
      event(state, `${p.long} long / ${p.short} short: ${quantity} contracts at $${entry}. Position ${p.id}.`);
    }
    if (order.remaining) event(state, `${order.trader} placed ${order.remaining} ${order.side} contracts at $${order.price}. Order ${order.id}.`);
    liquidate(state);
  } else if (command.action === 'cancel') {
    actor(command.trader);
    const order = state.orders.find(o => o.id === command.orderId && o.trader === command.trader && o.remaining > 0);
    if (!order) throw Error('Open order not found for this trader.');
    order.remaining = 0; event(state, `${command.trader} canceled order ${order.id}.`);
  } else if (command.action === 'close') {
    actor(command.trader);
    const p = state.positions.find(p => p.id === command.positionId && p.status === 'open' && (p.long === command.trader || p.short === command.trader));
    if (!p) throw Error('Open position not found.');
    // This lab settles BOTH sides together at the scenario mark. It is not a live exit order.
    settle(state, p, 'manual');
  } else if (command.action === 'mark') {
    priceCheck(command.price); state.price = command.price;
    state.prices = [...state.prices.slice(-119), command.price];
    event(state, `Scenario price changed to $${command.price}.`); liquidate(state);
  } else throw Error('Unknown practice command.');
  state.orders = state.orders.filter(o => o.remaining > 0);
  assertPractice(state); return state;
}
