import { spawnSync } from 'node:child_process';
import { address, networks } from 'bitcoinjs-lib';
const [txid, destination, amount, wallet] = process.argv.slice(2);
if (!/^[a-f0-9]{64}$/i.test(txid || '') || !destination || !wallet || !Number.isSafeInteger(Number(amount))) { console.error('Usage: node scripts/core-verify.mjs TXID TESTNET_ADDRESS SATOSHIS WALLET'); process.exit(1); }
try {
 const script = Buffer.from(address.toOutputScript(destination, networks.testnet)).toString('hex');
 const opts = ['-testnet4', '-rpcwallet=' + wallet];
 if (process.env.CORE_DATADIR) opts.push('-datadir=' + process.env.CORE_DATADIR);
 if (process.env.CORE_RPC_PORT) opts.push('-rpcport=' + process.env.CORE_RPC_PORT);
 function rpc(method, args = []) { const r = spawnSync(process.env.BITCOIN_CLI || 'bitcoin-cli', [...opts, method, ...args], { encoding: 'utf8', shell: false, timeout: 20000 }); if (r.error) throw r.error; if (r.status) throw Error(r.stderr); return JSON.parse(r.stdout); }
 const chain = rpc('getblockchaininfo'); if (chain.chain !== 'testnet4' || chain.initialblockdownload) throw Error('Bitcoin Core must be synchronized on Testnet 4.');
 const tx = rpc('gettransaction', [txid, 'true', 'true']);
 const out = tx.decoded?.vout.find(o => o.scriptPubKey.hex === script && Math.round(o.value * 1e8) === Number(amount));
 if (!out) throw Error('No output matches the exact receiving address and amount.');
 if (tx.confirmations < 0) throw Error('Transaction conflicts with the active chain.');
 console.log(JSON.stringify({ source: 'Bitcoin Core', network: chain.chain, txid, address: destination, sats: Number(amount), output: out.n, confirmations: tx.confirmations, confirmed: tx.confirmations >= 6, checkedAt: new Date().toISOString() }, null, 2));
 if (tx.confirmations < 6) process.exitCode = 2;
} catch (e) { console.error(e.message); process.exitCode = 1; }
