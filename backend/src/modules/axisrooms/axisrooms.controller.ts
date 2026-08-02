import { BadRequestException, Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { AxisRoomsService } from './axisrooms.service';
import { AxisInventoryDto, AxisRatesDto } from './axisrooms.dto';

@Controller('axisrooms')
export class AxisRoomsController {
  constructor(private s: AxisRoomsService) {}

  @Post('inbound/inventory')
  inventory(@Body() body: AxisInventoryDto, @Req() request: any, @Headers('x-axis-signature') signature?: string) {
    if (!this.s.verifyInbound(request.rawBody ?? Buffer.from(JSON.stringify(request.body)), signature)) throw new BadRequestException('Invalid AxisRooms signature');
    return this.s.inbound('inventory', body);
  }

  @Post('inbound/rates')
  rates(@Body() body: AxisRatesDto, @Req() request: any, @Headers('x-axis-signature') signature?: string) {
    if (!this.s.verifyInbound(request.rawBody ?? Buffer.from(JSON.stringify(request.body)), signature)) throw new BadRequestException('Invalid AxisRooms signature');
    return this.s.inbound('rate', body);
  }
}
