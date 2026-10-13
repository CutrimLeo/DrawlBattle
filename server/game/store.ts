/** Active rooms have one authoritative owner. A distributed implementation must also coordinate its timers and broadcasts. */
export interface SessionIdentity { roomCode: string; playerId: string }
export interface ActiveRoomStore<T> { readonly rooms: Map<string, T>; readonly sessions: Map<string, SessionIdentity> }
/** Default process-local state directory, separate from permanent match history. */
export class MemoryActiveRoomStore<T> implements ActiveRoomStore<T> { readonly rooms = new Map<string, T>(); readonly sessions = new Map<string, SessionIdentity>(); }
