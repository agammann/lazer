import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {address,networks} from 'bitcoinjs-lib';
import {fresh,openAccount,creditDeposit,place,applyCommand,reserveWithdrawal,invariant} from '../work/engine.mjs';
import {wallet,walletId,accountId,prepareWithdrawal} from '../work/bitcoin.mjs';
const datadir=process.env.CORE_REGTEST_DATADIR;if(!datadir)throw Error('Set CORE_REGTEST_DATADIR to an isolated, running Bitcoin Core regtest datadir.');
const cli=process.env.BITCOIN_CLI||'bitcoin-cli';
function rpc(method,args=[],walletName){const r=spawnSync(cli,['-datadir='+datadir,'-regtest','-rpcport='+(process.env.CORE_REGTEST_PORT||'18845'),...(walletName?['-rpcwallet='+walletName]:[]),'-stdin',method],{input:args.length?args.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join('\n')+'\n':'',encoding:'utf8',timeout:20000});if(r.status)throw Error(r.stderr);try{return JSON.parse(r.stdout)}catch{return r.stdout.trim()}}
if(rpc('getblockchaininfo').chain!=='regtest')throw Error('This integration test requires regtest');
const suffix=Date.now().toString();const miner='Miner-'+suffix,bob='Bob-'+suffix;rpc('createwallet',[miner]);rpc('createwallet',[bob]);const mineTo=rpc('getnewaddress',[],miner);rpc('generatetoaddress',[101,mineTo]);
const seed=randomBytes(32).toString('hex'),aliceId=accountId('regtest','Alice'),bobId=accountId('regtest','Bob');let s=fresh();for(const [id,person] of [[aliceId,'Alice'],[bobId,'Bob']]){const w=wallet(seed,id);openAccount(s,{id,person,address:w.address,script:w.script},walletId(seed))}
const alice=wallet(seed,aliceId),regDeposit=address.fromOutputScript(Buffer.from(alice.script,'hex'),networks.regtest);
const deposit=rpc('sendtoaddress',[regDeposit,0.002],miner);rpc('generatetoaddress',[6,mineTo]);const receipt=rpc('gettransaction',[deposit,true,true],miner);const tx={...receipt.decoded,confirmations:receipt.confirmations};const proof={txid:deposit,outputs:tx.vout.map(o=>({script:o.scriptPubKey.hex,value:Math.round(o.value*1e8)})),confirmations:tx.confirmations,inBestChain:true};
s=applyCommand(s,crypto.randomUUID(),'deposit',x=>creditDeposit(x,aliceId,proof,new Date().toISOString()));
s=applyCommand(s,crypto.randomUUID(),'sell',x=>place(x,aliceId,'sell',60000,20000,new Date().toISOString()));s=applyCommand(s,crypto.randomUUID(),'buy',x=>place(x,bobId,'buy',60000,20000,new Date().toISOString()));
const bobAddress=rpc('getnewaddress',[],bob),script=address.toOutputScript(bobAddress,networks.regtest),testnetEncoding=address.fromOutputScript(script,networks.testnet);
const p=prepareWithdrawal(seed,s.coins.filter(c=>!c.spentBy),bobId,crypto.randomUUID(),testnetEncoding,15000,1,new Date().toISOString());const accepted=rpc('testmempoolaccept',[[p.withdrawal.raw]]);if(!accepted[0].allowed)throw Error(JSON.stringify(accepted));
s=applyCommand(s,crypto.randomUUID(),'withdraw',x=>reserveWithdrawal(x,p.withdrawal,p.changeScript,new Date().toISOString()));const withdrawal=rpc('sendrawtransaction',[p.withdrawal.raw]);rpc('generatetoaddress',[6,mineTo]);const received=rpc('gettransaction',[withdrawal],bob);if(received.confirmations<6||Math.round(received.amount*1e8)!==15000)throw Error('Core wallet receipt mismatch');invariant(s);
const evidence={network:'regtest',test:'Bitcoin Core deposit, Alice sell, Bob buy, signed withdrawal, Core receipt',deposit:{txid:deposit,sats:200000,confirmations:proof.confirmations},trade:{sats:20000,priceDUSD:60000},withdrawal:{txid:withdrawal,sats:15000,fee:p.withdrawal.fee,confirmations:received.confirmations},mempoolAccepted:accepted[0].allowed,balances:{alice:s.accounts[aliceId].sats,bob:s.accounts[bobId].sats},passed:true,checkedAt:new Date().toISOString()};console.log(JSON.stringify(evidence,null,2));writeFileSync('work/regtest-evidence.json',JSON.stringify(evidence,null,2));
