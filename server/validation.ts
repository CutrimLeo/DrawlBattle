import { z } from 'zod';
export const settingsSchema = z.object({ maxPlayers: z.number().int().min(2).max(12), roundDuration: z.number().int().min(15).max(180), rounds: z.number().int().min(1).max(10) }).strict();
const profile = { name: z.string().trim().min(1).max(24), avatar: z.string().min(1).max(32) };
const empty = z.object({}).strict();
export const strokeSchema = z.object({ id: z.string().min(1).max(80), points: z.array(z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).strict()).min(1).max(2048), color: z.string().regex(/^#[0-9a-f]{6}$/i), brushSize: z.number().finite().min(1).max(50), tool: z.enum(['pencil', 'eraser']), roomId: z.string().optional() }).strict();
export const payloadSchemas = {
    'room:create': z.object({ ...profile, roomName: z.string().trim().min(1).max(40).optional(), settings: settingsSchema.partial().optional() }).strict(),
    'room:join': z.object({ ...profile, code: z.string().trim().regex(/^[A-Za-z0-9]{6}$/) }).strict(),
    'room:leave': empty, 'room:state': empty, 'room:settings': settingsSchema.partial(), 'player:kick': z.object({ playerId: z.string().uuid() }).strict(),
    'game:start': empty, 'game:word_select': z.object({ wordId: z.string().min(1).max(80) }).strict(),
    'draw:stroke': strokeSchema, 'draw:clear': empty, 'draw:undo': empty, 'draw:redo': empty,
    'chat:message': z.object({ text: z.string().trim().min(1).max(200) }).strict(), 'guess:submit': z.object({ text: z.string().trim().min(1).max(200) }).strict()
};
export const envelopeSchema = z.object({ type: z.string().min(1).max(48), requestId: z.string().min(1).max(80), timestamp: z.number().finite().int().nonnegative(), payload: z.unknown() }).strict();
export type ClientEvent = keyof typeof payloadSchemas;
