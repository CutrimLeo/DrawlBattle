import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{cwd:fileURLToPath(new URL('..',import.meta.url)),stdio:'inherit',env:{...process.env,RUST_LOG:'info'}});
process.exit(result.status??1);
