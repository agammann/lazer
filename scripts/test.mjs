import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';
mkdirSync('work', { recursive: true });
for (const name of ['engine', 'bitcoin']) await build({ entryPoints: ['lib/' + name + '.ts'], bundle: true, platform: 'node', packages: 'external', format: 'esm', outfile: 'work/' + name + '.mjs' });
const result = spawnSync(process.execPath, ['--test', 'tests/engine.test.mjs'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
