import test from 'node:test';
import assert from 'node:assert/strict';
import {ECPairFactory} from 'ecpair';
import * as ecc from '@bitcoinerlab/secp256k1';
import {payments,networks,Psbt,Transaction} from 'bitcoinjs-lib';
import {createEscrowContract,validateContract,validateFunding,createSettlement,inspectSettlement,combineSettlement} from '../work/escrow.mjs';
const ECPair=ECPairFactory(ecc);
const keys=[1,2,3,4].map(n=>ECPair.fromPrivateKey(Buffer.alloc(32,n),{network:networks.regtest}));
const pub=i=>Buffer.from(keys[i].publicKey).toString('hex');
const receiving=i=>payments.p2wpkh({pubkey:keys[i].publicKey,network:networks.regtest}).address;
const terms={tradeId:'escrow-test-1',network:'regtest',sellerPubkey:pub(0),buyerPubkey:pub(1),arbitratorPubkey:pub(2),sellerRefundAddress:receiving(0),buyerReceiveAddress:receiving(1),sats:100000,feeSats:1000};
const contract=()=>createEscrowContract(terms);
const funding=c=>({network:'regtest',txid:'ab'.repeat(32),vout:0,sats:c.fundingSats,script:c.outputScript,confirmations:6,unspent:true,coinbase:false});
const sign=(encoded,i)=>Psbt.fromBase64(encoded).signInput(0,keys[i]).toBase64();

test('escrow derives a deterministic native SegWit two of three contract without private keys',()=>{
 const c=contract();assert.ok(c.address.startsWith('bcrt1q'));assert.equal(c.fundingSats,101000);assert.match(c.descriptor,/^wsh\(sortedmulti\(2,/);assert.deepEqual(c,validateContract(c));assert.equal(c.address,createEscrowContract({...terms,sellerPubkey:pub(1),buyerPubkey:pub(0)}).address);
 assert.notEqual(c.termsHash,createEscrowContract({...terms,sats:200000}).termsHash);
});
test('escrow rejects mainnet, duplicate keys, malformed keys and invalid destinations',()=>{
 for(const change of [{network:'mainnet'},{network:'signet'},{buyerPubkey:pub(0)},{arbitratorPubkey:'02'+'00'.repeat(32)},{buyerReceiveAddress:receiving(0)},{buyerReceiveAddress:payments.p2wpkh({pubkey:keys[1].publicKey,network:networks.bitcoin}).address},{feeSats:0},{sats:1.5}])assert.throws(()=>createEscrowContract({...terms,...change}));
});
test('altered saved contracts are rejected',()=>{
 const c=contract();for(const change of [{termsHash:'00'.repeat(32)},{address:receiving(2)},{witnessScript:'51'},{sats:200000}])assert.throws(()=>validateContract({...c,...change}),/altered/);
});
test('funding must be the exact confirmed unspent output on the selected chain',()=>{
 const c=contract(),p=funding(c);
 for(const change of [{network:'testnet4'},{confirmations:5},{confirmations:NaN},{sats:100000},{script:'0014'+'00'.repeat(20)},{unspent:false},{coinbase:true},{vout:-1}])assert.throws(()=>validateFunding(c,{...p,...change}));
});
test('one participant including the operator cannot finalize escrow',()=>{
 const c=contract(),p=funding(c),unsigned=createSettlement(c,p,'release');
 for(let i=0;i<3;i++){const part=sign(unsigned,i);assert.equal(inspectSettlement(c,p,'release',part).readyToFinalize,false);assert.throws(()=>combineSettlement(c,p,'release',[part]),/Two distinct/);}
});
test('two independent signatures release the exact amount to the buyer',()=>{
 const c=contract(),p=funding(c),unsigned=createSettlement(c,p,'release'),result=combineSettlement(c,p,'release',[sign(unsigned,0),sign(unsigned,1)]),tx=Transaction.fromHex(result.raw);
 assert.deepEqual(new Set(result.signedBy),new Set(['seller','buyer']));assert.equal(tx.outs.length,1);assert.equal(tx.outs[0].value,100000n);assert.equal(tx.ins[0].witness.length,4);assert.equal(result.feeSats,1000);assert.equal(result.destination,c.buyerReceiveAddress);
 const all=combineSettlement(c,p,'release',[0,1,2].map(i=>sign(unsigned,i)));assert.equal(Transaction.fromHex(all.raw).ins[0].witness.length,4);assert.equal(all.signedBy.length,2);
});
test('operator with seller can authorize a refund, operator with buyer can authorize release',()=>{
 const c=contract(),p=funding(c);
 for(const [kind,other] of [['refund',0],['release',1]]){const u=createSettlement(c,p,kind),r=combineSettlement(c,p,kind,[sign(u,2),sign(u,other)]);assert.equal(r.destination,kind==='refund'?c.sellerRefundAddress:c.buyerReceiveAddress);}
});
test('submitting the same signature twice does not meet the threshold',()=>{
 const c=contract(),p=funding(c),one=sign(createSettlement(c,p,'release'),0);assert.throws(()=>combineSettlement(c,p,'release',[one,one]),/Two distinct/);
});
test('PSBT input, destination, amount, fee and policy substitution are rejected',()=>{
 const c=contract(),p=funding(c),u=createSettlement(c,p,'release');
 const refund=createSettlement(c,p,'refund');assert.throws(()=>inspectSettlement(c,p,'release',refund),/changes/);
 const replacement=Psbt.fromBase64(u,{network:networks.regtest});replacement.addOutput({address:receiving(3),value:1n});assert.throws(()=>inspectSettlement(c,p,'release',replacement.toBase64()),/changes/);
 const feeChanged=createSettlement(createEscrowContract({...terms,feeSats:2000}),{...p,sats:102000},'release');assert.throws(()=>inspectSettlement(c,p,'release',feeChanged),/signing data/);
 const lock=Psbt.fromBase64(u);lock.setLocktime(100);assert.throws(()=>inspectSettlement(c,p,'release',lock.toBase64()),/changes/);
 const other=createSettlement(c,{...p,txid:'cd'.repeat(32)},'release');assert.throws(()=>inspectSettlement(c,p,'release',other),/changes/);
});
test('non ALL signatures and forged signature bytes are rejected',()=>{
 const c=contract(),p=funding(c),u=createSettlement(c,p,'release');
 const unsafe=Psbt.fromBase64(u);unsafe.data.inputs[0].sighashType=Transaction.SIGHASH_NONE;unsafe.signInput(0,keys[0],[Transaction.SIGHASH_NONE]);assert.throws(()=>inspectSettlement(c,p,'release',unsafe.toBase64()),/sighash/);
 const forged=Psbt.fromBase64(sign(u,0));forged.data.inputs[0].partialSig[0].signature[10]^=1;assert.throws(()=>inspectSettlement(c,p,'release',forged.toBase64()));
 const outsider=Psbt.fromBase64(sign(u,0));outsider.data.inputs[0].partialSig[0].pubkey=keys[3].publicKey;assert.throws(()=>inspectSettlement(c,p,'release',outsider.toBase64()),/Unexpected signer/);
});
test('a funding output that becomes spent or loses confirmations blocks combining',()=>{
 const c=contract(),p=funding(c),u=createSettlement(c,p,'release'),parts=[sign(u,0),sign(u,1)];
 assert.throws(()=>combineSettlement(c,{...p,unspent:false},'release',parts),/unspent/);
 assert.throws(()=>combineSettlement(c,{...p,confirmations:2},'release',parts),/confirmations/);
});
test('release and refund signatures cannot be mixed',()=>{
 const c=contract(),p=funding(c);
 assert.throws(()=>combineSettlement(c,p,'release',[sign(createSettlement(c,p,'release'),0),sign(createSettlement(c,p,'refund'),1)]),/changes/);
});
