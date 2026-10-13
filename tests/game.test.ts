import { describe, expect, it } from 'vitest';
import { computeScore, normalizeGuess, sanitizeText } from '../server/game/scoring.js';
import { WORDS, selectWords } from '../server/game/words.js';
import { envelopeSchema, payloadSchemas, settingsSchema, strokeSchema } from '../server/validation.js';
import { stroke } from './helpers/socket.js';

describe('regras puras do jogo', () => {
  it('normaliza acentos, caixa e espaços preservando o significado', () => {
    expect(normalizeGuess('  AVIÃO  ')).toBe('aviao');
    expect(normalizeGuess('  Pão   de  Queijo ')).toBe('pao de queijo');
    expect(normalizeGuess('aviao')).not.toBe(normalizeGuess('navio'));
    const clean = sanitizeText('<b>Olá</b>\n\u0000');
    expect(clean).not.toMatch(/[<>]/);
    expect(clean.includes(String.fromCharCode(0))).toBe(false);
  });

  it('recompensa tempo, dificuldade e ordem de acerto sem aceitar pontos do cliente', () => {
    expect(computeScore(0, 80_000, 'easy')).toBeGreaterThan(computeScore(60_000, 80_000, 'easy'));
    expect(computeScore(10_000, 80_000, 'hard')).toBeGreaterThan(computeScore(10_000, 80_000, 'medium'));
    expect(computeScore(10_000, 80_000, 'medium')).toBeGreaterThan(computeScore(10_000, 80_000, 'easy'));
    expect(computeScore(10_000, 80_000, 'easy', 0)).toBeGreaterThan(computeScore(10_000, 80_000, 'easy', 3));
    expect(computeScore(100_000, 80_000, 'easy')).toBe(computeScore(80_000, 80_000, 'easy'));
    expect(Number.isInteger(computeScore(25_123, 80_000, 'hard'))).toBe(true);
  });

  it('mantém pelo menos 200 palavras distintas classificadas e três opções sem repetição', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(200);
    expect(new Set(WORDS.map(word => normalizeGuess(word.text))).size).toBe(WORDS.length);
    expect(new Set(WORDS.map(word => word.id)).size).toBe(WORDS.length);
    expect(new Set(WORDS.map(word => word.category)).size).toBeGreaterThan(3);
    expect(new Set(WORDS.map(word => word.difficulty))).toEqual(new Set(['easy', 'medium', 'hard']));
    const options = selectWords();
    expect(options).toHaveLength(3);
    expect(new Set(options.map(word => word.id)).size).toBe(3);
    expect(options.every(word => WORDS.some(entry => entry.id === word.id))).toBe(true);
  });
});

describe('limites dos contratos Zod', () => {
  it('exige envelope completo e valida coordenadas normalizadas', () => {
    expect(envelopeSchema.safeParse({ type: 'draw:stroke', requestId: 'teste', timestamp: Date.now(), payload: stroke() }).success).toBe(true);
    expect(envelopeSchema.safeParse({ type: 'draw:stroke', payload: stroke() }).success).toBe(false);
    expect(strokeSchema.safeParse(stroke()).success).toBe(true);
    expect(strokeSchema.safeParse({ ...stroke(), points: [{ x: 1.01, y: .5 }] }).success).toBe(false);
    expect(strokeSchema.safeParse({ ...stroke(), points: [{ x: NaN, y: .5 }] }).success).toBe(false);
    expect(strokeSchema.safeParse({ ...stroke(), points: [] }).success).toBe(false);
    expect(strokeSchema.safeParse({ ...stroke(), points: Array.from({ length: 2049 }, () => ({ x: .5, y: .5 })) }).success).toBe(false);
    expect(strokeSchema.safeParse({ ...stroke(), color: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('limita salas e mensagens e rejeita campos privilegiados enviados pelo cliente', () => {
    expect(settingsSchema.safeParse({ maxPlayers: 12, roundDuration: 180, rounds: 10 }).success).toBe(true);
    expect(settingsSchema.safeParse({ maxPlayers: 13, roundDuration: 180, rounds: 10 }).success).toBe(false);
    expect(payloadSchemas['chat:message'].safeParse({ text: 'a'.repeat(201) }).success).toBe(false);
    expect(payloadSchemas['game:start'].safeParse({ score: 999, endsAt: Date.now() }).success).toBe(false);
    expect(payloadSchemas['guess:submit'].safeParse({ text: 'gato', score: 999 }).success).toBe(false);
  });
});
