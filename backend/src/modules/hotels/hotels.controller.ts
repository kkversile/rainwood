import { Body, ConflictException, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { HotelsService } from './hotels.service';
import { AmenityDto, CopyRatePlanDto, HotelBankAccountDto, HotelContactDto, HotelContentDto, HotelDocumentDto, HotelDocumentUpdateDto, HotelImageDto, HotelImageOrderDto, HotelImageUpdateDto, HotelLocationAttractionDto, HotelLocationProfileDto, HotelLocationTransportDto, HotelPolicyDto, HotelReviewDto, HotelUpdateDto, HotelVideoDto, InventoryBatchDto, PhysicalRoomDto, PromotionDto, RateBatchDto, RateBulkUpdateDto, RatePlanAssignmentDto, RatePlanAssignmentUpdateDto, RatePlanDto, RatePlanMasterDto, RoomTypeDto, RateSeasonDto, YieldRuleDto } from './hotels.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import { OptionalJwtAuthGuard } from '../../common/optional-jwt-auth.guard';
import { ActiveAgentGuard } from '../../common/active-agent.guard';
import { HotelScopeGuard } from './hotel-scope.guard';
import { FeatureGuard } from '../features/feature.guard';
import { RequireFeature } from '../features/require-feature.decorator';
import { HotelRateImportService } from './hotel-rate-import.service';

@Controller('hotels')
@UseGuards(HotelScopeGuard)
export class HotelsController {
  constructor(private readonly service: HotelsService, private readonly rateImport: HotelRateImportService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard, ActiveAgentGuard)
  list() { return this.service.list(); }

  @Get('rate-plans')
  @RequireFeature('ratePlans')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  ratePlans(@CurrentUser() user: any) { return this.service.ratePlans(user?.scopeHotelId); }

  @Get('physical-rooms')
  @RequireFeature('physicalRooms')
  @UseGuards(JwtAuthGuard, RolesGuard, HotelScopeGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'VIEWER')
  physicalRooms(@Query('hotelId') hotelId: string | undefined, @CurrentUser() user: any) { return this.service.physicalRooms(hotelId ?? user?.scopeHotelId); }

  @Post(':hotelId/physical-rooms')
  @RequireFeature('physicalRooms')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  createPhysicalRoom(@Param('hotelId') hotelId: string, @Body() body: PhysicalRoomDto) { return this.service.createPhysicalRoom(hotelId, body); }

  @Patch('physical-rooms/:id')
  @RequireFeature('physicalRooms')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  updatePhysicalRoom(@Param('id') id: string, @Body() body: Partial<PhysicalRoomDto>) { return this.service.updatePhysicalRoom(id, body); }

  @Get(':hotelId/rate-plan-masters')
  @RequireFeature('ratePlans')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  ratePlanMasters(@Param('hotelId') hotelId: string) { return this.service.ratePlanMasters(hotelId); }

  @Get(':hotelId/bank-accounts')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  bankAccounts(@Param('hotelId') hotelId: string) { return this.service.bankAccounts(hotelId); }

  @Post(':hotelId/bank-accounts')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  addBankAccount(@Param('hotelId') hotelId: string, @Body() body: HotelBankAccountDto) { return this.service.addBankAccount(hotelId, body); }

  @Patch('bank-accounts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  updateBankAccount(@Param('id') id: string, @Body() body: Partial<HotelBankAccountDto>, @CurrentUser() user: any) { return this.service.updateBankAccount(id, body, user.id); }

  @Post(':hotelId/rate-plan-masters')
  @RequireFeature('ratePlans')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  createRatePlanMaster(@Param('hotelId') hotelId: string, @Body() body: RatePlanMasterDto) { return this.service.createRatePlanMaster(hotelId, body); }

  @Patch('rate-plan-masters/:id')
  @RequireFeature('ratePlans')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  updateRatePlanMaster(@Param('id') id: string, @Body() body: Partial<RatePlanMasterDto>) { return this.service.updateRatePlanMaster(id, body); }

  @Delete('rate-plan-masters/:id')
  @RequireFeature('ratePlans')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  deleteRatePlanMaster(@Param('id') id: string) { return this.service.deleteRatePlanMaster(id); }

  @Post('rate-plan-masters/:id/assignments')
  @RequireFeature('ratePlans')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  assignRatePlan(@Param('id') id: string, @Body() body: RatePlanAssignmentDto) { return this.service.assignRatePlanMaster(id, body); }

  @Patch('rate-plan-assignments/:id')
  @RequireFeature('ratePlans')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  updateRatePlanAssignment(@Param('id') id: string, @Body() body: RatePlanAssignmentUpdateDto) { return this.service.updateRatePlanAssignment(id, body); }

  @Delete('rate-plan-assignments/:id')
  @RequireFeature('ratePlans')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  deleteRatePlanAssignment(@Param('id') id: string) { return this.service.deleteRatePlanAssignment(id); }

  @Post(':hotelId/rates/bulk/preview')
  @RequireFeature('rates')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  previewBulkRates(@Param('hotelId') hotelId: string, @Body() body: RateBulkUpdateDto, @CurrentUser() user: any) { return this.service.previewBulkRates(hotelId, body, user.id); }

  @Post(':hotelId/rates/bulk')
  @RequireFeature('rates')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  updateBulkRates(@Param('hotelId') hotelId: string, @Body() body: RateBulkUpdateDto, @CurrentUser() user: any) { return this.service.updateBulkRates(hotelId, body, user.id); }

  @Get(':hotelId/promotions')
  @RequireFeature('promotions')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  promotions(@Param('hotelId') hotelId: string, @CurrentUser() user: any) { return this.service.promotions(hotelId, user.id); }

  @Post(':hotelId/promotions')
  @RequireFeature('promotions')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  createPromotion(@Param('hotelId') hotelId: string, @Body() body: PromotionDto, @CurrentUser() user: any) { return this.service.createPromotion(hotelId, body, user.id); }

  @Patch('promotions/:id')
  @RequireFeature('promotions')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  updatePromotion(@Param('id') id: string, @Body() body: Partial<PromotionDto>, @CurrentUser() user: any) { return this.service.updatePromotion(id, body, user.id); }

  @Get(':hotelId/rate-seasons')
  @RequireFeature('rateSeasons')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  rateSeasons(@Param('hotelId') hotelId: string, @CurrentUser() user: any) { return this.service.rateSeasons(hotelId, user.id); }

  @Post(':hotelId/rate-seasons')
  @RequireFeature('rateSeasons')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  createRateSeason(@Param('hotelId') hotelId: string, @Body() body: RateSeasonDto, @CurrentUser() user: any) { return this.service.createRateSeason(hotelId, body, user.id); }

  @Patch('rate-seasons/:id')
  @RequireFeature('rateSeasons')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  updateRateSeason(@Param('id') id: string, @Body() body: Partial<RateSeasonDto>, @CurrentUser() user: any) { return this.service.updateRateSeason(id, body, user.id); }

  @Get(':hotelId/yield-rules')
  @RequireFeature('yieldRules')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  yieldRules(@Param('hotelId') hotelId: string, @CurrentUser() user: any) { return this.service.yieldRules(hotelId, user.id); }

  @Post(':hotelId/yield-rules')
  @RequireFeature('yieldRules')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  createYieldRule(@Param('hotelId') hotelId: string, @Body() body: YieldRuleDto, @CurrentUser() user: any) { return this.service.createYieldRule(hotelId, body, user.id); }

  @Patch('yield-rules/:id')
  @RequireFeature('yieldRules')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  updateYieldRule(@Param('id') id: string, @Body() body: Partial<YieldRuleDto>, @CurrentUser() user: any) { return this.service.updateYieldRule(id, body, user.id); }

  @Get(':slug')
  @UseGuards(OptionalJwtAuthGuard, ActiveAgentGuard)
  detail(@Param('slug') slug: string) { return this.service.detail(slug); }

  @Get(':hotelId/reviews')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  listReviews(@Param('hotelId') hotelId: string) { return this.service.listReviews(hotelId); }

  @Post(':hotelId/reviews')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  createReview(@Param('hotelId') hotelId: string, @Body() body: HotelReviewDto) { return this.service.createReview(hotelId, body); }

  @Patch('reviews/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  updateReview(@Param('id') id: string, @Body() body: HotelReviewDto) { return this.service.updateReview(id, body); }

  @Delete('reviews/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  deleteReview(@Param('id') id: string) { return this.service.deleteReview(id); }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN')
  create(@Body() body: HotelContentDto) { return this.service.create(body); }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  update(@Param('id') id: string, @Body() body: HotelUpdateDto) { return this.service.update(id, body); }

  @Get(':hotelId/policy')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  policy(@Param('hotelId') hotelId: string) { return this.service.policy(hotelId); }

  @Put(':hotelId/policy')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  savePolicy(@Param('hotelId') hotelId: string, @Body() body: HotelPolicyDto) { return this.service.savePolicy(hotelId, body); }

  @Get(':hotelId/contacts')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  contacts(@Param('hotelId') hotelId: string) { return this.service.contacts(hotelId); }

  @Post(':hotelId/contacts')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  addContact(@Param('hotelId') hotelId: string, @Body() body: HotelContactDto) { return this.service.addContact(hotelId, body); }

  @Patch('contacts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  updateContact(@Param('id') id: string, @Body() body: Partial<HotelContactDto>) { return this.service.updateContact(id, body); }

  @Delete('contacts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  deleteContact(@Param('id') id: string) { return this.service.deleteContact(id); }

  @Get(':hotelId/documents')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  documents(@Param('hotelId') hotelId: string) { return this.service.documents(hotelId); }

  @Post(':hotelId/documents')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  addDocument(@Param('hotelId') hotelId: string, @Body() body: HotelDocumentDto) { return this.service.addDocument(hotelId, body); }

  @Patch('documents/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  updateDocument(@Param('id') id: string, @Body() body: HotelDocumentUpdateDto) { return this.service.updateDocument(id, body); }

  @Delete('documents/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  deleteDocument(@Param('id') id: string) { return this.service.deleteDocument(id); }

  @Get(':hotelId/location')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  location(@Param('hotelId') hotelId: string) { return this.service.location(hotelId); }

  @Put(':hotelId/location')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  saveLocation(@Param('hotelId') hotelId: string, @Body() body: HotelLocationProfileDto) { return this.service.saveLocation(hotelId, body); }

  @Post(':hotelId/location/attractions')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  addLocationAttraction(@Param('hotelId') hotelId: string, @Body() body: HotelLocationAttractionDto) { return this.service.addLocationAttraction(hotelId, body); }

  @Patch('location/attractions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  updateLocationAttraction(@Param('id') id: string, @Body() body: Partial<HotelLocationAttractionDto>) { return this.service.updateLocationAttraction(id, body); }

  @Delete('location/attractions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  deleteLocationAttraction(@Param('id') id: string) { return this.service.deleteLocationAttraction(id); }

  @Post(':hotelId/location/transports')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  addLocationTransport(@Param('hotelId') hotelId: string, @Body() body: HotelLocationTransportDto) { return this.service.addLocationTransport(hotelId, body); }

  @Patch('location/transports/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  updateLocationTransport(@Param('id') id: string, @Body() body: Partial<HotelLocationTransportDto>) { return this.service.updateLocationTransport(id, body); }

  @Delete('location/transports/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  deleteLocationTransport(@Param('id') id: string) { return this.service.deleteLocationTransport(id); }

  @Get(':hotelId/catalog')
  @RequireFeature('roomsInventory')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION')
  catalog(@Param('hotelId') hotelId: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string) { return this.service.catalog(hotelId, startDate, endDate); }

  @Get(':hotelId/pricebook.xlsx')
  @RequireFeature('rates')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="rainwood-pricebook.xlsx"')
  async pricebook(@Param('hotelId') hotelId: string) { return new StreamableFile(await this.service.pricebookExport(hotelId)); }

  @Get(':hotelId/rate-plan-masters/:masterId/rates/import-template.xlsx')
  @RequireFeature('rateImport')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="rainwood-rate-plan-rate-template.xlsx"')
  async ratePlanRateTemplate(@Param('hotelId') hotelId: string, @Param('masterId') masterId: string) { return new StreamableFile(await this.service.baseRateTemplate(hotelId, masterId)); }

  @Post(':hotelId/rate-plan-masters/:masterId/rates/import')
  @RequireFeature('rateImport')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  importRatePlanRates(@Param('hotelId') hotelId: string, @Param('masterId') masterId: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) { return this.service.importBaseRates(hotelId, masterId, file, user.id); }

  @Get(':hotelId/rates/import-template.xlsx')
  @RequireFeature('rates')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="rainwood-rate-master-import.xlsx"')
  async hotelRateImportTemplate(@Param('hotelId') hotelId: string, @Query('scope') scope?: string, @Query('from') from?: string, @Query('to') to?: string) { return new StreamableFile(await this.rateImport.template(hotelId, scope, from, to)); }

  @Post(':hotelId/rates/import')
  @RequireFeature('rates')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  importHotelRates(@Param('hotelId') hotelId: string, @Query('scope') scope: string | undefined, @Query('from') from: string | undefined, @Query('to') to: string | undefined, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) { return this.rateImport.importRates(hotelId, scope, from, to, file, user.id); }

  @Post(':hotelId/amenities')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  addAmenity(@Param('hotelId') hotelId: string, @Body() body: AmenityDto) { return this.service.addAmenity(hotelId, body); }

  @Delete(':hotelId/amenities/:amenityId')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  deleteAmenity(@Param('hotelId') hotelId: string, @Param('amenityId') amenityId: string) { return this.service.deleteAmenity(hotelId, amenityId); }

  @Post(':hotelId/images')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  addImage(@Param('hotelId') hotelId: string, @Body() body: HotelImageDto) { return this.service.addImage(hotelId, body); }

  @Patch(':hotelId/images/:imageId')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  updateImage(@Param('hotelId') hotelId: string, @Param('imageId') imageId: string, @Body() body: HotelImageUpdateDto) { return this.service.updateImage(hotelId, imageId, body); }

  @Put(':hotelId/images/order')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  reorderImages(@Param('hotelId') hotelId: string, @Body() body: HotelImageOrderDto) { return this.service.reorderImages(hotelId, body); }

  @Delete(':hotelId/images/:imageId')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  deleteImage(@Param('hotelId') hotelId: string, @Param('imageId') imageId: string) { return this.service.deleteImage(hotelId, imageId); }

  @Post(':hotelId/videos')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  addVideo(@Param('hotelId') hotelId: string, @Body() body: HotelVideoDto) { return this.service.addVideo(hotelId, body); }

  @Delete(':hotelId/videos/:videoId')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  deleteVideo(@Param('hotelId') hotelId: string, @Param('videoId') videoId: string) { return this.service.deleteVideo(hotelId, videoId); }

  @Post(':hotelId/rooms')
  @RequireFeature('roomsInventory')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  createRoom(@Param('hotelId') hotelId: string, @Body() body: RoomTypeDto) { return this.service.createRoom(hotelId, body); }

  @Patch('rooms/:id')
  @RequireFeature('roomsInventory')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  updateRoom(@Param('id') id: string, @Body() body: Partial<RoomTypeDto>) { return this.service.updateRoom(id, body); }

  @Post('rooms/:roomId/images')
  @RequireFeature('roomsInventory')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  addRoomImage(@Param('roomId') roomId: string, @Body() body: HotelImageDto) { return this.service.addRoomImage(roomId, body); }

  @Delete('rooms/:roomId/images/:imageId')
  @RequireFeature('roomsInventory')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  deleteRoomImage(@Param('roomId') roomId: string, @Param('imageId') imageId: string) { return this.service.deleteRoomImage(roomId, imageId); }

  @Post('rooms/:roomId/rate-plans')
  @RequireFeature('ratePlans')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  createRatePlan(@Param('roomId') roomId: string, @Body() body: RatePlanDto) { return this.service.createRatePlan(roomId, body); }

  @Post('rate-plans/:id/copy')
  @RequireFeature('ratePlans')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  copyRatePlan(@Param('id') id: string, @Body() body: CopyRatePlanDto) { return this.service.copyRatePlan(id, body); }

  @Patch('rate-plans/:id')
  @RequireFeature('ratePlans')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  updateRatePlan(@Param('id') id: string, @Body() body: Partial<RatePlanDto>) { return this.service.updateRatePlan(id, body); }

  @Delete('rate-plans/:id')
  @RequireFeature('ratePlans')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  async deleteRatePlan(@Param('id') id: string) {
    try { return await this.service.deleteRatePlan(id); } catch (error) { if (error instanceof ConflictException) throw error; throw error; }
  }

  @Post('rooms/:roomId/inventory')
  @RequireFeature('roomsInventory')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  saveInventory(@Param('roomId') roomId: string, @Body() body: InventoryBatchDto) { return this.service.saveInventory(roomId, body); }

  @Post('rate-plans/:ratePlanId/rates')
  @RequireFeature('rates')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  saveRates(@Param('ratePlanId') ratePlanId: string, @Body() body: RateBatchDto) { return this.service.saveRates(ratePlanId, body); }
}
