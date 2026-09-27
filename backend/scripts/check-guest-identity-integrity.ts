import { GuestProfile } from '@prisma/client';
import { PrismaService } from '../src/common/prisma.service';

const prisma = new PrismaService();

function groups(rows: GuestProfile[], key: 'normalizedMobile' | 'normalizedEmail') {
  const map = new Map<string, GuestProfile[]>();
  for (const row of rows) {
    const value = row[key];
    if (value) map.set(value, [...(map.get(value) ?? []), row]);
  }
  return [...map.entries()].filter(([, profiles]) => profiles.length > 1).map(([value, profiles]) => ({ value, profileIds: profiles.map((profile) => profile.id), names: profiles.map((profile) => profile.displayName) }));
}

async function main() {
  const profiles = await prisma.guestProfile.findMany({ where: { OR: [{ normalizedMobile: { not: null } }, { normalizedEmail: { not: null } }] }, select: { id: true, displayName: true, normalizedMobile: true, normalizedEmail: true, mobile: true, email: true } });
  const duplicateMobile = groups(profiles as GuestProfile[], 'normalizedMobile');
  const duplicateEmail = groups(profiles as GuestProfile[], 'normalizedEmail');
  const byMobile = new Map<string, Set<string>>(); const byEmail = new Map<string, Set<string>>();
  for (const profile of profiles) {
    if (profile.normalizedMobile) byMobile.set(profile.normalizedMobile, new Set([...(byMobile.get(profile.normalizedMobile) ?? []), profile.normalizedEmail ?? '<missing-email>']));
    if (profile.normalizedEmail) byEmail.set(profile.normalizedEmail, new Set([...(byEmail.get(profile.normalizedEmail) ?? []), profile.normalizedMobile ?? '<missing-mobile>']));
  }
  const conflictingIdentityPatterns = [...byMobile.entries()].filter(([, emails]) => emails.size > 1).map(([mobile, emails]) => ({ mobile, emails: [...emails] }));
  const splitEmailPatterns = [...byEmail.entries()].filter(([, mobiles]) => mobiles.size > 1).map(([email, mobiles]) => ({ email, mobiles: [...mobiles] }));
  console.log(JSON.stringify({ mode: 'diagnostic-only', profilesScanned: profiles.length, duplicateNonNullNormalizedMobile: duplicateMobile, duplicateNonNullNormalizedEmail: duplicateEmail, splitMobileEmailCombinations: conflictingIdentityPatterns, splitEmailMobileCombinations: splitEmailPatterns }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
