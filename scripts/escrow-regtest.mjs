import {spawnSync} from 'node:child_process';
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createEscrowContract,createSettlement,inspectSettlement,combineSettlement} from '../work/escrow.mjs';
const datadir=process.env.CORE_REGTEST_DATADIR;
if(!datadir)throw Error('Set CORE_REGTEST_DATADIR to an isolated running regtest node.');
const cli=process.env.BITCOIN_CLI||'bitcoin-cli';
function rpc(method,args=[],wallet){
 const result=spawnSync(cli,['-regtest','-datadir='+datadir,'-rpcport='+(process.env.CORE_REGTEST_PORT||'18845'),...(wallet?['-rpcwallet='+wallet]:[]),'-stdin',method],{input:args.length?args.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join('\n')+'\n':'',encoding:'utf8',timeout:20000,shell:false});
 if(result.error)throw result.error;if(result.status)throw Error(result.stderr);
 if(!result.stdout.trim())return null;
 try{return JSON.parse(result.stdout)}catch{return result.stdout.trim()}
}
if(rpc('getblockchaininfo').chain!=='regtest')throw Error('This test refuses any chain except regtest.');
const suffix=Date.now(),names={seller:'EscrowSeller-'+suffix,buyer:'EscrowBuyer-'+suffix,arbitrator:'EscrowOperator-'+suffix};
for(const name of Object.values(names))rpc('createwallet',[name]);
const mineTo=rpc('getnewaddress',[],names.seller);rpc('generatetoaddress',[101,mineTo]);
const origins=new Map();
function publicKey(role){const addr=rpc('getnewaddress',['','bech32'],names[role]),info=rpc('getaddressinfo',[addr],names[role]);origins.set(info.pubkey,{pubkey:info.pubkey,masterFingerprint:info.hdmasterfingerprint,path:info.hdkeypath});return info.pubkey}
function proof(c,txid,vout){const u=rpc('gettxout',[txid,vout,true]);if(!u)throw Error('Funding is spent');return {network:'regtest',txid,vout,sats:Math.round(u.value*1e8),script:u.scriptPubKey.hex,confirmations:u.confirmations,unspent:true,coinbase:u.coinbase};}
const cases=[];
for(const [kind,roles] of [['release',['seller','buyer']],['refund',['seller','arbitrator']]]){
 const sellerPubkey=publicKey('seller'),buyerPubkey=publicKey('buyer'),arbitratorPubkey=publicKey('arbitrator');
 const c=createEscrowContract({tradeId:'core-'+kind+'-'+suffix,network:'regtest',sellerPubkey,buyerPubkey,arbitratorPubkey,keyOrigins:[sellerPubkey,buyerPubkey,arbitratorPubkey].map(k=>origins.get(k)),sellerRefundAddress:rpc('getnewaddress',[],names.seller),buyerReceiveAddress:rpc('getnewaddress',[],names.buyer),sats:100000,feeSats:1000});
 const derived=rpc('deriveaddresses',[rpc('getdescriptorinfo',[c.descriptor]).descriptor]);
 assert.equal(derived[0],c.address);
 const deposit=rpc('sendtoaddress',[c.address,c.fundingSats/1e8],names.seller);rpc('generatetoaddress',[6,mineTo]);
 const receipt=rpc('gettransaction',[deposit,true,true],names.seller);
 const vout=receipt.decoded.vout.find(o=>o.scriptPubKey.hex===c.outputScript).n;
 const p=proof(c,deposit,vout),unsigned=createSettlement(c,p,kind);
 // finalize=false retains partial signatures so Lazer can independently validate each signer.
 const parts=roles.map(role=>rpc('walletprocesspsbt',[unsigned,true,'ALL',true,false],names[role]).psbt);
 const operatorAlone=rpc('walletprocesspsbt',[unsigned,true,'ALL',true,false],names.arbitrator).psbt;
 assert.deepEqual(inspectSettlement(c,p,kind,operatorAlone).signedBy,['arbitrator']);
 assert.throws(()=>combineSettlement(c,p,kind,[operatorAlone]),/Two distinct/);
 for(const [i,part] of parts.entries())assert.deepEqual(inspectSettlement(c,p,kind,part).signedBy,[roles[i]]);
 const final=combineSettlement(c,proof(c,deposit,vout),kind,parts);
 if(kind==='refund'){
  const folder='work/escrow-cli-'+suffix;mkdirSync(folder,{recursive:true});
  const now=Math.floor(Date.now()/1000);
  writeFileSync(folder+'/terms.json',JSON.stringify({bitcoin:c,payment:{network:'local',buyerAddress:'0x'+'11'.repeat(20),sellerAddress:'0x'+'22'.repeat(20),wei:'1000000000000000',notBefore:now-60,expiresAt:now+3600}}));
  const runCli=args=>{const r=spawnSync(process.execPath,['scripts/escrow-cli.mjs',...args],{env:{...process.env,CORE_DATADIR:datadir,CORE_RPC_PORT:process.env.CORE_REGTEST_PORT||'18845'},encoding:'utf8',timeout:30000});if(r.error)throw r.error;assert.equal(r.status,0,r.stderr);return r.stdout;};
  runCli(['create',folder+'/terms.json',folder+'/trade.json']);
  runCli(['payment-request',folder+'/trade.json',deposit,String(vout)]);
  runCli(['prepare',folder+'/trade.json','refund',deposit,String(vout),folder+'/refund.json']);
  parts.forEach((part,i)=>writeFileSync(folder+'/partial-'+i+'.psbt',part));
  runCli(['inspect',folder+'/trade.json',folder+'/refund.json',folder+'/partial-0.psbt']);
  runCli(['combine',folder+'/trade.json',folder+'/refund.json',folder+'/partial-0.psbt',folder+'/partial-1.psbt',folder+'/combined.json']);
  assert.equal(JSON.parse(readFileSync(folder+'/combined.json','utf8')).raw,final.raw);
 }
 const accepted=rpc('testmempoolaccept',[[final.raw]])[0];assert.equal(accepted.allowed,true,JSON.stringify(accepted));
 assert.equal(rpc('sendrawtransaction',[final.raw]),final.txid);rpc('generatetoaddress',[6,mineTo]);
 const recipient=kind==='release'?'buyer':'seller',received=rpc('gettransaction',[final.txid,true,true],names[recipient]);
 assert.ok(received.confirmations>=6);assert.ok(received.decoded.vout.some(o=>o.scriptPubKey.address===final.destination&&Math.round(o.value*1e8)===c.sats));
 assert.equal(rpc('gettxout',[deposit,vout,true]),null);
 cases.push({kind,fundingTxid:deposit,settlementTxid:final.txid,sats:c.sats,feeSats:c.feeSats,signers:roles,operatorAloneRejected:true,coreMempoolAccepted:true,confirmations:received.confirmations});
}
const evidence={network:'regtest',bitcoinCoreVersion:rpc('getnetworkinfo').version,implementation:'Lazer two of three native SegWit escrow',privateKeysExported:false,cliRefundFlowVerified:true,ethereumPaymentBroadcast:false,cases,passed:true,checkedAt:new Date().toISOString()};
mkdirSync('work',{recursive:true});writeFileSync('work/escrow-regtest-evidence.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
