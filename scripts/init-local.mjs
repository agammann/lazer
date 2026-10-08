import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import './sites-env.mjs';

if (!existsSync('dist/server/wrangler.json')) throw Error('Run npm run build before local setup.');
if (!existsSync('.dev.vars')) {
  writeFileSync('.dev.vars', 'TESTNET_WALLET_SEED='+randomBytes(32).toString('hex')+'\n', {flag:'wx',mode:0o600});
  console.log('Created private local wallet configuration; keep it with your local database backup.');
} else if (!/^TESTNET_WALLET_SEED=[a-f0-9]{64}\s*$/im.test(readFileSync('.dev.vars','utf8'))) {
  throw Error('Existing .dev.vars has no valid TESTNET_WALLET_SEED. It was preserved; check your configuration.');
}
const base=['--import','./scripts/sites-env.mjs','node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',process.env.LAZER_LOCAL_STATE || '.wrangler/state'];
const output=execFileSync(process.execPath,[...base,'--command',"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('exchange_sessions','invoice_addresses','request_limits')",'--json'],{encoding:'utf8',windowsHide:true});
const tables=JSON.parse(output).flatMap(r=>r.results).map(r=>r.name).sort();
const expected=['exchange_sessions','invoice_addresses','request_limits'];
if (tables.length===0) {
  for(const file of ['0000_abnormal_dragon_lord.sql','0001_overconfident_doctor_doom.sql'])execFileSync(process.execPath,[...base,'--file','drizzle/'+file],{stdio:'inherit',windowsHide:true});
  console.log('Initialized the fresh local database with both existing migrations.');
} else if (JSON.stringify(tables)!==JSON.stringify(expected)) {
  throw Error('The local database is partly initialized. No migration was applied; inspect its schema and restore a consistent backup.');
} else console.log('Existing local schema and wallet configuration were preserved.');
