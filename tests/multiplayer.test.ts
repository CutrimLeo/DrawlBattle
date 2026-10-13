import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGameServer } from '../server/app.js';
import type { IdentityAck, RoomSnapshot, WordOption } from '../shared/types.js';
import { TestClient, migratedDatabase, stroke } from './helpers/socket.js';

describe('multiplayer real por WebSocket', () => {
  let database: Awaited<ReturnType<typeof migratedDatabase>>;
  let server: Awaited<ReturnType<typeof createGameServer>>;
  let url: string;
  let clients: TestClient[] = [];

  beforeAll(async () => { database = await migratedDatabase(); });
  beforeEach(async () => {
    server = await createGameServer({
      databaseUrl: database.databaseUrl, choiceMs: 2_500, roundMs: 1_800,
      transitionMs: 35, graceMs: 220,
    });
    url = 'http://127.0.0.1:' + await server.start(0);
  });
  afterEach(async () => {
    for (const client of clients) client.disconnect();
    clients = [];
    await server.close();
  });
  afterAll(async () => { await database?.dispose(); });

  async function connect(token?: string) {
    const client = await new TestClient(url, token).connect();
    clients.push(client);
    return client;
  }

  async function create(name = 'Ana', settings = { rounds: 1, roundDuration: 15, maxPlayers: 8 }) {
    const client = await connect();
    const result = await client.send<IdentityAck>('room:create', { name, avatar: 'fox', roomName: 'Sala de testes', settings });
    expect(result.payload.ok).toBe(true);
    client.identity = result.payload;
    await client.stateWhere(state => state.code === result.payload.roomCode);
    return client;
  }

  async function join(host: TestClient, name: string) {
    const client = await connect();
    const result = await client.send<IdentityAck>('room:join', { name, avatar: 'cat', code: host.identity!.roomCode });
    expect(result.payload.ok).toBe(true);
    client.identity = result.payload;
    await client.stateWhere(state => state.players.some(player => player.id === result.payload.playerId));
    return client;
  }

  async function room() {
    const ana = await create();
    const bruno = await join(ana, 'Bruno');
    const clara = await join(ana, 'Clara');
    const players = [ana, bruno, clara];
    await Promise.all(players.map(player => player.stateWhere(state => state.players.length === 3)));
    return players;
  }

  async function begin(players: TestClient[]) {
    expect((await players[0].send('game:start')).payload.ok).toBe(true);
    await players[0].stateWhere(state => state.phase === 'choosing');
    const drawer = players.find(player => player.identity!.playerId === players[0].state!.drawerId)!;
    await drawer.until(() => Boolean(drawer.state?.wordOptions?.length === 3), 'três palavras privadas');
    const word = drawer.state!.wordOptions![0];
    expect((await drawer.send('game:word_select', { wordId: word.id })).payload.ok).toBe(true);
    await Promise.all(players.map(player => player.stateWhere(state => state.phase === 'drawing')));
    return { drawer, word, guessers: players.filter(player => player !== drawer) };
  }

  it('cria salas, conecta três jogadores e aplica limites e permissões do host', async () => {
    const players = await room();
    for (const player of players) {
      expect(player.state!.players).toHaveLength(3);
      expect(player.state!.hostId).toBe(players[0].identity!.playerId);
      expect(player.state!.phase).toBe('lobby');
    }
    expect((await players[1].send('game:start')).payload.ok).toBe(false);
    expect((await players[1].send('room:settings', { rounds: 2 })).payload.ok).toBe(false);
    expect((await players[0].send('room:settings', { maxPlayers: 13 })).payload.ok).toBe(false);
    expect((await players[0].send('room:settings', { maxPlayers: 3, rounds: 2 })).payload.ok).toBe(true);
    const fourth = await connect();
    expect((await fourth.send('room:join', { name: 'Davi', avatar: 'dog', code: players[0].identity!.roomCode })).payload.ok).toBe(false);
  });

  it('sincroniza desenho, undo/redo/clear e chat somente entre participantes da sala', async () => {
    const players = await room();
    const outside = await create('Outro host');
    const outsideGuest = await join(outside, 'Outra pessoa');
    const { drawer, guessers } = await begin(players);
    const drawn = stroke();
    expect((await drawer.send('draw:stroke', drawn)).payload.ok).toBe(true);
    await Promise.all(guessers.map(player => player.until(() => player.messages.some(message => message.type === 'draw:stroke'))));
    await Promise.all(players.map(player => player.stateWhere(state => state.strokes.length === 1)));
    expect(guessers[0].state!.strokes[0]).toEqual(drawn);
    expect((await guessers[0].send('draw:stroke', stroke())).payload.ok).toBe(false);
    expect((await drawer.send('draw:stroke', { ...stroke(), roomId: outside.identity!.roomCode })).payload.ok).toBe(false);
    expect(outside.messages.filter(message => message.type === 'draw:stroke')).toHaveLength(0);
    expect(outsideGuest.state!.strokes).toHaveLength(0);

    expect((await drawer.send('draw:undo')).payload.ok).toBe(true);
    await guessers[0].stateWhere(state => state.strokes.length === 0);
    await drawer.stateWhere(state => state.canRedo);
    expect((await drawer.send('draw:redo')).payload.ok).toBe(true);
    await guessers[0].stateWhere(state => state.strokes.length === 1);
    expect((await drawer.send('draw:clear')).payload.ok).toBe(true);
    await guessers[0].stateWhere(state => state.strokes.length === 0);

    expect((await guessers[0].send('chat:message', { text: 'Olá, sala!' })).payload.ok).toBe(true);
    await drawer.stateWhere(state => state.chat.some(message => message.text === 'Olá, sala!'));
    expect(outsideGuest.state!.chat.some(message => message.text === 'Olá, sala!')).toBe(false);
    expect((await guessers[0].send('chat:message', { text: 'x'.repeat(401) })).payload.ok).toBe(false);
  });

  it('mantém palavras privadas, valida palpites e atualiza pontos sem revelar acertos', async () => {
    const players = await room();
    const { drawer, word, guessers } = await begin(players);
    expect(drawer.state!.secretWord).toBe(word.text);
    for (const guesser of guessers) {
      expect(guesser.state!.secretWord).toBeUndefined();
      expect(guesser.state!.wordOptions).toBeUndefined();
      expect(guesser.messages.some(message => message.type === 'game:word_options')).toBe(false);
      expect(guesser.messages.filter(message => message.type === 'room:state').every(message => {
        const state = message.payload as RoomSnapshot;
        return state.secretWord === undefined && state.wordOptions === undefined;
      })).toBe(true);
    }
    expect((await drawer.send('guess:submit', { text: word.text })).payload.ok).toBe(false);
    expect((await guessers[0].send('guess:submit', { text: 'resposta definitivamente incorreta xyz' })).payload.ok).toBe(true);
    expect(guessers[0].state!.players.find(player => player.id === guessers[0].identity!.playerId)!.score).toBe(0);
    expect((await guessers[0].send('guess:submit', { text: word.text.toLocaleUpperCase('pt-BR') })).payload.ok).toBe(true);
    await guessers[1].stateWhere(state => state.players.some(player => player.id === guessers[0].identity!.playerId && player.guessed));
    const snapshot = guessers[1].state!;
    expect(snapshot.players.find(player => player.id === guessers[0].identity!.playerId)!.score).toBeGreaterThan(0);
    expect(snapshot.players.find(player => player.id === drawer.identity!.playerId)!.score).toBeGreaterThan(0);
    expect(snapshot.phase).toBe('drawing');
    expect(snapshot.chat.some(message => message.kind === 'correct')).toBe(true);
    expect(snapshot.chat.filter(message => message.kind === 'correct').some(message => message.text.toLocaleLowerCase('pt-BR').includes(word.text.toLocaleLowerCase('pt-BR')))).toBe(false);
    expect(guessers[1].messages.filter(message => message.type === 'guess:correct').some(message => JSON.stringify(message.payload).includes(word.text))).toBe(false);
    expect((await guessers[0].send('chat:message', { text: word.text })).payload.ok).toBe(false);
    expect((await guessers[0].send('guess:submit', { text: word.text })).payload.ok).toBe(false);
  });

  it('usa o mesmo deadline do servidor para três clientes e encerra pelo tempo', async () => {
    const players = await room();
    const { word } = await begin(players);
    const endsAt = players[0].state!.endsAt!;
    expect(players.map(player => player.state!.endsAt)).toEqual([endsAt, endsAt, endsAt]);
    expect(endsAt - players[0].state!.startedAt!).toBeGreaterThan(0);
    expect((await players[1].send('game:start', { endsAt: Date.now() + 100_000 })).payload.ok).toBe(false);
    await players[0].until(() => players[0].messages.some(message => message.type === 'game:round_end'), 'fim por tempo');
    expect(Date.now()).toBeGreaterThanOrEqual(endsAt - 40);
    const end = players[0].messages.find(message => message.type === 'game:round_end')!;
    expect(JSON.stringify(end.payload)).toContain(word.text);
    const deadlines = players.map(player => player.messages.find(message => message.type === 'game:round_start')?.payload);
    expect(deadlines.every(payload => Boolean(payload))).toBe(true);
  });

  it('emite aviso sincronizado quando restam dez segundos', async () => {
    await server.close();
    server = await createGameServer({ databaseUrl: database.databaseUrl, roundMs: 10_500, choiceMs: 2_500, transitionMs: 35, graceMs: 220 });
    url = 'http://127.0.0.1:' + await server.start(0);
    const players = await room();
    await begin(players);
    await Promise.all(players.map(player => player.stateWhere(state => state.chat.some(message => message.text === 'Restam 10 segundos!'))));
    for (const player of players) {
      expect(player.state!.phase).toBe('drawing');
      expect(player.state!.endsAt! - player.state!.serverTime).toBeGreaterThan(9_500);
      expect(player.state!.endsAt! - player.state!.serverTime).toBeLessThanOrEqual(10_020);
    }
  });

  it('reconecta por token sem duplicar identidade e restaura o desenho atual', async () => {
    const players = await room();
    const { drawer } = await begin(players);
    const drawn = stroke();
    expect((await drawer.send('draw:stroke', drawn)).payload.ok).toBe(true);
    const reconnecting = players.find(player => player !== drawer)!;
    const identity = reconnecting.identity!;
    reconnecting.disconnect();
    await drawer.stateWhere(state => state.players.some(player => player.id === identity.playerId && !player.connected));
    const resumed = await connect(identity.sessionToken);
    resumed.identity = identity;
    await resumed.stateWhere(state => state.players.some(player => player.id === identity.playerId && player.connected));
    expect(resumed.state!.players).toHaveLength(3);
    expect(resumed.state!.players.filter(player => player.id === identity.playerId)).toHaveLength(1);
    expect(resumed.state!.strokes).toEqual([drawn]);
    expect(resumed.state!.secretWord).toBeUndefined();
    expect((await resumed.send('chat:message', { text: 'Voltei!' })).payload.ok).toBe(true);
    await drawer.stateWhere(state => state.chat.some(message => message.text === 'Voltei!'));
  });

  it('remove inativos após tolerância, transfere host e trata a saída do desenhista', async () => {
    const players = await room();
    const hostId = players[0].identity!.playerId;
    const { drawer } = await begin(players);
    expect(drawer).toBe(players[0]);
    players[0].disconnect();
    await players[1].stateWhere(state => state.players.some(player => player.id === hostId && !player.connected));
    await players[1].stateWhere(state => state.players.length === 2 && state.hostId !== hostId, 'transferência do administrador');
    expect(players[1].state!.players.some(player => player.isHost && player.connected)).toBe(true);
    expect(players[1].messages.some(message => message.type === 'player:left')).toBe(true);
    await players[1].until(() => players[1].messages.some(message => message.type === 'game:round_end'), 'fim com desenhista inativo');
  });

  it('conclui todos os turnos, persiste ranking real e inicia uma nova partida', async () => {
    const players = await room();
    expect((await players[0].send('game:start')).payload.ok).toBe(true);
    for (let turn = 1; turn <= 3; turn++) {
      await players[0].stateWhere(state => state.phase === 'choosing' && state.turn === turn, 'seleção do turno ' + turn);
      const drawer = players.find(player => player.identity!.playerId === players[0].state!.drawerId)!;
      await drawer.until(() => Boolean(drawer.state?.wordOptions?.length), 'opções da palavra');
      const word = drawer.state!.wordOptions![0] as WordOption;
      expect((await drawer.send('game:word_select', { wordId: word.id })).payload.ok).toBe(true);
      await drawer.stateWhere(state => state.phase === 'drawing');
      if (turn === 1) {
        const drawn = stroke();
        expect((await drawer.send('draw:stroke', drawn)).payload.ok).toBe(true);
        const late = await join(players[0], 'Davi');
        players.push(late);
        await late.stateWhere(state => state.phase === 'drawing' && state.strokes.length === 1);
        expect(late.state!.secretWord).toBeUndefined();
        expect(late.state!.strokes).toEqual([drawn]);
      }
      for (const guesser of players.filter(player => player !== drawer)) {
        expect((await guesser.send('guess:submit', { text: word.text })).payload.ok).toBe(true);
      }
    }
    await players[0].stateWhere(state => state.phase === 'finished', 'resultado final');
    await players[0].until(() => players[0].messages.some(message => message.type === 'game:finish'), 'persistência do resultado');
    expect(players[0].state!.stats!.completedTurns).toBe(3);
    expect(players[0].state!.stats!.correctGuesses).toBe(9);
    expect(players[0].state!.ranking).toHaveLength(4);
    expect(players[0].state!.players.every(player => player.score > 0 && player.correctGuesses === (player.name === 'Davi' ? 3 : 2))).toBe(true);
    const leaderboard = await (await fetch(url + '/api/leaderboard')).json() as { name: string; matchesPlayed: number }[];
    expect(leaderboard.some(player => player.name === 'Ana' && player.matchesPlayed > 0)).toBe(true);
    expect(leaderboard.some(player => player.name === 'Davi' && player.matchesPlayed > 0)).toBe(true);
    expect((await players[0].send('game:start')).payload.ok).toBe(true);
    await players[0].stateWhere(state => state.phase === 'choosing' && state.turn === 1);
    expect(players[0].state!.players.every(player => player.score === 0 && player.correctGuesses === 0)).toBe(true);
  });

  it('aplica proteção contra spam sem desconectar os demais participantes', async () => {
    const players = await room();
    for (let index = 0; index < 5; index++) {
      expect((await players[0].send('chat:message', { text: 'Mensagem ' + index })).payload.ok).toBe(true);
    }
    const blocked = await players[0].send('chat:message', { text: 'Sexta mensagem' });
    expect(blocked.payload.ok).toBe(false);
    expect(blocked.payload.code).toBe('RATE_LIMIT');
    await players[1].stateWhere(state => state.chat.filter(message => message.kind === 'message').length === 5);
    expect(players[1].state!.players.every(player => player.connected)).toBe(true);
  });

  it('rejeita envelopes/payloads malformados e ações de clientes sem sessão', async () => {
    const anonymous = await connect();
    expect((await anonymous.send('game:start')).payload.ok).toBe(false);
    expect((await anonymous.send('draw:clear')).payload.ok).toBe(false);
    const forgedSession = new TestClient(url, 'token-forjado');
    clients.push(forgedSession);
    await expect(forgedSession.connect()).rejects.toThrow();
    const players = await room();
    expect((await players[0].raw('chat:message', { payload: { text: 'sem envelope' } })).payload.ok).toBe(false);
    expect((await players[0].send('chat:message', { text: '<script>alert(1)</script>' })).payload.ok).toBe(true);
    await players[1].stateWhere(state => state.chat.some(message => message.name === 'Ana' && message.kind === 'message'));
    expect(players[1].state!.chat.some(message => message.text.includes('<script>'))).toBe(false);
    const { drawer } = await begin(players);
    expect((await drawer.send('draw:stroke', { ...stroke(), points: [{ x: -1, y: 2 }] })).payload.ok).toBe(false);
    expect((await drawer.send('draw:stroke', { ...stroke(), brushSize: 999 })).payload.ok).toBe(false);
    expect((await players[1].send('player:kick', { playerId: players[0].identity!.playerId })).payload.ok).toBe(false);
    expect((await players[1].send('game:word_select', { wordId: 'forged' })).payload.ok).toBe(false);
  });
});
