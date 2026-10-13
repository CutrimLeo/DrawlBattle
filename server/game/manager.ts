import { v4 as uuid } from 'uuid';
import type { Server, Socket } from 'socket.io';
import { DEFAULT_SETTINGS } from '../../shared/types.js';
import type { AckPayload, ChatMessage, Envelope, MatchStats, Player, RoomEvent, RoomSettings, RoomSnapshot, Stroke, WordOption } from '../../shared/types.js';
import { envelopeSchema, payloadSchemas, type ClientEvent } from '../validation.js';
import { computeScore, normalizeGuess, sanitizeText } from './scoring.js';
import { selectWords } from './words.js';
import { MemoryActiveRoomStore, type ActiveRoomStore } from './store.js';
import type { MatchRepository } from '../persistence/repository.js';
export interface ManagerOptions {
    choiceMs?: number;
    transitionMs?: number;
    graceMs?: number;
    roundMs?: number;
    now?: () => number;
    activeStore?: ActiveRoomStore<Room>;
}
interface Participant extends Player {
    token: string;
    socketId: string | null;
    graceTimer?: ReturnType<typeof setTimeout>;
}
interface Room {
    id: string;
    code: string;
    name: string;
    hostId: string;
    settings: RoomSettings;
    phase: RoomSnapshot['phase'];
    players: Map<string, Participant>;
    participants: Map<string, Participant>;
    round: number;
    turn: number;
    schedule: string[];
    drawerId: string | null;
    options: WordOption[];
    word: WordOption | null;
    startedAt: number | null;
    endsAt: number | null;
    choiceEndsAt: number | null;
    matchStartedAt: number | null;
    matchId: string | null;
    completedTurns: number;
    strokes: Stroke[];
    history: Stroke[][];
    redo: Stroke[][];
    chat: ChatMessage[];
    events: RoomEvent[];
    timers: Set<ReturnType<typeof setTimeout>>;
    snapshotTimer?: ReturnType<typeof setTimeout>;
    stats: MatchStats | null;
}
class GameError extends Error {
    constructor(message: string, readonly code = 'INVALID_ACTION') { super(message); }
}
interface Bucket {
    start: number;
    count: number;
}
export class GameManager {
    readonly rooms: ActiveRoomStore<Room>['rooms'];
    readonly sessions: ActiveRoomStore<Room>['sessions'];
    private readonly buckets = new Map<string, Bucket>();
    private readonly pending = new Set<Promise<unknown>>();
    private closed = false;
    readonly now: () => number;
    constructor(readonly io: Server, readonly repository: MatchRepository, readonly options: ManagerOptions = {}) { this.now = options.now ?? Date.now; const store = options.activeStore ?? new MemoryActiveRoomStore<Room>(); this.rooms = store.rooms; this.sessions = store.sessions; }
    envelope<T>(type: string, payload: T, requestId = uuid()): Envelope<T> { return { type, requestId, timestamp: this.now(), payload }; }
    stats() { return { onlinePlayers: [...this.rooms.values()].reduce((n, r) => n + [...r.players.values()].filter(p => p.connected).length, 0), rooms: this.rooms.size }; }
    publicPlayer(p: Participant, room: Room): Player { return { id: p.id, name: p.name, avatar: p.avatar, score: p.score, correctGuesses: p.correctGuesses, connected: p.connected, guessed: p.guessed, isHost: p.id === room.hostId }; }
    ranking(room: Room): Player[] { const source = room.phase === 'finished' ? room.participants : room.players; return [...source.values()].map(p => this.publicPlayer(p, room)).sort((a, b) => b.score - a.score || b.correctGuesses - a.correctGuesses || a.name.localeCompare(b.name)); }
    snapshot(room: Room, playerId: string): RoomSnapshot {
        const drawer = playerId === room.drawerId;
        const text = room.word?.text ?? '';
        const snapshot: RoomSnapshot = { id: room.id, code: room.code, name: room.name, hostId: room.hostId, settings: { ...room.settings }, phase: room.phase, players: [...room.players.values()].map(p => this.publicPlayer(p, room)), round: room.round, turn: room.turn, totalTurns: room.schedule.length, drawerId: room.drawerId, serverTime: this.now(), startedAt: room.startedAt, endsAt: room.endsAt, choiceEndsAt: room.choiceEndsAt, wordLength: [...text].filter(c => c !== ' ').length, wordHint: text.replace(/[^ -]/g, '_'), category: room.word?.category ?? null, difficulty: room.word?.difficulty ?? null, strokes: room.strokes, canUndo: drawer && room.phase === 'drawing' && room.history.length > 0, canRedo: drawer && room.phase === 'drawing' && room.redo.length > 0, chat: room.chat, events: room.events, ranking: this.ranking(room), stats: room.stats };
        if (drawer && room.phase === 'choosing')
            snapshot.wordOptions = room.options;
        if (drawer && room.phase === 'drawing')
            snapshot.secretWord = text;
        if (room.phase === 'round_end' || room.phase === 'finished')
            snapshot.revealedWord = text || undefined;
        return snapshot;
    }
    emitRoom(room: Room, type: string, payload: unknown) { this.io.to(room.id).emit(type, this.envelope(type, payload)); }
    emitState(room: Room) { for (const player of room.players.values())
        if (player.socketId && player.connected)
            this.io.to(player.socketId).emit('room:state', this.envelope('room:state', this.snapshot(room, player.id))); }
    queueState(room: Room) { if (room.snapshotTimer)
        return; room.snapshotTimer = setTimeout(() => { room.snapshotTimer = undefined; if (this.rooms.has(room.code))
        this.emitState(room); }, 45); }
    system(room: Room, text: string, type = 'system') { const timestamp = this.now(); const m: ChatMessage = { id: uuid(), name: 'DrawBattle', text, kind: 'system', timestamp }; room.chat.push(m); room.chat = room.chat.slice(-150); room.events.push({ id: uuid(), type, text, timestamp }); room.events = room.events.slice(-100); this.emitRoom(room, 'chat:message', m); }
    schedule(room: Room, fn: () => void, delay: number) { const timer = setTimeout(() => { room.timers.delete(timer); if (!this.closed && this.rooms.has(room.code))
        fn(); }, Math.max(0, delay)); room.timers.add(timer); }
    clearTimers(room: Room) { for (const timer of room.timers)
        clearTimeout(timer); room.timers.clear(); if (room.snapshotTimer)
        clearTimeout(room.snapshotTimer); room.snapshotTimer = undefined; }
    allow(socket: Socket, event: string) { const group = event.startsWith('draw:') ? 'draw' : event === 'chat:message' || event === 'guess:submit' ? 'chat' : 'action'; const key = socket.id + ':' + group; const window = group === 'chat' ? 3000 : 1000; const limit = group === 'chat' ? 5 : group === 'draw' ? 100 : 40; const now = this.now(); let b = this.buckets.get(key); if (!b || now - b.start >= window) {
        b = { start: now, count: 0 };
        this.buckets.set(key, b);
    } if (++b.count > limit)
        throw new GameError('Muitas ações. Aguarde um instante.', 'RATE_LIMIT'); }
    bind(socket: Socket) {
        const restoredToken = socket.handshake.auth?.sessionToken;
        if (typeof restoredToken === 'string') {
            const identity = this.sessions.get(restoredToken);
            const room = identity && this.rooms.get(identity.roomCode);
            const player = room && room.players.get(identity.playerId);
            if (room && player) {
                if (player.graceTimer)
                    clearTimeout(player.graceTimer);
                player.graceTimer = undefined;
                const previous = player.socketId;
                player.socketId = socket.id;
                player.connected = true;
                socket.data.identity = { roomCode: room.code, playerId: player.id };
                socket.join(room.id);
                if (previous && previous !== socket.id)
                    this.io.sockets.sockets.get(previous)?.disconnect(true);
                this.io.to(socket.id).emit('session:restored', this.envelope('session:restored', { ok: true, sessionToken: player.token, roomCode: room.code, playerId: player.id }));
                this.system(room, player.name + ' voltou à sala.', 'player:reconnect');
                this.emitState(room);
            }
        }
        const requests = new Map<string, {
            event: string;
            payload: AckPayload;
        }>();
        socket.onAny((event, ...args) => { if (Object.hasOwn(payloadSchemas, event))
            return; const parsed = envelopeSchema.safeParse(args[0]); const requestId = parsed.success ? parsed.data.requestId : uuid(); const response = this.envelope(event, { ok: false as const, error: 'Evento desconhecido.', code: 'UNKNOWN_EVENT' }, requestId); const ack = args.at(-1); if (typeof ack === 'function')
            ack(response);
        else
            socket.emit('error', this.envelope('error', response.payload, requestId)); });
        for (const event of Object.keys(payloadSchemas) as ClientEvent[]) {
            socket.on(event, (raw: unknown, ack?: (message: Envelope<AckPayload>) => void) => {
                const parsed = envelopeSchema.safeParse(raw);
                const requestId = parsed.success ? parsed.data.requestId : uuid();
                const send = (payload: AckPayload) => { const response = this.envelope(event, payload, requestId); if (typeof ack === 'function')
                    ack(response);
                else if (!payload.ok)
                    socket.emit('error', this.envelope('error', payload, requestId)); return payload; };
                try {
                    if (!parsed.success || parsed.data.type !== event)
                        throw new GameError('Mensagem inválida.', 'VALIDATION');
                    const previous = requests.get(requestId);
                    if (previous) {
                        if (previous.event !== event)
                            throw new GameError('Identificador de requisição reutilizado.', 'VALIDATION');
                        send(previous.payload);
                        return;
                    }
                    this.allow(socket, event);
                    const valid = payloadSchemas[event].safeParse(parsed.data.payload);
                    if (!valid.success)
                        throw new GameError('Dados inválidos: ' + valid.error.issues.map(x => x.path.join('.') || 'payload').join(', '), 'VALIDATION');
                    const result = this.dispatch(socket, event, valid.data);
                    requests.set(requestId, { event, payload: result });
                    if (requests.size > 256)
                        requests.delete(requests.keys().next().value!);
                    send(result);
                }
                catch (error) {
                    const known = error instanceof GameError;
                    const payload: AckPayload = { ok: false, error: known ? error.message : 'Não foi possível executar a ação.', code: known ? error.code : 'INTERNAL' };
                    send(payload);
                    if (!known)
                        console.error(JSON.stringify({ level: 'error', event, error: String(error) }));
                }
            });
        }
        socket.on('disconnect', () => this.disconnect(socket));
        socket.emit('server:stats', this.envelope('server:stats', this.stats()));
        this.io.emit('server:stats', this.envelope('server:stats', this.stats()));
    }
    identity(socket: Socket): {
        room: Room;
        player: Participant;
    } { const identity = socket.data.identity; const room = identity && this.rooms.get(identity.roomCode); const player = room && room.players.get(identity.playerId); if (!room || !player || player.socketId !== socket.id)
        throw new GameError('Entre em uma sala primeiro.', 'NOT_IN_ROOM'); return { room, player }; }
    requireHost(room: Room, player: Participant) { if (room.hostId !== player.id)
        throw new GameError('Apenas o administrador pode fazer isso.', 'FORBIDDEN'); }
    requireDrawer(room: Room, player: Participant) { if (room.phase === 'drawing' && room.endsAt !== null && this.now() >= room.endsAt) {
        this.endRound(room, 'time_up');
        throw new GameError('O tempo da rodada terminou.', 'ROUND_EXPIRED');
    } if (room.phase !== 'drawing' || room.drawerId !== player.id)
        throw new GameError('Somente o desenhista da rodada pode desenhar.', 'FORBIDDEN'); }
    createPlayer(socket: Socket, name: string, avatar: string): Participant { if (!sanitizeText(name) || !sanitizeText(avatar))
        throw new GameError('Nome ou avatar inválido.', 'VALIDATION'); return { id: uuid(), name: sanitizeText(name), avatar: sanitizeText(avatar), score: 0, correctGuesses: 0, connected: true, guessed: false, isHost: false, token: uuid(), socketId: socket.id }; }
    addPlayer(socket: Socket, room: Room, p: Participant) { room.players.set(p.id, p); if (room.phase === 'choosing' || room.phase === 'drawing' || room.phase === 'round_end')
        room.participants.set(p.id, p); this.sessions.set(p.token, { roomCode: room.code, playerId: p.id }); socket.data.identity = { roomCode: room.code, playerId: p.id }; socket.join(room.id); this.system(room, p.name + ' entrou na sala.', 'player:joined'); this.emitRoom(room, 'player:joined', { player: this.publicPlayer(p, room) }); this.emitState(room); this.io.emit('server:stats', this.envelope('server:stats', this.stats())); return { ok: true as const, sessionToken: p.token, roomCode: room.code, playerId: p.id }; }
    dispatch(socket: Socket, event: ClientEvent, data: any): AckPayload {
        if (event === 'room:create') {
            if (socket.data.identity)
                throw new GameError('Saia da sala atual antes de criar outra.');
            if (this.rooms.size >= 200)
                throw new GameError('Servidor cheio. Tente novamente mais tarde.');
            let code = '';
            do {
                code = uuid().replace(/-/g, '').slice(0, 6).toUpperCase();
            } while (this.rooms.has(code));
            const player = this.createPlayer(socket, data.name, data.avatar);
            const room: Room = { id: uuid(), code, name: sanitizeText(data.roomName ?? 'Sala de ' + player.name), hostId: player.id, settings: { ...DEFAULT_SETTINGS, ...data.settings }, phase: 'lobby', players: new Map(), participants: new Map(), round: 0, turn: 0, schedule: [], drawerId: null, options: [], word: null, startedAt: null, endsAt: null, choiceEndsAt: null, matchStartedAt: null, matchId: null, completedTurns: 0, strokes: [], history: [], redo: [], chat: [], events: [], timers: new Set(), stats: null };
            this.rooms.set(code, room);
            return this.addPlayer(socket, room, player);
        }
        if (event === 'room:join') {
            if (socket.data.identity)
                throw new GameError('Saia da sala atual antes de entrar em outra.');
            const room = this.rooms.get(data.code.toUpperCase());
            if (!room)
                throw new GameError('Sala não encontrada.', 'ROOM_NOT_FOUND');
            if (room.players.size >= room.settings.maxPlayers)
                throw new GameError('Esta sala está cheia.', 'ROOM_FULL');
            return this.addPlayer(socket, room, this.createPlayer(socket, data.name, data.avatar));
        }
        const { room, player } = this.identity(socket);
        switch (event) {
            case 'room:state':
                this.emitState(room);
                return { ok: true, state: this.snapshot(room, player.id) };
            case 'room:leave':
                this.removePlayer(room, player, 'saiu da sala');
                socket.leave(room.id);
                delete socket.data.identity;
                return { ok: true };
            case 'room:settings':
                this.requireHost(room, player);
                if (room.phase !== 'lobby' && room.phase !== 'finished')
                    throw new GameError('Configure a sala antes de iniciar.');
                if (data.maxPlayers && data.maxPlayers < room.players.size)
                    throw new GameError('O limite não pode ser menor que a quantidade atual.');
                room.settings = { ...room.settings, ...data };
                this.emitState(room);
                return { ok: true };
            case 'player:kick': {
                this.requireHost(room, player);
                if (data.playerId === player.id)
                    throw new GameError('Você não pode remover a si mesmo.');
                const target = room.players.get(data.playerId);
                if (!target)
                    throw new GameError('Jogador não encontrado.');
                if (target.socketId) {
                    const s = this.io.sockets.sockets.get(target.socketId);
                    s?.emit('player:kicked', this.envelope('player:kicked', { reason: 'Você foi removido pelo administrador.' }));
                    s?.leave(room.id);
                    if (s)
                        delete s.data.identity;
                }
                this.removePlayer(room, target, 'foi removido pelo administrador');
                return { ok: true };
            }
            case 'game:start':
                this.requireHost(room, player);
                if (room.phase !== 'lobby' && room.phase !== 'finished')
                    throw new GameError('A partida já começou.');
                if ([...room.players.values()].filter(p => p.connected).length < 2)
                    throw new GameError('São necessários pelo menos dois jogadores.');
                this.startGame(room);
                return { ok: true };
            case 'game:word_select':
                if (room.phase === 'choosing' && room.choiceEndsAt !== null && this.now() >= room.choiceEndsAt) {
                    this.startDrawing(room, room.options[0]!);
                    throw new GameError('O tempo para escolher terminou.', 'CHOICE_EXPIRED');
                }
                if (room.phase !== 'choosing' || room.drawerId !== player.id)
                    throw new GameError('Você não pode escolher uma palavra agora.', 'FORBIDDEN');
                {
                    const word = room.options.find(w => w.id === data.wordId);
                    if (!word)
                        throw new GameError('Escolha uma das opções disponíveis.');
                    this.startDrawing(room, word);
                    return { ok: true };
                }
            case 'draw:stroke': {
                this.requireDrawer(room, player);
                if (data.roomId && data.roomId !== room.code && data.roomId !== room.id)
                    throw new GameError('Sala inválida.', 'FORBIDDEN');
                const stroke: Stroke = { id: data.id, points: data.points, color: data.color, brushSize: data.brushSize, tool: data.tool };
                const index = room.strokes.findIndex(s => s.id === stroke.id);
                const totalPoints = room.strokes.reduce((n, s, i) => n + (i === index ? 0 : s.points.length), 0) + stroke.points.length;
                if (totalPoints > 30000)
                    throw new GameError('O canvas atingiu o limite de detalhes. Limpe ou desfaça traços.', 'CANVAS_LIMIT');
                if (index < 0) {
                    if (room.strokes.length >= 400)
                        throw new GameError('Limite de traços atingido. Limpe o canvas.');
                    room.history.push([...room.strokes]);
                    room.history = room.history.slice(-50);
                    room.strokes.push(stroke);
                    room.redo = [];
                }
                else
                    room.strokes[index] = stroke;
                this.emitRoom(room, 'draw:stroke', stroke);
                this.queueState(room);
                return { ok: true };
            }
            case 'draw:clear':
                this.requireDrawer(room, player);
                if (room.strokes.length)
                    room.history.push([...room.strokes]);
                room.history = room.history.slice(-50);
                room.strokes = [];
                room.redo = [];
                this.emitRoom(room, 'draw:clear', {});
                this.emitState(room);
                return { ok: true };
            case 'draw:undo':
                this.requireDrawer(room, player);
                {
                    const previous = room.history.pop();
                    if (previous) {
                        room.redo.push([...room.strokes]);
                        room.strokes = previous;
                    }
                    this.emitRoom(room, 'draw:undo', { strokes: room.strokes });
                    this.emitState(room);
                    return { ok: true };
                }
            case 'draw:redo':
                this.requireDrawer(room, player);
                {
                    const next = room.redo.pop();
                    if (next) {
                        room.history.push([...room.strokes]);
                        room.history = room.history.slice(-50);
                        room.strokes = next;
                    }
                    this.emitRoom(room, 'draw:redo', { strokes: room.strokes });
                    this.emitState(room);
                    return { ok: true };
                }
            case 'chat:message':
            case 'guess:submit': return this.chat(room, player, data.text);
            default: throw new GameError('Evento desconhecido.');
        }
    }
    startGame(room: Room) { this.clearTimers(room); room.participants = new Map(room.players); for (const p of room.players.values()) {
        p.score = 0;
        p.correctGuesses = 0;
        p.guessed = false;
    } const ids = [...room.players.values()].filter(p => p.connected).map(p => p.id); room.schedule = Array.from({ length: room.settings.rounds }, () => ids).flat(); room.turn = 0; room.round = 0; room.completedTurns = 0; room.matchId = uuid(); room.matchStartedAt = this.now(); room.stats = null; room.word = null; this.system(room, 'A partida começou!', 'game:start'); this.nextTurn(room); }
    nextTurn(room: Room) {
        this.clearTimers(room);
        if ([...room.players.values()].filter(p => p.connected).length < 2) { this.finishGame(room); return; }
        let next = room.turn;
        while (next < room.schedule.length) {
            const p = room.players.get(room.schedule[next]!);
            if (p?.connected)
                break;
            next++;
        }
        if (next >= room.schedule.length) {
            this.finishGame(room);
            return;
        }
        room.turn = next + 1;
        const perRound = room.schedule.length / room.settings.rounds;
        room.round = Math.floor(next / perRound) + 1;
        room.drawerId = room.schedule[next]!;
        room.phase = 'choosing';
        room.options = selectWords();
        room.word = null;
        room.strokes = [];
        room.history = [];
        room.redo = [];
        room.startedAt = null;
        room.endsAt = null;
        room.choiceEndsAt = this.now() + (this.options.choiceMs ?? 15000);
        for (const p of room.players.values())
            p.guessed = false;
        const drawer = room.players.get(room.drawerId)!;
        this.system(room, drawer.name + ' vai desenhar.', 'game:round_start');
        this.emitRoom(room, 'game:round_start', { round: room.round, turn: room.turn, drawerId: room.drawerId, phase: room.phase, choiceEndsAt: room.choiceEndsAt, serverTime: this.now() });
        if (drawer.socketId)
            this.io.to(drawer.socketId).emit('game:word_options', this.envelope('game:word_options', { options: room.options, endsAt: room.choiceEndsAt }));
        this.emitState(room);
        this.schedule(room, () => this.startDrawing(room, room.options[0]!), this.options.choiceMs ?? 15000);
    }
    startDrawing(room: Room, word: WordOption) { if (room.phase !== 'choosing')
        return; this.clearTimers(room); room.phase = 'drawing'; room.word = word; room.options = []; room.startedAt = this.now(); room.endsAt = room.startedAt + (this.options.roundMs ?? room.settings.roundDuration * 1000); room.choiceEndsAt = null; this.emitRoom(room, 'game:round_start', { round: room.round, turn: room.turn, drawerId: room.drawerId, phase: room.phase, startedAt: room.startedAt, endsAt: room.endsAt, serverTime: this.now() }); this.emitState(room); const duration = room.endsAt - room.startedAt; if (duration > 10000)
        this.schedule(room, () => { this.system(room, 'Restam 10 segundos!', 'timer:warning'); this.emitState(room); }, duration - 10000); this.schedule(room, () => this.endRound(room, 'time_up'), duration); }
    chat(room: Room, player: Participant, raw: string): AckPayload {
        if (room.phase === 'drawing' && room.endsAt !== null && this.now() >= room.endsAt)
            this.endRound(room, 'time_up');
        const text = sanitizeText(raw);
        if (!text)
            throw new GameError('Escreva uma mensagem.');
        if (room.phase === 'drawing') {
            if (player.id === room.drawerId)
                throw new GameError('O desenhista não pode enviar mensagens durante a rodada.', 'FORBIDDEN');
            if (player.guessed)
                throw new GameError('Você já acertou. Aguarde o fim da rodada para conversar.', 'ALREADY_GUESSED');
            if (normalizeGuess(text) === normalizeGuess(room.word!.text)) {
                player.guessed = true;
                player.correctGuesses++;
                const order = [...room.players.values()].filter(p => p.guessed).length - 1;
                const score = computeScore(this.now() - room.startedAt!, room.endsAt! - room.startedAt!, room.word!.difficulty, order);
                player.score += score;
                const drawer = room.players.get(room.drawerId!);
                if (drawer)
                    drawer.score += Math.round(50 * (room.word!.difficulty === 'hard' ? 1.5 : room.word!.difficulty === 'medium' ? 1.25 : 1));
                const message: ChatMessage = { id: uuid(), playerId: player.id, name: player.name, avatar: player.avatar, text: player.name + ' acertou! +' + score + ' pontos', kind: 'correct', timestamp: this.now() };
                room.chat.push(message);
                room.chat = room.chat.slice(-150);
                this.emitRoom(room, 'chat:message', message);
                this.emitRoom(room, 'guess:correct', { playerId: player.id, score, totalScore: player.score });
                this.emitRoom(room, 'score:update', { players: [...room.players.values()].map(p => this.publicPlayer(p, room)), ranking: this.ranking(room) });
                this.emitState(room);
                if (this.everyoneGuessed(room))
                    this.endRound(room, 'all_guessed');
                return { ok: true, correct: true, score };
            }
        }
        const message: ChatMessage = { id: uuid(), playerId: player.id, name: player.name, avatar: player.avatar, text, kind: 'message', timestamp: this.now() };
        room.chat.push(message);
        room.chat = room.chat.slice(-150);
        this.emitRoom(room, 'chat:message', message);
        this.emitState(room);
        return { ok: true, correct: false };
    }
    everyoneGuessed(room: Room) { return [...room.players.values()].filter(p => p.connected && p.id !== room.drawerId).every(p => p.guessed); }
    endRound(room: Room, reason: string) { if (room.phase !== 'drawing' && room.phase !== 'choosing')
        return; this.clearTimers(room); room.phase = 'round_end'; room.endsAt = null; room.choiceEndsAt = null; room.options = []; room.completedTurns++; const word = room.word?.text ?? ''; this.system(room, word ? 'A palavra era “' + word + '”.' : 'A rodada foi interrompida.', 'game:round_end'); this.emitRoom(room, 'game:round_end', { word, reason, round: room.round, turn: room.turn, ranking: this.ranking(room) }); this.emitState(room); this.schedule(room, () => this.nextTurn(room), this.options.transitionMs ?? 4000); }
    finishGame(room: Room) {
        this.clearTimers(room);
        room.phase = 'finished';
        room.drawerId = null;
        room.endsAt = null;
        room.choiceEndsAt = null;
        room.stats = { totalTurns: room.schedule.length, completedTurns: room.completedTurns, correctGuesses: [...room.participants.values()].reduce((n, p) => n + p.correctGuesses, 0), durationMs: this.now() - (room.matchStartedAt ?? this.now()) };
        const ranking = this.ranking(room);
        const matchId = room.matchId!;
        const record = { id: matchId, roomCode: room.code, startedAt: room.matchStartedAt ?? this.now(), finishedAt: this.now(), settings: { ...room.settings }, ranking, stats: { ...room.stats } };
        this.system(room, 'Partida encerrada! ' + (ranking[0]?.name ?? '') + ' venceu.', 'game:finish');
        this.emitState(room);
        const save = this.repository.saveMatch(record).then(() => { if (room.matchId === matchId)
            this.emitRoom(room, 'game:finish', { ranking, stats: record.stats, matchId }); }).catch(error => { console.error(JSON.stringify({ level: 'error', event: 'match:persist', matchId, error: String(error) })); this.emitRoom(room, 'error', { ok: false, error: 'Não foi possível salvar o ranking desta partida.', code: 'PERSISTENCE' }); });
        this.pending.add(save);
        void save.finally(() => this.pending.delete(save));
    }
    transferHost(room: Room) { const current = room.players.get(room.hostId); if (current?.connected)
        return; const next = [...room.players.values()].find(p => p.connected) ?? [...room.players.values()][0]; if (next && next.id !== room.hostId) {
        room.hostId = next.id;
        this.system(room, next.name + ' agora é o administrador.', 'host:transfer');
    } }
    removePlayer(room: Room, player: Participant, reason: string) { if (player.graceTimer)
        clearTimeout(player.graceTimer); room.players.delete(player.id); this.sessions.delete(player.token); if (player.socketId) {
        const s = this.io.sockets.sockets.get(player.socketId);
        s?.leave(room.id);
        if (s)
            delete s.data.identity;
    } player.connected = false; player.socketId = null; this.system(room, player.name + ' ' + reason + '.', 'player:left'); this.emitRoom(room, 'player:left', { playerId: player.id, reason }); this.transferHost(room); if (room.players.size === 0) {
        this.clearTimers(room);
        this.rooms.delete(room.code);
    }
    else {
        if (room.drawerId === player.id && (room.phase === 'drawing' || room.phase === 'choosing'))
            this.endRound(room, 'drawer_left');
        else if ((room.phase === 'drawing' && this.everyoneGuessed(room)) || (room.phase === 'choosing' && [...room.players.values()].filter(p => p.connected).length < 2))
            this.endRound(room, 'all_guessed');
        this.emitState(room);
    } this.io.emit('server:stats', this.envelope('server:stats', this.stats())); }
    disconnect(socket: Socket) { const identity = socket.data.identity; const room = identity && this.rooms.get(identity.roomCode); const p = room && room.players.get(identity.playerId); for (const key of this.buckets.keys())
        if (key.startsWith(socket.id + ':'))
            this.buckets.delete(key); if (!room || !p || p.socketId !== socket.id)
        return; p.connected = false; p.socketId = null; this.emitRoom(room, 'player:disconnect', { playerId: p.id, graceMs: this.options.graceMs ?? 20000 }); this.system(room, p.name + ' perdeu a conexão. Aguardando retorno.', 'player:disconnect'); this.transferHost(room); if (room.drawerId === p.id && (room.phase === 'drawing' || room.phase === 'choosing'))
        this.endRound(room, 'drawer_disconnected');
    else if (room.phase === 'drawing' && this.everyoneGuessed(room))
        this.endRound(room, 'all_guessed'); this.emitState(room); p.graceTimer = setTimeout(() => { p.graceTimer = undefined; if (!p.connected && room.players.has(p.id))
        this.removePlayer(room, p, 'saiu após desconectar'); }, this.options.graceMs ?? 20000); this.io.emit('server:stats', this.envelope('server:stats', this.stats())); }
    async close() { this.closed = true; for (const room of this.rooms.values()) {
        this.clearTimers(room);
        for (const p of room.players.values())
            if (p.graceTimer)
                clearTimeout(p.graceTimer);
    } await Promise.allSettled([...this.pending]); this.rooms.clear(); this.sessions.clear(); this.buckets.clear(); }
}
