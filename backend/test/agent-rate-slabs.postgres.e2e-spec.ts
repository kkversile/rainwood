import { PrismaService } from '../src/common/prisma.service';
import { AgentRateSlabsService } from '../src/modules/agent-rate-slabs/agent-rate-slabs.service';
import { AgentRateSheetRenderer } from '../src/modules/agent-rate-slabs/agent-rate-sheet-renderer';
import { BadRequestException, ConflictException } from '@nestjs/common';

const runDatabaseTests = process.env.RUN_DB_INTEGRATION === '1';
(runDatabaseTests ? describe : describe.skip)('Agent rate slabs PostgreSQL commercial correctness', () => {
  let prisma: PrismaService;
  let service: AgentRateSlabsService;
  let slabId = '';
  let agentId = '';
  let actorId = '';
  let canonicalRatePlanId = '';
  let legacyRatePlanId = '';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    service = new AgentRateSlabsService(prisma, undefined, new AgentRateSheetRenderer());
    const agent = await prisma.user.findFirstOrThrow({ where: { role: 'AGENT', active: true }, select: { id: true } });
    agentId = agent.id;
    const actor = await prisma.user.findFirstOrThrow({ where: { role: { in: ['SUPER_ADMIN', 'CORPORATE_ADMIN'] }, active: true }, select: { id: true } });
    actorId = actor.id;
    const canonical = await prisma.ratePlan.findFirstOrThrow({ where: { active: true, master: { kind: 'CANONICAL_MEAL', mealPlan: 'CP' } }, select: { id: true } });
    canonicalRatePlanId = canonical.id;
    const legacy = await prisma.ratePlan.findFirst({ where: { active: true, master: { kind: 'LEGACY', code: 'A' } }, select: { id: true } });
    legacyRatePlanId = legacy?.id ?? '';
  });

  afterAll(async () => {
    if (slabId) await prisma.agentRateSlab.delete({ where: { id: slabId } });
    await prisma.onModuleDestroy();
  });

  it('creates, publishes, assigns, snapshots, and rejects incomplete coverage', async () => {
    const slab = await service.create({ code: `E2E-${Date.now()}`, name: 'Synthetic Partner Contract', validFrom: '2026-10-01', validTo: '2027-03-31' }, actorId);
    slabId = slab.id;
    await service.replaceRates(slab.id, [
      { ratePlanId: canonicalRatePlanId, validFrom: '2026-10-01', validTo: '2026-12-31', amount: 6000, extraAdultAmount: 1500, extraChildWithBedAmount: 1000, childWithoutBedAmount: 800 },
      { ratePlanId: canonicalRatePlanId, validFrom: '2027-01-01', validTo: '2027-03-31', amount: 6500, extraAdultAmount: 1500, extraChildWithBedAmount: 1000, childWithoutBedAmount: 800 },
    ]);
    await service.publish(slab.id, actorId);
    const assignment = await service.assign(agentId, { slabId, validFrom: '2026-10-01', validTo: '2027-03-31' }, actorId);
    expect(assignment.slabId).toBe(slab.id);
    const preview = await service.previewSheet(agentId, slab.id);
    expect(preview.html).toContain('INR 6,000.00');
    expect(preview.html).toContain('2026-10-01');
    expect(preview.html).toContain('2026-12-31');
    expect(preview.html).toContain('2027-01-01');
    expect(preview.html).toContain('INR 6,500.00');
    await expect(service.publishSheet(agentId, slab.id, actorId)).resolves.toEqual(expect.objectContaining({ slabId: slab.id }));
    await prisma.agentRateSlabAssignment.deleteMany({ where: { agentId } });
  });

  it('serializes overlapping assignments for the same agent', async () => {
    const slab = await prisma.agentRateSlab.findUniqueOrThrow({ where: { id: slabId } });
    const second = await service.clone(slab.id, actorId);
    await expect(service.replaceRates(second.id, [{ ratePlanId: legacyRatePlanId, validFrom: '2026-10-01', validTo: '2026-12-31', amount: 4800 }])).rejects.toThrow(BadRequestException);
    await service.publish(second.id, actorId);
    const results = await Promise.allSettled([
      service.assign(agentId, { slabId: second.id, validFrom: '2026-10-01', validTo: '2027-03-31' }, actorId),
      service.assign(agentId, { slabId: second.id, validFrom: '2026-11-01', validTo: '2027-03-31' }, actorId),
    ]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((item) => item.status === 'rejected').map((item: any) => item.reason)).toEqual([expect.any(ConflictException)]);
    await prisma.agentRateSlab.delete({ where: { id: second.id } });
  });
});
