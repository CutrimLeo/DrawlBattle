import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { WORDS } from '../server/game/words.js';
const prisma = new PrismaClient();
try {
    await prisma.word.createMany({ data: WORDS });
    console.log('Seed: ' + WORDS.length + ' palavras.');
}
catch (error) {
    if ((error as {
        code?: string;
    }).code === 'P2002')
        console.log('Palavras já inseridas.');
    else
        throw error;
}
finally {
    await prisma.$disconnect();
}
