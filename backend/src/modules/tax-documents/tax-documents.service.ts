import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaxCustomerType, TaxInvoiceStatus, TdsStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { getActorScope, resolveRequestedHotel } from '../../common/role-scope';
import { nextDocumentNumber } from '../../common/document-sequences';
import { CreditNoteDto, TaxInvoiceCustomerDto, TaxInvoiceQueryDto, TaxProfileDto, TaxRuleDto, TdsDto, TdsReverseDto } from './tax-documents.dto';
import { dateOnly, financialYearFor, TaxCalculationService } from './tax-calculation.service';

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

  async settings(userId: string, requestedHotel?: string) {
    const { hotelId, scope } = await this.hotelIdFor(userId, requestedHotel);
    return this.p.hotelTaxProfile.findMany({ where: { hotelId: hotelId ?? undefined }, orderBy: { updatedAt: 'desc' }, include: { hotel: { select: { id: true, name: true } } } }).then(async (profiles) => ({ profiles, rules: await this.p.taxRule.findMany({ where: { OR: [{ hotelId: hotelId ?? undefined }, { hotelId: null }], active: true }, orderBy: [{ effectiveFrom: 'desc' }, { name: 'asc' }], include: { hotel: { select: { id: true, name: true } } } }), scope: { isGlobal: scope.isGlobal, hotelId: scope.hotelId } }));
  }

  async saveProfile(userId: string, body: TaxProfileDto) {
    const { scope, hotelId } = await this.hotelIdFor(userId, body.hotelId, true);
    if (!hotelId) throw new BadRequestException('hotelId is required for global users.');
    if (body.id) {
      const current = await this.p.hotelTaxProfile.findUnique({ where: { id: body.id }, select: { hotelId: true } });
      if (!current || current.hotelId !== hotelId) throw new NotFoundException('Hotel tax profile not found in the selected hotel.');
    }
    const data: any = { ...body, hotelId, id: undefined, active: body.active ?? true };
    delete data.hotelId; delete data.id;
    const row = body.id ? await this.p.hotelTaxProfile.update({ where: { id: body.id }, data }) : await this.p.hotelTaxProfile.create({ data: { ...data, hotelId } });
    await this.audit.log({ actorUserId: userId, action: 'HOTEL_TAX_PROFILE_UPDATED', entityType: 'HotelTaxProfile', entityId: row.id, after: { hotelId, active: row.active } });
    return row;
  }

  async createRule(userId: string, body: TaxRuleDto) {
    const { hotelId } = await this.hotelIdFor(userId, body.hotelId, true);
    const row = await this.p.taxRule.create({ data: { hotelId, name: body.name.trim(), serviceCode: body.serviceCode?.trim(), description: body.description, ratePercent: body.ratePercent, effectiveFrom: dateOnly(body.effectiveFrom), effectiveTo: body.effectiveTo ? dateOnly(body.effectiveTo) : null, active: body.active ?? true } });
    await this.audit.log({ actorUserId: userId, action: 'TAX_RULE_CREATED', entityType: 'TaxRule', entityId: row.id, after: { hotelId, ratePercent: row.ratePercent } });
    return row;
  }

  private async loadReservation(db: any, reference: string) {
    const reservation = await db.reservation.findUnique({ where: { reference }, include: { hotel: true, corporateAccount: true, settlement: true, lines: { include: { nights: true } }, folioCharges: { where: { status: 'POSTED' } } } });
    if (!reservation) throw new NotFoundException('Reservation not found.');
    return reservation;
  }

  private async profileAndRules(db: any, hotelId: string, invoiceDate: Date) {
    const profile = await db.hotelTaxProfile.findFirst({ where: { hotelId, active: true }, orderBy: { updatedAt: 'desc' } });
    if (!profile) throw new BadRequestException('An active HotelTaxProfile is required before issuing a tax invoice.');
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
      customerGstin: body.customerGstin ?? snapshot.gstin ?? corporate?.gstin ?? reservation.gstin ?? null,
      customerAddress: body.customerAddress ?? snapshot.billingAddress ?? corporate?.billingAddress ?? reservation.address ?? null,
      customerState: body.customerState ?? snapshot.state ?? corporate?.state ?? null,
      customerStateCode: body.customerStateCode ?? snapshot.stateCode ?? null,
      customerEmail: body.customerEmail ?? corporate?.email ?? reservation.email ?? null,
      customerMobile: body.customerMobile ?? corporate?.mobile ?? reservation.mobile ?? null,
    };
  }

  private sourceLines(reservation: any, rules: any[]) {
    const rule = (serviceCode?: string) => rules.find((candidate) => serviceCode && candidate.serviceCode === serviceCode) ?? rules[0];
    const lines: any[] = [];
    for (const reservationLine of reservation.lines) {
      const nights = reservationLine.nights ?? [];
      if (nights.length) for (const night of nights) {
        const quantity = Number(night.rooms || 1);
        const taxable = round(night.amount);
        lines.push({ lineType: 'ROOM', description: `Room accommodation - ${new Date(night.date).toISOString().slice(0, 10)}`, quantity, unitAmount: round(taxable / quantity), taxableAmount: taxable, sourceType: 'RESERVATION_ROOM_NIGHT', sourceId: night.id, rule: rule() });
      }
      else {
        const quantity = Number(reservationLine.rooms || 1);
        const taxable = round(reservationLine.lineTotal);
        lines.push({ lineType: 'ROOM', description: 'Room accommodation', quantity, unitAmount: round(taxable / quantity), taxableAmount: taxable, sourceType: 'RESERVATION_LINE', sourceId: reservationLine.id, rule: rule() });
      }
    }
    for (const charge of reservation.folioCharges ?? []) {
      const taxable = round(Number(charge.taxableAmount) > 0 ? charge.taxableAmount : charge.totalAmount);
      const quantity = round(charge.quantity || 1);
      const lineType = charge.category === 'FOOD_AND_BEVERAGE' ? 'FOOD_BEVERAGE' : charge.category === 'LAUNDRY' ? 'LAUNDRY' : charge.category === 'ROOM_SERVICE' ? 'ROOM_SERVICE' : 'OTHER_SERVICE';
      lines.push({ lineType, description: charge.description, quantity, unitAmount: round(taxable / quantity), taxableAmount: taxable, sourceType: 'RESERVATION_FOLIO_CHARGE', sourceId: charge.id, rule: rule() });
    }
    if (!lines.length) throw new BadRequestException('No finalized taxable room or posted service lines are available.');
    return lines;
  }

  private async buildPreview(db: any, reference: string, body: TaxInvoiceCustomerDto = {}) {
    const reservation = await this.loadReservation(db, reference);
    if (!reservation.settlement || reservation.settlement.status !== 'SETTLED' || reservation.stayStatus !== 'CHECKED_OUT') throw new BadRequestException('Tax invoices require a finalized checkout settlement.');
    const invoiceDate = dateOnly(reservation.settlement.settledAt ?? new Date());
    const { profile, rules } = await this.profileAndRules(db, reservation.hotelId, invoiceDate);
    const customer = this.customer(reservation, body);
    const source = this.sourceLines(reservation, rules);
    const calculated = source.map((line) => ({ ...line, tax: this.tax.calculateLine(line, profile.stateCode, customer.customerStateCode) }));
    const totals = this.tax.calculate(source, profile.stateCode, customer.customerStateCode);
    return { reservation: { id: reservation.id, reference: reservation.reference, hotelId: reservation.hotelId, currency: reservation.currency }, invoiceDate, financialYear: financialYearFor(invoiceDate).label, profile, customer, lines: calculated, totals };
  }

  async preview(userId: string, reference: string, body: TaxInvoiceCustomerDto) {
    const { scope } = await this.hotelIdFor(userId);
    const result = await this.buildPreview(this.p, reference, body);
    if (!scope.isGlobal && result.reservation.hotelId !== scope.hotelId) throw new ForbiddenException('You cannot access another hotel.');
    return result;
  }

  async issue(userId: string, reference: string, body: TaxInvoiceCustomerDto) {
    const { scope } = await this.hotelIdFor(userId, undefined, true);
    let created: any;
    try {
      created = await this.p.$transaction(async (tx) => {
        const reservation = await this.loadReservation(tx, reference);
        if (!scope.isGlobal && reservation.hotelId !== scope.hotelId) throw new ForbiddenException('You cannot access another hotel.');
        const existing = await tx.taxInvoice.findUnique({ where: { reservationId: reservation.id }, include: { lines: true } });
        if (existing) return existing;
        const preview = await this.buildPreview(tx, reference, body);
        const fy = financialYearFor(preview.invoiceDate);
        const invoiceNo = await nextDocumentNumber(tx as any, reservation.hotelId, 'TAX_INVOICE', fy.sequenceYear, preview.profile.invoicePrefix ?? 'INV');
        return tx.taxInvoice.create({ data: { hotelId: reservation.hotelId, taxProfileId: preview.profile.id, invoiceNo, invoiceDate: preview.invoiceDate, financialYear: preview.financialYear, status: TaxInvoiceStatus.ISSUED, reservationId: reservation.id, settlementId: reservation.settlement.id, ...preview.customer, hotelLegalName: preview.profile.legalName, hotelTradeName: preview.profile.tradeName, hotelGstin: preview.profile.gstin, hotelPan: preview.profile.pan, hotelAddress: preview.profile.registeredAddress, hotelCity: preview.profile.city, hotelState: preview.profile.state, hotelStateCode: preview.profile.stateCode, hotelPostalCode: preview.profile.postalCode, placeOfSupplyState: preview.customer.customerState, placeOfSupplyStateCode: preview.customer.customerStateCode, taxableAmount: preview.totals.taxableAmount, cgstAmount: preview.totals.cgstAmount, sgstAmount: preview.totals.sgstAmount, igstAmount: preview.totals.igstAmount, otherTaxAmount: 0, roundOff: 0, grandTotal: preview.totals.grandTotal, currency: reservation.currency, issuedById: userId, issuedAt: new Date(), lines: { create: preview.lines.map((line: any) => ({ taxRuleId: line.rule.id, lineType: line.lineType, description: line.description, serviceCode: line.rule.serviceCode, quantity: line.quantity, unitAmount: line.unitAmount, taxableAmount: line.tax.taxableAmount, taxRate: line.tax.ratePercent, cgstRate: line.tax.cgstRate, cgstAmount: line.tax.cgstAmount, sgstRate: line.tax.sgstRate, sgstAmount: line.tax.sgstAmount, igstRate: line.tax.igstRate, igstAmount: line.tax.igstAmount, lineTotal: line.tax.lineTotal, sourceType: line.sourceType, sourceId: line.sourceId })) } }, include: { lines: true } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const racedReservation = await this.p.reservation.findUnique({ where: { reference }, select: { id: true } });
      created = racedReservation ? await this.p.taxInvoice.findUnique({ where: { reservationId: racedReservation.id }, include: { lines: true } }) : null;
      if (!created) throw new ConflictException('Invoice issue raced with another request; retry the lookup.');
    }
    await this.audit.log({ actorUserId: userId, action: 'TAX_INVOICE_ISSUED', entityType: 'TaxInvoice', entityId: created.id, after: { invoiceNo: created.invoiceNo, reservationReference: reference } });
    return created;
  }

  private async visibleInvoice(userId: string, id: string) {
    const { scope } = await this.hotelIdFor(userId);
    const invoice = await this.p.taxInvoice.findUnique({ where: { id }, include: { lines: true, creditNotes: { where: { status: 'ISSUED' } }, tdsDeductions: { where: { status: { not: 'REVERSED' } } }, hotel: { select: { id: true, name: true } }, reservation: { select: { reference: true, corporateAccountId: true, guestName: true } } } });
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
    const row = await this.p.taxInvoice.update({ where: { id }, data: { status: TaxInvoiceStatus.CANCELLED, cancelledById: userId, cancelledAt: new Date(), cancellationReason: reason.trim() } });
    await this.audit.log({ actorUserId: userId, action: 'TAX_INVOICE_CANCELLED', entityType: 'TaxInvoice', entityId: id, after: { reason: reason.trim() } });
    return row;
  }

  async print(userId: string, id: string) {
    const invoice: any = await this.visibleInvoice(userId, id);
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(invoice.invoiceNo)}</title><style>body{font-family:Arial,sans-serif;color:#123;padding:32px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}.total{font-weight:bold}</style></head><body><h1>Tax Invoice</h1><p><strong>${esc(invoice.hotelLegalName)}</strong><br>${esc(invoice.hotelAddress)}<br>GSTIN: ${esc(invoice.hotelGstin)}</p><hr><p><strong>Invoice:</strong> ${esc(invoice.invoiceNo)}<br><strong>Date:</strong> ${esc(invoice.invoiceDate.toISOString().slice(0,10))}<br><strong>Customer:</strong> ${esc(invoice.customerName)}<br>${esc(invoice.customerAddress)}<br>GSTIN: ${esc(invoice.customerGstin)}</p><table><thead><tr><th>Description</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th></tr></thead><tbody>${invoice.lines.map((line: any) => `<tr><td>${esc(line.description)}</td><td>${round(line.taxableAmount).toFixed(2)}</td><td>${round(line.cgstAmount).toFixed(2)}</td><td>${round(line.sgstAmount).toFixed(2)}</td><td>${round(line.igstAmount).toFixed(2)}</td><td>${round(line.lineTotal).toFixed(2)}</td></tr>`).join('')}</tbody><tfoot><tr class="total"><td>Total</td><td>${round(invoice.taxableAmount).toFixed(2)}</td><td>${round(invoice.cgstAmount).toFixed(2)}</td><td>${round(invoice.sgstAmount).toFixed(2)}</td><td>${round(invoice.igstAmount).toFixed(2)}</td><td>${round(invoice.grandTotal).toFixed(2)}</td></tr></tfoot></table></body></html>`;
  }

  async creditNote(userId: string, invoiceId: string, body: CreditNoteDto) {
    const invoice: any = await this.visibleInvoice(userId, invoiceId);
    if (invoice.status !== TaxInvoiceStatus.ISSUED) throw new BadRequestException('Credit notes can only be issued for an issued invoice.');
    const prior = invoice.creditNotes.reduce((sum: number, note: any) => sum + round(note.grandTotal), 0);
    const remaining = round(invoice.grandTotal) - prior;
    const originalTaxable = round(invoice.taxableAmount);
    const taxable = body.taxableAmount === undefined ? originalTaxable : round(body.taxableAmount);
    const cgst = round(round(invoice.cgstAmount) * taxable / Math.max(originalTaxable, 0.01));
    const sgst = round(round(invoice.sgstAmount) * taxable / Math.max(originalTaxable, 0.01));
    const igst = round(round(invoice.igstAmount) * taxable / Math.max(originalTaxable, 0.01));
    const computedGrandTotal = round(taxable + cgst + sgst + igst);
    if (computedGrandTotal <= 0 || computedGrandTotal > remaining + 0.005) throw new BadRequestException(`Credit amount must be between 0.01 and ${remaining.toFixed(2)}.`);
    const fy = financialYearFor(new Date());
    const note = await this.p.$transaction(async (tx) => { const no = await nextDocumentNumber(tx as any, invoice.hotelId, 'CREDIT_NOTE', fy.sequenceYear, 'CN'); return tx.taxCreditNote.create({ data: { hotelId: invoice.hotelId, invoiceId, creditNoteNo: no, creditNoteDate: dateOnly(new Date()), financialYear: fy.label, reason: body.reason.trim(), taxableAmount: taxable, cgstAmount: cgst, sgstAmount: sgst, igstAmount: igst, grandTotal: computedGrandTotal, issuedById: userId, issuedAt: new Date(), lines: { create: { description: `Credit against ${invoice.invoiceNo}`, taxableAmount: taxable, taxRate: originalTaxable ? round((cgst + sgst + igst) * 100 / taxable) : 0, cgstAmount: cgst, sgstAmount: sgst, igstAmount: igst, lineTotal: computedGrandTotal } } }, include: { lines: true } }); });
    await this.audit.log({ actorUserId: userId, action: 'CREDIT_NOTE_ISSUED', entityType: 'TaxCreditNote', entityId: note.id, after: { invoiceId, creditNoteNo: note.creditNoteNo, grandTotal: computedGrandTotal } });
    return note;
  }

  async recordTds(userId: string, invoiceId: string, body: TdsDto) {
    const invoice: any = await this.visibleInvoice(userId, invoiceId);
    if (!invoice.reservation.corporateAccountId) throw new BadRequestException('TDS can only be recorded against a corporate reservation.');
    const existing = invoice.tdsDeductions.reduce((sum: number, row: any) => sum + round(row.tdsAmount), 0);
    const credits = invoice.creditNotes.reduce((sum: number, row: any) => sum + round(row.grandTotal), 0);
    const max = round(invoice.grandTotal) - credits - existing;
    if (body.tdsAmount > max + 0.005) throw new BadRequestException(`TDS exceeds the remaining invoice balance available for TDS (${Math.max(max, 0).toFixed(2)}).`);
    const corporateAccountId = body.corporateAccountId ?? invoice.reservation.corporateAccountId;
    if (corporateAccountId !== invoice.reservation.corporateAccountId) throw new BadRequestException('TDS corporate account does not match the invoice reservation.');
    const row = await this.p.tdsDeduction.create({ data: { hotelId: invoice.hotelId, corporateAccountId, taxInvoiceId: invoiceId, deductionDate: dateOnly(body.deductionDate), sectionCode: body.sectionCode, ratePercent: body.ratePercent, grossInvoiceAmount: invoice.grandTotal, tdsAmount: body.tdsAmount, certificateNumber: body.certificateNumber, certificateDate: body.certificateDate ? dateOnly(body.certificateDate) : null, financialYear: body.financialYear, status: body.status ?? (body.certificateNumber ? TdsStatus.CERTIFICATE_RECEIVED : TdsStatus.CERTIFICATE_PENDING), notes: body.notes, recordedById: userId } });
    await this.audit.log({ actorUserId: userId, action: 'TDS_RECORDED', entityType: 'TdsDeduction', entityId: row.id, after: { invoiceId, tdsAmount: body.tdsAmount } });
    return row;
  }
  async reverseTds(userId: string, id: string, body: TdsReverseDto) { if (!body.reason?.trim()) throw new BadRequestException('Reversal reason is required.'); const row = await this.p.tdsDeduction.findUnique({ where: { id } }); if (!row) throw new NotFoundException('TDS deduction not found.'); const { scope } = await this.hotelIdFor(userId, undefined, true); if (!scope.isGlobal && row.hotelId !== scope.hotelId) throw new ForbiddenException('You cannot access another hotel.'); if (row.status === TdsStatus.REVERSED) return row; const updated = await this.p.tdsDeduction.update({ where: { id }, data: { status: TdsStatus.REVERSED, reversedById: userId, reversedAt: new Date(), reversalReason: body.reason.trim() } }); await this.audit.log({ actorUserId: userId, action: 'TDS_REVERSED', entityType: 'TdsDeduction', entityId: id, after: { reason: body.reason.trim() } }); return updated; }

  async statutoryReceivables(userId: string, corporateId: string) {
    const { scope } = await this.hotelIdFor(userId);
    const account = await this.p.corporateAccount.findUnique({ where: { id: corporateId }, select: { id: true, name: true, creditDays: true } });
    if (!account) throw new NotFoundException('Corporate account not found.');
    const invoices: any[] = await this.p.taxInvoice.findMany({ where: { status: TaxInvoiceStatus.ISSUED, hotelId: scope.hotelId ?? undefined, reservation: { corporateAccountId: corporateId } }, include: { creditNotes: { where: { status: 'ISSUED' } }, tdsDeductions: { where: { status: { not: 'REVERSED' } } }, reservation: { select: { reference: true, guestName: true, payments: { where: { verified: true }, select: { amount: true } } } } }, orderBy: { invoiceDate: 'asc' } });
    return invoices.map((invoice) => { const credits = invoice.creditNotes.reduce((n: number, row: any) => n + round(row.grandTotal), 0); const paid = invoice.reservation.payments.reduce((n: number, row: any) => n + round(row.amount), 0); const tds = invoice.tdsDeductions.reduce((n: number, row: any) => n + round(row.tdsAmount), 0); const outstanding = Math.max(round(invoice.grandTotal) - credits - paid - tds, 0); const due = new Date(invoice.invoiceDate); due.setUTCDate(due.getUTCDate() + (account.creditDays ?? 0)); const age = Math.max(Math.floor((Date.now() - due.getTime()) / 86400000), 0); return { invoiceNo: invoice.invoiceNo, invoiceDate: invoice.invoiceDate, reservationReference: invoice.reservation.reference, guestName: invoice.reservation.guestName, invoiceAmount: round(invoice.grandTotal), paid, tds, creditNotes: credits, outstanding, dueDate: due, agingBucket: outstanding <= 0 ? 'SETTLED' : age <= 0 ? 'CURRENT' : age <= 30 ? '1-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '90+' }; });
  }

  async reports(userId: string, kind: 'tax-invoices' | 'credit-notes' | 'tds') { const { hotelId } = await this.hotelIdFor(userId); if (kind === 'tax-invoices') return this.p.taxInvoice.findMany({ where: { hotelId: hotelId ?? undefined }, orderBy: { invoiceDate: 'desc' } }); if (kind === 'credit-notes') return this.p.taxCreditNote.findMany({ where: { hotelId: hotelId ?? undefined }, include: { invoice: { select: { invoiceNo: true, customerName: true } } }, orderBy: { creditNoteDate: 'desc' } }); return this.p.tdsDeduction.findMany({ where: { hotelId: hotelId ?? undefined }, include: { corporateAccount: { select: { name: true } }, taxInvoice: { select: { invoiceNo: true, grandTotal: true } } }, orderBy: { deductionDate: 'desc' } }); }
}
