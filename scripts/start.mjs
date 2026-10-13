import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const server=spawn(process.execPath,['--env-file-if-exists=.env','dist/server/index.js'],{cwd:fileURLToPath(new URL('..',import.meta.url)),stdio:'inherit',env:{...process.env,NODE_ENV:'production'}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.kill(signal));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.on('exit',code=>process.exit(code??0));
