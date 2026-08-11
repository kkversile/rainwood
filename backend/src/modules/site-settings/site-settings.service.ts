import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class SiteSettingsService {
  constructor(private prisma: PrismaService) {}

  async publicSettings() {
    const setting = await this.prisma.siteSetting.findUnique({ where: { key: 'site.logoUrl' } });
    return { logoUrl: setting?.value ?? null };
  }

  async adminSettings() { return this.publicSettings(); }

  async saveLogo(logoUrl: string | null) {
    if (!logoUrl) await this.prisma.siteSetting.deleteMany({ where: { key: 'site.logoUrl' } });
    else await this.prisma.siteSetting.upsert({ where: { key: 'site.logoUrl' }, update: { value: logoUrl }, create: { key: 'site.logoUrl', value: logoUrl } });
    return this.publicSettings();
  }
}
