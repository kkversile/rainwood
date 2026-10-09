import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { parseDateOnly, toDateOnly } from '../../common/dates';
import { PrismaService } from '../../common/prisma.service';
import { RateMasterService } from '../rate-master/rate-master.service';
import { AgentRateSheetRenderer } from './agent-rate-sheet-renderer';

@Injectable()
export class AgentCategoryRatesService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly audit?: AuditService, @Optional() private readonly renderer?: AgentRateSheetRenderer, @Optional() private readonly rateMaster?: RateMasterService) {}

  private async auditEvent(actorUserId: string | undefined, action: string, entityType: string, entityId?: string, after?: unknown) {
    if (this.audit) await this.audit.log({ actorUserId, action, entityType, entityId, after });
  }

  async effectiveRates(agentId: string, from?: string, to?: string) {
    const start = parseDateOnly(from ?? toDateOnly(new Date()), 'from');
    const end = parseDateOnly(to ?? toDateOnly(new Date(Date.now() + 180 * 86_400_000)), 'to');
    return this.rateMaster?.effectiveRatesForAgent(agentId, start, end) ?? { source: 'AGENT_CATEGORY', mappings: [], rates: [] };
  }

  private async categorySnapshot(agentId: string, from?: string, to?: string) {
    if (!this.rateMaster) throw new BadRequestException('Category rate sheets are unavailable.');
    const start = parseDateOnly(from ?? toDateOnly(new Date()), 'from');
    const end = parseDateOnly(to ?? toDateOnly(new Date(Date.now() + 180 * 86_400_000)), 'to');
    const resolved = await this.rateMaster.effectiveRatesForAgent(agentId, start, end);
    if (!resolved || !resolved.rates.length) throw new BadRequestException('Publishable category rates are not available for this agent period.');
    const agent = await this.prisma.user.findFirstOrThrow({ where: { id: agentId, role: 'AGENT' }, select: { id: true, name: true, email: true, companyName: true } });
    const hotelIds = [...new Set(resolved.rates.map((item: any) => item.hotel.id))];
    const hotels = await this.prisma.hotel.findMany({ where: { id: { in: hotelIds } }, include: { policy: true, amenities: { where: { active: true }, include: { amenity: { select: { name: true } } } }, supplementaryCharges: { where: { active: true, scope: { in: ['AGENTS', 'ALL'] }, startDate: { lte: end }, endDate: { gte: start } }, orderBy: { startDate: 'asc' } }, bankAccounts: { where: { active: true, displayOnAgentRateSheet: true }, orderBy: { createdAt: 'asc' } } } });
    const hotelById = new Map(hotels.map((hotel) => [hotel.id, hotel]));
    const hotelsForSheet = hotelIds.map((hotelId) => {
      const hotel = hotelById.get(hotelId);
      const grouped = new Map<string, any>();
      for (const plan of resolved.rates.filter((item: any) => item.hotel.id === hotelId)) {
        const key = `${plan.room.id}:${plan.id}`;
        const room = grouped.get(key) ?? { id: plan.room.id, code: plan.room.code, name: plan.room.name, rates: [] };
        room.rates.push(...plan.rates.map((rate: any) => ({ mealPlan: plan.mealPlan, validFrom: toDateOnly(rate.validFrom ?? rate.date), validTo: toDateOnly(rate.validTo ?? rate.date), amount: Number(rate.amount), extraAdultAmount: Number(rate.extraAdultAmount ?? 0), extraChildWithBedAmount: Number(rate.extraChildWithBedAmount ?? 0), childWithoutBedAmount: Number(rate.childWithoutBedAmount ?? 0) })));
        grouped.set(key, room);
      }
      const configuredAmenities = (hotel?.amenities ?? []).map((item: any) => item.amenity?.name).filter(Boolean);
      const mealInclusions = ['EP - Room only', 'CP - Breakfast included', 'MAP - Breakfast + Dinner', 'AP - Breakfast + Lunch + Dinner'];
      return { id: hotelId, code: hotel?.code, name: hotel?.name, city: hotel?.city, description: hotel?.description, canonicalLink: hotel?.canonicalPath ? `${process.env.PUBLIC_SITE_URL ?? ''}${hotel.canonicalPath}` : null, rooms: [...grouped.values()], supplements: (hotel?.supplementaryCharges ?? []).map((item) => ({ id: item.id, name: item.name, startDate: toDateOnly(item.startDate), endDate: toDateOnly(item.endDate), amountPerRoomNight: Number(item.amountPerRoomNight), scope: item.scope })), inclusions: [mealInclusions.join('; '), configuredAmenities.length ? `Configured property amenities: ${configuredAmenities.join(', ')}` : null].filter(Boolean).join('. '), guidelines: hotel?.policy?.houseRules ?? 'Subject to property availability and the published booking terms.', terms: hotel?.policy?.termsAndConditions ?? null, bankAccounts: (hotel?.bankAccounts ?? []).map((bank) => ({ accountName: bank.accountName, bankName: bank.bankName, branch: bank.branch, accountNumber: bank.accountNumber, ifsc: bank.ifsc, accountType: bank.accountType })) };
    });
    return { agent, contract: { source: 'AGENT_CATEGORY', code: 'CATEGORY_MAPPING', name: 'Assigned hotel rates', validFrom: toDateOnly(start), validTo: toDateOnly(end) }, hotels: hotelsForSheet };
  }

  async previewCategorySheet(agentId: string, from?: string, to?: string) {
    const snapshot = await this.categorySnapshot(agentId, from, to);
    return { source: 'AGENT_CATEGORY', previewState: 'ASSIGNED_CONTRACT_PREVIEW', snapshot, html: this.renderer?.render(snapshot) ?? '' };
  }

  async publishCategorySheet(agentId: string, actorId: string, from?: string, to?: string) {
    const snapshot = await this.categorySnapshot(agentId, from, to);
    const sheet = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-category-rate-sheet:${agentId}`}, 0))`;
      const latest = await tx.agentRateSheet.findFirst({ where: { agentId, sourceType: 'AGENT_CATEGORY' }, orderBy: { version: 'desc' }, select: { version: true } });
      return tx.agentRateSheet.create({ data: { agentId, sourceType: 'AGENT_CATEGORY', version: (latest?.version ?? 0) + 1, snapshotJson: snapshot as Prisma.InputJsonValue, publishedById: actorId } });
    });
    await this.auditEvent(actorId, 'AGENT_CATEGORY_RATE_SHEET_PUBLISHED', 'AgentRateSheet', sheet.id, { agentId, sourceType: 'AGENT_CATEGORY', version: sheet.version });
    return sheet;
  }

  sheets(agentId: string) { return this.prisma.agentRateSheet.findMany({ where: { agentId, sourceType: 'AGENT_CATEGORY' }, orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }] }); }

  categorySheets(agentId: string) { return this.sheets(agentId); }

  async sheetsForAgent(agentId: string) {
    if (this.rateMaster) {
      const from = new Date(); from.setUTCHours(0, 0, 0, 0);
      const to = new Date(from.getTime() + 180 * 86_400_000);
      const categoryRates = await this.rateMaster.effectiveRatesForAgent(agentId, from, to);
      if (categoryRates) return [{ id: `category-${agentId}-${from.toISOString().slice(0, 10)}`, agentId, source: 'AGENT_CATEGORY', version: 1, publishedAt: new Date(), snapshotJson: categoryRates }];
    }
    return this.sheets(agentId);
  }

  async downloadSheet(agentId: string, sheetId: string) {
    const sheet = await this.prisma.agentRateSheet.findFirst({ where: { id: sheetId, agentId, sourceType: 'AGENT_CATEGORY' } });
    if (!sheet) throw new BadRequestException('Category rate sheet not found.');
    const html = this.renderer?.render(sheet.snapshotJson) ?? '';
    await this.auditEvent(undefined, 'AGENT_CATEGORY_RATE_SHEET_DOWNLOADED', 'AgentRateSheet', sheet.id, { agentId, version: sheet.version, sourceType: 'AGENT_CATEGORY' });
    return { html, filename: `rainwood-${agentId}-category-rate-sheet-v${sheet.version}.html` };
  }

  downloadCategorySheet(agentId: string, sheetId: string) { return this.downloadSheet(agentId, sheetId); }
}
