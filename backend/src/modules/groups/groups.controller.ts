import { Body, Controller, Get, Header, Param, Patch, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { BulkPickupDto, GroupBlockCreateDto, GroupBlockUpdateDto, GroupCreateDto, GroupListQueryDto, GroupUpdateDto, PickupDto, RoomingListBulkDto, RoomingListEntryDto, RoomingListImportDto } from './groups.dto';
import { GroupsService } from './groups.service';
import { FeatureGuard } from '../features/feature.guard';
import { RequireFeature } from '../features/require-feature.decorator';

@Controller('groups')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@RequireFeature('groups')
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'VIEWER')
export class GroupsController {
  constructor(private readonly service: GroupsService) {}

  @Get() list(@CurrentUser() user: any, @Query() query: GroupListQueryDto) { return this.service.list(user.id, query); }
  @Post() @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') create(@CurrentUser() user: any, @Body() body: GroupCreateDto) { return this.service.create(user.id, body); }
  @Get(':id') detail(@CurrentUser() user: any, @Param('id') id: string, @Query('hotelId') hotelId?: string) { return this.service.detail(user.id, id, hotelId); }
  @Post(':id/sync-lifecycle') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') syncLifecycle(@CurrentUser() user: any, @Param('id') id: string) { return this.service.syncLifecycleStatus(user.id, id); }
  @Patch(':id') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: GroupUpdateDto) { return this.service.update(user.id, id, body); }
  @Post(':id/tentative') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') tentative(@CurrentUser() user: any, @Param('id') id: string) { return this.service.tentative(user.id, id); }
  @Post(':id/confirm') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') confirm(@CurrentUser() user: any, @Param('id') id: string) { return this.service.confirm(user.id, id); }
  @Post(':id/cancel') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') cancel(@CurrentUser() user: any, @Param('id') id: string) { return this.service.cancel(user.id, id); }
  @Post(':id/blocks') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') addBlock(@CurrentUser() user: any, @Param('id') id: string, @Body() body: GroupBlockCreateDto) { return this.service.addBlock(user.id, id, body); }
  @Patch(':id/blocks/:blockId') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') updateBlock(@CurrentUser() user: any, @Param('id') id: string, @Param('blockId') blockId: string, @Body() body: GroupBlockUpdateDto) { return this.service.updateBlock(user.id, id, blockId, body); }
  @Post(':id/release') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') release(@CurrentUser() user: any, @Param('id') id: string) { return this.service.release(user.id, id); }
  @Post(':id/rooming-list') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') addRooming(@CurrentUser() user: any, @Param('id') id: string, @Body() body: RoomingListEntryDto) { return this.service.addRoomingEntry(user.id, id, body); }
  @Post(':id/rooming-list/bulk') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') bulkRooming(@CurrentUser() user: any, @Param('id') id: string, @Body() body: RoomingListBulkDto) { return this.service.bulkRooming(user.id, id, body); }
  @Get(':id/rooming-list/template.xlsx') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') @Header('Content-Disposition', 'attachment; filename="rainwood-rooming-list-template.xlsx"') async roomingTemplate(@CurrentUser() user: any, @Param('id') id: string) { return new StreamableFile(await this.service.roomingListTemplate(user.id, id)); }
  @Post(':id/rooming-list/import') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } })) importRooming(@CurrentUser() user: any, @Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Body() body: RoomingListImportDto) { return this.service.importRoomingList(user.id, id, file, body.commit); }
  @Post(':id/rooming-list/:entryId/pickup') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') pickup(@CurrentUser() user: any, @Param('id') id: string, @Param('entryId') entryId: string, @Body() body: PickupDto) { return this.service.pickup(user.id, id, entryId, body); }
  @Post(':id/rooming-list/create-reservations') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') bulkPickup(@CurrentUser() user: any, @Param('id') id: string, @Body() body: BulkPickupDto) { return this.service.bulkPickup(user.id, id, body.entryIds); }
}
