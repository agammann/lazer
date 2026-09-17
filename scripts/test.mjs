import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
mkdirSync("work",{recursive:true});
for(const name of ["engine","bitcoin"]){
 const r=spawnSync(process.execPath,["node_modules/esbuild/bin/esbuild","lib/"+name+".ts","--bundle","--platform=node","--packages=external","--format=esm","--outfile=work/"+name+".mjs"],{stdio:"inherit"});if(r.status)process.exit(r.status);
}
const result=spawnSync(process.execPath,["--test","tests/engine.test.mjs"],{stdio:"inherit"});process.exit(result.status??1);
