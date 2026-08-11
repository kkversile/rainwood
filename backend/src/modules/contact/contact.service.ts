import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateContactRequestDto } from './contact.dto';

@Injectable()
export class ContactService {
  constructor(private prisma: PrismaService) {}

  create(body: CreateContactRequestDto) {
    return this.prisma.contactRequest.create({ data: { name: body.name.trim(), email: body.email.trim().toLowerCase(), message: body.message.trim() } });
  }

  list() {
    return this.prisma.contactRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }
}
