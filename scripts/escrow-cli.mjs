import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createEscrowContract,validateFunding,createSettlement,inspectSettlement,combineSettlement} from '../work/escrow.mjs';
import {createEscrowTrade,validateTrade,paymentRequest,verifyEthPayment,ethereumRpc} from '../work/ethereum.mjs';

const usage=`Lazer BTC / ETH escrow tools (test networks only; never auto sign or broadcast)
Run npm test first to build the protocol modules.

node scripts/escrow-cli.mjs core-key NETWORK WALLET OUTPUT.json
node scripts/escrow-cli.mjs create TERMS.json TRADE.json
node scripts/escrow-cli.mjs payment-request TRADE.json FUNDING_TXID VOUT
node scripts/escrow-cli.mjs verify-eth TRADE.json ETH_TXID
node scripts/escrow-cli.mjs prepare TRADE.json release|refund FUNDING_TXID VOUT OUTPUT.json [ETH_TXID]
node scripts/escrow-cli.mjs inspect TRADE.json INTENT.json PARTIAL.psbt
node scripts/escrow-cli.mjs combine TRADE.json INTENT.json PARTIAL1.psbt PARTIAL2.psbt OUTPUT.json

NETWORK: regtest or testnet4.
Configure BITCOIN_CLI, CORE_DATADIR, CORE_RPC_PORT and ETH_RPC_URL privately.
An ETH release requires a finalized payment. A refund still requires two signatures.
Output files are created exclusively and are never overwritten.
`;
function load(path){
 const body=readFileSync(path,'utf8');if(body.length>100000)throw Error('Input file is too large');return JSON.parse(body);
}
function save(path,value){writeFileSync(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});console.log('Saved '+path);}
function core(network){
 if(!['regtest','testnet4'].includes(network))throw Error('Mainnet is not enabled.');
 const args=['-'+network];
 if(process.env.CORE_DATADIR)args.push('-datadir='+process.env.CORE_DATADIR);
 if(process.env.CORE_RPC_PORT)args.push('-rpcport='+process.env.CORE_RPC_PORT);
 const rpc=(method,params=[],wallet)=>{
  const result=spawnSync(process.env.BITCOIN_CLI||'bitcoin-cli',[...args,...(wallet?['-rpcwallet='+wallet]:[]),'-stdin',method],{input:params.length?params.map(p=>typeof p==='object'?JSON.stringify(p):String(p)).join('\n')+'\n':'',encoding:'utf8',shell:false,timeout:20000,maxBuffer:1000000});
  if(result.error)throw Error('Could not execute Bitcoin Core CLI.');
  if(result.status)throw Error('Bitcoin Core request failed. Check the selected node and wallet locally.');
  const text=result.stdout.trim();if(!text)return null;try{return JSON.parse(text)}catch{return text}
 };
 const chain=rpc('getblockchaininfo');
 if(chain.chain!==network||(network==='testnet4'&&chain.initialblockdownload))throw Error('Bitcoin Core must be synchronized on the selected test network.');
 return rpc;
}
function funding(trade,txid,index){
 if(!/^[a-f0-9]{64}$/i.test(txid)||!/^\d+$/.test(String(index)))throw Error('Invalid funding outpoint');
 const vout=Number(index);if(!Number.isSafeInteger(vout)||vout>0xffffffff)throw Error('Invalid funding output index');
 const rpc=core(trade.bitcoin.network),u=rpc('gettxout',[txid,vout,true]);
 if(!u)throw Error('Funding output is spent or unknown to Core.');
 const proof={network:trade.bitcoin.network,txid:txid.toLowerCase(),vout,sats:Math.round(u.value*1e8),script:u.scriptPubKey.hex,confirmations:u.confirmations,unspent:true,coinbase:u.coinbase};
 validateFunding(trade.bitcoin,proof);return proof;
}
const eth=()=>{if(!process.env.ETH_RPC_URL)throw Error('Set ETH_RPC_URL to the selected Ethereum test network node.');return ethereumRpc(process.env.ETH_RPC_URL);};
async function checkIntent(trade,intent){
 if(intent.paymentData!==trade.paymentData||!['release','refund'].includes(intent.kind))throw Error('Settlement intent does not match this saved trade.');
 const proof=funding(trade,intent.fundingTxid,intent.fundingVout);
 const payment=intent.kind==='release'?await verifyEthPayment(trade,intent.ethTxid,eth()):null;
 inspectSettlement(trade.bitcoin,proof,intent.kind,intent.psbt);
 return {proof,payment};
}
try{
 const [command,...args]=process.argv.slice(2);
 if(!command||command==='help'||command==='--help'){console.log(usage);process.exit(0);}
 if(command==='core-key'&&args.length===3){
  const [network,wallet,out]=args,rpc=core(network),address=rpc('getnewaddress',['Lazer escrow','bech32'],wallet),info=rpc('getaddressinfo',[address],wallet);
  if(!info.pubkey||!info.hdkeypath||!info.hdmasterfingerprint)throw Error('Use a Bitcoin Core descriptor wallet that owns this key.');
  save(out,{network,address,pubkey:info.pubkey,keyOrigin:{pubkey:info.pubkey,masterFingerprint:info.hdmasterfingerprint,path:info.hdkeypath}});
 }else if(command==='create'&&args.length===2){
  const input=load(args[0]);save(args[1],createEscrowTrade(createEscrowContract(input.bitcoin),input.payment));
 }else if(command==='payment-request'&&args.length===3){
  const trade=validateTrade(load(args[0]));funding(trade,args[1],args[2]);
  const now=Math.floor(Date.now()/1000);if(now<trade.payment.notBefore||now>trade.payment.expiresAt)throw Error('The agreed payment window is not currently open.');
  console.log(JSON.stringify(paymentRequest(trade),null,2));
 }else if(command==='verify-eth'&&args.length===2){
  console.log(JSON.stringify(await verifyEthPayment(validateTrade(load(args[0])),args[1],eth()),null,2));
 }else if(command==='prepare'&&(args.length===5||args.length===6)){
  const [file,kind,txid,vout,out,ethTxid]=args,trade=validateTrade(load(file)),proof=funding(trade,txid,vout);
  if(kind==='release'&&!ethTxid)throw Error('Release requires the ETH payment transaction hash.');
  const payment=kind==='release'?await verifyEthPayment(trade,ethTxid,eth()):null;
  const psbt=createSettlement(trade.bitcoin,proof,kind);
  save(out,{paymentData:trade.paymentData,kind,fundingTxid:proof.txid,fundingVout:proof.vout,ethTxid:ethTxid||null,payment,psbt,review:inspectSettlement(trade.bitcoin,proof,kind,psbt)});
 }else if(command==='inspect'&&args.length===3){
  const trade=validateTrade(load(args[0])),intent=load(args[1]),{proof,payment}=await checkIntent(trade,intent),part=readFileSync(args[2],'utf8').trim();
  console.log(JSON.stringify({review:inspectSettlement(trade.bitcoin,proof,intent.kind,part),payment},null,2));
 }else if(command==='combine'&&args.length===5){
  const trade=validateTrade(load(args[0])),intent=load(args[1]),{proof,payment}=await checkIntent(trade,intent);
  const parts=args.slice(2,4).map(file=>readFileSync(file,'utf8').trim());
  save(args[4],{...combineSettlement(trade.bitcoin,proof,intent.kind,parts),payment});
 }else throw Error(usage);
}catch(error){console.error(error.message);process.exitCode=1;}
