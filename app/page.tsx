"use client";
import { useEffect, useState, useRef } from 'react';
import { Zap, FlaskConical, ArrowDown, ArrowUp, RotateCcw, BookOpen, Download, Wallet, FileText, ExternalLink } from 'lucide-react';
import { PracticeChart } from '@/components/practice-chart';
import { freshPractice, applyPractice, account, margin, pnlAt, liquidationPrice, type Command, type Trader, type Direction, type Practice } from '@/lib/derivatives';
import './practice.css';

const KEY = 'lazer-derivatives-practice-v1';
const number = (v: number) => (v === 0 ? 0 : v).toLocaleString('en-US');
const signed = (v: number) => `${v >= 0 ? '+' : ''}${number(v)}`;
type Tab = 'Positions' | 'Orders' | 'Journal';
type Panel = 'Trade' | 'Funding' | 'Guide';
function replay(value: unknown): { commands: Command[]; state: Practice } {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('commands' in value) || !Array.isArray(value.commands) || value.commands.length > 1_000) throw Error('Invalid Lazer practice journal.');
  let state = freshPractice(); for (const command of value.commands) state = applyPractice(state, command);
  return { commands: value.commands, state };
}
export default function Home() {
  const [state, setState] = useState(freshPractice), [commands, setCommands] = useState<Command[]>([]), [ready, setReady] = useState(false);
  const [trader, setTrader] = useState<Trader>('Alice'), [side, setSide] = useState<Direction>('long');
  const [price, setPrice] = useState('60000'), [quantity, setQuantity] = useState('100'), [leverage, setLeverage] = useState(2);
  const [tab, setTab] = useState<Tab>('Positions'), [panel, setPanel] = useState<Panel>('Trade'), [error, setError] = useState(''), [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null), latest = useRef({ state, commands }); latest.current = { state, commands };
  useEffect(() => {
    try { const saved = sessionStorage.getItem(KEY); if (saved) { const restored = replay(JSON.parse(saved)); setState(restored.state); setCommands(restored.commands); setMessage(`Restored ${restored.commands.length} practice commands.`); } }
    catch { setError('The saved practice journal could not be restored. This session starts fresh; real Testnet balances are unaffected.'); }
    setReady(true);
  }, []);
  function persist(next: Practice, history: Command[]) {
    sessionStorage.setItem(KEY, JSON.stringify({ version: 1, commands: history }));
    latest.current = { state: next, commands: history }; setState(next); setCommands(history);
  }
  function act(command: Command) {
    try {
      if (!ready) return;
      if (latest.current.commands.length >= 1_000) throw Error('Export this journal and start a new practice session.');
      const next = applyPractice(latest.current.state, command); persist(next, [...latest.current.commands, command]);
      setError(''); setMessage(next.events.at(-1)?.message || 'Practice order processed.');
    } catch (e) { setError((e as Error).message); }
  }
  function exportJournal() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, mode: 'practice', commands, result: state }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'lazer-practice-journal.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importJournal(file?: File) {
    try {
      if (!file) return; if (file.size > 500_000) throw Error('Journal must be smaller than 500 KB.');
      const restored = replay(JSON.parse(await file.text())); persist(restored.state, restored.commands);
      setMessage(`Replayed ${restored.commands.length} commands. All balances were recalculated.`); setError('');
    } catch (e) { setError((e as Error).message); }
    if (input.current) input.current.value = '';
  }
  function reset() {
    try { exportJournal(); persist(freshPractice(), []); setMessage('Previous journal exported. A fresh practice session is ready.'); setError(''); }
    catch { setError('Browser storage is unavailable. Allow session storage to start a practice session.'); }
  }
  const balance = account(state, trader), open = state.positions.filter(p => p.status === 'open');
  let required: number | null = null; try { required = margin(Number(quantity), Number(price), leverage); } catch {}
  const book = [...state.orders].sort((a, b) => b.price - a.price || a.id - b.id);
  return <main className="lz">
    <header className="lz-header"><a href="/" className="lz-brand"><Zap size={30} fill="currentColor" />LAZER</a>
      <nav aria-label="Main navigation">{(['Trade', 'Funding'] as const).map(p => <button key={p} onClick={() => setPanel(p)} className={panel === p ? 'selected' : ''}>{p}</button>)}<button onClick={() => { setPanel('Trade'); setTab('Journal'); requestAnimationFrame(() => document.getElementById('practice-ledger')?.scrollIntoView({ block: 'start' })); }}>Journal</button><button className={panel === 'Guide' ? 'selected' : ''} onClick={() => setPanel('Guide')}>Guide</button></nav>
      <a className="lz-mode" href="/market">Shared test rooms →</a><label className="lz-trader"><span>Trader</span><select aria-label="Active trader" value={trader} onChange={e => setTrader(e.target.value as Trader)}><option>Alice</option><option>Bob</option></select></label>
    </header>
    <div className="lz-disclosure"><FlaskConical size={20} /><p><strong>Practice sats only.</strong> No real deposits. Alice and Bob trade inside this browser tab. No external liquidity.</p></div>
    {error && <div role="alert" className="lz-error">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    <div className="lz-market"><h1><span>₿</span> BTC/USD <small>Inverse</small></h1><div><span>Scenario price</span><strong>${number(state.price)}.00</strong></div><div><span>Margin</span><strong>Isolated · 1–5×</strong></div><div><span>Settlement</span><strong>Practice SATS</strong></div><p>Lazer’s independent<br />derivatives test environment.</p></div>
    {panel === 'Trade' ? <>
      <section className="lz-grid">
        <section className="lz-panel lz-scenario"><div className="lz-title"><h2>BTC/USD <span>· Scenario</span></h2><span>{state.prices.length - 1} price steps</span></div><p className="lz-caption">Your scenario history. Not live market data.</p><PracticeChart prices={state.prices} />
          <div className="lz-scenario-controls"><h3>Scenario controls</h3><p>Move the price to test P&amp;L and liquidation.</p><div><button disabled={!ready} onClick={() => act({ action: 'mark', price: Math.max(1000, Math.round(state.price * .95)) })}><ArrowDown size={17} /><span>Price −5%<small>${number(Math.max(1000, Math.round(state.price * .95)))}</small></span></button><button disabled={!ready} onClick={() => act({ action: 'mark', price: 60_000 })}><RotateCcw size={16} /><span>Reset price<small>$60,000</small></span></button><button disabled={!ready} onClick={() => act({ action: 'mark', price: Math.min(1_000_000, Math.round(state.price * 1.05)) })}><ArrowUp size={17} /><span>Price +5%<small>${number(Math.min(1_000_000, Math.round(state.price * 1.05)))}</small></span></button></div></div>
        </section>
        <section className="lz-panel lz-book"><h2>Order book <small>(BTC/USD)</small></h2><div className="lz-book-head"><span>Price USD</span><span>Contracts</span><span>Trader</span></div>
          {book.length ? book.map(o => <button className={`lz-book-row ${o.side}`} key={o.id} title="Use this limit price" onClick={() => setPrice(String(o.price))}><span>{number(o.price)}</span><span>{o.remaining}</span><span>{o.trader}</span></button>) : <div className="lz-empty"><BookOpen size={30} /><h3>No resting orders</h3><p>Place an order, then switch traders to take the other side.</p></div>}
          <div className="lz-book-mark">{number(state.price)}<small>Scenario price</small></div><p className="lz-caption">Price priority, then time priority.<br />Orders from the same trader do not match.</p>
        </section>
        <section className="lz-panel lz-ticket"><h2>Place order</h2><div className="lz-side" role="group" aria-label="Position direction"><button aria-pressed={side === 'long'} className={side === 'long' ? 'active-long' : ''} onClick={() => setSide('long')}>Long</button><button aria-pressed={side === 'short'} className={side === 'short' ? 'active-short' : ''} onClick={() => setSide('short')}>Short</button></div>
          <p className="lz-ticket-note">{trader} · Limit order<br />1 contract = $1 of BTC/USD exposure.</p>
          <form onSubmit={e => { e.preventDefault(); act({ action: 'place', trader, side, price: Number(price), quantity: Number(quantity), leverage }); }}>
            <label>Limit price (USD)<input type="number" min="1000" max="1000000" step="1" required value={price} onChange={e => setPrice(e.target.value)} /></label>
            <label>Contracts (USD)<input type="number" min="1" max="10000" step="1" required value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
            <label className="lz-leverage">Leverage <strong>{leverage}×</strong><input aria-label="Leverage" type="range" min="1" max="5" step="1" value={leverage} onChange={e => setLeverage(Number(e.target.value))} /><span>1×</span><span>5×</span></label>
            <div className="lz-margin"><span>Margin at limit</span><strong>{required === null ? '—' : number(required)} sats</strong></div><button disabled={!ready || required === null || required > balance.available} className={`lz-submit ${side}`}>Place practice {side}</button>
          </form><p className="lz-caption">No match, no position. Execution uses the resting order’s price; required sats may change.</p>
        </section>
      </section>
      <section id="practice-ledger" className="lz-panel lz-ledger"><div className="lz-tabs" role="group" aria-label="Account views">{(['Positions', 'Orders', 'Journal'] as const).map(t => <button aria-pressed={t === tab} className={t === tab ? 'selected' : ''} key={t} onClick={() => setTab(t)}>{t}{t === 'Positions' && open.length > 0 ? ` (${open.length})` : ''}</button>)}</div>
        {tab === 'Positions' ? open.length ? <div className="lz-table-wrap"><table><thead><tr><th>Position</th><th>Side</th><th>Contracts</th><th>Entry USD</th><th>Margin sats</th><th>Liquidation USD*</th><th>P&amp;L sats</th><th>Action</th></tr></thead><tbody>{open.map(p => { const isLong = p.long === trader, pnl = pnlAt(p, state.price) * (isLong ? 1 : -1), liq = liquidationPrice(p, isLong ? 'long' : 'short'); return <tr key={p.id}><td>#{p.id} BTC/USD</td><td className={isLong ? 'long' : 'short'}>{isLong ? 'Long' : 'Short'}</td><td>{p.quantity}</td><td>{number(p.entry)}</td><td>{number(isLong ? p.longMargin : p.shortMargin)}</td><td>{liq ? number(Math.round(liq)) : 'None'}</td><td className={pnl >= 0 ? 'long' : 'short'}>{signed(pnl)}</td><td><button onClick={() => act({ action: 'close', trader, positionId: p.id })}>Settle both sides</button></td></tr>; })}</tbody></table><p className="lz-caption">*Estimate before rounding. Either side reaching maintenance closes the pair. Scenario losses are capped at posted margin; this is not a live liquidation or exit order.</p></div> : <div className="lz-empty"><FileText size={28} /><h3>No open positions</h3><p>Place an order, then switch to Bob to take the other side.</p></div>
          : tab === 'Orders' ? state.orders.length ? <div className="lz-table-wrap"><table><thead><tr><th>Order</th><th>Trader</th><th>Side</th><th>Limit USD</th><th>Remaining</th><th>Action</th></tr></thead><tbody>{state.orders.map(o => <tr key={o.id}><td>#{o.id}</td><td>{o.trader}</td><td className={o.side}>{o.side}</td><td>{number(o.price)}</td><td>{o.remaining}</td><td><button disabled={o.trader !== trader} onClick={() => act({ action: 'cancel', trader, orderId: o.id })}>Cancel</button></td></tr>)}</tbody></table></div> : <div className="lz-empty"><p>No open orders. Submitted orders will appear here.</p></div>
          : <div className="lz-journal"><div className="lz-journal-tools"><button onClick={exportJournal}><Download size={15} />Export journal</button><button onClick={() => input.current?.click()}>Import &amp; replay</button><button onClick={reset}>Export &amp; restart</button><input ref={input} hidden type="file" accept="application/json,.json" onChange={e => void importJournal(e.target.files?.[0])} /></div>{state.events.length ? <ol>{state.events.slice().reverse().map(e => <li key={e.seq}><span>#{e.seq}</span>{e.message}</li>)}</ol> : <p className="lz-caption">Your orders, matches, and settlements will appear here. Exported journals can be replayed to recalculate the same balances.</p>}</div>}
      </section>
    </> : panel === 'Funding' ? <section className="lz-panel lz-info"><h2>Bitcoin trading. Lightning funding.</h2><p>Lightning is the funding and withdrawal network for Lazer. Trading happens in Lazer’s own order book.</p><div className="lz-rails">{[
      { name: 'Lightning', asset: 'BTC · sats', text: 'Lightning invoices for deposits and withdrawals. A local Bitcoin Core/LND round trip is verified: 100,000 sats in and 15,000 sats returned. App funding still needs a reconciled collateral bridge.', href: 'https://github.com/lightningnetwork/lnd', package: 'LND + bolt11' },
    ].map(r => <article key={r.name}><Wallet size={24} /><h3>{r.name}</h3><strong>{r.asset}</strong><p>{r.text}</p><span className="lz-status">Transfers not connected</span><a href={r.href} target="_blank" rel="noreferrer">{r.package}<ExternalLink size={13} /></a></article>)}</div><p>Lightning invoice inspection tools are in the public repository. They validate encodings and network boundaries; they do not establish ownership or credit funds. Practice balances cannot be withdrawn.</p><a href="/legacy">Open the existing Testnet 4 wallet and order book →</a></section>
      : <section className="lz-panel lz-info"><h2>Trade the price of Bitcoin. Settle in sats.</h2><p>A long position gains sats when BTC/USD rises; a short gains sats when it falls. You post Bitcoin collateral instead of buying Bitcoin with a simulated dollar balance.</p><ol className="lz-guide"><li>As Alice, place a long limit order: $60,000, 100 contracts, 2× leverage.</li><li>Switch to Bob and place a short with the same price and size. The orders match and each side reserves 83,334 practice sats.</li><li>Press Price +5%. At $63,000, Alice’s unrealized gain is 7,936 sats and Bob’s loss is 7,936 sats.</li><li>Press Settle both sides. The gain and loss become realized; each trader’s unused margin becomes available.</li><li>Open the Journal to export or replay the complete sequence. Try larger price changes to exercise liquidations.</li></ol><h3>What this test environment proves</h3><p>Price and time priority, partial fills, collateral reservation, inverse P&amp;L, cancellation, and conservation of practice sats. Sessions are local to a browser tab and survive reloads. Alice and Bob are test roles you control. For two separate signed-in people, use <a href="/market">shared test rooms</a>; their order book and balances are saved on the server.</p><h3>What still has to be built</h3><p>Verified Lightning collateral, reliable price feeds, perpetual funding, live close orders, continuous liquidation workers, liquidity providers, and verified funding/withdrawal services. The current bilateral scenario settlement is a test mechanism, not a production perpetual contract.</p><a href="https://github.com/agammann/lazer/blob/main/docs/DERIVATIVES.md" target="_blank" rel="noreferrer">Read the build specification <ExternalLink size={14} /></a></section>}
    <div className="lz-message" role="status" aria-live="polite">{message || 'Ready to test. Start with an Alice long and a matching Bob short.'}</div>
    <footer className="lz-footer"><strong>Account ({trader})</strong><div><span>Available</span><b>{number(balance.available)} sats</b></div><div><span>Reserved</span><b>{number(balance.orderMargin + balance.positionMargin)} sats</b></div><div><span>Realized P&amp;L</span><b className={balance.realized >= 0 ? 'long' : 'short'}>{signed(balance.realized)} sats</b></div><button onClick={() => setPanel('Funding')}>Lightning<small>Transfers not connected</small></button><a href="/legacy">Legacy Testnet wallet<ExternalLink size={13} /></a></footer>
  </main>;
}
