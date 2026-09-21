import { BadRequestException, Controller, Get, Param, Post, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { ActiveAgentGuard } from '../../common/active-agent.guard';

@Controller('files')
export class FilesController {
  constructor(private s: FilesService) {}

  @Post('payment-proof')
  @UseGuards(JwtAuthGuard, ActiveAgentGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_request, file, callback) => callback(null, ['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)) }))
  upload(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: any) {
    if (!file) throw new BadRequestException('A PDF, PNG, or JPEG file is required');
    return this.s.save(file.buffer, file.originalname, file.mimetype, 'PAYMENT_PROOF', user.id);
  }

  @Post('hotel-image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_request, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) }))
  uploadHotelImage(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: any) {
    if (!file) throw new BadRequestException('A JPEG, PNG, or WebP hotel image is required');
    return this.s.save(file.buffer, file.originalname, file.mimetype, 'OTHER', user.id);
  }

  @Post('hotel-video')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 150 * 1024 * 1024 }, fileFilter: (_request, file, callback) => callback(null, ['video/mp4', 'video/webm'].includes(file.mimetype)) }))
  uploadHotelVideo(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: any) {
    if (!file) throw new BadRequestException('An MP4 or WebM hotel video is required');
    return this.s.save(file.buffer, file.originalname, file.mimetype, 'OTHER', user.id, 150 * 1024 * 1024);
  }

  @Post('hotel-document')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_request, file, callback) => callback(null, ['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)) }))
  uploadHotelDocument(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: any) {
    if (!file) throw new BadRequestException('A PDF, PNG, or JPEG hotel document is required');
    return this.s.save(file.buffer, file.originalname, file.mimetype, 'OTHER', user.id);
  }

  @Post('agent-document')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_request, file, callback) => callback(null, ['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)) }))
  uploadAgentDocument(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: any) {
    if (!file) throw new BadRequestException('A PDF, PNG, or JPEG agent document is required');
    return this.s.save(file.buffer, file.originalname, file.mimetype, 'OTHER', user.id);
  }

  @Post('profile-image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (_request, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) }))
  uploadProfileImage(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: any) {
    if (!file) throw new BadRequestException('A JPEG, PNG, or WebP profile image is required');
    return this.s.save(file.buffer, file.originalname, file.mimetype, 'OTHER', user.id, 2 * 1024 * 1024);
  }

  @Get('public/:id')
  async publicImage(@Param('id') id: string) {
    const { file, buffer } = await this.s.get(id);
    if (!file.mimeType.startsWith('image/') && !file.mimeType.startsWith('video/')) throw new BadRequestException('Only image and video files can be displayed publicly');
    return new StreamableFile(buffer, { type: file.mimeType, disposition: 'inline' });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async download(@Param('id') id: string, @CurrentUser() user: any) {
    const { file, buffer } = await this.s.authorize(id, user);
    return new StreamableFile(buffer, { type: file.mimeType, disposition: `attachment; filename="${file.originalName.replace(/"/g, '')}"` });
  }
}
