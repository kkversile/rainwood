import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentDocumentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import bcrypt from 'bcryptjs';
import { getAgentOnboardingStatus, hasAgentPaymentTerms, summarizeAgentDocuments } from '../../common/agent-access';
import { paymentMilestonesForAgent } from '../../common/agent-payment-terms';

export const AGENT_DOCUMENT_TYPES = [
  'Company PAN Card', 'GST Document', 'MSME Certificate', 'Trade License',
  'Hotel Contract - Signed', 'Cancelled Cheque Leaf', 'Address proof',
  'Owner PAN Document', 'Owner ID proof', 'Owner Address proof', 'Others',
] as const;

@Injectable()
export class AgentsService {
  constructor(private p: PrismaService) {}

  private assignedAgent(agentId: string, db: PrismaService | Prisma.TransactionClient = this.p) {
    return db.user.findFirstOrThrow({ where: { id: agentId, role: 'AGENT' }, select: { id: true, email: true, name: true, role: true, active: true, assignedRatePlans: { include: { ratePlan: { include: { master: true, roomType: { include: { hotel: { select: { id: true, name: true, city: true } } } } } } } } } });
  }

  async assignAgentHotelRatePlan(agentId: string, hotelId: string, masterId: string, actorId: string) {
    await this.p.user.findFirstOrThrow({ where: { id: agentId, role: 'AGENT' }, select: { id: true } });
    const master = await this.p.ratePlanMaster.findUnique({ where: { id: masterId }, select: { id: true, hotelId: true, active: true, code: true, name: true, mealPlan: true, hotel: { select: { id: true, name: true, city: true } }, assignments: { where: { active: true, roomType: { hotelId, active: true } }, select: { id: true, roomType: { select: { id: true, name: true } } } } } });
    if (!master || master.hotelId !== hotelId) throw new BadRequestException('The selected commercial rate plan does not belong to the selected hotel.');
    if (!master.active) throw new BadRequestException('The selected commercial rate plan is inactive.');
    if (!master.assignments.length) throw new BadRequestException('This rate plan is not assigned to any active room types in the selected hotel.');
    const selectedRatePlanIds = master.assignments.map((assignment) => assignment.id);
    const current = await this.p.agentRatePlan.findMany({ where: { agentId, active: true, ratePlan: { roomType: { hotelId } } }, select: { ratePlanId: true, ratePlan: { select: { masterId: true } } } });
    const result = await this.p.$transaction(async (tx) => {
      await tx.agentRatePlan.updateMany({ where: { agentId, active: true, ratePlan: { roomType: { hotelId }, masterId: { not: masterId } } }, data: { active: false } });
      for (const ratePlanId of selectedRatePlanIds) await tx.agentRatePlan.upsert({ where: { agentId_ratePlanId: { agentId, ratePlanId } }, create: { agentId, ratePlanId, active: true }, update: { active: true } });
      await tx.auditLog.create({ data: { actorUserId: actorId, action: 'AGENT_HOTEL_RATE_PLAN_ASSIGNED', entityType: 'User', entityId: agentId, before: { hotelId, masterIds: current.map((item) => item.ratePlan.masterId) }, after: { hotelId, masterId, ratePlanIds: selectedRatePlanIds } } });
      return this.assignedAgent(agentId, tx);
    });
    return result;
  }

  async removeAgentHotelRatePlan(agentId: string, masterId: string, actorId: string) {
    await this.p.user.findFirstOrThrow({ where: { id: agentId, role: 'AGENT' }, select: { id: true } });
    const master = await this.p.ratePlanMaster.findUnique({ where: { id: masterId }, select: { id: true, hotelId: true, code: true, name: true, hotel: { select: { id: true, name: true } } } });
    if (!master) throw new BadRequestException('Rate plan master not found.');
    const result = await this.p.$transaction(async (tx) => {
      const updated = await tx.agentRatePlan.updateMany({ where: { agentId, active: true, ratePlan: { masterId } }, data: { active: false } });
      await tx.auditLog.create({ data: { actorUserId: actorId, action: 'AGENT_HOTEL_RATE_PLAN_REMOVED', entityType: 'User', entityId: agentId, before: { hotelId: master.hotelId, masterId, activeMappings: updated.count }, after: { hotelId: master.hotelId, masterId, active: false } } });
      return this.assignedAgent(agentId, tx);
    });
    return result;
  }

  private publicProfile(user: any) {
    const { agentDocuments = [], paymentMilestones = [], agentPaymentPolicy, bookingPaymentPercent, profileImageFileId, active: _active, ...profile } = user;
    const milestones = paymentMilestones.length ? paymentMilestones : (agentPaymentPolicy ? paymentMilestonesForAgent({ agentPaymentPolicy, bookingPaymentPercent }) : []);
    const kycSummary = summarizeAgentDocuments(agentDocuments.map((document: { status: string }) => document.status));
    return {
      ...profile,
      profileImageUrl: profileImageFileId ? `/files/public/${profileImageFileId}` : null,
      onboardingStatus: getAgentOnboardingStatus(user, kycSummary),
      canAccessHotels: Boolean(user.active),
      canBook: Boolean(user.active),
      paymentTermsAssigned: milestones.length > 0 || hasAgentPaymentTerms({ agentPaymentPolicy, bookingPaymentPercent }),
      paymentTerms: user.active && (milestones.length > 0 || hasAgentPaymentTerms({ agentPaymentPolicy, bookingPaymentPercent })) ? { mode: 'MILESTONES', milestones: milestones.map((item: any) => ({ percentage: Number(item.percentage), dueType: item.dueType, daysBeforeCheckIn: item.daysBeforeCheckIn })) } : null,
      kycSummary,
    };
  }

  async getProfile(agentId: string) {
    const user = await this.p.user.findFirstOrThrow({ where: { id: agentId, role: 'AGENT' }, select: { id: true, email: true, name: true, companyName: true, contactPerson: true, mobile: true, gstin: true, place: true, addressLine1: true, addressLine2: true, state: true, pinCode: true, additionalInformation: true, role: true, active: true, agentPaymentPolicy: true, bookingPaymentPercent: true, profileImageFileId: true, paymentMilestones: { orderBy: { sortOrder: 'asc' } }, agentDocuments: { select: { status: true } } } });
    return this.publicProfile(user);
  }

  async updateProfile(agentId: string, body: Record<string, unknown>) {
    const allowed = ['name', 'companyName', 'contactPerson', 'mobile', 'gstin', 'place', 'addressLine1', 'addressLine2', 'state', 'pinCode', 'additionalInformation'] as const;
    const data = Object.fromEntries(allowed.map((key) => [key, typeof body[key] === 'string' ? (body[key] as string).trim() || null : undefined]).filter(([, value]) => value !== undefined));
    if (typeof data.name === 'string' && data.name.length < 2) throw new BadRequestException('Name must be at least 2 characters');
    return this.p.user.update({ where: { id: agentId, role: 'AGENT' }, data, select: { id: true, email: true, name: true, companyName: true, contactPerson: true, mobile: true, gstin: true, place: true, addressLine1: true, addressLine2: true, state: true, pinCode: true, additionalInformation: true, role: true, active: true, agentPaymentPolicy: true, bookingPaymentPercent: true, profileImageFileId: true, paymentMilestones: { orderBy: { sortOrder: 'asc' } }, agentDocuments: { select: { status: true } } } }).then((user) => this.publicProfile(user));
  }

  async setProfileImage(agentId: string, fileId: string) {
    const file = await this.p.storedFile.findFirst({ where: { id: fileId, createdById: agentId, kind: 'OTHER', mimeType: { startsWith: 'image/' } } });
    if (!file) throw new BadRequestException('The selected profile image could not be verified');
    return this.p.user.update({ where: { id: agentId, role: 'AGENT' }, data: { profileImageFileId: file.id }, select: { profileImageFileId: true } }).then((user) => ({ profileImageUrl: `/files/public/${user.profileImageFileId}` }));
  }

  async changePassword(agentId: string, currentPassword: string, newPassword: string) {
    if (!currentPassword || newPassword.length < 8) throw new BadRequestException('Current password and a new password of at least 8 characters are required');
    const user = await this.p.user.findFirstOrThrow({ where: { id: agentId, role: 'AGENT' }, select: { passwordHash: true } });
    if (!await bcrypt.compare(currentPassword, user.passwordHash)) throw new BadRequestException('Current password is incorrect');
    await this.p.user.update({ where: { id: agentId }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
    return { updated: true };
  }

  listDocuments(agentId: string) {
    return this.p.agentDocument.findMany({ where: { agentId }, include: { file: { select: { originalName: true, mimeType: true, size: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async addDocument(agentId: string, body: { documentType?: string; description?: string; fileId?: string }) {
    const documentType = body.documentType?.trim();
    if (!documentType || !AGENT_DOCUMENT_TYPES.includes(documentType as any)) throw new BadRequestException('Select a valid document type');
    if (!body.fileId) throw new BadRequestException('A document file is required');
    const file = await this.p.storedFile.findFirst({ where: { id: body.fileId, createdById: agentId, kind: 'OTHER' } });
    if (!file) throw new BadRequestException('The uploaded document could not be verified');
    const previous = await this.p.agentDocument.findUnique({ where: { agentId_documentType: { agentId, documentType } } });
    return this.p.$transaction(async (tx) => {
      if (previous) await tx.agentDocument.delete({ where: { id: previous.id } });
      return tx.agentDocument.create({ data: { agentId, documentType, description: body.description?.trim() || null, fileId: file.id }, include: { file: { select: { originalName: true, mimeType: true, size: true } } } });
    });
  }

  async reviewDocument(agentId: string, id: string, status: string, reviewRemark?: string) {
    if (!Object.values(AgentDocumentStatus).includes(status as AgentDocumentStatus)) throw new BadRequestException('Invalid document status');
    const document = await this.p.agentDocument.findFirst({ where: { id, agentId } });
    if (!document) throw new NotFoundException('Agent document not found');
    return this.p.agentDocument.update({ where: { id }, data: { status: status as AgentDocumentStatus, reviewRemark: reviewRemark?.trim() || null, reviewedAt: status === 'PENDING' ? null : new Date() }, include: { file: { select: { originalName: true, mimeType: true, size: true } } } });
  }
}
