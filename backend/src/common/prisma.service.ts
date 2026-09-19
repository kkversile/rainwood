import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;
  constructor() {
    const connectionString = process.env.DATABASE_URL || '';
    const requiresTls = /(?:\?|&)sslmode=require(?:&|$)/i.test(connectionString);
    const pool = new Pool({ connectionString, ...(requiresTls ? { ssl: { rejectUnauthorized: true } } : {}) });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }
  async onModuleInit(){ await this.$connect(); }
  async onModuleDestroy(){ await this.$disconnect(); await this.pool.end(); }
}
