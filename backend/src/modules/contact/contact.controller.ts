import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { ContactService } from './contact.service';
import { CreateContactRequestDto } from './contact.dto';

@Controller('contact-requests')
export class ContactController {
  constructor(private service: ContactService) {}

  @Post()
  create(@Body() body: CreateContactRequestDto) { return this.service.create(body); }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'RESERVATION')
  list() { return this.service.list(); }
}
