export function PracticeChart({ prices }: { prices: number[] }) {
  const lo = Math.min(...prices) * .98, hi = Math.max(...prices) * 1.02;
  const x = (i: number) => 18 + i / Math.max(1, prices.length - 1) * 590;
  const y = (p: number) => 220 - (p - lo) / (hi - lo) * 200;
  const points = prices.map((p, i) => `${x(i)},${y(p)}`).join(' ');
  return <div className="lz-chart"><svg viewBox="0 0 710 260" role="img" aria-label="Scenario prices from this practice session. Not live market data.">
    {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1="18" x2="610" y1={20 + i * 50} y2={20 + i * 50} stroke="#263345" /><text x="622" y={24 + i * 50} fill="#a1b1c6" fontSize="11">{Math.round(hi - (hi - lo) * i / 4).toLocaleString('en-US')}</text></g>)}
    <polyline points={points} stroke="#8fedff" strokeWidth="2" fill="none" />
    {prices.map((p, i) => <circle key={i} cx={x(i)} cy={y(p)} r={prices.length < 30 ? 3 : 1} fill="#8fedff"><title>{`Step ${i}: $${p.toLocaleString('en-US')}`}</title></circle>)}
    <text x="18" y="248" fill="#a1b1c6" fontSize="11">START</text><text x="536" y="248" fill="#a1b1c6" fontSize="11">STEP {prices.length - 1}</text>
  </svg>{prices.length === 1 && <p>Move the scenario price to build a history.<br />Every point comes from your test session.</p>}</div>;
}
