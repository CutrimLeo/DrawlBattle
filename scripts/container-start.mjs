import {spawnSync,spawn} from 'node:child_process';
for(const args of [['node_modules/prisma/build/index.js','migrate','deploy'],['node_modules/tsx/dist/cli.mjs','prisma/seed.ts']]){const r=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,RUST_LOG: 'info'}});if(r.status!==0)process.exit(r.status??1);}
const server=spawn(process.execPath,['dist/server/index.js'],{stdio:'inherit',env:{...process.env,NODE_ENV:'production'}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.kill(signal));
server.on('exit',code=>process.exit(code??0));
