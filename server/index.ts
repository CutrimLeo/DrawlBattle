import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createGameServer } from './app.js';
export { createGameServer } from './app.js';
export type { ServerOptions } from './app.js';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const game = createGameServer();
    const port = Number(process.env.PORT ?? 3001);
    game.start(port, process.env.HOST ?? '0.0.0.0').then(actual => console.log(JSON.stringify({ level: 'info', event: 'server:start', port: actual }))).catch(error => { console.error(JSON.stringify({ level: 'error', event: 'server:start', error: String(error) })); process.exitCode = 1; });
    let stopping = false;
    async function shutdown() { if (stopping)
        return; stopping = true; await game.close(); process.exitCode = 0; }
    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
}
