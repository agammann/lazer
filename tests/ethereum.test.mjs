import test from 'node:test';
import assert from 'node:assert/strict';
import {ECPairFactory} from 'ecpair';
import * as ecc from '@bitcoinerlab/secp256k1';
import {payments,networks} from 'bitcoinjs-lib';
import {createEscrowContract} from '../work/escrow.mjs';
import {createEscrowTrade,validateTrade,paymentRequest,verifyEthPayment,ethereumRpc} from '../work/ethereum.mjs';
const ECPair=ECPairFactory(ecc),keys=[1,2,3].map(n=>ECPair.fromPrivateKey(Buffer.alloc(32,n)));
const bitcoin=createEscrowContract({tradeId:'btc-eth-1',network:'regtest',sellerPubkey:Buffer.from(keys[0].publicKey).toString('hex'),buyerPubkey:Buffer.from(keys[1].publicKey).toString('hex'),arbitratorPubkey:Buffer.from(keys[2].publicKey).toString('hex'),sellerRefundAddress:payments.p2wpkh({pubkey:keys[0].publicKey,network:networks.regtest}).address,buyerReceiveAddress:payments.p2wpkh({pubkey:keys[1].publicKey,network:networks.regtest}).address,sats:100000,feeSats:1000});
const payment={network:'sepolia',buyerAddress:'0x'+'11'.repeat(20),sellerAddress:'0x'+'22'.repeat(20),wei:'1000000000000000',notBefore:1700000000,expiresAt:1700003600};
const txid='0x'+'ab'.repeat(32),blockHash='0x'+'cd'.repeat(32);
function fixture(){
 const trade=createEscrowTrade(bitcoin,payment),request=paymentRequest(trade);
 const data={chain:'0xaa36a7',tx:{hash:txid,from:request.from,to:request.to,value:request.value,input:request.data,chainId:request.chainId,blockHash,blockNumber:'0x64'},receipt:{transactionHash:txid,from:request.from,to:request.to,status:'0x1',blockHash,blockNumber:'0x64'},block:{hash:blockHash,number:'0x64',timestamp:'0x6553f164'},finalized:{hash:'0x'+'ef'.repeat(32),number:'0x70'},code:'0x'};
 const rpc=async(method,params=[])=>structuredClone(method==='eth_chainId'?data.chain:method==='eth_getTransactionByHash'?data.tx:method==='eth_getTransactionReceipt'?data.receipt:method==='eth_getCode'?data.code:params[0]==='finalized'?data.finalized:data.block);
 return {trade,data,rpc};
}
test('ETH payment request binds exact native value, payer, recipient and trade',()=>{
 const {trade}=fixture(),r=paymentRequest(trade);assert.equal(r.to,payment.sellerAddress);assert.equal(BigInt(r.value),1000000000000000n);assert.equal(r.data,trade.paymentData);
 const other=createEscrowTrade(createEscrowContract({...bitcoin,tradeId:'different-trade'}),payment);assert.notEqual(other.paymentData,trade.paymentData);assert.deepEqual(validateTrade(trade),trade);
});
test('payment terms reject mainnet, invalid amounts, addresses and altered commitments',()=>{
 for(const change of [{network:'ethereum'},{wei:'0'},{wei:'1.1'},{wei:'1e18'},{wei:'100000000000000000001'},{sellerAddress:payment.buyerAddress},{sellerAddress:'0x'+'00'.repeat(20)},{expiresAt:payment.notBefore}])assert.throws(()=>createEscrowTrade(bitcoin,{...payment,...change}));
 const {trade}=fixture();assert.throws(()=>validateTrade({...trade,payment:{...payment,wei:'2'}}),/altered/);
});
test('finalized native ETH with exact terms verifies',async()=>{
 const {trade,rpc}=fixture(),proof=await verifyEthPayment(trade,txid,rpc);assert.equal(proof.finalized,true);assert.equal(proof.wei,payment.wei);assert.equal(proof.chainId,11155111);
});
test('wrong network and pending transactions never verify',async()=>{
 for(const mutate of [d=>d.chain='0x1',d=>d.tx=null,d=>d.receipt=null,d=>d.tx.blockNumber=null]){
  const {trade,data,rpc}=fixture();mutate(data);await assert.rejects(verifyEthPayment(trade,txid,rpc));
 }
});
test('reverted, wrong payer, wrong recipient, wrong amount and missing reference payments are rejected',async()=>{
 for(const mutate of [d=>d.receipt.status='0x0',d=>d.tx.from=payment.sellerAddress,d=>d.tx.to=payment.buyerAddress,d=>d.tx.value='0x1',d=>d.tx.input='0x',d=>d.receipt.to=payment.buyerAddress,d=>d.tx.chainId='0x1']){
  const {trade,data,rpc}=fixture();mutate(data);await assert.rejects(verifyEthPayment(trade,txid,rpc));
 }
});
test('block mismatch, reorganization and unavailable finality are rejected',async()=>{
 for(const mutate of [d=>d.receipt.blockHash='0x'+'00'.repeat(32),d=>d.block.hash='0x'+'00'.repeat(32),d=>d.finalized.number='0x63',d=>d.finalized.number='0x64',d=>d.finalized=null,d=>d.block.number='0x65']){
  const {trade,data,rpc}=fixture();mutate(data);await assert.rejects(verifyEthPayment(trade,txid,rpc));
 }
});
test('payments before or after the agreed window are rejected',async()=>{
 for(const stamp of [payment.notBefore-1,payment.expiresAt+1]){
  const {trade,data,rpc}=fixture();data.block.timestamp='0x'+stamp.toString(16);await assert.rejects(verifyEthPayment(trade,txid,rpc),/window/);
 }
});
test('contract recipients and token calls are not mistaken for native ETH payment',async()=>{
 const {trade,data,rpc}=fixture();data.code='0x6000';await assert.rejects(verifyEthPayment(trade,txid,rpc),/plain receiving/);
 data.code='0x';data.tx.value='0x0';data.tx.input='0xa9059cbb';await assert.rejects(verifyEthPayment(trade,txid,rpc));
});
test('payment from another trade fails even when recipient and value match',async()=>{
 const {trade,rpc}=fixture(),other=createEscrowTrade(createEscrowContract({...bitcoin,tradeId:'different'}),payment);
 await assert.rejects(verifyEthPayment(other,txid,rpc),/not bound/);
});
test('RPC transport enforces read only methods and response correlation',async()=>{
 const calls=[];
 const rpc=ethereumRpc('https://rpc.example',async(url,options)=>{const call=JSON.parse(options.body);calls.push(call);return Response.json({jsonrpc:'2.0',id:call.id,result:'0xaa36a7'});});
 assert.equal(await rpc('eth_chainId'),'0xaa36a7');assert.equal(calls.length,1);await assert.rejects(rpc('eth_sendTransaction',[{}]),/Only payment/);assert.equal(calls.length,1);
 const wrong=ethereumRpc('https://rpc.example',async()=>Response.json({jsonrpc:'2.0',id:999,result:'0x1'}));await assert.rejects(wrong('eth_chainId'),/invalid response/);
 assert.throws(()=>ethereumRpc('http://remote.example'),/HTTPS/);
});
test('malformed provider quantities and oversized responses fail closed',async()=>{
 const {trade,data,rpc}=fixture();data.tx.value='0x00';await assert.rejects(verifyEthPayment(trade,txid,rpc),/Invalid Ethereum/);
 const huge=ethereumRpc('https://rpc.example',async()=>new Response('x'.repeat(1_000_001)));await assert.rejects(huge('eth_chainId'),/too large/);
});
