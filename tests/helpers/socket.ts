import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { promisify } from 'node:util';
import { io, type Socket } from 'socket.io-client';
import type { Envelope, IdentityAck, RoomSnapshot, Stroke } from '../../shared/types.js';

const exec = promisify(execFile);
export const timeout = 5_000;

export class TestClient {
  readonly socket: Socket;
  readonly messages: Envelope[] = [];
  identity?: IdentityAck;

  constructor(url: string, sessionToken?: string) {
    this.socket = io(url, {
      transports: ['websocket'], autoConnect: false, reconnection: false,
      auth: sessionToken ? { sessionToken } : {},
    });
    this.socket.onAny((_event: string, data: Envelope) => this.messages.push(data));
  }

  async connect() {
    const connected = new Promise<void>((resolveConnect, reject) => {
      this.socket.once('connect', resolveConnect);
      this.socket.once('connect_error', reject);
    });
    this.socket.connect();
    await connected;
    return this;
  }

  async send<T = Record<string, unknown>>(type: string, payload: unknown = {}) {
    return this.raw<T>(type, { type, requestId: randomUUID(), timestamp: Date.now(), payload });
  }

  raw<T = Record<string, unknown>>(type: string, envelope: unknown) {
    return new Promise<Envelope<T>>((resolveAck, reject) => {
      this.socket.timeout(timeout).emit(type, envelope, (error: Error | null, ack: Envelope<T>) => {
        if (error) reject(error);
        else resolveAck(ack);
      });
    });
  }

  latest<T>(type: string) {
    return [...this.messages].reverse().find(message => message.type === type)?.payload as T | undefined;
  }

  get state() {
    return this.latest<RoomSnapshot>('room:state');
  }

  async until(predicate: () => boolean, description = 'estado esperado', limit = timeout) {
    const started = Date.now();
    while (!predicate()) {
      if (Date.now() - started > limit) {
        throw new Error('Tempo esgotado aguardando ' + description + '; estado: ' + JSON.stringify(this.state));
      }
      await new Promise(resolveWait => setTimeout(resolveWait, 10));
    }
  }

  async stateWhere(predicate: (state: RoomSnapshot) => boolean, description = 'estado da sala') {
    await this.until(() => Boolean(this.state && predicate(this.state)), description);
    return this.state!;
  }

  disconnect() { this.socket.disconnect(); }
}

export function stroke(): Stroke {
  return { id: randomUUID(), points: [{ x: .1, y: .2 }, { x: .25, y: .35 }], color: '#8B5CF6', brushSize: 6, tool: 'pencil' };
}

/** A migration real é aplicada ao SQLite temporário; nenhuma resposta do jogo é simulada. */
export async function migratedDatabase() {
  const tempRoot = resolve(tmpdir());
  const directory = await mkdtemp(join(tempRoot, 'drawbattle-tests-'));
  if (resolve(dirname(directory)).toLowerCase() !== tempRoot.toLowerCase()) {
    throw new Error('Diretório temporário de testes fora da raiz permitida.');
  }
  const databaseUrl = 'file:' + join(directory, 'game.db').replaceAll('\\', '/');
  const migrationEnvironment = { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info', DEBUG: [process.env.DEBUG, 'prisma:schemaEngine*'].filter(Boolean).join(',') };
  try {
    await exec(process.execPath, [
      resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy',
      '--schema', resolve('prisma/schema.prisma'),
    ], { env: migrationEnvironment });
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string; code?: unknown };
    const environment = { nodeEnv: process.env.NODE_ENV, vitest: process.env.VITEST, workerId: process.env.VITEST_WORKER_ID, nodeOptions: process.env.NODE_OPTIONS, schemaEngine: process.env.PRISMA_SCHEMA_ENGINE_BINARY, queryEngine: process.env.PRISMA_QUERY_ENGINE_LIBRARY, rustLog: migrationEnvironment.RUST_LOG };
    throw new Error('Falha na migration SQLite real: ' + JSON.stringify({ databaseUrl, executable: process.execPath, environment, exitCode: failure.code, stdout: failure.stdout, stderr: failure.stderr, message: failure.message }));
  }
  return { databaseUrl, dispose: () => rm(directory, { recursive: true, force: true }) };
}
