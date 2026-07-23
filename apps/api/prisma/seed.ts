/* Seed: one workspace, ten users, themed channels with realistic history. */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';

const prisma = new PrismaClient();

const PASSWORD = 'inmobiles123';

const USERS = [
  { email: 'admin@inmobiles.net', displayName: 'Dani Bitar', role: 'owner' as const },
  { email: 'sara@inmobiles.net', displayName: 'Sara Khoury', role: 'admin' as const },
  { email: 'omar@inmobiles.net', displayName: 'Omar Haddad', role: 'member' as const },
  { email: 'lina@inmobiles.net', displayName: 'Lina Nassar', role: 'member' as const },
  { email: 'maya@inmobiles.net', displayName: 'Maya Aoun', role: 'member' as const },
  { email: 'karim@inmobiles.net', displayName: 'Karim Saab', role: 'member' as const },
  { email: 'nour@inmobiles.net', displayName: 'Nour Fakhoury', role: 'member' as const },
  { email: 'rami@inmobiles.net', displayName: 'Rami Chidiac', role: 'member' as const },
  { email: 'jad@inmobiles.net', displayName: 'Jad Maalouf', role: 'member' as const },
  { email: 'layla@inmobiles.net', displayName: 'Layla Harb', role: 'member' as const },
];

// [userIndex, content] — index into USERS above.
type Line = [number, string];

const HISTORY: Record<string, Line[]> = {
  general: [
    [0, 'Welcome to the new inMobiles chat platform! :tada:'],
    [1, 'Finally! Goodbye email threads.'],
    [2, 'This is looking clean. Is markdown supported? **bold** _italic_ `code`'],
    [0, 'It is — code blocks too:\n```ts\nconst hello = "inMobiles";\n```'],
    [3, 'Love it. Can we get a #design channel at some point?'],
    [1, 'Try creating one — the + button next to Channels.'],
    [4, 'Morning everyone ☀️ first day on the new chat!'],
    [5, 'Welcome Maya! Coffee machine on 3rd floor is the good one, pro tip.'],
    [4, '[sticker:1f602]'],
    [6, 'Reminder: all-hands on Thursday at 11. Agenda coming to #announcements.'],
    [7, 'Can whoever booked meeting room B for the whole week... not? 😅'],
    [8, 'That was me, sorry — released everything after Tuesday.'],
    [9, 'New lunch spot next to the office is actually great, who wants to try tomorrow?'],
    [2, "Count me in. It can't be worse than Monday's shawarma incident."],
    [9, '[sticker:1f923]'],
  ],
  announcements: [
    [0, '📢 **Welcome to the official announcements channel.** Only admins can post here — replies and reactions are open to everyone.'],
    [1, '📅 **All-hands this Thursday 11:00**, main floor. Topics: Q3 roadmap, the new chat platform (you are soaking in it), and the office move update.'],
    [0, '🚀 We are officially dogfooding this chat platform as our daily driver. Report anything broken in #engineering.'],
  ],
  engineering: [
    [2, 'Deploy pipeline is green again — the flaky test was the timezone one. Again.'],
    [7, 'We should just delete that test and live dangerously.'],
    [2, '`Date` handling: the eternal enemy.'],
    [8, 'PSA: staging DB gets wiped tonight 22:00 for the migration rehearsal.'],
    [5, 'Anyone else seeing 502s from the payments sandbox?'],
    [7, 'Yes — their status page says degraded. Not us for once 🎉'],
    [5, '[sticker:1f64f]'],
    [8, 'Code review round-robin is updated for this sprint, check the wiki.'],
  ],
  design: [
    [3, 'New icon set exploration is up — hexagons or rounded squares, fight it out 🥊'],
    [9, 'Rounded squares. Hexagons are for crypto startups.'],
    [4, 'Strong agree. Also the purple in the new palette is *chefs kiss*.'],
    [3, 'Purple gang wins. Shipping the tokens tomorrow.'],
    [9, '[sticker:1f60d]'],
  ],
  product: [
    [1, 'Q3 roadmap draft is ready — biggest bets: onboarding revamp and the partner API.'],
    [6, 'Do we have sizing from engineering on the partner API yet?'],
    [2, 'Rough cut: 6 weeks with two people, plus a hardening sprint.'],
    [1, 'Booking a scoping session for Monday then.'],
    [6, 'Customer council feedback doc is in the drive — highlights: everyone wants dark mode 😄'],
    [1, 'Well, this chat app has it. Setting the bar.'],
  ],
  random: [
    [9, 'Friday playlist duty is mine this week. Requests open for the next hour 🎵'],
    [7, 'Anything but the lo-fi beats. I am one chill beat away from hibernation.'],
    [4, 'Cat photo thread when?'],
    [9, 'NOW is the correct answer.'],
    [4, '[sticker:1f389]'],
    [5, 'The office plant I was told is "unkillable" is dying. Thoughts and prayers.'],
    [8, 'You watered it with the sparkling water again, didn\'t you.'],
    [5, '...no comment.'],
    [8, '[sticker:1f923]'],
  ],
  support: [
    [6, 'Weekly ticket digest: 42 resolved, 7 open, CSAT 4.7 ⭐'],
    [5, 'The two billing tickets from Friday are with finance now.'],
    [6, 'Big customer (you know the one) asked about SSO again. Adding it to the product wishlist.'],
    [1, 'Noted — it is on the Phase 3 list already.'],
  ],
};

const CHANNELS: {
  name: string;
  topic: string;
  description?: string;
  isDefault?: boolean;
  postingPolicy?: 'everyone' | 'admins_only';
}[] = [
  {
    name: 'general',
    topic: 'Company-wide chatter',
    description: 'The default channel — everyone at inMobiles is here.',
    isDefault: true,
  },
  {
    name: 'announcements',
    topic: 'Official inMobiles announcements',
    description: 'Company news from the leadership team. Admin-post-only.',
    postingPolicy: 'admins_only',
  },
  {
    name: 'engineering',
    topic: 'Build things, break things, fix things',
    description: 'Deploys, incidents, code review, and the occasional flame war about tabs.',
  },
  {
    name: 'design',
    topic: 'Pixels, palettes, and hot takes',
    description: 'Design reviews, brand assets, and figma links.',
  },
  {
    name: 'product',
    topic: 'Roadmap and customer insights',
    description: 'What we build next and why.',
  },
  {
    name: 'random',
    topic: 'Everything that has no channel',
    description: 'Lunch plans, playlists, pets, and general nonsense. Keep it fun.',
  },
  {
    name: 'support',
    topic: 'Customer support sync',
    description: 'Ticket digests, escalations, and CSAT.',
  },
];

async function main() {
  const passwordHash = await argon2.hash(PASSWORD);

  const workspace = await prisma.workspace.upsert({
    where: { slug: 'inmobiles' },
    update: { name: 'inChat' },
    create: { name: 'inChat', slug: 'inmobiles' },
  });

  const users: { id: string }[] = [];
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, displayName: u.displayName, passwordHash },
    });
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      update: { role: u.role },
      create: { workspaceId: workspace.id, userId: user.id, role: u.role },
    });
    users.push(user);
  }

  for (const spec of CHANNELS) {
    const extras = {
      isDefault: spec.isDefault ?? false,
      postingPolicy: spec.postingPolicy ?? ('everyone' as const),
      topic: spec.topic,
      description: spec.description,
    };
    let channel = await prisma.channel.findFirst({
      where: { workspaceId: workspace.id, name: spec.name },
    });
    if (channel) {
      channel = await prisma.channel.update({ where: { id: channel.id }, data: extras });
    } else {
      channel = await prisma.channel.create({
        data: {
          workspaceId: workspace.id,
          type: 'public',
          name: spec.name,
          createdById: users[0].id,
          ...extras,
        },
      });
    }
    // Everyone joins every seeded public channel.
    await prisma.channelMember.createMany({
      data: users.map((u) => ({ channelId: channel!.id, userId: u.id })),
      skipDuplicates: true,
    });

    const lines = HISTORY[spec.name] ?? [];
    const count = await prisma.message.count({ where: { channelId: channel.id } });
    if (count === 0 && lines.length > 0) {
      // Space messages out over the past days so timestamps look lived-in.
      let ts = Date.now() - lines.length * 47 * 60_000;
      for (const [idx, content] of lines) {
        await prisma.message.create({
          data: {
            channelId: channel.id,
            userId: users[idx].id,
            content,
            clientMsgId: randomUUID(),
            createdAt: new Date(ts),
          },
        });
        ts += 47 * 60_000;
      }
      await prisma.channel.update({
        where: { id: channel.id },
        data: { lastMessageAt: new Date(ts - 47 * 60_000) },
      });
    }
  }

  // A 1:1 DM and a group DM so the sidebar looks real.
  const mkDm = async (indices: number[], lines: Line[]) => {
    const ids = indices.map((i) => users[i].id).sort();
    const dmKey = createHash('sha256').update(ids.join(':')).digest('hex');
    const dm = await prisma.channel.upsert({
      where: { dmKey },
      update: {},
      create: {
        workspaceId: workspace.id,
        type: ids.length === 2 ? 'dm' : 'group_dm',
        dmKey,
        createdById: ids[0],
        members: { create: ids.map((userId) => ({ userId })) },
      },
    });
    const count = await prisma.message.count({ where: { channelId: dm.id } });
    if (count === 0 && lines.length > 0) {
      let ts = Date.now() - lines.length * 13 * 60_000;
      for (const [idx, content] of lines) {
        await prisma.message.create({
          data: {
            channelId: dm.id,
            userId: users[idx].id,
            content,
            clientMsgId: randomUUID(),
            createdAt: new Date(ts),
          },
        });
        ts += 13 * 60_000;
      }
      await prisma.channel.update({
        where: { id: dm.id },
        data: { lastMessageAt: new Date(ts - 13 * 60_000) },
      });
    }
  };

  await mkDm(
    [0, 1],
    [
      [0, 'Chat platform launch went smoothly 🚀'],
      [1, 'People are actually using it — #random is already chaos.'],
      [0, 'As intended.'],
    ],
  );
  await mkDm(
    [2, 7, 8],
    [
      [2, 'Migration rehearsal tonight — who is on call?'],
      [7, 'Me until midnight, then Rami.'],
      [8, 'Confirmed. Bringing snacks.'],
    ],
  );

  console.log(`Seeded workspace "inMobiles": ${USERS.length} users, ${CHANNELS.length} channels.`);
  for (const u of USERS) console.log(`  ${u.email} / ${PASSWORD} (${u.role})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
