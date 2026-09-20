import { env } from 'cloudflare:workers';
import { createHash } from 'node:crypto';
import { applyPractice, freshPractice, account, type Practice, type Command, type Trader } from './derivatives';

type Receipt = { id: string; owner: string; payload: string };
type Room = { version: 1; alice: string; bob: string | null; market: Practice; receipts: Receipt[] };
type Row = { revision: number; state: string };
export class MarketError extends Error { constructor(message: string, public status = 400) { super(message); } }
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const ownerKey = (owner: string) => 'derivatives-owner-v1:' + digest(owner);
const roomKey = (id: string) => 'derivatives-room-v1:' + id;
export function validId(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value); }
function db() { const db = (env as unknown as { DB?: D1Database }).DB; if (!db) throw new MarketError('Market storage is unavailable.', 503); return db; }
async function row(key: string) { return db().prepare('SELECT revision,state FROM exchange_sessions WHERE id=?').bind(key).first<Row>(); }
function role(room: Room, owner: string): Trader | null { return room.alice === owner ? 'Alice' : room.bob === owner ? 'Bob' : null; }
function view(id: string, room: Room, owner: string, revision: number) {
  const trader = role(room, owner); if (!trader) throw new MarketError('Room unavailable for this account.', 403);
  return { id, revision, trader, partnerJoined: !!room.bob, market: room.market, account: account(room.market, trader), funding: 'practice-only' as const };
}
export type SharedView = ReturnType<typeof view>;
export async function marketRateLimit(owner: string, read = false) {
  const result = await db().prepare('INSERT INTO request_limits (id,window,count) VALUES (?,?,1) ON CONFLICT(id) DO UPDATE SET window=excluded.window,count=CASE WHEN request_limits.window=excluded.window THEN request_limits.count+1 ELSE 1 END RETURNING count')
    .bind('derivatives-' + (read ? 'read:' : 'write:') + digest(owner), Math.floor(Date.now() / 60000)).first<{ count: number }>();
  if (!result || result.count > (read ? 60 : 30)) throw new MarketError('Too many requests. Wait a minute before retrying.', 429);
}
export async function ownRoom(owner: string) { const saved = await row(ownerKey(owner)); return saved ? JSON.parse(saved.state).roomId as string : null; }
/** One persistent room per creator. Concurrent creation converges on the same random invite. */
export async function createRoom(owner: string) {
  await db().prepare('INSERT OR IGNORE INTO exchange_sessions (id,revision,state) VALUES (?,0,?)').bind(ownerKey(owner), JSON.stringify({ roomId: crypto.randomUUID() })).run();
  const id = (await ownRoom(owner))!;
  const room: Room = { version: 1, alice: owner, bob: null, market: freshPractice(), receipts: [] };
  await db().prepare('INSERT OR IGNORE INTO exchange_sessions (id,revision,state) VALUES (?,0,?)').bind(roomKey(id), JSON.stringify(room)).run();
  return readRoom(id, owner);
}
export async function readRoom(id: string, owner: string) {
  if (!validId(id)) throw new MarketError('Invalid room code.');
  const saved = await row(roomKey(id)); if (!saved) throw new MarketError('Room unavailable for this account.', 403);
  return view(id, JSON.parse(saved.state), owner, saved.revision);
}
type Input = Record<string, unknown>;
function command(input: Input, trader: Trader, room: Room): Command {
  if ('trader' in input || 'balance' in input || 'market' in input) throw new MarketError('The server assigns the trader and balances.');
  if (input.action === 'mark') {
    if (trader !== 'Alice') throw new MarketError('Only the room creator can advance the test scenario.', 403);
    // The client selects a bounded test step, never an authoritative market price.
    if (input.step !== 'up' && input.step !== 'down' && input.step !== 'reset') throw new MarketError('Choose a scenario step.');
    return { action: 'mark', price: input.step === 'reset' ? 60000 : Math.max(1000, Math.min(1000000, Math.round(room.market.price * (input.step === 'up' ? 1.05 : 0.95)))) };
  }
  if (input.action === 'place') return { action: 'place', trader, side: input.side as 'long' | 'short', price: input.price as number, quantity: input.quantity as number, leverage: input.leverage as number };
  if (input.action === 'cancel') return { action: 'cancel', trader, orderId: input.orderId as number };
  if (input.action === 'close') return { action: 'close', trader, positionId: input.positionId as number };
  throw new MarketError('Unknown market action.');
}
/** Compare-and-swap covers membership, order state and receipts together. No money-moving API. */
export async function changeRoom(owner: string, input: Input) {
  if (!validId(input.roomId) || !validId(input.requestId)) throw new MarketError('Invalid room or request identifier.');
  const id = input.roomId, payload = JSON.stringify(input);
  for (let attempt = 0; attempt < 8; attempt++) {
    const saved = await row(roomKey(id)); if (!saved) throw new MarketError('Room unavailable for this account.', 403);
    const current: Room = JSON.parse(saved.state);
    const receipt = current.receipts.find(r => r.id === input.requestId && r.owner === owner);
    if (receipt) { if (receipt.payload !== payload) throw new MarketError('Request identifier was reused for another action.'); return view(id, current, owner, saved.revision); }
    if (!Number.isSafeInteger(input.issuedAt) || Math.abs(Date.now() - Number(input.issuedAt)) > 300000) throw new MarketError('Request expired. Refresh the room and try again.');
    if (current.receipts.length >= 1000) throw new MarketError('This bounded test room is full. Export its journal; continue scenarios in solo practice.');
    const next: Room = structuredClone(current);
    if (input.action === 'join') {
      if (current.alice === owner) throw new MarketError('A second signed-in person must join as Bob.');
      if (current.bob && current.bob !== owner) throw new MarketError('Room unavailable for this account.', 403);
      if (current.bob === owner) return view(id, current, owner, saved.revision);
      next.bob = owner;
    } else {
      const trader = role(current, owner); if (!trader) throw new MarketError('Room unavailable for this account.', 403);
      if (input.revision !== saved.revision) throw new MarketError('The room changed. Refresh before submitting again.', 409);
      next.market = applyPractice(current.market, command(input, trader, current));
    }
    next.receipts.push({ id: input.requestId, owner, payload });
    const updated = await db().prepare('UPDATE exchange_sessions SET state=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(next), roomKey(id), saved.revision).run();
    if (updated.meta.changes === 1) return view(id, next, owner, saved.revision + 1);
  }
  throw new MarketError('Market busy. Refresh and retry.', 409);
}
