import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import { PrismaService } from '../../common/prisma.service';
import { FilesService } from '../files/files.service';

@Injectable()
export class VouchersService {
  constructor(private p: PrismaService, private f: FilesService, private c: ConfigService) {}

  async generate(reservationId: string) {
    const reservation = await this.p.reservation.findUnique({ where: { id: reservationId }, include: { hotel: true, lines: { include: { roomType: true, ratePlan: true, nights: true } }, payments: true, vouchers: { orderBy: { version: 'desc' }, take: 1 } } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    const payments = reservation.payments.filter((payment) => payment.verified);
    const metadata = { reference: reservation.reference, guestName: reservation.guestName, email: reservation.email, hotel: reservation.hotel.name, source: reservation.source, checkIn: reservation.checkIn.toISOString().slice(0, 10), checkOut: reservation.checkOut.toISOString().slice(0, 10), currency: reservation.currency, totalAmount: Number(reservation.totalAmount), taxAmount: Number(reservation.taxAmount), advanceAmount: Number(reservation.advanceAmount), balanceAmount: Number(reservation.balanceAmount), paymentStatus: reservation.paymentStatus, lines: reservation.lines.map((line) => ({ roomType: line.roomType.name, ratePlan: line.ratePlan.name, rooms: line.rooms, adults: line.adults, children: line.children, checkIn: line.checkIn.toISOString().slice(0, 10), checkOut: line.checkOut.toISOString().slice(0, 10), lineTotal: Number(line.lineTotal) })), policySnapshot: reservation.policySnapshot, version: (reservation.vouchers[0]?.version ?? 0) + 1, generatedAt: new Date().toISOString() };
    const chunks: Buffer[] = [];
    const document = new PDFDocument({ margin: 48, size: 'A4' });
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.fontSize(22).fillColor('#0d3856').text('RainWood Hotels');
    document.fontSize(14).fillColor('#172333').text('Confirmation Voucher').moveDown();
    document.fontSize(10).text(`Voucher version: ${metadata.version}`).text(`Booking reference: ${metadata.reference}`).text(`Generated: ${metadata.generatedAt}`).moveDown();
    document.fontSize(12).text(`Guest: ${metadata.guestName}`).text(`Hotel: ${metadata.hotel}`).text(`Stay: ${metadata.checkIn} to ${metadata.checkOut}`).text(`Booking source: ${metadata.source}`).moveDown();
    for (const line of metadata.lines) document.text(`${line.rooms} x ${line.roomType} / ${line.ratePlan} | ${line.adults} adults, ${line.children} children | INR ${line.lineTotal.toFixed(2)}`);
    document.moveDown().text(`Total: INR ${metadata.totalAmount.toFixed(2)}`).text(`Tax: INR ${metadata.taxAmount.toFixed(2)}`).text(`Advance paid: INR ${metadata.advanceAmount.toFixed(2)}`).text(`Balance: INR ${metadata.balanceAmount.toFixed(2)}`).text(`Payment status: ${metadata.paymentStatus}`);
    document.moveDown().fontSize(9).text('Cancellation and booking terms are those captured in the reservation policy snapshot.');
    document.end();
    await new Promise<void>((resolve, reject) => { document.once('end', resolve); document.once('error', reject); });
    const file = await this.f.save(Buffer.concat(chunks), `${reservation.reference}-v${metadata.version}.pdf`, 'application/pdf', 'VOUCHER');
    return this.p.$transaction(async (tx) => {
      await tx.voucher.updateMany({ where: { reservationId, supersededAt: null }, data: { supersededAt: new Date() } });
      return tx.voucher.create({ data: { reservationId, version: metadata.version, fileId: file.id, metadata }, include: { file: true } });
    });
  }

  async email(voucherId: string) {
    const voucher = await this.p.voucher.findUnique({ where: { id: voucherId }, include: { file: true, reservation: true } });
    if (!voucher) throw new NotFoundException('Voucher not found');
    if (this.c.get('SMTP_MODE', 'log') === 'log') return this.p.voucher.update({ where: { id: voucherId }, data: { emailedAt: new Date() } });
    const transport = nodemailer.createTransport({ host: this.c.getOrThrow('SMTP_HOST'), port: Number(this.c.get('SMTP_PORT', 587)), secure: Number(this.c.get('SMTP_PORT', 587)) === 465, auth: this.c.get('SMTP_USER') ? { user: this.c.get('SMTP_USER'), pass: this.c.get('SMTP_PASSWORD') } : undefined });
    await transport.sendMail({ from: this.c.getOrThrow('SMTP_FROM'), to: voucher.reservation.email, subject: `RainWood reservation ${voucher.reservation.reference}`, text: 'Your RainWood confirmation voucher is attached.', attachments: [{ filename: voucher.file.originalName, content: await this.f.get(voucher.fileId).then((result) => result.buffer) }] });
    return this.p.voucher.update({ where: { id: voucherId }, data: { emailedAt: new Date() } });
  }

  async fileForVoucher(voucherId: string) {
    const voucher = await this.p.voucher.findUnique({ where: { id: voucherId } });
    if (!voucher) throw new NotFoundException('Voucher not found');
    return this.f.get(voucher.fileId);
  }
}
