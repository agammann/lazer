import { identity, readState, changeState, view, seed, rateLimit } from '@/lib/store';
import { openAccount, participant, place, cancel, creditDeposit, reserveWithdrawal, balance, type State } from '@/lib/engine';
import { accountId, wallet, walletId, transactionProof, eligibleCoins, prepareWithdrawal, broadcast, api, testnetAddress } from '@/lib/bitcoin';
export const dynamic = 'force-dynamic';
function result(value: unknown, status = 200) { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); }
export async function GET() { try { const owner = await identity(true), s = await readState(); return result(view(s.state, owner, s.revision)); } catch { return result({ error: 'Trading service is temporarily unavailable. Please retry.' }, 503); } }
async function readBody(req: Request) { const reader = req.body?.getReader(); if (!reader) throw Error('Missing request body.'); let size = 0; const chunks: Uint8Array[] = []; while (true) { const x = await reader.read(); if (x.done) break; size += x.value.length; if (size > 4096) { await reader.cancel(); throw Error('Request is too large.'); } chunks.push(x.value); } return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
export async function POST(req: Request) {
 try {
  if (req.headers.get('origin') !== new URL(req.url).origin) return result({ error: 'Requests must originate from Lazer.' }, 403);
  if (!req.headers.get('content-type')?.startsWith('application/json')) return result({ error: 'Expected JSON.' }, 415);
  const owner = (await identity())!, body = await readBody(req), now = new Date().toISOString();
  if (typeof body.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId)) throw Error('Invalid request identifier.');
  const commandId = accountId(owner, body.requestId), payload = JSON.stringify(body), current = await readState();
  const receipt = current.state.commands.find(x => x.id === commandId);
  if (receipt) { if (receipt.payload !== payload) throw Error('Request identifier was reused for another action.'); return result(view(current.state, owner, current.revision)); }
  if (!Number.isSafeInteger(body.issuedAt) || Math.abs(Date.now() - body.issuedAt) > 300_000) throw Error('Request expired. Refresh and try again.');
  await rateLimit(owner);
  let mutate: (s: State) => void;
  const secret = seed(), fingerprint = walletId(secret); if (current.state.walletId && fingerprint !== current.state.walletId) throw Error('Wallet configuration changed. Contact the operator.');
  if (body.action === 'open') {
   const accounts = (['Alice','Bob'] as const).map(person => { const id = accountId(owner, person), w = wallet(secret, id); return { id, person, address: w.address, script: w.script, sats: 0, usd: 0 }; });
   mutate = s => { for (const a of accounts) openAccount(s, a, fingerprint); };
  } else {
   participant(body.person); const id = accountId(owner, body.person); if (!current.state.accounts[id]) throw Error('Open your accounts first.');
   if (body.action === 'place') { await eligibleCoins(current.state); mutate = s => place(s, id, body.side, body.price, body.sats, now); }
   else if (body.action === 'cancel') mutate = s => cancel(s, id, body.orderId, now);
   else if (body.action === 'deposit') {
    const proof = await transactionProof(body.txid); if (!proof) throw Error('Transaction not found on Testnet 4 yet.');
    const already = current.state.deposits.some(d => d.account === id && d.txid === proof.txid && d.credited);
    if (!already) { for (const [vout, output] of proof.outputs.entries()) if (output.script === current.state.accounts[id].script) { const spend = await api(`/tx/${proof.txid}/outspend/${vout}`); if (!spend || spend.spent !== false) throw Error('Deposit output is already spent or cannot be verified.'); } }
    const previous = current.state.deposits.find(d => d.account === id && d.txid === proof.txid), confirmations = proof.inBestChain ? proof.confirmations : 0;
    if (previous && previous.confirmations === confirmations && (previous.credited || confirmations < 6)) return result(view(current.state, owner, current.revision));
    mutate = s => creditDeposit(s, id, proof, now);
   } else if (body.action === 'quote' || body.action === 'withdraw') {
    const destination = testnetAddress(body.address); if (Object.values(current.state.accounts).some(a => a.script === destination.script) || wallet(secret, 'treasury').script === destination.script) throw Error('Withdraw to an external Bitcoin Core wallet, not a Lazer deposit address.');
    const coins = await eligibleCoins(current.state), fees = await api('/v1/fees/recommended'); const rate = Math.min(100, Math.max(1, Math.ceil(fees?.hourFee || 1)));
    const prepared = prepareWithdrawal(secret, coins, id, commandId, destination.address, body.sats, rate, now);
    if (prepared.withdrawal.sats + prepared.withdrawal.fee > balance(current.state, id).availableSats) throw Error('Not enough available Bitcoin including the fee.');
    if (body.action === 'quote') return result({ fee: prepared.withdrawal.fee, sats: body.sats, address: destination.address, rate });
    if (!Number.isSafeInteger(body.feeLimit) || body.feeLimit < prepared.withdrawal.fee || body.feeLimit > 100_000) throw Error('Network fee changed. Request and approve a fresh quote.');
    mutate = s => reserveWithdrawal(s, prepared.withdrawal, prepared.changeScript, now);
   } else if (body.action === 'broadcast' || body.action === 'refreshWithdrawal') {
    const w = current.state.withdrawals.find(w => w.id === body.withdrawalId && w.account === id); if (!w) throw Error('Withdrawal not found for this account.');
    if (body.action === 'broadcast') await broadcast(w);
    const proof = await transactionProof(w.txid);
    const confirmations = proof?.confirmations || 0, status = proof && proof.inBestChain && confirmations >= 6 ? 'confirmed' : proof ? 'broadcast' : 'prepared';
    if (body.action === 'refreshWithdrawal' && w.confirmations === confirmations && w.status === status) return result(view(current.state, owner, current.revision));
    mutate = s => { const target = s.withdrawals.find(x => x.id === w.id)!; target.confirmations = confirmations; target.status = status; };
   } else throw Error('Unknown action.');
  }
  const updated = await changeState(commandId, payload, mutate); return result(view(updated.state, owner, updated.revision));
 } catch (e) { const message = e instanceof Error ? e.message : 'Request failed.'; console.error('Lazer request failed:', message); return result({ error: message }, message.includes('Sign in') ? 401 : 400); }
}
