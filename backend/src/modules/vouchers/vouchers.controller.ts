import { Controller, Get, Param, Post, StreamableFile, UseGuards } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';

@Controller('vouchers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS')
export class VouchersController {
  constructor(private s: VouchersService) {}

  @Post('reservation/:id')
  generate(@Param('id') id: string) { return this.s.generate(id); }

  @Post(':id/email')
  email(@Param('id') id: string) { return this.s.email(id); }

  @Get(':id/download')
  async download(@Param('id') id: string) {
    const { file, buffer } = await this.s.fileForVoucher(id);
    return new StreamableFile(buffer, { type: file.mimeType, disposition: `attachment; filename="${file.originalName.replace(/"/g, '')}"` });
  }
}
