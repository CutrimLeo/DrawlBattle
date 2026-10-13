export type RoomPhase = 'lobby' | 'choosing' | 'drawing' | 'round_end' | 'finished';
export type Difficulty = 'easy' | 'medium' | 'hard';
export interface Envelope<T = unknown> {
    type: string;
    requestId: string;
    timestamp: number;
    payload: T;
}
export interface RoomSettings {
    maxPlayers: number;
    roundDuration: number;
    rounds: number;
}
export interface Point {
    x: number;
    y: number;
}
export interface Stroke {
    id: string;
    points: Point[];
    color: string;
    brushSize: number;
    tool: 'pencil' | 'eraser';
}
export interface WordOption {
    id: string;
    text: string;
    category: string;
    difficulty: Difficulty;
}
export interface Player {
    id: string;
    name: string;
    avatar: string;
    score: number;
    correctGuesses: number;
    connected: boolean;
    guessed: boolean;
    isHost: boolean;
}
export interface ChatMessage {
    id: string;
    playerId?: string;
    name: string;
    avatar?: string;
    text: string;
    kind: 'message' | 'system' | 'correct';
    timestamp: number;
}
export interface RoomEvent {
    id: string;
    type: string;
    text: string;
    timestamp: number;
}
export interface MatchStats {
    totalTurns: number;
    completedTurns: number;
    correctGuesses: number;
    durationMs: number;
}
export interface RoomSnapshot {
    id: string;
    code: string;
    name: string;
    hostId: string;
    settings: RoomSettings;
    phase: RoomPhase;
    players: Player[];
    round: number;
    turn: number;
    totalTurns: number;
    drawerId: string | null;
    serverTime: number;
    startedAt: number | null;
    endsAt: number | null;
    choiceEndsAt: number | null;
    wordLength: number;
    wordHint: string;
    category: string | null;
    difficulty: Difficulty | null;
    secretWord?: string;
    wordOptions?: WordOption[];
    revealedWord?: string;
    strokes: Stroke[];
    canUndo: boolean;
    canRedo: boolean;
    chat: ChatMessage[];
    events: RoomEvent[];
    ranking: Player[];
    stats: MatchStats | null;
}
export interface IdentityAck {
    ok: true;
    sessionToken: string;
    roomCode: string;
    playerId: string;
}
export type AckPayload = {
    ok: true;
    [key: string]: unknown;
} | {
    ok: false;
    error: string;
    code?: string;
};
export type Ack<T = AckPayload> = Envelope<T>;
export interface CreateRoomPayload {
    name: string;
    avatar: string;
    roomName?: string;
    settings?: Partial<RoomSettings>;
}
export interface JoinRoomPayload {
    name: string;
    avatar: string;
    code: string;
}
export const DEFAULT_SETTINGS: RoomSettings = { maxPlayers: 8, roundDuration: 80, rounds: 3 };
export const AVATARS = ['fox', 'cat', 'bear', 'rabbit', 'panda', 'dog', 'frog', 'owl'] as const;
export const CLIENT_EVENTS = ['room:create', 'room:join', 'room:leave', 'room:state', 'room:settings', 'player:kick', 'game:start', 'game:word_select', 'draw:stroke', 'draw:clear', 'draw:undo', 'draw:redo', 'chat:message', 'guess:submit'] as const;
export const SERVER_EVENTS = ['room:state', 'player:joined', 'player:left', 'player:disconnect', 'game:round_start', 'game:round_end', 'game:word_options', 'draw:stroke', 'draw:clear', 'draw:undo', 'draw:redo', 'chat:message', 'guess:correct', 'score:update', 'game:finish', 'server:stats', 'session:restored', 'player:kicked', 'error'] as const;
