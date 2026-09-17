import { api } from "@/lib/bitcoin";
export const dynamic="force-dynamic";
let cached:{time:number;value:unknown}|undefined;
export async function GET(){
 if(cached&&Date.now()-cached.time<60000)return Response.json(cached.value,{headers:{"Cache-Control":"private, max-age=30"}});
 const values=await Promise.allSettled([
 fetch("https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600",{headers:{Accept:"application/json"},signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data))throw Error();return data.filter((a:unknown)=>Array.isArray(a)&&a.length===6&&a.every(Number.isFinite)).sort((a:number[],b:number[])=>a[0]-b[0]).slice(-72)}),
 api("/v1/fees/recommended"),api("/blocks/tip/height"),fetch("https://mempool.space/api/v1/prices",{signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw Error();return r.json()})
 ]);
 const pick=(i:number)=>values[i].status==="fulfilled"?(values[i] as PromiseFulfilledResult<any>).value:null;
 const value={candles:pick(0)||[],fees:pick(1),height:pick(2),prices:pick(3),fetchedAt:new Date().toISOString(),source:"Coinbase Exchange / mempool.space",errors:values.map((x,i)=>x.status==="rejected"?["Market candles unavailable","Fee estimate unavailable","Block height unavailable","Reference price unavailable"][i]:null).filter(Boolean)};
 cached={time:Date.now(),value};return Response.json(value,{headers:{"Cache-Control":"private, max-age=30"}});
}
