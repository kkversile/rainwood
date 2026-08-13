import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export async function serializable<T>(prisma: PrismaService, operation: (tx: Prisma.TransactionClient) => Promise<T>, attempts = 8): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: any) {
      lastError = error;
      const serializationFailure = error?.code === 'P2034' || (error?.code === 'P2010' && error?.meta?.code === '40001');
      if (!serializationFailure || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 35 * (attempt + 1) + Math.floor(Math.random() * 25)));
    }
  }
  throw lastError;
}
