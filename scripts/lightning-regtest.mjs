// Real LND + Bitcoin Core payment test on an isolated, disposable regtest chain.
// Never connects to an existing wallet or accepts a network override.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, openSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import bolt11 from 'bolt11';

const names = ['BITCOIND', 'BITCOIN_CLI', 'LND', 'LNCLI'];
for (const name of names) if (!process.env[name] || !existsSync(process.env[name])) throw Error(`Set ${name} to the installed executable path.`);
const runId = Date.now(), root = resolve('work', `lightning-regtest-${runId}`), coreDir = join(root, 'core');
mkdirSync(coreDir, { recursive: true });
const corePort = 18846, nodes = [{ name: 'Alice', rpc: 10019, p2p: 19735 }, { name: 'Lazer', rpc: 10020, p2p: 19736 }];
const children = [];
function launch(executable, args, logPath) {
  const fd = openSync(logPath, 'a');
  const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', fd, fd] });
  children.push(child); return child;
}
function execute(executable, args, input) {
  const result = spawnSync(executable, args, { windowsHide: true, encoding: 'utf8', input, maxBuffer: 2_000_000 });
  if (result.status !== 0) throw Error(`Test subprocess failed (${args.find(a => !a.startsWith('-')) || 'startup'}). See private logs in ${root}.`);
  const output = result.stdout.trim(); if (!output) return null;
  try { return JSON.parse(output); } catch { return output; }
}
function core(method, args = [], wallet) {
  return execute(process.env.BITCOIN_CLI, [`-datadir=${coreDir}`, '-regtest', `-rpcport=${corePort}`, ...(wallet ? [`-rpcwallet=${wallet}`] : []), '-stdin', method], args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join('\n') + (args.length ? '\n' : ''));
}
function ln(node, ...args) {
  return execute(process.env.LNCLI, [`--lnddir=${node.dir}`, '--network=regtest', `--rpcserver=127.0.0.1:${node.rpc}`, ...args]);
}
async function until(check, label) {
  const end = Date.now() + 90_000;
  while (Date.now() < end) { try { const value = check(); if (value) return value; } catch {} await new Promise(r => setTimeout(r, 1000)); }
  throw Error(`Timed out waiting for ${label}. Private logs: ${root}`);
}
const password = randomBytes(32).toString('hex');
writeFileSync(join(coreDir, 'bitcoin.conf'), `regtest=1\nserver=1\nlisten=0\nfallbackfee=0.00001000\ntxindex=1\n[regtest]\nrpcbind=127.0.0.1\nrpcallowip=127.0.0.1\nrpcport=${corePort}\nrpcuser=lazer-regtest\nrpcpassword=${password}\nzmqpubrawblock=tcp://127.0.0.1:28346\nzmqpubrawtx=tcp://127.0.0.1:28347\n`, { mode: 0o600 });
let startedCore = false;
try {
  launch(process.env.BITCOIND, [`-datadir=${coreDir}`], join(root, 'core.log'));
  await until(() => core('getblockchaininfo')?.chain === 'regtest', 'Bitcoin Core regtest'); startedCore = true;
  core('createwallet', ['miner']); const mineAddress = core('getnewaddress', [], 'miner');
  core('generatetoaddress', [101, mineAddress]);
  console.log('Isolated Core regtest initialized. Starting two LND test wallets.');
  for (const node of nodes) {
    node.dir = join(root, node.name.toLowerCase()); mkdirSync(node.dir);
    writeFileSync(join(node.dir, 'lnd.conf'), `[Application Options]\nalias=Lazer-regtest-${node.name}\nnoseedbackup=true\nlisten=127.0.0.1:${node.p2p}\nrpclisten=127.0.0.1:${node.rpc}\nrestlisten=127.0.0.1:${node.rpc + 100}\n[Bitcoin]\nbitcoin.active=true\nbitcoin.regtest=true\nbitcoin.node=bitcoind\n[Bitcoind]\nbitcoind.rpchost=127.0.0.1:${corePort}\nbitcoind.rpcuser=lazer-regtest\nbitcoind.rpcpass=${password}\nbitcoind.zmqpubrawblock=tcp://127.0.0.1:28346\nbitcoind.zmqpubrawtx=tcp://127.0.0.1:28347\n`, { mode: 0o600 });
    launch(process.env.LND, [`--lnddir=${node.dir}`], join(root, node.name.toLowerCase() + '.log'));
    await until(() => { const info = ln(node, 'getinfo'); return info.chains[0].network === 'regtest' && info.synced_to_chain; }, `${node.name} LND`);
  }
  const [alice, lazer] = nodes, destination = ln(alice, 'newaddress', 'p2wkh').address;
  core('sendtoaddress', [destination, 0.02], 'miner'); core('generatetoaddress', [6, mineAddress]);
  await until(() => Number(ln(alice, 'walletbalance').confirmed_balance) >= 2_000_000, 'Alice funding');
  const pubkey = ln(lazer, 'getinfo').identity_pubkey;
  ln(alice, 'connect', `${pubkey}@127.0.0.1:${lazer.p2p}`);
  const channel = ln(alice, 'openchannel', `--node_key=${pubkey}`, '--local_amt=1000000', '--sat_per_vbyte=1');
  core('generatetoaddress', [6, mineAddress]);
  await until(() => nodes.every(node => ln(node, 'listchannels').channels.some(c => c.active)) && ln(alice, 'queryroutes', pubkey, '100000').routes.length > 0, 'usable Lightning channel');
  console.log('Lightning channel active. Testing a 100,000 sat deposit and 15,000 sat return.');
  function payment(sender, receiver, sats) {
    const invoice = ln(receiver, 'addinvoice', `--amt=${sats}`, '--memo=Lazer isolated regtest verification');
    const decoded = bolt11.decode(invoice.payment_request);
    assert.equal(decoded.network.bech32, 'bcrt'); assert.equal(decoded.satoshis, sats);
    const paid = ln(sender, 'payinvoice', '--force', '--json', invoice.payment_request);
    assert.equal(paid.status, 'SUCCEEDED');
    const paymentHash = decoded.tagsObject.payment_hash;
    const received = ln(receiver, 'lookupinvoice', paymentHash);
    assert.equal(received.state, 'SETTLED'); assert.equal(Number(received.amt_paid_sat), sats);
    return { paymentHash, sats, senderStatus: paid.status, receiverState: received.state, feeSats: Number(paid.fee_sat) };
  }
  const deposit = payment(alice, lazer, 100_000), withdrawal = payment(lazer, alice, 15_000);
  const result = { checkedAt: new Date().toISOString(), network: 'regtest', coreVersion: core('getnetworkinfo').subversion, lndVersion: ln(alice, 'getinfo').version, channelFundingTxid: channel.funding_txid, deposit, withdrawal, remainingAtLazerSats: Number(ln(lazer, 'channelbalance').local_balance.sat), limits: ['Local regtest only; no valuable Bitcoin moved.', 'Direct channel; no public routing or liquidity reliability claim.', 'Lightning proof is separate from the practice trading ledger.', 'No Ark or Liquid transfer was performed.'] };
  assert.equal(result.remainingAtLazerSats, 85_000);
  mkdirSync('docs/evidence', { recursive: true });
  writeFileSync('docs/evidence/lightning-regtest.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  // Shut down only the processes and fresh data directories created by this run.
  for (const node of nodes) if (node.dir) { try { ln(node, 'stop'); } catch {} }
  if (startedCore) { try { core('stop'); } catch {} }
  for (const child of children) if (child.exitCode === null) await Promise.race([new Promise(r => child.once('exit', r)), new Promise(r => setTimeout(r, 10_000))]);
}
