import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const [rail, environment, value] = process.argv.slice(2);
if (!rail || !environment || !value || process.argv.length !== 5) {
  console.error('Usage: npm run funding:inspect -- lightning <mainnet|test|regtest> <invoice>');
  process.exit(1);
}
try {
  mkdirSync('work', { recursive: true });
  await build({ entryPoints: ['lib/funding-inspect.ts'], bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: 'work/funding-inspect.mjs' });
  const { inspectFunding } = await import(pathToFileURL(resolve('work/funding-inspect.mjs')).href);
  console.log(JSON.stringify(inspectFunding(rail, value, environment), null, 2));
} catch {
  // Do not echo input or third-party exceptions: callers may accidentally supply secrets.
  console.error('Inspection failed. Check the rail, environment, encoding and invoice expiry. This tool does not accept seeds, keys, or wallet credentials.');
  process.exitCode = 1;
}
