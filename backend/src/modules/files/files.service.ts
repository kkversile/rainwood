import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileKind } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { isAbsolute, join, resolve, sep } from 'path';
import { PrismaService } from '../../common/prisma.service';

const ALLOWED: Record<string, FileKind> = { 'image/jpeg': 'PAYMENT_PROOF', 'image/png': 'PAYMENT_PROOF', 'application/pdf': 'PAYMENT_PROOF' };

@Injectable()
export class FilesService {
  constructor(private p: PrismaService, private c: ConfigService) {}

  async save(buffer: Buffer, originalName: string, mimeType: string, kind: FileKind, userId?: string) {
    const max = Number(this.c.get('MAX_UPLOAD_BYTES', 5 * 1024 * 1024));
    if (!buffer?.length || buffer.length > max) throw new BadRequestException('File is empty or exceeds the upload limit');
    if (kind === 'PAYMENT_PROOF' && ALLOWED[mimeType] !== kind) throw new BadRequestException('Only PDF, PNG, and JPEG payment proofs are accepted');
    this.validateMagic(buffer, mimeType);
    const extension = originalName.toLowerCase().split('.').pop();
    if (!extension || ['exe', 'js', 'html', 'svg', 'bat', 'cmd', 'sh'].includes(extension)) throw new BadRequestException('File extension is not permitted');
    const base = this.basePath();
    const folder = kind.toLowerCase();
    const storageKey = `${folder}/${randomUUID()}.${extension}`;
    const absolute = this.safePath(storageKey);
    await mkdir(resolve(base, folder), { recursive: true });
    await writeFile(absolute, buffer, { flag: 'wx' });
    return this.p.storedFile.create({ data: { kind, storageKey, originalName: originalName.replace(/[\r\n]/g, '_').slice(0, 255), mimeType, size: buffer.length, checksum: createHash('sha256').update(buffer).digest('hex'), createdById: userId } });
  }

  async get(fileId: string) {
    const file = await this.p.storedFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');
    return { file, buffer: await readFile(this.safePath(file.storageKey)) };
  }

  async remove(fileId: string) {
    const file = await this.p.storedFile.findUnique({ where: { id: fileId } });
    if (!file) return false;
    try { await unlink(this.safePath(file.storageKey)); } catch (error: any) { if (error?.code !== 'ENOENT') throw error; }
    await this.p.storedFile.delete({ where: { id: fileId } });
    return true;
  }

  async authorize(fileId: string, user: { role: string }) {
    if (['SUPER_ADMIN', 'ADMIN', 'ACCOUNTS', 'RESERVATION'].includes(user.role)) return this.get(fileId);
    throw new ForbiddenException('You are not allowed to access this file');
  }

  private basePath() { return resolve(process.cwd(), this.c.get('STORAGE_PATH', this.c.get('STORAGE_LOCAL_PATH', 'storage'))); }

  private safePath(storageKey: string) {
    if (isAbsolute(storageKey) || storageKey.includes('..') || storageKey.includes('\\') && storageKey.includes('..')) throw new BadRequestException('Invalid storage key');
    const base = this.basePath();
    const absolute = resolve(base, storageKey);
    if (absolute !== base && !absolute.startsWith(`${base}${sep}`)) throw new BadRequestException('Invalid storage key');
    return absolute;
  }

  private validateMagic(buffer: Buffer, mimeType: string) {
    const pdf = buffer.subarray(0, 5).toString() === '%PDF-';
    const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
    if ((mimeType === 'application/pdf' && !pdf) || (mimeType === 'image/png' && !png) || (mimeType === 'image/jpeg' && !jpeg)) throw new BadRequestException('File content does not match its MIME type');
  }
}
