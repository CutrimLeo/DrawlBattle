import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import { v4 as uuid } from 'uuid';
import type { AckPayload, Envelope, IdentityAck, RoomSnapshot, Stroke } from '../../../shared/types';

interface Identity { token: string; playerId: string; roomCode: string }
interface Profile { name: string; avatar: string }
interface GameState {
  room: RoomSnapshot | null; identity: Identity | null; profile: Profile;
  connected: boolean; connecting: boolean; onlinePlayers: number | null; activeRooms: number | null;
  error: string | null; busy: boolean; clockOffset: number;
  theme: 'light' | 'dark';
  setProfile: (profile: Partial<Profile>) => void;
  setTheme: () => void;
  dismissError: () => void;
}
function readSaved<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch { return fallback; }
}
const savedIdentity = (() => { try { return JSON.parse(sessionStorage.getItem('drawbattle.session') || 'null') as Identity | null; } catch { return null; } })();
export const useGame = create<GameState>((set, get) => ({
  room: null, identity: savedIdentity,
  profile: readSaved<Profile>('drawbattle.profile', { name: '', avatar: 'fox' }),
  connected: false, connecting: true, onlinePlayers: null, activeRooms: null,
  error: null, busy: false, clockOffset: 0,
  theme: readSaved<'light' | 'dark'>('drawbattle.theme', 'light'),
  setProfile: (profile) => { const value = { ...get().profile, ...profile }; localStorage.setItem('drawbattle.profile', JSON.stringify(value)); set({ profile: value }); },
  setTheme: () => { const theme = get().theme === 'light' ? 'dark' : 'light'; localStorage.setItem('drawbattle.theme', JSON.stringify(theme)); set({ theme }); },
  dismissError: () => set({ error: null }),
}));
let socket: Socket | undefined;
let initialized = false;
function saveIdentity(value: IdentityAck) {
  const identity = { token: value.sessionToken, playerId: value.playerId, roomCode: value.roomCode };
  sessionStorage.setItem('drawbattle.session', JSON.stringify(identity));
  useGame.setState({ identity });
  if (socket) socket.auth = { sessionToken: identity.token };
}
function forgetSession() {
  sessionStorage.removeItem('drawbattle.session');
  useGame.setState({ identity: null, room: null });
  if (socket) socket.auth = {};
}
export function connectGame() {
  if (initialized) return;
  initialized = true;
  const apiUrl = (import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_API_URL || undefined;
  socket = io(apiUrl, { transports: ['websocket'], auth: { sessionToken: useGame.getState().identity?.token }, reconnection: true, reconnectionDelay: 600, reconnectionDelayMax: 4000 });
  socket.on('connect', () => {
    useGame.setState({ connected: true, connecting: false });
    if (useGame.getState().identity) void sendEvent('room:state', {}, false).catch(() => {});
  });
  socket.on('disconnect', () => useGame.setState({ connected: false, connecting: true }));
  socket.on('connect_error', (error: Error) => {
    useGame.setState({ connected: false, connecting: true });
    if (/session|sessão|token/i.test(error.message)) {
      forgetSession(); socket!.auth = {}; socket!.connect();
    }
  });
  socket.on('room:state', (message: Envelope<RoomSnapshot>) => {
    useGame.setState({ room: message.payload, clockOffset: message.payload.serverTime - Date.now(), error: null });
  });
  socket.on('server:stats', (message: Envelope<{ onlinePlayers: number; rooms: number }>) => {
    useGame.setState({ onlinePlayers: message.payload.onlinePlayers, activeRooms: message.payload.rooms });
  });
  socket.on('session:restored', (message: Envelope<IdentityAck>) => saveIdentity(message.payload));
  socket.on('draw:stroke', (message: Envelope<Stroke>) => {
    const room = useGame.getState().room;
    if (!room) return;
    const strokes = [...room.strokes]; const index = strokes.findIndex((s) => s.id === message.payload.id);
    if (index >= 0) strokes[index] = message.payload; else strokes.push(message.payload);
    useGame.setState({ room: { ...room, strokes } });
  });
  socket.on('error', (message: Envelope<{ error?: string; message?: string }>) => {
    useGame.setState({ error: message.payload.error || message.payload.message || 'Não foi possível concluir a ação.' });
  });
  socket.on('player:kicked', (message: Envelope<{ reason: string }>) => {
    forgetSession(); useGame.setState({ error: message.payload.reason || 'Você foi removido da sala.' });
  });
}
export async function sendEvent<T extends { ok: boolean } = AckPayload>(type: string, payload: unknown = {}, showError = true): Promise<T> {
  if (!socket?.connected) {
    const error = 'A conexão está voltando. Tente novamente em alguns instantes.';
    if (showError) useGame.setState({ error });
    throw new Error(error);
  }
  const envelope: Envelope = { type, requestId: uuid(), timestamp: Date.now(), payload };
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => { if (showError) useGame.setState({ error: 'O servidor demorou para responder. Tente novamente.' }); reject(new Error('Timeout')); }, 8000);
    socket!.emit(type, envelope, (response: Envelope<T>) => {
      window.clearTimeout(timer);
      if (!response?.payload?.ok) {
        const error = (response?.payload as { error?: string })?.error || 'Não foi possível concluir a ação.';
        if (showError) useGame.setState({ error });
        reject(new Error(error)); return;
      }
      resolve(response.payload);
    });
  });
}
export async function enterRoom(type: 'room:create' | 'room:join', code?: string) {
  useGame.setState({ busy: true, error: null });
  try {
    const profile = useGame.getState().profile;
    const result = await sendEvent<IdentityAck>(type, { name: profile.name.trim(), avatar: profile.avatar, ...(type === 'room:join' ? { code: (code || '').trim().toUpperCase() } : { roomName: 'Sala de ' + profile.name.trim() }) });
    saveIdentity(result); return result.roomCode;
  } finally { useGame.setState({ busy: false }); }
}
export async function leaveRoom() {
  await sendEvent('room:leave');
  forgetSession();
}
export async function action(type: string, payload: unknown = {}) {
  try { await sendEvent(type, payload); } catch { /* The store shows the server's feedback. */ }
}
export function streamStroke(stroke: Stroke) {
  if (!socket?.connected) return;
  socket.emit('draw:stroke', { type: 'draw:stroke', requestId: uuid(), timestamp: Date.now(), payload: stroke } satisfies Envelope);
}
