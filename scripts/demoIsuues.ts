// prisma/seed.ts

import { PrismaClient, PostKind, PublishState } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  // --- Categories (we'll use these to group content on the public site)
  const issuesCat = await prisma.category.upsert({
    where: { slug: 'issues' },
    update: {},
    create: { name: 'Issues', slug: 'issues' },
  });

  const endorsementsCat = await prisma.category.upsert({
    where: { slug: 'endorsements' },
    update: {},
    create: { name: 'Endorsements', slug: 'endorsements' },
  });

  // --- Tags (optional, for filtering / SEO niceties)
  const infraTag = await prisma.tag.upsert({
    where: { slug: 'infrastructure' },
    update: {},
    create: { name: 'Infrastructure', slug: 'infrastructure' },
  });

  const educationTag = await prisma.tag.upsert({
    where: { slug: 'education' },
    update: {},
    create: { name: 'Education', slug: 'education' },
  });

  const healthTag = await prisma.tag.upsert({
    where: { slug: 'health' },
    update: {},
    create: { name: 'Health', slug: 'health' },
  });

  const communityTag = await prisma.tag.upsert({
    where: { slug: 'community' },
    update: {},
    create: { name: 'Community', slug: 'community' },
  });

  // ======= ISSUES =======
  const issues: Array<Parameters<typeof prisma.post.create>[0]['data']> = [
    {
      kind: PostKind.BLOG,
      title: 'Roads & Infrastructure',
      slug: 'roads-and-infrastructure',
      summary:
        'Our plan to upgrade rural access roads, footbridges, and drainage for safer travel and market access.',
      bodyRich: {
        html: `<p>We will prioritize feeder roads, introduce transparent maintenance schedules, and leverage labor-based works to create jobs. Key corridors to be upgraded in phases with clear milestones.</p>`,
      },
      state: PublishState.PUBLISHED,
      isFeatured: true,
      rank: 1,
      postCategories: { create: { categoryId: issuesCat.id } },
      postTags: { create: [{ tagId: infraTag.id }] },
      seoTitle: 'Issues: Roads & Infrastructure',
      seoDescription:
        'Our constituency plan for roads, bridges, and drainage — safer travel and improved market access.',
    },
    {
      kind: PostKind.BLOG,
      title: 'Education & Bursaries',
      slug: 'education-and-bursaries',
      summary:
        'Fair, transparent bursaries; school infrastructure improvements; and support for teachers and parents.',
      bodyRich: {
        html: `<p>We will publish bursary criteria and beneficiary lists, invest in classrooms, labs and sanitation, and encourage school-community compacts for accountability.</p>`,
      },
      state: PublishState.PUBLISHED,
      isFeatured: false,
      rank: 2,
      postCategories: { create: { categoryId: issuesCat.id } },
      postTags: { create: [{ tagId: educationTag.id }] },
      seoTitle: 'Issues: Education & Bursaries',
      seoDescription:
        'Transparent bursaries and better school infrastructure to elevate learning outcomes.',
    },
    {
      kind: PostKind.BLOG,
      title: 'Primary Healthcare Access',
      slug: 'primary-healthcare-access',
      summary:
        'Community health, last-mile clinics, and essential supplies — because health is the first wealth.',
      bodyRich: {
        html: `<p>We’ll outfit dispensaries, stock essential drugs, and support community health volunteers with kits and basic stipends, plus maternal health transport support.</p>`,
      },
      state: PublishState.PUBLISHED,
      isFeatured: false,
      rank: 3,
      postCategories: { create: { categoryId: issuesCat.id } },
      postTags: { create: [{ tagId: healthTag.id }] },
      seoTitle: 'Issues: Primary Healthcare',
      seoDescription: 'Expand primary healthcare through equipped dispensaries and supported CHVs.',
    },
  ];

  for (const data of issues) {
    await prisma.post.upsert({
      where: { kind_slug: { kind: data.kind, slug: data.slug! } },
      update: data,
      create: data,
    });
  }

  // ======= ENDORSEMENTS =======
  const endorsements: Array<Parameters<typeof prisma.post.create>[0]['data']> = [
    {
      kind: PostKind.NEWS,
      title: 'Kenya Youth Council – Sabatia Chapter Endorsement',
      slug: 'kenya-youth-council-sabatia-endorsement',
      summary:
        'The Sabatia Chapter of the Kenya Youth Council endorses our development agenda focusing on jobs and digital skills.',
      bodyRich: {
        html: `<p>The Youth Council recognizes our apprenticeship and internship pipeline plans, and our commitment to expanding community internet points.</p>`,
      },
      state: PublishState.PUBLISHED,
      isFeatured: true,
      rank: 1,
      postCategories: { create: { categoryId: endorsementsCat.id } },
      postTags: { create: [{ tagId: communityTag.id }] },
      seoTitle: 'Endorsement: Kenya Youth Council – Sabatia',
      seoDescription:
        'Endorsement highlighting jobs, digital skills, and expanded access to opportunity.',
    },
    {
      kind: PostKind.NEWS,
      title: 'Sabatia Health Workers Association Endorsement',
      slug: 'sabatia-health-workers-endorsement',
      summary:
        'Health workers back our plan for essential drugs, last-mile clinics, and fair staffing.',
      bodyRich: {
        html: `<p>We’re grateful for this support and will keep engaging frontline workers to co-design monthly supply audits and duty rosters.</p>`,
      },
      state: PublishState.PUBLISHED,
      isFeatured: false,
      rank: 2,
      postCategories: { create: { categoryId: endorsementsCat.id } },
      postTags: { create: [{ tagId: healthTag.id }] },
      seoTitle: 'Endorsement: Sabatia Health Workers Association',
      seoDescription: 'Frontline support for our primary healthcare agenda and supplies tracking.',
    },
  ];

  for (const data of endorsements) {
    await prisma.post.upsert({
      where: { kind_slug: { kind: data.kind, slug: data.slug! } },
      update: data,
      create: data,
    });
  }

  console.log('Seed complete ✅');
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
