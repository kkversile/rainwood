import { GuestProfile } from '@prisma/client';
import { PrismaService } from '../src/common/prisma.service';
import { normalizeGuestEmail, normalizeGuestMobile } from '../src/modules/guests/guest-normalization';

const prisma = new PrismaService();
const apply = process.argv.includes('--apply');

async function main() {
  const reservations = await prisma.reservation.findMany({ where: { guestProfileId: null }, select: { id: true, hotelId: true, guestName: true, mobile: true, email: true } });
  const report = { scanned: reservations.length, linked: 0, created: 0, ambiguous: 0, conflicts: 0, noIdentifiers: 0 };
  for (const reservation of reservations) {
    const normalizedMobile = normalizeGuestMobile(reservation.mobile); const normalizedEmail = normalizeGuestEmail(reservation.email);
    const matches: GuestProfile[] = await prisma.guestProfile.findMany({ where: { OR: [...(normalizedMobile ? [{ normalizedMobile }] : []), ...(normalizedEmail ? [{ normalizedEmail }] : [])] } });
    const mobile = matches.find((profile) => profile.normalizedMobile === normalizedMobile); const email = matches.find((profile) => profile.normalizedEmail === normalizedEmail);
    if (mobile && email && mobile.id !== email.id) { report.conflicts++; continue; }
    const profile = mobile ?? email;
    if (profile) { report.linked++; if (apply) await prisma.reservation.update({ where: { id: reservation.id }, data: { guestProfileId: profile.id } }); continue; }
    if (!normalizedMobile && !normalizedEmail) report.noIdentifiers++;
    report.created++;
    if (apply) {
      const created = await prisma.guestProfile.create({ data: { displayName: reservation.guestName, mobile: reservation.mobile || null, email: reservation.email || null, normalizedMobile, normalizedEmail, preferredHotelId: reservation.hotelId } });
      await prisma.reservation.update({ where: { id: reservation.id }, data: { guestProfileId: created.id } });
    }
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...report }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
