import { PrismaClient } from '@prisma/client';

// Синглтон: в dev tsx/nodemon перезапускается часто,
// без кеша в globalThis каждый перезапуск создавал бы новый пул соединений,
// и PostgreSQL быстро упёрся бы в max_connections.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}