import { getChatGPTUser } from '@/app/chatgpt-auth';
import { MarketError, marketRateLimit, ownRoom, createRoom, readRoom, changeRoom } from '@/lib/shared-market';
export const dynamic = 'force-dynamic';
const result = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
async function identity() { const user = await getChatGPTUser(); if (!user) throw new MarketError('Sign in to use shared test rooms.', 401); return user.userId; }
function failure(error: unknown) { return result({ error: error instanceof MarketError ? error.message : error instanceof Error && /practice|contracts|margin|Price|order|position|leverage|trader|long|short/i.test(error.message) ? error.message : 'Market request failed. Refresh and retry.' }, error instanceof MarketError ? error.status : 400); }
export async function GET(req: Request) {
  try {
    const owner = await identity(); await marketRateLimit(owner, true);
    const id = new URL(req.url).searchParams.get('room') || await ownRoom(owner);
    return result({ authenticated: true, room: id ? await readRoom(id, owner) : null });
  } catch (error) { return failure(error); }
}
async function body(req: Request) {
  const reader = req.body?.getReader(); if (!reader) throw new MarketError('Missing request body.');
  let length = 0; const chunks: Uint8Array[] = [];
  while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 4096) { await reader.cancel(); throw new MarketError('Request is too large.', 413); } chunks.push(part.value); }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MarketError('Expected a market command.');
  return value;
}
export async function POST(req: Request) {
  try {
    if (req.headers.get('origin') !== new URL(req.url).origin) throw new MarketError('Requests must originate from Lazer.', 403);
    if (!req.headers.get('content-type')?.startsWith('application/json')) throw new MarketError('Expected JSON.', 415);
    const owner = await identity(), input = await body(req); await marketRateLimit(owner);
    return result({ authenticated: true, room: input.action === 'create' ? await createRoom(owner) : await changeRoom(owner, input) });
  } catch (error) { return failure(error); }
}
