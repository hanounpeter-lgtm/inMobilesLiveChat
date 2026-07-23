/**
 * Create (or update the password of) a user and add them to the workspace
 * and all public channels.
 *
 * Usage, from apps/api:
 *   pnpm user:create <email> "<Display Name>" <password> [owner|admin|member]
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const [email, displayName, password, roleArg] = process.argv.slice(2);
  if (!email || !displayName || !password) {
    console.error('Usage: pnpm user:create <email> "<Display Name>" <password> [owner|admin|member]');
    process.exit(1);
  }
  const allowedDomain = (process.env.ALLOWED_EMAIL_DOMAIN ?? 'inmobiles.net').trim().toLowerCase();
  if (allowedDomain && !email.toLowerCase().endsWith(`@${allowedDomain}`)) {
    console.error(`Email must end with @${allowedDomain}`);
    process.exit(1);
  }
  const role = (roleArg ?? 'member') as 'owner' | 'admin' | 'member';
  if (!['owner', 'admin', 'member'].includes(role)) {
    console.error(`Invalid role "${role}" — use owner, admin, or member`);
    process.exit(1);
  }

  const workspace = await prisma.workspace.findFirst();
  if (!workspace) {
    console.error('No workspace found — run `pnpm db:seed` first.');
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { displayName, passwordHash, deletedAt: null },
    create: { email: email.toLowerCase(), displayName, passwordHash },
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    update: { role },
    create: { workspaceId: workspace.id, userId: user.id, role },
  });

  const publicChannels = await prisma.channel.findMany({
    where: { workspaceId: workspace.id, type: 'public', isArchived: false },
  });
  for (const channel of publicChannels) {
    await prisma.channelMember.upsert({
      where: { channelId_userId: { channelId: channel.id, userId: user.id } },
      update: {},
      create: { channelId: channel.id, userId: user.id },
    });
  }

  console.log(`✔ ${user.email} (${role}) — member of ${publicChannels.length} public channels`);
  console.log('  They can sign in at http://localhost:5173');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
