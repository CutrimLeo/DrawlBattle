import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { Server } from 'socket.io';
import { GameManager, type ManagerOptions } from './game/manager.js';
import { PrismaMatchRepository, type MatchRepository } from './persistence/repository.js';
export interface ServerOptions extends ManagerOptions {
    databaseUrl?: string;
    repository?: MatchRepository;
    clientOrigin?: string | string[];
}
export function createGameServer(options: ServerOptions = {}) {
    const app = express();
    app.disable('x-powered-by');
    const origins = options.clientOrigin ?? process.env.CLIENT_ORIGIN?.split(',') ?? ['http://localhost:5173', 'http://127.0.0.1:5173'];
    app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: process.env.NODE_ENV === 'production' ? { directives: { 'upgrade-insecure-requests': null } } : false }));
    app.use(cors({ origin: origins, credentials: true }));
    app.use(express.json({ limit: '16kb' }));
    app.use('/api', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
    const allowedOrigins = Array.isArray(origins) ? origins : [origins];
    const server = createServer(app);
    const io = new Server(server, { allowRequest: (request, callback) => { const origin = request.headers.origin; let sameHost = false; try { sameHost = Boolean(origin && new URL(origin).host === request.headers.host); } catch { sameHost = false; } callback(null, !origin || sameHost || allowedOrigins.includes(origin)); }, cors: { origin: origins, credentials: true }, transports: ['websocket', 'polling'], maxHttpBufferSize: 200000, pingInterval: 10000, pingTimeout: 15000 });
    const repository = options.repository ?? new PrismaMatchRepository(options.databaseUrl ?? process.env.DATABASE_URL ?? 'file:./dev.db');
    const manager = new GameManager(io, repository, options);
    io.use((socket, next) => { const token = socket.handshake.auth?.sessionToken; if (token !== undefined && token !== null && (typeof token !== 'string' || !manager.sessions.has(token))) { next(new Error('Sessão expirada. Entre novamente.')); return; } next(); });
    io.on('connection', socket => manager.bind(socket));
    app.get(['/api/health', '/health'], (_req, res) => res.json({ ok: true, service: 'drawbattle', ...manager.stats() }));
    app.get('/api/stats', (_req, res) => res.json(manager.stats()));
    app.get('/api/leaderboard', async (_req, res) => { try {
        res.json(await repository.leaderboard());
    }
    catch (error) {
        console.error(JSON.stringify({ level: 'error', event: 'leaderboard', error: String(error) }));
        res.status(503).json({ error: 'Ranking temporariamente indisponível.' });
    } });
    const clientDir = path.resolve(process.cwd(), 'client/dist');
    if (existsSync(path.join(clientDir, 'index.html'))) {
        app.use(express.static(clientDir));
        app.get('*', (req, res, next) => { if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/'))
            return next(); res.sendFile(path.join(clientDir, 'index.html')); });
    }
    let started = false;
    let closing: Promise<void> | null = null;
    async function start(port = 0, host = '127.0.0.1'): Promise<number> { if (started) {
        const address = server.address();
        return typeof address === 'object' && address ? address.port : port;
    } await repository.init(); await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(); }); }); started = true; const address = server.address(); return typeof address === 'object' && address ? address.port : port; }
    async function close(): Promise<void> { if (closing)
        return closing; closing = (async () => { await manager.close(); await new Promise<void>(resolve => io.close(() => resolve())); if (server.listening)
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await repository.close(); started = false; })(); return closing; }
    return { app, server, io, manager, repository, start, close };
}
