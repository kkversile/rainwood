import { PrismaService } from "../src/common/prisma.service";

const action = process.argv[2] ?? "seed";
const prefix = process.argv[3] ?? `RW-GROUP-BROWSER-${Date.now()}`;
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    if (action === "cleanup") {
      const marker = prefix === "__all__" ? "RW-GROUP-BROWSER-" : prefix;
      await prisma.groupReservation.deleteMany({
        where: { groupCode: { startsWith: marker } },
      });
      await prisma.hotel.deleteMany({
        where: {
          code: {
            startsWith:
              prefix === "__all__" ? "RW-GROUP-BROWSER-" : `${prefix}-B`,
          },
        },
      });
      return;
    }
    const hotelA = await prisma.hotel.findFirstOrThrow({
      where: { active: true },
      select: { id: true, name: true },
    });
    const admin = await prisma.user.findFirstOrThrow({
      where: { email: "admin@rainwood.demo", active: true },
      select: { id: true },
    });
    const hotelB = await prisma.hotel.create({
      data: {
        code: `${prefix}-B`,
        name: "RainWood Lakeside Demo",
        slug: `${prefix.toLowerCase()}-b`,
        city: "Alleppey",
        active: true,
      },
    });
    const roomType = await prisma.roomType.create({
      data: {
        hotelId: hotelB.id,
        code: "DEMO",
        name: "Demonstration Room",
        maxAdults: 2,
        maxChildren: 1,
        maxOccupancy: 3,
      },
    });
    const master = await prisma.ratePlanMaster.create({
      data: {
        hotelId: hotelB.id,
        code: "CP",
        name: "Demonstration Breakfast Plan",
        mealPlan: "CP",
        description: "Synthetic browser-test rate plan.",
      },
    });
    await prisma.ratePlan.create({
      data: {
        roomTypeId: roomType.id,
        masterId: master.id,
        code: "CP",
        name: "Demonstration Breakfast Plan",
        mealPlan: "CP",
        description: "Synthetic browser-test rate plan.",
      },
    });
    await prisma.hotelBusinessDay.create({
      data: {
        hotelId: hotelB.id,
        businessDate: date("2026-10-04"),
        status: "OPEN",
      },
    });
    await prisma.groupReservation.create({
      data: {
        hotelId: hotelA.id,
        groupCode: `${prefix}-A`,
        groupName: "Demonstration Group Alpha",
        groupType: "CORPORATE",
        status: "INQUIRY",
        arrivalDate: date("2026-11-05"),
        departureDate: date("2026-11-07"),
        primaryContactName: "Demo Contact",
        primaryContactMobile: "9000011111",
        source: "DIRECT",
        billingInstruction: "INDIVIDUAL",
        createdByUserId: admin.id,
      },
    });
    const groupB = await prisma.groupReservation.create({
      data: {
        hotelId: hotelB.id,
        groupCode: `${prefix}-B-GROUP`,
        groupName: "Second Hotel Demonstration Group",
        groupType: "CORPORATE",
        status: "INQUIRY",
        arrivalDate: date("2026-11-10"),
        departureDate: date("2026-11-12"),
        primaryContactName: "Second Hotel Contact",
        primaryContactMobile: "9000012222",
        source: "DIRECT",
        billingInstruction: "INDIVIDUAL",
        createdByUserId: admin.id,
      },
    });
    process.stdout.write(
      JSON.stringify({
        prefix,
        hotelAName: hotelA.name,
        hotelBName: hotelB.name,
        hotelBId: hotelB.id,
        groupBId: groupB.id,
        groupBName: groupB.groupName,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
