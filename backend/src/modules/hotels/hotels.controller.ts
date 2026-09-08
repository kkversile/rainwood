import { Body, ConflictException, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { HotelsService } from './hotels.service';
import { AmenityDto, HotelContactDto, HotelContentDto, HotelDocumentDto, HotelImageDto, HotelImageOrderDto, HotelImageUpdateDto, HotelPolicyDto, HotelReviewDto, HotelUpdateDto, HotelVideoDto, InventoryBatchDto, RateBatchDto, RatePlanDto, RoomTypeDto } from './hotels.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';

@Controller('hotels')
export class HotelsController {
  constructor(private readonly service: HotelsService) {}

  @Get()
  list() { return this.service.list(); }

  @Get('rate-plans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  ratePlans() { return this.service.ratePlans(); }

  @Get(':slug')
  detail(@Param('slug') slug: string) { return this.service.detail(slug); }

  @Get(':hotelId/reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  listReviews(@Param('hotelId') hotelId: string) { return this.service.listReviews(hotelId); }

  @Post(':hotelId/reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  createReview(@Param('hotelId') hotelId: string, @Body() body: HotelReviewDto) { return this.service.createReview(hotelId, body); }

  @Patch('reviews/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateReview(@Param('id') id: string, @Body() body: HotelReviewDto) { return this.service.updateReview(id, body); }

  @Delete('reviews/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  deleteReview(@Param('id') id: string) { return this.service.deleteReview(id); }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Body() body: HotelContentDto) { return this.service.create(body); }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Param('id') id: string, @Body() body: HotelUpdateDto) { return this.service.update(id, body); }

  @Get(':hotelId/policy')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  policy(@Param('hotelId') hotelId: string) { return this.service.policy(hotelId); }

  @Put(':hotelId/policy')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  savePolicy(@Param('hotelId') hotelId: string, @Body() body: HotelPolicyDto) { return this.service.savePolicy(hotelId, body); }

  @Get(':hotelId/contacts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  contacts(@Param('hotelId') hotelId: string) { return this.service.contacts(hotelId); }

  @Post(':hotelId/contacts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  addContact(@Param('hotelId') hotelId: string, @Body() body: HotelContactDto) { return this.service.addContact(hotelId, body); }

  @Patch('contacts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateContact(@Param('id') id: string, @Body() body: Partial<HotelContactDto>) { return this.service.updateContact(id, body); }

  @Delete('contacts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  deleteContact(@Param('id') id: string) { return this.service.deleteContact(id); }

  @Get(':hotelId/documents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  documents(@Param('hotelId') hotelId: string) { return this.service.documents(hotelId); }

  @Post(':hotelId/documents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  addDocument(@Param('hotelId') hotelId: string, @Body() body: HotelDocumentDto) { return this.service.addDocument(hotelId, body); }

  @Delete('documents/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  deleteDocument(@Param('id') id: string) { return this.service.deleteDocument(id); }

  @Get(':hotelId/catalog')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  catalog(@Param('hotelId') hotelId: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string) { return this.service.catalog(hotelId, startDate, endDate); }

  @Get(':hotelId/pricebook.xlsx')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="rainwood-pricebook.xlsx"')
  async pricebook(@Param('hotelId') hotelId: string) { return new StreamableFile(await this.service.pricebookExport(hotelId)); }

  @Post(':hotelId/amenities')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  addAmenity(@Param('hotelId') hotelId: string, @Body() body: AmenityDto) { return this.service.addAmenity(hotelId, body); }

  @Delete(':hotelId/amenities/:amenityId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  deleteAmenity(@Param('hotelId') hotelId: string, @Param('amenityId') amenityId: string) { return this.service.deleteAmenity(hotelId, amenityId); }

  @Post(':hotelId/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  addImage(@Param('hotelId') hotelId: string, @Body() body: HotelImageDto) { return this.service.addImage(hotelId, body); }

  @Patch(':hotelId/images/:imageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateImage(@Param('hotelId') hotelId: string, @Param('imageId') imageId: string, @Body() body: HotelImageUpdateDto) { return this.service.updateImage(hotelId, imageId, body); }

  @Put(':hotelId/images/order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  reorderImages(@Param('hotelId') hotelId: string, @Body() body: HotelImageOrderDto) { return this.service.reorderImages(hotelId, body); }

  @Delete(':hotelId/images/:imageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  deleteImage(@Param('hotelId') hotelId: string, @Param('imageId') imageId: string) { return this.service.deleteImage(hotelId, imageId); }

  @Post(':hotelId/videos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  addVideo(@Param('hotelId') hotelId: string, @Body() body: HotelVideoDto) { return this.service.addVideo(hotelId, body); }

  @Delete(':hotelId/videos/:videoId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  deleteVideo(@Param('hotelId') hotelId: string, @Param('videoId') videoId: string) { return this.service.deleteVideo(hotelId, videoId); }

  @Post(':hotelId/rooms')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  createRoom(@Param('hotelId') hotelId: string, @Body() body: RoomTypeDto) { return this.service.createRoom(hotelId, body); }

  @Patch('rooms/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateRoom(@Param('id') id: string, @Body() body: Partial<RoomTypeDto>) { return this.service.updateRoom(id, body); }

  @Post('rooms/:roomId/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  addRoomImage(@Param('roomId') roomId: string, @Body() body: HotelImageDto) { return this.service.addRoomImage(roomId, body); }

  @Delete('rooms/:roomId/images/:imageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  deleteRoomImage(@Param('roomId') roomId: string, @Param('imageId') imageId: string) { return this.service.deleteRoomImage(roomId, imageId); }

  @Post('rooms/:roomId/rate-plans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  createRatePlan(@Param('roomId') roomId: string, @Body() body: RatePlanDto) { return this.service.createRatePlan(roomId, body); }

  @Patch('rate-plans/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateRatePlan(@Param('id') id: string, @Body() body: Partial<RatePlanDto>) { return this.service.updateRatePlan(id, body); }

  @Delete('rate-plans/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  async deleteRatePlan(@Param('id') id: string) {
    try { return await this.service.deleteRatePlan(id); } catch (error) { if (error instanceof ConflictException) throw error; throw error; }
  }

  @Post('rooms/:roomId/inventory')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  saveInventory(@Param('roomId') roomId: string, @Body() body: InventoryBatchDto) { return this.service.saveInventory(roomId, body); }

  @Post('rate-plans/:ratePlanId/rates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  saveRates(@Param('ratePlanId') ratePlanId: string, @Body() body: RateBatchDto) { return this.service.saveRates(ratePlanId, body); }
}
