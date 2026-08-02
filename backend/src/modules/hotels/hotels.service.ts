import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { HotelContentDto } from './hotels.dto';

@Injectable()
export class HotelsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.hotel.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      include: {
        images: { where: { published: true }, orderBy: { sortOrder: 'asc' } },
        amenities: { include: { amenity: true } },
        rooms: { where: { active: true }, include: { images: { where: { published: true }, orderBy: { sortOrder: 'asc' } }, ratePlans: { where: { active: true } } } },
      },
    });
  }

  async detail(slug: string) {
    const hotel = await this.prisma.hotel.findFirst({
      where: { slug, active: true },
      include: {
        images: { where: { published: true }, orderBy: { sortOrder: 'asc' } },
        amenities: { include: { amenity: true } },
        taxes: { where: { active: true } },
        charges: { where: { active: true } },
        rooms: { where: { active: true }, include: { images: { where: { published: true }, orderBy: { sortOrder: 'asc' } }, ratePlans: { where: { active: true } } } },
      },
    });
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }

  create(body: HotelContentDto) {
    return this.prisma.hotel.create({ data: { ...body, slug: body.slug.toLowerCase().trim() } });
  }

  async update(id: string, body: Partial<HotelContentDto>) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id } });
    if (!hotel) throw new NotFoundException('Hotel not found');
    return this.prisma.hotel.update({ where: { id }, data: { ...body, slug: body.slug?.toLowerCase().trim() } });
  }
}
