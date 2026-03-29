// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // upsert the single constituency
  const sabatia = await prisma.constituency.upsert({
    where: { id: 'constituency' },
    create: {
      id: 'constituency',
      name: 'Sabatia Constituency',
      slug: 'sabatia-constituency',
      county: 'Vihiga County',
      population: 131628,
    },
    update: {},
  });

  const wards = [
    { name: 'Sabatia West', slug: 'sabatia-west', rank: 1 },
    { name: 'North Maragoli', slug: 'north-maragoli', rank: 2 },
    { name: 'Busali', slug: 'busali', rank: 3 },
    { name: 'Izava Lyaduywa', slug: 'izava-lyaduywa', rank: 4 },
    { name: 'Chavakali', slug: 'chavakali', rank: 5 },
    { name: 'Wodanga', slug: 'wodanga', rank: 6 },
  ];

  // idempotent: upsert wards
  for (const w of wards) {
    await prisma.ward.upsert({
      where: {
        constituencyId_slug: { constituencyId: sabatia.id, slug: w.slug },
      },
      create: { ...w, constituencyId: sabatia.id },
      update: { name: w.name, rank: w.rank },
    });
  }

  // (optional) a couple of example stations so UI renders
  const chavakali = await prisma.ward.findFirstOrThrow({
    where: { slug: 'chavakali' },
  });
  await prisma.pollingStation.upsert({
    where: { wardId_code: { wardId: chavakali.id, code: 'SBT-CHA-001' } },
    create: {
      wardId: chavakali.id,
      code: 'SBT-CHA-001',
      name: 'Chavakali Primary School',
      address: 'Chavakali',
      streams: 2,
      registeredVoters: 0,
      rank: 1,
    },
    update: {},
  });

  console.log('Seeded constituency, wards, and sample station.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
