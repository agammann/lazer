"use client";
import { useEffect, useRef, useState } from 'react';
import { Zap, Users, RefreshCw } from 'lucide-react';
import { PracticeChart } from '@/components/practice-chart';
import { margin, pnlAt } from '@/lib/derivatives';
import type { SharedView } from '@/lib/shared-market';
import '../practice.css';
import './shared.css';

const num = (n: number) => n.toLocaleString('en-US');
type Pending = Record<string, unknown>;
type Reply = { room: SharedView | null; error?: string };
export default function SharedMarket() {
  const [room, setRoom] = useState<SharedView | null>(null), [auth, setAuth] = useState<boolean | null>(null);
  const [code, setCode] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [retry, setRetry] = useState(false);
  const [price, setPrice] = useState('60000'), [quantity, setQuantity] = useState('100'), [leverage, setLeverage] = useState(2), [side, setSide] = useState<'long' | 'short'>('long');
  const current = useRef<SharedView | null>(null), pending = useRef<Pending | null>(null), sending = useRef(false);
  function accept(next: SharedView | null) {
    if (next && current.current?.id === next.id && next.revision < current.current.revision) return;
    current.current = next; setRoom(next);
  }
  async function refresh(id?: string) {
    const requested = id ?? current.current?.id;
    try {
      const response = await fetch('/api/derivatives' + (requested ? '?room=' + encodeURIComponent(requested) : ''), { cache: 'no-store' });
      const data = await response.json() as Reply;
      if (response.status === 401) { setAuth(false); return; }
      setAuth(true);
      if (!response.ok) throw Error(data.error || 'Unable to refresh the room.');
      // A slow poll from the previous room must not replace a newly joined room.
      if (!requested || !current.current || requested === current.current.id) accept(data.room);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void refresh(); const timer = setInterval(() => { if (!document.hidden && current.current && !sending.current) void refresh(); }, 5000); return () => clearInterval(timer); }, []);
  async function send(input?: Pending) {
    if (sending.current) return;
    const body = input ? { ...input, requestId: crypto.randomUUID(), issuedAt: Date.now(), ...(current.current ? { roomId: current.current.id, revision: current.current.revision } : {}), ...(input.action === 'join' ? { roomId: code.trim().toLowerCase() } : {}) } : pending.current;
    if (!body) return;
    sending.current = true; pending.current = body; setBusy(true); setRetry(false); setError('');
    try {
      const response = await fetch('/api/derivatives', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json() as Reply;
      if (!response.ok) { if (response.status === 401) setAuth(false); pending.current = null; if (response.status === 409) await refresh(); throw Error(data.error || 'Request failed.'); }
      setAuth(true); accept(data.room); pending.current = null;
    } catch (e) { setError((e as Error).message); setRetry(!!pending.current); }
    finally { sending.current = false; setBusy(false); }
  }
  function download() {
    if (!room) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ mode: 'shared-practice', revision: room.revision, market: room.market }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'lazer-shared-test-snapshot.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  let required: number | null = null; try { required = margin(Number(quantity), Number(price), leverage); } catch {}
  const locked = busy || retry;
  return <main className="lz">
    <header className="lz-header"><a className="lz-brand" href="/"><Zap size={30} fill="currentColor" />LAZER</a><nav aria-label="Market navigation"><a href="/">Solo practice</a><a href="/market" aria-current="page">Shared rooms</a><a href="https://github.com/agammann/lazer/blob/main/docs/SHARED-MARKET.md" target="_blank" rel="noreferrer">Guide</a></nav><span className="lz-mode">Lightning only</span></header>
    <div className="lz-disclosure"><Users size={20} /><p><strong>Shared test market · Practice sats only.</strong> Two signed-in people, one server-saved order book. No Bitcoin deposits or withdrawals. The creator controls scenario prices.</p></div>
    {error && <div role="alert" className="lz-error">{error}{retry && <button disabled={busy} onClick={() => void send()}>Retry same request</button>}</div>}
    {auth === false ? <section className="lz-panel lz-info"><h1>Trade a test scenario together.</h1><p>Sign in to create a room as Alice or join another person as Bob. Each account receives nonredeemable practice sats.</p><a className="shared-primary" href="/signin-with-chatgpt?return_to=%2Fmarket">Sign in with ChatGPT</a><p>You can also use <a href="/">solo practice</a> without signing in.</p></section>
      : <section className="lz-panel shared-lobby"><div><h1>Shared test rooms</h1><p>{auth === null ? 'Checking your sign-in…' : 'Create or reopen your room, or join someone using their room code.'}</p></div><button className="shared-primary" disabled={locked || auth === null} onClick={() => void send({ action: 'create' })}>Open my room</button><form onSubmit={e => { e.preventDefault(); void send({ action: 'join' }); }}><label>Room code<input value={code} maxLength={36} placeholder="Paste a room code" onChange={e => setCode(e.target.value)} required /></label><button disabled={locked || auth === null || code.trim().length !== 36}>Join as Bob</button></form></section>}
    {room && auth && <>
      <div className="lz-market"><h1>₿ BTC/USD <small>Inverse</small></h1><div><span>Scenario price</span><strong>${num(room.market.price)}</strong></div><div><span>Your account</span><strong>{room.trader}</strong></div><div><span>Server revision</span><strong>{room.revision}</strong></div><p>{room.partnerJoined ? 'Both participants joined' : 'Waiting for Bob to join'}</p></div>
      <section className="lz-panel shared-room"><label>Room code — share with your trading partner<input readOnly value={room.id} onFocus={e => e.target.select()} /></label><button disabled={busy} onClick={() => void refresh()}><RefreshCw size={15} />Refresh</button><button onClick={download}>Export snapshot</button><p role="status">Saved on the server. Refreshes every 5 seconds while this tab is visible.</p></section>
      <section className="lz-grid">
        <section className="lz-panel lz-scenario"><div className="lz-title"><h2>BTC/USD · Shared scenario</h2><span>{room.market.prices.length - 1} price steps</span></div><p className="lz-caption">Test prices, not a live market feed.</p><PracticeChart prices={room.market.prices} /><div className="lz-scenario-controls"><h3>Scenario controls</h3><p>Only Alice, the room creator, can advance the test price.</p><div>{(['down', 'reset', 'up'] as const).map(step => <button key={step} disabled={locked || room.trader !== 'Alice'} onClick={() => void send({ action: 'mark', step })}>{step === 'down' ? 'Price −5%' : step === 'up' ? 'Price +5%' : 'Reset $60,000'}</button>)}</div></div></section>
        <section className="lz-panel lz-book"><h2>Shared order book</h2><div className="lz-book-head"><span>Price USD</span><span>Contracts</span><span>Trader</span></div>{[...room.market.orders].sort((a,b) => b.price-a.price || a.id-b.id).map(order => <div className={'lz-book-row ' + order.side} key={order.id}><span>{num(order.price)}</span><span>{order.remaining}</span><span>{order.trader}</span></div>)}{!room.market.orders.length && <div className="lz-empty"><h3>No resting orders</h3><p>Place an order for your partner to match.</p></div>}<div className="lz-book-mark">{num(room.market.price)}<small>Scenario price</small></div></section>
        <section className="lz-panel lz-ticket"><h2>Place order · {room.trader}</h2><div className="lz-side" role="group" aria-label="Position direction"><button aria-pressed={side==='long'} className={side==='long'?'active-long':''} onClick={()=>setSide('long')}>Long</button><button aria-pressed={side==='short'} className={side==='short'?'active-short':''} onClick={()=>setSide('short')}>Short</button></div><p className="lz-ticket-note">1 contract = $1 of BTC/USD exposure.<br />Only your signed-in account can submit.</p><form onSubmit={e=>{e.preventDefault();void send({ action:'place', side, price:Number(price), quantity:Number(quantity), leverage });}}><label>Limit price (USD)<input type="number" min="1000" max="1000000" required value={price} onChange={e=>setPrice(e.target.value)}/></label><label>Contracts (USD)<input type="number" min="1" max="10000" required value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label className="lz-leverage">Leverage <strong>{leverage}×</strong><input aria-label="Leverage" type="range" min="1" max="5" value={leverage} onChange={e=>setLeverage(Number(e.target.value))}/><span>1×</span><span>5×</span></label><div className="lz-margin"><span>Margin at limit</span><strong>{required===null?'—':num(required)} sats</strong></div><button className={'lz-submit '+side} disabled={locked || required===null || required>room.account.available}>Place practice {side}</button></form></section>
      </section>
      <section className="lz-panel shared-ledger"><h2>Your positions</h2><div className="lz-table-wrap"><table><thead><tr><th>Position</th><th>Side</th><th>Contracts</th><th>Entry</th><th>P&amp;L sats</th><th>Action</th></tr></thead><tbody>{room.market.positions.filter(p=>p.status==='open').map(p=>{const long=p.long===room.trader;return <tr key={p.id}><td>#{p.id}</td><td>{long?'Long':'Short'}</td><td>{p.quantity}</td><td>${num(p.entry)}</td><td>{num(pnlAt(p,room.market.price)*(long?1:-1))}</td><td><button disabled={locked} onClick={()=>void send({action:'close',positionId:p.id})}>Settle both sides</button></td></tr>;})}</tbody></table></div><p className="lz-caption">Test settlement closes both sides at the scenario price. It is not a live market exit order.</p><h2>Your resting orders</h2>{room.market.orders.filter(o=>o.trader===room.trader).map(o=><div className="shared-order" key={o.id}><span>#{o.id} · {o.side} {o.remaining} contracts at ${num(o.price)}</span><button disabled={locked} onClick={()=>void send({action:'cancel',orderId:o.id})}>Cancel order #{o.id}</button></div>)}<h2>Room journal</h2><ol className="shared-events">{room.market.events.slice(-30).reverse().map(e=><li key={e.seq}>#{e.seq} · {e.message}</li>)}</ol></section>
      <footer className="lz-footer"><strong>Account ({room.trader})</strong><div><span>Available</span><b>{num(room.account.available)} sats</b></div><div><span>Reserved</span><b>{num(room.account.orderMargin+room.account.positionMargin)} sats</b></div><div><span>Realized P&amp;L</span><b>{num(room.account.realized)} sats</b></div><a href="/">Lightning funding · Not connected</a></footer>
    </>}
  </main>;
}
