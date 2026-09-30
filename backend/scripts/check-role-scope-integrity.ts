import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? '';
const tls = /(?:\?|&)sslmode=require(?:&|$)/i.test(connectionString);
const pool = new Pool({ connectionString, ...(tls ? { ssl: { rejectUnauthorized: true } } : {}) });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, role: true, staffHotelId: true, staffDepartment: true, jobTitle: true, staffHotel: { select: { id: true, active: true } } }, orderBy: { email: 'asc' } });
  const findings: Array<{ email: string; role: string; issue: string }> = [];
  for (const user of users) {
    if ((user.role === 'SUPER_ADMIN' || user.role === 'CORPORATE_ADMIN') && user.staffHotelId) findings.push({ email: user.email, role: user.role, issue: 'global role has staffHotelId' });
    if ((user.role === 'ADMIN' || user.role === 'RESERVATION') && (!user.staffHotelId || !user.staffHotel?.active)) findings.push({ email: user.email, role: user.role, issue: 'property role has no active hotel' });
    if (user.role === 'SERVICE_STAFF' && (!user.staffHotelId || !user.staffHotel?.active || !user.staffDepartment || !user.jobTitle?.trim())) findings.push({ email: user.email, role: user.role, issue: 'service staff scope or department metadata is incomplete' });
  }
  const counts = users.reduce<Record<string, number>>((result, user) => { result[user.role] = (result[user.role] ?? 0) + 1; return result; }, {});
  console.log(JSON.stringify({ usersScanned: users.length, counts, findings, ok: findings.length === 0 }, null, 2));
  if (findings.length) {
    console.error('Role-scope integrity check failed. Resolve the listed accounts before deployment.');
    process.exitCode = 1;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); await pool.end(); });
