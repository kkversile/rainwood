import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaxCategory, TaxCustomerType, TaxInvoiceStatus, TdsStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { getActorScope, resolveRequestedHotel } from '../../common/role-scope';
import { nextDocumentNumber } from '../../common/document-sequences';
import { CreditNoteDto, TaxInvoiceCustomerDto, TaxInvoiceQueryDto, TaxProfileDto, TaxRuleDto, TaxRuleUpdateDto, TdsCertificateDto, TdsDto, TdsReverseDto } from './tax-documents.dto';
import { dateOnly, financialYearFor, hotelLocalDate, normalizeGstin, resolvePlaceOfSupply, TaxCalculationService } from './tax-calculation.service';
import { calculateStatutoryReceivable } from './statutory-receivables';

const issueRoles: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.CORPORATE_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTS];
const readRoles: UserRole[] = [...issueRoles, UserRole.RESERVATION];
const round = (value: unknown) => Number(Number(value ?? 0).toFixed(2));
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));

@Injectable()
export class TaxDocumentsService {
  constructor(private readonly p: PrismaService, private readonly audit: AuditService, private readonly tax: TaxCalculationService) {}

  private async actor(userId: string, write = false) {
    const scope = await getActorScope(this.p, userId);
    const roles = write ? issueRoles : readRoles;
    if (!roles.includes(scope.role)) throw new ForbiddenException('Statutory finance access is not available to this account.');
    return scope;
  }

  private async hotelIdFor(userId: string, requested?: string, write = false) {
    const scope = await this.actor(userId, write);
    return { scope, hotelId: resolveRequestedHotel(scope, requested) };
  }

  private async reportScope(userId: string) {
    const scope = await getActorScope(this.p, userId);
    if (![...readRoles, UserRole.VIEWER].includes(scope.role)) throw new ForbiddenException('Statutory report access is not available to this account.');
    // VIEWER is an organization-wide read-only reporting role in this model.
    return { scope, hotelId: scope.role === UserRole.VIEWER ? null : resolveRequestedHotel(scope) };
  }

  async settings(userId: string, requestedHotel?: string) {
    const { hotelId, scope } = await this.hotelIdFor(userId, requestedHotel);
    return this.p.hotelTaxProfile.findMany({ where: { hotelId: hotelId ?? undefined }, orderBy: { updatedAt: 'desc' }, include: { hotel: { select: { id: true, name: true } } } }).then(async (profiles) => ({ profiles, rules: await this.p.taxRule.findMany({ where: { OR: [{ hotelId: hotelId ?? undefined }, { hotelId: null }] }, orderBy: [{ effectiveFrom: 'desc' }, { name: 'asc' }], include: { hotel: { select: { id: true, name: true } } } }), scope: { isGlobal: scope.isGlobal, hotelId: scope.hotelId } }));
  }

  async saveProfile(userId: string, body: TaxProfileDto) {
    const { scope, hotelId } = await this.hotelIdFor(userId, body.hotelId, true);
    if (!hotelId) throw new BadRequestException('hotelId is required for global users.');
    if (body.id) {
      const current = await this.p.hotelTaxProfile.findUnique({ where: { id: body.id }, select: { hotelId: true } });
      if (!current || current.hotelId !== hotelId) throw new NotFoundException('Hotel tax profile not found in the selected hotel.');
    }
    const data: any = { ...body, hotelId, id: undefined, active: body.active ?? true, legalName: body.legalName.trim(), gstin: normalizeGstin(body.gstin), stateCode: body.stateCode?.trim().toUpperCase() || null };
    delete data.hotelId; delete data.id;
    const row = await this.p.$transaction(async (tx) => {
      if (data.active) await tx.hotelTaxProfile.updateMany({ where: { hotelId, active: true, ...(body.id ? { id: { not: body.id } } : {}) }, data: { active: false } });
      return body.id ? tx.hotelTaxProfile.update({ where: { id: body.id }, data }) : tx.hotelTaxProfile.create({ data: { ...data, hotelId } });
    });
    await this.audit.log({ actorUserId: userId, action: 'HOTEL_TAX_PROFILE_UPDATED', entityType: 'HotelTaxProfile', entityId: row.id, after: { hotelId, active: row.active } });
    return row;
  }

  private async assertRuleWindow(db: any, body: TaxRuleDto, hotelId: string | null, excludeId?: string) {
    const from = dateOnly(body.effectiveFrom);
    const to = body.effectiveTo ? dateOnly(body.effectiveTo) : null;
    if (to && to < from) throw new BadRequestException('Tax rule effectiveTo must be on or after effectiveFrom.');
    const candidates = await db.taxRule.findMany({ where: { hotelId, taxCategory: body.taxCategory, active: true, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true, effectiveFrom: true, effectiveTo: true } });
    const overlaps = candidates.some((candidate: any) => {
      const candidateTo = candidate.effectiveTo ? new Date(candidate.effectiveTo) : null;
      return (!to || new Date(candidate.effectiveFrom) <= to) && (!candidateTo || candidateTo >= from);
    });
    if (overlaps) throw new ConflictException(`An active ${body.taxCategory} tax rule overlaps the requested effective dates.`);
    return { from, to };
  }

  async createRule(userId: string, body: TaxRuleDto) {
    const { hotelId } = await this.hotelIdFor(userId, body.hotelId, true);
    const window = await this.assertRuleWindow(this.p, body, hotelId);
    const row = await this.p.taxRule.create({ data: { hotelId, name: body.name.trim(), taxCategory: body.taxCategory, serviceCode: body.serviceCode?.trim(), description: body.description, ratePercent: body.ratePercent, effectiveFrom: window.from, effectiveTo: window.to, active: body.active ?? true } });
    await this.audit.log({ actorUserId: userId, action: 'TAX_RULE_CREATED', entityType: 'TaxRule', entityId: row.id, after: { hotelId, ratePercent: row.ratePercent } });
    return row;
  }

  async updateRule(userId: string, id: string, body: TaxRuleUpdateDto) {
    const existing = await this.p.taxRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tax rule not found.');
    const { hotelId } = await this.hotelIdFor(userId, body.hotelId ?? existing.hotelId ?? undefined, true);
    if (existing.hotelId !== hotelId) throw new ForbiddenException('You cannot update a tax rule outside the selected hotel.');
    const merged: TaxRuleDto = { hotelId: hotelId ?? undefined, name: body.name ?? existing.name, taxCategory: body.taxCategory ?? existing.taxCategory, serviceCode: body.serviceCode === undefined ? existing.serviceCode ?? undefined : body.serviceCode, description: body.description === undefined ? existing.description ?? undefined : body.description, ratePercent: body.ratePercent ?? Number(existing.ratePercent), effectiveFrom: body.effectiveFrom ?? new Date(existing.effectiveFrom).toISOString().slice(0, 10), effectiveTo: body.effectiveTo === undefined ? (existing.effectiveTo ? new Date(existing.effectiveTo).toISOString().slice(0, 10) : undefined) : body.effectiveTo, active: body.active ?? existing.active };
    const window = await this.assertRuleWindow(this.p, merged, hotelId, id);
    return this.p.taxRule.update({ where: { id }, data: { name: merged.name.trim(), taxCategory: merged.taxCategory, serviceCode: merged.serviceCode?.trim(), description: merged.description, ratePercent: merged.ratePercent, effectiveFrom: window.from, effectiveTo: window.to, active: merged.active } });
  }

  private async loadReservation(db: any, reference: string) {
    const reservation = await db.reservation.findUnique({ where: { reference }, include: { hotel: true, corporateAccount: true, settlement: true, lines: { include: { nights: true } }, folioCharges: { where: { status: 'POSTED' } } } });
    if (!reservation) throw new NotFoundException('Reservation not found.');
    return reservation;
  }

  private async profileAndRules(db: any, hotelId: string, invoiceDate: Date) {
    const profiles = await db.hotelTaxProfile.findMany({ where: { hotelId, active: true }, orderBy: { updatedAt: 'desc' } });
    if (profiles.length > 1) throw new ConflictException('More than one active HotelTaxProfile exists for this hotel; resolve the profile history before issuing.');
    const profile = profiles[0];
    if (!profile) throw new BadRequestException('An active HotelTaxProfile is required before issuing a tax invoice.');
    if (!profile.legalName?.trim() || !profile.registeredAddress?.trim() || !profile.state?.trim() || !profile.stateCode?.trim()) throw new BadRequestException('Hotel tax profile is incomplete: legalName, registeredAddress, state and stateCode are required.');
    if (profile.gstRegistered && !normalizeGstin(profile.gstin)) throw new BadRequestException('GSTIN is required for a GST-registered hotel tax profile.');
    const rules = await db.taxRule.findMany({ where: { active: true, OR: [{ hotelId }, { hotelId: null }], effectiveFrom: { lte: invoiceDate }, AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: invoiceDate } }] }] }, orderBy: [{ hotelId: 'desc' }, { effectiveFrom: 'desc' }] });
    if (!rules.length) throw new BadRequestException('An active TaxRule is required before issuing a tax invoice.');
    return { profile, rules };
  }

  private customer(reservation: any, body: TaxInvoiceCustomerDto = {}) {
    const corporate = reservation.corporateAccount;
    const snapshot: any = corporate ? (reservation.corporateSnapshot ?? {}) : {};
    const customerType = body.customerType ?? (corporate ? TaxCustomerType.CORPORATE : TaxCustomerType.INDIVIDUAL);
    return {
      customerType,
      customerName: body.customerName ?? snapshot.legalName ?? snapshot.name ?? corporate?.legalName ?? corporate?.name ?? reservation.guestName,
      customerGstin: normalizeGstin(body.customerGstin ?? snapshot.gstin ?? corporate?.gstin ?? reservation.gstin),
      customerAddress: body.customerAddress ?? snapshot.billingAddress ?? corporate?.billingAddress ?? reservation.address ?? null,
      customerState: (body.customerState ?? snapshot.state ?? corporate?.state ?? null)?.trim() || null,
      customerStateCode: (body.customerStateCode ?? snapshot.stateCode ?? null)?.trim().toUpperCase() || null,
      customerEmail: body.customerEmail ?? corporate?.email ?? reservation.email ?? null,
      customerMobile: body.customerMobile ?? corporate?.mobile ?? reservation.mobile ?? null,
    };
  }

  private sourceLines(reservation: any, rules: any[]) {
    const rule = (category: TaxCategory) => {
      const candidates = rules.filter((candidate) => candidate.taxCategory === category).sort((a, b) => Number(b.hotelId === reservation.hotelId) - Number(a.hotelId === reservation.hotelId));
      if (!candidates.length) throw new BadRequestException(`No active tax rule configured for ${category}.`);
      return candidates[0];
    };
    const checkBreakdown = (taxable: number, taxAmount: number, totalAmount: number) => {
      if (Math.abs(round(taxable + taxAmount) - totalAmount) > 0.01) throw new BadRequestException('LEGACY_TAX_BREAKDOWN_UNAVAILABLE: finalized line totals cannot be reconciled.');
    };
    const lines: any[] = [];
    for (const reservationLine of reservation.lines) {
      const nights = reservationLine.nights ?? [];
      if (nights.length) for (const night of nights) {
        const quantity = Number(night.rooms || 1);
        const taxAmount = round(night.taxAmount);
        const totalAmount = round(night.totalAmount ?? Number(night.amount) + taxAmount);
        // `amount` is the base room component; finalized taxable value also
        // includes persisted zero-rated extras/supplements carried in total.
        const taxable = round(totalAmount - taxAmount);
        checkBreakdown(taxable, taxAmount, totalAmount);
        lines.push({ lineType: 'ROOM', description: `Room accommodation - ${new Date(night.date).toISOString().slice(0, 10)}`, quantity, unitAmount: round(taxable / quantity), taxableAmount: taxable, taxAmount, totalAmount, sourceType: 'RESERVATION_ROOM_NIGHT', sourceId: night.id, rule: rule(TaxCategory.ROOM) });
      }
      else {
        const quantity = Number(reservationLine.rooms || 1);
        const taxAmount = round(reservationLine.taxAmount);
        const totalAmount = round(reservationLine.lineTotal);
        const taxable = round(totalAmount - taxAmount);
        checkBreakdown(taxable, taxAmount, totalAmount);
        lines.push({ lineType: 'ROOM', description: 'Room accommodation', quantity, unitAmount: round(taxable / quantity), taxableAmount: taxable, taxAmount, totalAmount, sourceType: 'RESERVATION_LINE', sourceId: reservationLine.id, rule: rule(TaxCategory.ROOM) });
      }
    }
    for (const charge of reservation.folioCharges ?? []) {
      const totalAmount = round(charge.totalAmount);
      const taxAmount = round(charge.taxAmount);
      const taxable = round(Number(charge.taxableAmount) > 0 ? charge.taxableAmount : totalAmount - taxAmount);
      if (Number(charge.taxableAmount) === 0 && taxAmount === 0 && totalAmount !== 0) throw new BadRequestException('LEGACY_TAX_BREAKDOWN_UNAVAILABLE: folio charge has no persisted taxable/tax split.');
      checkBreakdown(taxable, taxAmount, totalAmount);
      const quantity = round(charge.quantity || 1);
      const lineType = charge.category === 'FOOD_AND_BEVERAGE' ? 'FOOD_BEVERAGE' : charge.category === 'LAUNDRY' ? 'LAUNDRY' : charge.category === 'ROOM_SERVICE' ? 'ROOM_SERVICE' : 'OTHER_SERVICE';
      lines.push({ lineType, description: charge.description, quantity, unitAmount: round(taxable / quantity), taxableAmount: taxable, taxAmount, totalAmount, sourceType: 'RESERVATION_FOLIO_CHARGE', sourceId: charge.id, rule: rule(lineType as TaxCategory) });
    }
    if (!lines.length) throw new BadRequestException('No finalized taxable room or posted service lines are available.');
    return lines;
  }

  private async buildPreview(db: any, reference: string, body: TaxInvoiceCustomerDto = {}) {
    const reservation = await this.loadReservation(db, reference);
    if (!reservation.settlement || reservation.settlement.status !== 'SETTLED' || reservation.stayStatus !== 'CHECKED_OUT') throw new BadRequestException('Tax invoices require a finalized checkout settlement.');
    if ((reservation.settlement.snapshot as any)?.taxSemantics !== 'TAX_INCLUSIVE_PERSISTED_BREAKDOWN_V1') throw new BadRequestException('LEGACY_TAX_BREAKDOWN_UNAVAILABLE: this settlement predates the reliable statutory tax snapshot.');
    const invoiceDate = hotelLocalDate(reservation.settlement.settledAt ?? new Date(), reservation.hotel.timezoneName);
    const { profile, rules } = await this.profileAndRules(db, reservation.hotelId, invoiceDate);
    const customer = this.customer(reservation, body);
    const source = this.sourceLines(reservation, rules);
    const placeOfSupply = resolvePlaceOfSupply({ supplierStateCode: profile.stateCode, customerStateCode: customer.customerStateCode });
    const calculated = source.map((line) => ({ ...line, tax: this.tax.calculateFinalizedLine(line, profile.stateCode, customer.customerStateCode) }));
    const totals = calculated.reduce((total, line) => ({ taxableAmount: round(total.taxableAmount + line.tax.taxableAmount), cgstAmount: round(total.cgstAmount + line.tax.cgstAmount), sgstAmount: round(total.sgstAmount + line.tax.sgstAmount), igstAmount: round(total.igstAmount + line.tax.igstAmount), grandTotal: round(total.grandTotal + line.tax.lineTotal) }), { taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, grandTotal: 0 });
    const settlementGross = round(reservation.settlement.grossAmount);
    const reconciliation = { finalSettlementTotal: settlementGross, taxable: totals.taxableAmount, gst: round(totals.cgstAmount + totals.sgstAmount + totals.igstAmount), invoiceGrandTotal: totals.grandTotal, difference: round(totals.grandTotal - settlementGross), reconciles: Math.abs(totals.grandTotal - settlementGross) <= 0.01 };
    return { reservation: { id: reservation.id, reference: reservation.reference, hotelId: reservation.hotelId, currency: reservation.currency }, invoiceDate, financialYear: financialYearFor(invoiceDate).label, profile, customer, placeOfSupply, lines: calculated, totals, reconciliation };
  }

  async preview(userId: string, reference: string, body: TaxInvoiceCustomerDto) {
    const { scope } = await this.hotelIdFor(userId);
    const result = await this.buildPreview(this.p, reference, body);
    if (!scope.isGlobal && result.reservation.hotelId !== scope.hotelId) throw new ForbiddenException('You cannot access another hotel.');
    return result;
  }

  async issue(userId: string, reference: string, body: TaxInvoiceCustomerDto) {
    const { scope } = await this.hotelIdFor(userId, undefined, true);
    let created: any; let issued = false;
    try {
      created = await this.p.$transaction(async (tx) => {
        const reservation = await this.loadReservation(tx, reference);
        if (!scope.isGlobal && reservation.hotelId !== scope.hotelId) throw new ForbiddenException('You cannot access another hotel.');
        const existing = await tx.taxInvoice.findUnique({ where: { reservationId: reservation.id }, include: { lines: true } });
        if (existing) return existing;
        const preview = await this.buildPreview(tx, reference, body);
        if (!preview.reconciliation.reconciles) throw new BadRequestException('Tax invoice totals do not reconcile with finalized settlement.');
        const fy = financialYearFor(preview.invoiceDate);
        const invoiceNo = await nextDocumentNumber(tx as any, reservation.hotelId, 'TAX_INVOICE', fy.sequenceYear, preview.profile.invoicePrefix ?? 'INV');
        const row = await tx.taxInvoice.create({ data: { hotelId: reservation.hotelId, taxProfileId: preview.profile.id, invoiceNo, invoiceDate: preview.invoiceDate, financialYear: preview.financialYear, status: TaxInvoiceStatus.ISSUED, reservationId: reservation.id, settlementId: reservation.settlement.id, ...preview.customer, hotelLegalName: preview.profile.legalName, hotelTradeName: preview.profile.tradeName, hotelGstin: normalizeGstin(preview.profile.gstin), hotelPan: preview.profile.pan, hotelAddress: preview.profile.registeredAddress, hotelCity: preview.profile.city, hotelState: preview.profile.state, hotelStateCode: preview.profile.stateCode, hotelPostalCode: preview.profile.postalCode, placeOfSupplyState: preview.customer.customerState, placeOfSupplyStateCode: preview.placeOfSupply.customerStateCode, taxableAmount: preview.totals.taxableAmount, cgstAmount: preview.totals.cgstAmount, sgstAmount: preview.totals.sgstAmount, igstAmount: preview.totals.igstAmount, otherTaxAmount: 0, roundOff: preview.reconciliation.finalSettlementTotal - preview.totals.grandTotal, grandTotal: preview.reconciliation.finalSettlementTotal, currency: reservation.currency, issuedById: userId, issuedAt: new Date(), lines: { create: preview.lines.map((line: any) => ({ taxRuleId: line.rule.id, lineType: line.lineType, description: line.description, serviceCode: line.rule.serviceCode, quantity: line.quantity, unitAmount: line.unitAmount, taxableAmount: line.tax.taxableAmount, taxRate: line.tax.ratePercent, cgstRate: line.tax.cgstRate, cgstAmount: line.tax.cgstAmount, sgstRate: line.tax.sgstRate, sgstAmount: line.tax.sgstAmount, igstRate: line.tax.igstRate, igstAmount: line.tax.igstAmount, lineTotal: line.tax.lineTotal, sourceType: line.sourceType, sourceId: line.sourceId })) } }, include: { lines: true } });
        issued = true;
        return row;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const racedReservation = await this.p.reservation.findUnique({ where: { reference }, select: { id: true } });
      created = racedReservation ? await this.p.taxInvoice.findUnique({ where: { reservationId: racedReservation.id }, include: { lines: true } }) : null;
      if (!created) throw new ConflictException('Invoice issue raced with another request; retry the lookup.');
    }
    if (issued) await this.audit.log({ actorUserId: userId, action: 'TAX_INVOICE_ISSUED', entityType: 'TaxInvoice', entityId: created.id, after: { invoiceNo: created.invoiceNo, reservationReference: reference } });
    return created;
  }

  private async visibleInvoice(userId: string, id: string) {
    const { scope } = await this.hotelIdFor(userId);
    const invoice = await this.p.taxInvoice.findUnique({ where: { id }, include: { lines: true, creditNotes: { where: { status: 'ISSUED' }, include: { lines: true } }, tdsDeductions: { where: { status: { not: 'REVERSED' } } }, hotel: { select: { id: true, name: true, timezoneName: true } }, reservation: { select: { reference: true, corporateAccountId: true, guestName: true, payments: { where: { verified: true }, select: { amount: true, verified: true } } } } } });
    if (!invoice || (!scope.isGlobal && invoice.hotelId !== scope.hotelId)) throw new NotFoundException('Tax invoice not found.');
    return invoice;
  }

  async list(userId: string, query: TaxInvoiceQueryDto) {
    const { hotelId } = await this.hotelIdFor(userId, query.hotelId);
    return this.p.taxInvoice.findMany({ where: { hotelId: hotelId ?? undefined, status: query.status, customerType: query.customerType, customerGstin: query.gstin ? { contains: query.gstin, mode: 'insensitive' } : undefined, invoiceDate: query.from || query.to ? { gte: query.from ? dateOnly(query.from) : undefined, lte: query.to ? dateOnly(query.to) : undefined } : undefined }, include: { hotel: { select: { id: true, name: true } }, lines: true }, orderBy: { invoiceDate: 'desc' } });
  }
  async detail(userId: string, id: string) { return this.visibleInvoice(userId, id); }
  async byReservation(userId: string, reference: string) {
    const { scope } = await this.hotelIdFor(userId);
    const reservation = await this.p.reservation.findUnique({ where: { reference }, select: { id: true, hotelId: true } });
    if (!reservation || (!scope.isGlobal && reservation.hotelId !== scope.hotelId)) throw new NotFoundException('Tax invoice not found.');
    return this.p.taxInvoice.findUnique({ where: { reservationId: reservation.id }, include: { lines: true, creditNotes: true, tdsDeductions: true } });
  }

  async cancel(userId: string, id: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('Cancellation reason is required.');
    const invoice = await this.visibleInvoice(userId, id);
    if (invoice.status !== TaxInvoiceStatus.ISSUED) throw new BadRequestException('Only issued invoices can be cancelled.');
    if (invoice.creditNotes.length || invoice.tdsDeductions.length) throw new ConflictException('Reverse TDS / resolve credit-note chain before cancelling the invoice.');
    const row = await this.p.taxInvoice.update({ where: { id }, data: { status: TaxInvoiceStatus.CANCELLED, cancelledById: userId, cancelledAt: new Date(), cancellationReason: reason.trim() } });
    await this.audit.log({ actorUserId: userId, action: 'TAX_INVOICE_CANCELLED', entityType: 'TaxInvoice', entityId: id, after: { reason: reason.trim() } });
    return row;
  }

  async print(userId: string, id: string) {
    const invoice: any = await this.visibleInvoice(userId, id);
    const roundOff = round(invoice.roundOff);
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(invoice.invoiceNo)}</title><style>body{font-family:Arial,sans-serif;color:#123;padding:32px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}.total{font-weight:bold}</style></head><body><h1>Tax Invoice</h1><p><strong>${esc(invoice.hotelLegalName)}</strong><br>${esc(invoice.hotelAddress)}<br>GSTIN: ${esc(invoice.hotelGstin)}</p><hr><p><strong>Invoice:</strong> ${esc(invoice.invoiceNo)}<br><strong>Date:</strong> ${esc(invoice.invoiceDate.toISOString().slice(0,10))}<br><strong>Customer:</strong> ${esc(invoice.customerName)}<br>${esc(invoice.customerAddress)}<br>GSTIN: ${esc(invoice.customerGstin)}</p><table><thead><tr><th>Description</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th></tr></thead><tbody>${invoice.lines.map((line: any) => `<tr><td>${esc(line.description)}</td><td>${round(line.taxableAmount).toFixed(2)}</td><td>${round(line.cgstAmount).toFixed(2)}</td><td>${round(line.sgstAmount).toFixed(2)}</td><td>${round(line.igstAmount).toFixed(2)}</td><td>${round(line.lineTotal).toFixed(2)}</td></tr>`).join('')}${roundOff !== 0 ? `<tr><td colspan="5">Round Off</td><td>${roundOff.toFixed(2)}</td></tr>` : ''}</tbody><tfoot><tr class="total"><td>Grand Total</td><td>${round(invoice.taxableAmount).toFixed(2)}</td><td>${round(invoice.cgstAmount).toFixed(2)}</td><td>${round(invoice.sgstAmount).toFixed(2)}</td><td>${round(invoice.igstAmount).toFixed(2)}</td><td>${round(invoice.grandTotal).toFixed(2)}</td></tr></tfoot></table></body></html>`;
  }

  private async visibleCreditNote(userId: string, id: string) {
    const { scope } = await this.hotelIdFor(userId);
    const note: any = await this.p.taxCreditNote.findUnique({ where: { id }, include: { lines: true, invoice: { select: { invoiceNo: true, customerName: true, invoiceDate: true, grandTotal: true } }, hotel: { select: { id: true, name: true } } } });
    if (!note || (!scope.isGlobal && note.hotelId !== scope.hotelId)) throw new NotFoundException('Credit note not found.');
    return note;
  }

  async creditNoteDetail(userId: string, id: string) { return this.visibleCreditNote(userId, id); }

  async printCreditNote(userId: string, id: string) {
    const note: any = await this.visibleCreditNote(userId, id);
    const roundOff = round(note.roundOff);
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(note.creditNoteNo)}</title><style>body{font-family:Arial,sans-serif;color:#123;padding:32px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}.total{font-weight:bold}</style></head><body><h1>Credit Note</h1><p><strong>${esc(note.hotel.name)}</strong><br><strong>Credit Note:</strong> ${esc(note.creditNoteNo)}<br><strong>Date:</strong> ${esc(note.creditNoteDate.toISOString().slice(0,10))}<br><strong>Invoice:</strong> ${esc(note.invoice.invoiceNo)}<br><strong>Customer:</strong> ${esc(note.invoice.customerName)}<br><strong>Reason:</strong> ${esc(note.reason)}</p><table><thead><tr><th>Description</th><th>Service code</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th></tr></thead><tbody>${note.lines.map((line: any) => `<tr><td>${esc(line.description)}</td><td>${esc(line.serviceCode)}</td><td>${round(line.taxableAmount).toFixed(2)}</td><td>${round(line.cgstAmount).toFixed(2)}</td><td>${round(line.sgstAmount).toFixed(2)}</td><td>${round(line.igstAmount).toFixed(2)}</td><td>${round(line.lineTotal).toFixed(2)}</td></tr>`).join('')}${roundOff !== 0 ? `<tr><td colspan="6">Round Off</td><td>${roundOff.toFixed(2)}</td></tr>` : ''}</tbody><tfoot><tr class="total"><td colspan="2">Grand Total</td><td>${round(note.taxableAmount).toFixed(2)}</td><td>${round(note.cgstAmount).toFixed(2)}</td><td>${round(note.sgstAmount).toFixed(2)}</td><td>${round(note.igstAmount).toFixed(2)}</td><td>${round(note.grandTotal).toFixed(2)}</td></tr></tfoot></table></body></html>`;
  }

  async creditNote(userId: string, invoiceId: string, body: CreditNoteDto) {
    const invoice: any = await this.visibleInvoice(userId, invoiceId);
    if (invoice.status !== TaxInvoiceStatus.ISSUED) throw new BadRequestException('Credit notes can only be issued for an issued invoice.');
    const priorByLine = new Map<string, number>();
    for (const note of invoice.creditNotes) for (const line of note.lines ?? []) if (line.invoiceLineId) priorByLine.set(line.invoiceLineId, round((priorByLine.get(line.invoiceLineId) ?? 0) + round(line.taxableAmount)));
    const priorRoundOff = round(invoice.creditNotes.reduce((sum: number, note: any) => sum + round(note.roundOff), 0));
    const remainingRoundOff = round(Number(invoice.roundOff ?? 0) - priorRoundOff);
    const requests: Array<{ invoiceLineId: string; taxableAmount: number }> | undefined = body.fullCredit ? invoice.lines.map((line: any) => ({ invoiceLineId: line.id, taxableAmount: round(line.taxableAmount) - (priorByLine.get(line.id) ?? 0) })).filter((line: any) => line.taxableAmount > 0.005) : body.lines ?? (body.taxableAmount !== undefined && invoice.lines.length === 1 ? [{ invoiceLineId: invoice.lines[0].id, taxableAmount: body.taxableAmount }] : undefined);
    if (!requests?.length && !(body.fullCredit && remainingRoundOff > 0.005)) throw new BadRequestException('Select one or more invoice lines, or request a full credit.');
    const seen = new Set<string>();
    const creditLines: Array<{ invoiceLineId: string; description: string; serviceCode: string | null; taxableAmount: number; taxRate: number; cgstAmount: number; sgstAmount: number; igstAmount: number; lineTotal: number }> = (requests ?? []).map((request) => {
      if (seen.has(request.invoiceLineId)) throw new BadRequestException('An invoice line may only appear once in a credit note.');
      seen.add(request.invoiceLineId);
      const original = invoice.lines.find((line: any) => line.id === request.invoiceLineId);
      if (!original) throw new BadRequestException('Credit note line does not belong to this invoice.');
      const remainingTaxable = round(Number(original.taxableAmount) - (priorByLine.get(original.id) ?? 0));
      const taxable = round(request.taxableAmount);
      if (taxable <= 0 || taxable > remainingTaxable + 0.005) throw new BadRequestException(`Credit for ${original.description} must be between 0.01 and ${remainingTaxable.toFixed(2)}.`);
      const ratio = Number(original.taxableAmount) ? taxable / Number(original.taxableAmount) : 0;
      const cgst = round(Number(original.cgstAmount) * ratio);
      const sgst = round(Number(original.sgstAmount) * ratio);
      const igst = round(Number(original.igstAmount) * ratio);
      return { invoiceLineId: original.id, description: `Credit against ${original.description}`, serviceCode: original.serviceCode, taxableAmount: taxable, taxRate: round(original.taxRate), cgstAmount: cgst, sgstAmount: sgst, igstAmount: igst, lineTotal: round(taxable + cgst + sgst + igst) };
    });
    const taxable = round(creditLines.reduce((sum: number, line) => sum + line.taxableAmount, 0));
    const cgst = round(creditLines.reduce((sum: number, line) => sum + line.cgstAmount, 0));
    const sgst = round(creditLines.reduce((sum: number, line) => sum + line.sgstAmount, 0));
    const igst = round(creditLines.reduce((sum: number, line) => sum + line.igstAmount, 0));
    const roundOff = body.fullCredit ? remainingRoundOff : 0;
    const computedGrandTotal = round(creditLines.reduce((sum: number, line) => sum + line.lineTotal, 0) + roundOff);
    if (computedGrandTotal <= 0) throw new BadRequestException('The remaining credit is not a positive statutory amount.');
    const issuedAt = new Date();
    const creditNoteDate = hotelLocalDate(issuedAt, invoice.hotel.timezoneName);
    const fy = financialYearFor(creditNoteDate);
    const note = await this.p.$transaction(async (tx) => { const no = await nextDocumentNumber(tx as any, invoice.hotelId, 'CREDIT_NOTE', fy.sequenceYear, 'CN'); return tx.taxCreditNote.create({ data: { hotelId: invoice.hotelId, invoiceId, creditNoteNo: no, creditNoteDate, financialYear: fy.label, reason: body.reason.trim(), taxableAmount: taxable, cgstAmount: cgst, sgstAmount: sgst, igstAmount: igst, roundOff, grandTotal: computedGrandTotal, issuedById: userId, issuedAt, lines: { create: creditLines } }, include: { lines: true } }); });
    await this.audit.log({ actorUserId: userId, action: 'CREDIT_NOTE_ISSUED', entityType: 'TaxCreditNote', entityId: note.id, after: { invoiceId, creditNoteNo: note.creditNoteNo, grandTotal: computedGrandTotal } });
    return note;
  }

  async recordTds(userId: string, invoiceId: string, body: TdsDto) {
    const invoice: any = await this.visibleInvoice(userId, invoiceId);
    if (invoice.status !== TaxInvoiceStatus.ISSUED) throw new BadRequestException('TDS can only be recorded against an issued tax invoice.');
    if (!invoice.reservation.corporateAccountId) throw new BadRequestException('TDS can only be recorded against a corporate reservation.');
    const receivable = calculateStatutoryReceivable(invoice);
    if (receivable.overApplied) throw new BadRequestException(`${receivable.diagnostic}: payments, credits and TDS exceed the invoice amount.`);
    const max = round(receivable.outstanding);
    if (body.tdsAmount > max + 0.005) throw new BadRequestException(`TDS exceeds the remaining invoice balance available for TDS (${Math.max(max, 0).toFixed(2)}).`);
    if (body.status === TdsStatus.REVERSED) throw new BadRequestException('A new TDS record cannot start in REVERSED status; use the reversal endpoint.');
    if (body.status === TdsStatus.CERTIFICATE_RECEIVED && !body.certificateNumber) throw new BadRequestException('Certificate number is required when TDS status is CERTIFICATE_RECEIVED.');
    const corporateAccountId = body.corporateAccountId ?? invoice.reservation.corporateAccountId;
    if (corporateAccountId !== invoice.reservation.corporateAccountId) throw new BadRequestException('TDS corporate account does not match the invoice reservation.');
    const row = await this.p.tdsDeduction.create({ data: { hotelId: invoice.hotelId, corporateAccountId, taxInvoiceId: invoiceId, deductionDate: dateOnly(body.deductionDate), sectionCode: body.sectionCode, ratePercent: body.ratePercent, grossInvoiceAmount: invoice.grandTotal, tdsAmount: body.tdsAmount, certificateNumber: body.certificateNumber, certificateDate: body.certificateDate ? dateOnly(body.certificateDate) : null, financialYear: body.financialYear ?? financialYearFor(dateOnly(body.deductionDate)).label, status: body.status ?? (body.certificateNumber ? TdsStatus.CERTIFICATE_RECEIVED : TdsStatus.CERTIFICATE_PENDING), notes: body.notes, recordedById: userId } });
    await this.audit.log({ actorUserId: userId, action: 'TDS_RECORDED', entityType: 'TdsDeduction', entityId: row.id, after: { invoiceId, tdsAmount: body.tdsAmount } });
    return row;
  }
  async receiveTdsCertificate(userId: string, id: string, body: TdsCertificateDto) {
    const { scope } = await this.hotelIdFor(userId, undefined, true);
    const row: any = await this.p.tdsDeduction.findUnique({ where: { id } });
    if (!row || (!scope.isGlobal && row.hotelId !== scope.hotelId)) throw new NotFoundException('TDS deduction not found.');
    const certificateNumber = body.certificateNumber.trim();
    if (!certificateNumber) throw new BadRequestException('Certificate number is required.');
    const certificateDate = dateOnly(body.certificateDate);
    const financialYear = body.financialYear ?? row.financialYear;
    if (row.status === TdsStatus.REVERSED) throw new BadRequestException('Reversed TDS cannot receive a certificate.');
    if (row.status === TdsStatus.CERTIFICATE_RECEIVED) {
      const same = row.certificateNumber === certificateNumber && row.certificateDate?.getTime() === certificateDate.getTime() && row.financialYear === financialYear;
      if (same) return row;
      throw new ConflictException('A received TDS certificate cannot be overwritten; use a controlled correction policy.');
    }
    if (![TdsStatus.RECORDED, TdsStatus.CERTIFICATE_PENDING].includes(row.status)) throw new BadRequestException('TDS certificate transition is not allowed from the current status.');
    const updated = await this.p.tdsDeduction.update({ where: { id }, data: { status: TdsStatus.CERTIFICATE_RECEIVED, certificateNumber, certificateDate, financialYear, notes: body.notes ?? row.notes } });
    await this.audit.log({ actorUserId: userId, action: 'TDS_CERTIFICATE_RECEIVED', entityType: 'TdsDeduction', entityId: id, after: { tdsId: id, certificateNumber, certificateDate } });
    return updated;
  }
  async reverseTds(userId: string, id: string, body: TdsReverseDto) { if (!body.reason?.trim()) throw new BadRequestException('Reversal reason is required.'); const row = await this.p.tdsDeduction.findUnique({ where: { id } }); if (!row) throw new NotFoundException('TDS deduction not found.'); const { scope } = await this.hotelIdFor(userId, undefined, true); if (!scope.isGlobal && row.hotelId !== scope.hotelId) throw new ForbiddenException('You cannot access another hotel.'); if (row.status === TdsStatus.REVERSED) return row; const updated = await this.p.tdsDeduction.update({ where: { id }, data: { status: TdsStatus.REVERSED, reversedById: userId, reversedAt: new Date(), reversalReason: body.reason.trim() } }); await this.audit.log({ actorUserId: userId, action: 'TDS_REVERSED', entityType: 'TdsDeduction', entityId: id, after: { reason: body.reason.trim() } }); return updated; }

  async statutoryReceivables(userId: string, corporateId: string) {
    const { scope } = await this.hotelIdFor(userId);
    const account = await this.p.corporateAccount.findUnique({ where: { id: corporateId }, select: { id: true, name: true, creditDays: true } });
    if (!account) throw new NotFoundException('Corporate account not found.');
    const invoices: any[] = await this.p.taxInvoice.findMany({ where: { status: TaxInvoiceStatus.ISSUED, hotelId: scope.hotelId ?? undefined, reservation: { corporateAccountId: corporateId } }, include: { creditNotes: { where: { status: 'ISSUED' } }, tdsDeductions: { where: { status: { not: 'REVERSED' } } }, reservation: { select: { reference: true, guestName: true, payments: { where: { verified: true }, select: { amount: true } } } } }, orderBy: { invoiceDate: 'asc' } });
    return invoices.map((invoice) => { const receivable = calculateStatutoryReceivable(invoice); const due = new Date(invoice.invoiceDate); due.setUTCDate(due.getUTCDate() + (account.creditDays ?? 0)); const age = Math.max(Math.floor((Date.now() - due.getTime()) / 86400000), 0); return { invoiceNo: invoice.invoiceNo, invoiceDate: invoice.invoiceDate, reservationReference: invoice.reservation.reference, guestName: invoice.reservation.guestName, invoiceAmount: receivable.invoiceAmount, paid: receivable.verifiedPayments, tds: receivable.existingTds, creditNotes: receivable.creditNotes, outstanding: receivable.outstanding, diagnostic: receivable.diagnostic, dueDate: due, agingBucket: receivable.overApplied ? 'OVER_APPLIED_RECEIVABLE' : receivable.outstanding <= 0 ? 'SETTLED' : age <= 0 ? 'CURRENT' : age <= 30 ? '1-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '90+' }; });
  }

  async reports(userId: string, kind: 'tax-invoices' | 'credit-notes' | 'tds') { const { hotelId } = await this.reportScope(userId); if (kind === 'tax-invoices') return this.p.taxInvoice.findMany({ where: { hotelId: hotelId ?? undefined }, orderBy: { invoiceDate: 'desc' } }); if (kind === 'credit-notes') return this.p.taxCreditNote.findMany({ where: { hotelId: hotelId ?? undefined }, include: { invoice: { select: { invoiceNo: true, customerName: true } } }, orderBy: { creditNoteDate: 'desc' } }); return this.p.tdsDeduction.findMany({ where: { hotelId: hotelId ?? undefined }, include: { corporateAccount: { select: { name: true } }, taxInvoice: { select: { invoiceNo: true, grandTotal: true, status: true } } }, orderBy: { deductionDate: 'desc' } }); }
}
