import { PrismaClient } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import type { MatchStats, Player, RoomSettings } from '../../shared/types.js';
export interface MatchRecord {
    id: string;
    roomCode: string;
    startedAt: number;
    finishedAt: number;
    settings: RoomSettings;
    ranking: Player[];
    stats: MatchStats;
}
export interface MatchRepository {
    init(): Promise<void>;
    saveMatch(match: MatchRecord): Promise<void>;
    leaderboard(): Promise<unknown[]>;
    close(): Promise<void>;
}
export class PrismaMatchRepository implements MatchRepository {
    readonly prisma: PrismaClient;
    constructor(databaseUrl?: string) { this.prisma = new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined); }
    async init() {
        const statements = [
            'CREATE TABLE IF NOT EXISTS "User" ("id" TEXT NOT NULL PRIMARY KEY,"name" TEXT NOT NULL,"avatar" TEXT NOT NULL,"totalScore" INTEGER NOT NULL DEFAULT 0,"correctGuesses" INTEGER NOT NULL DEFAULT 0,"matchesPlayed" INTEGER NOT NULL DEFAULT 0,"wins" INTEGER NOT NULL DEFAULT 0,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL)',
            'CREATE TABLE IF NOT EXISTS "Match" ("id" TEXT NOT NULL PRIMARY KEY,"roomCode" TEXT NOT NULL,"startedAt" DATETIME NOT NULL,"finishedAt" DATETIME NOT NULL,"durationMs" INTEGER NOT NULL,"totalTurns" INTEGER NOT NULL,"completedTurns" INTEGER NOT NULL,"settingsJson" TEXT NOT NULL)',
            'CREATE TABLE IF NOT EXISTS "MatchResult" ("id" TEXT NOT NULL PRIMARY KEY,"matchId" TEXT NOT NULL,"playerId" TEXT NOT NULL,"score" INTEGER NOT NULL,"correctGuesses" INTEGER NOT NULL,"rank" INTEGER NOT NULL,FOREIGN KEY("matchId") REFERENCES "Match"("id") ON DELETE CASCADE,FOREIGN KEY("playerId") REFERENCES "User"("id") ON DELETE CASCADE)',
            'CREATE UNIQUE INDEX IF NOT EXISTS "MatchResult_matchId_playerId_key" ON "MatchResult"("matchId","playerId")',
            'CREATE TABLE IF NOT EXISTS "Word" ("id" TEXT NOT NULL PRIMARY KEY,"text" TEXT NOT NULL,"category" TEXT NOT NULL,"difficulty" TEXT NOT NULL)',
            'CREATE UNIQUE INDEX IF NOT EXISTS "Word_text_key" ON "Word"("text")'
        ];
        for (const sql of statements)
            await this.prisma.$executeRawUnsafe(sql);
    }
    async saveMatch(record: MatchRecord) {
        await this.prisma.$transaction(async (tx) => {
            const existing = await tx.match.findUnique({ where: { id: record.id } });
            if (existing)
                return;
            await tx.match.create({ data: { id: record.id, roomCode: record.roomCode, startedAt: new Date(record.startedAt), finishedAt: new Date(record.finishedAt), durationMs: record.stats.durationMs, totalTurns: record.stats.totalTurns, completedTurns: record.stats.completedTurns, settingsJson: JSON.stringify(record.settings) } });
            for (let i = 0; i < record.ranking.length; i++) {
                const p = record.ranking[i]!;
                await tx.user.upsert({ where: { id: p.id }, create: { id: p.id, name: p.name, avatar: p.avatar, totalScore: p.score, correctGuesses: p.correctGuesses, matchesPlayed: 1, wins: i === 0 ? 1 : 0 }, update: { name: p.name, avatar: p.avatar, totalScore: { increment: p.score }, correctGuesses: { increment: p.correctGuesses }, matchesPlayed: { increment: 1 }, wins: { increment: i === 0 ? 1 : 0 } } });
                await tx.matchResult.create({ data: { id: uuid(), matchId: record.id, playerId: p.id, score: p.score, correctGuesses: p.correctGuesses, rank: i + 1 } });
            }
        });
    }
    async leaderboard() { return this.prisma.user.findMany({ orderBy: [{ totalScore: 'desc' }, { wins: 'desc' }], take: 20 }); }
    async close() { await this.prisma.$disconnect(); }
}
