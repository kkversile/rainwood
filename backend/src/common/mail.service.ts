import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type MailAttachment = { filename: string; content: Buffer; contentType?: string };
export type MailMessage = { to: string | string[]; subject: string; text: string; html?: string; attachments?: MailAttachment[]; attachmentFileIds?: string[] };

function escapeHtml(value: string) {
  return value.replace(/[&<>'\"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;' })[character] ?? character);
}

function renderLines(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const detailRows: string[] = [];
  const paragraphs: string[] = [];
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator > 0 && separator < 40) {
      const label = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      detailRows.push(`<tr><td style="padding:10px 12px;border-bottom:1px solid #e3eef1;color:#718793;font-size:13px;font-weight:700;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:10px 12px;border-bottom:1px solid #e3eef1;color:#173f59;font-size:14px;vertical-align:top;">${escapeHtml(value)}</td></tr>`);
    } else {
      paragraphs.push(`<p style="margin:0 0 12px;color:#526b78;font-size:15px;line-height:1.65;">${escapeHtml(line)}</p>`);
    }
  }
  const table = detailRows.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 8px;border:1px solid #d9e9ed;border-radius:8px;border-collapse:separate;overflow:hidden;">${detailRows.join('')}</table>` : '';
  return `${paragraphs.join('')}${table}`;
}

function categoryFor(subject: string) {
  const value = subject.toLowerCase();
  if (value.includes('voucher')) return 'Reservation document';
  if (value.includes('wallet') || value.includes('recharge')) return 'Wallet update';
  if (value.includes('payment')) return value.includes('awaiting') || value.includes('submitted') ? 'Action required' : 'Payment update';
  if (value.includes('booking') || value.includes('reservation')) return 'Reservation update';
  return 'RainWood notification';
}

function statusStyles(subject: string) {
  const value = subject.toLowerCase();
  if (value.includes('awaiting') || value.includes('submitted')) return { background: '#fff4d9', color: '#8a5d00', dot: '#d79b28' };
  if (value.includes('cancel') || value.includes('failed') || value.includes('reject')) return { background: '#fde8e8', color: '#a63838', dot: '#c44c4c' };
  return { background: '#e4f7f3', color: '#087c70', dot: '#16a897' };
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  adminRecipients() {
    return String(this.config.get('MAIL_ADMIN_TO', '')).split(',').map((value) => value.trim()).filter(Boolean);
  }

  async queue(message: MailMessage, idempotencyKey: string, aggregateType: string, aggregateId: string) {
    const recipients = Array.isArray(message.to) ? message.to : [message.to];
    const to = recipients.map((value) => value.trim()).filter(Boolean);
    if (!to.length) return null;
    if (message.attachments?.length) throw new Error('Queued mail does not support in-memory attachments; use attachmentFileIds.');
    return this.prisma.outboxJob.upsert({
      where: { idempotencyKey },
      create: { type: 'SEND_EMAIL', aggregateType, aggregateId, idempotencyKey, payload: { ...message, to } as Prisma.InputJsonValue },
      update: {},
    });
  }

  async send(message: MailMessage) {
    const mode = this.config.get('SMTP_MODE', 'log').toLowerCase();
    const recipients = Array.isArray(message.to) ? message.to : [message.to];
    if (mode === 'log') {
      this.logger.log(`Mail suppressed in log mode: ${message.subject} -> ${recipients.join(', ')}`);
      return { accepted: recipients };
    }
    const port = Number(this.config.get('SMTP_PORT', 587));
    const transport = nodemailer.createTransport({
      host: this.config.getOrThrow('SMTP_HOST'),
      port,
      secure: port === 465,
      auth: { user: this.config.getOrThrow('SMTP_USER'), pass: this.config.getOrThrow('SMTP_PASSWORD') },
    });
    const category = categoryFor(message.subject);
    const status = statusStyles(message.subject);
    const html = message.html ?? `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(message.subject)}</title>
  </head>
  <body style="margin:0;background:#f4f8fa;font-family:Arial,Helvetica,sans-serif;color:#123b57;">
    <div style="padding:32px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d5e6eb;border-radius:14px;overflow:hidden;">
        <tr>
          <td style="padding:24px 32px;background:#073b5c;">
            <div style="font-size:22px;font-weight:800;letter-spacing:1.8px;color:#ffffff;">RAINWOOD <span style="color:#18b5c6;">HOTELS</span></div>
            <div style="margin-top:6px;font-size:11px;letter-spacing:2px;color:#d8eaf0;">STAY COMFORTABLE. TRAVEL CONFIDENTLY.</div>
          </td>
        </tr>
        <tr>
          <td style="height:6px;background:#13a9b9;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:34px 32px 26px;">
            <div style="font-size:12px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#c88d25;margin-bottom:12px;">${escapeHtml(category)}</div>
            <h1 style="margin:0 0 18px;color:#073b5c;font-size:28px;line-height:1.25;">${escapeHtml(message.subject)}</h1>
            <div style="display:inline-block;margin:0 0 22px;padding:7px 11px;border-radius:999px;background:${status.background};color:${status.color};font-size:12px;font-weight:700;">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${status.dot};margin-right:6px;">&nbsp;</span>${escapeHtml(category)}
            </div>
            <div style="padding:20px 20px 8px;border:1px solid #e0edf0;border-radius:10px;background:#fbfdfd;">
            ${message.html ?? renderLines(message.text)}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #e3eef1;background:#f8fbfc;color:#718793;font-size:12px;line-height:1.55;">
            <strong style="color:#526b78;">RainWood Hotels</strong><br>
            This is an automated service message. Please do not reply to this email. Contact the RainWood reservations team if you need assistance.
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>`;
    try {
      return await transport.sendMail({
        from: { name: 'RainWood Hotels', address: this.config.getOrThrow('SMTP_FROM') },
        to: recipients,
        subject: message.subject,
        text: message.text,
        html,
        attachments: message.attachments,
      });
    } finally {
      transport.close();
    }
  }
}
