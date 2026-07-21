import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CreateTemplateRequest, MessageTemplateDto } from '@inmobiles/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

const BUILTIN: { id: string; title: string; body: string }[] = [
  { id: 'builtin-meeting', title: 'Meeting reminder', body: 'Reminder: [meeting] starts at [time] in [place/link]. Please be on time.' },
  { id: 'builtin-urgent', title: 'Urgent announcement', body: '🚨 URGENT: [what is happening]. Action needed: [action] by [deadline].' },
  { id: 'builtin-maintenance', title: 'Maintenance notice', body: 'Scheduled maintenance on [system] from [start] to [end]. Expect [impact].' },
  { id: 'builtin-welcome', title: 'Welcome', body: 'Welcome to the team, [name]! 🎉 Reach out to [contact] if you need anything.' },
  { id: 'builtin-closure', title: 'Office closure', body: 'The office will be closed on [date] for [reason]. We reopen on [date].' },
  { id: 'builtin-deadline', title: 'Deadline reminder', body: 'Reminder: [deliverable] is due on [date]. Current status: [status].' },
  { id: 'builtin-document', title: 'Document shared', body: 'I\'ve shared [document]. Please review by [date] and add your comments.' },
];

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private async workspaceId(userId: string): Promise<string> {
    const m = await this.prisma.workspaceMember.findFirstOrThrow({ where: { userId } });
    return m.workspaceId;
  }

  private async requireAdmin(userId: string) {
    const m = await this.prisma.workspaceMember.findFirst({ where: { userId } });
    if (!m || (m.role !== 'owner' && m.role !== 'admin')) {
      throw new ForbiddenException('Only admins can manage templates');
    }
    return m.workspaceId;
  }

  async list(userId: string): Promise<MessageTemplateDto[]> {
    const wsId = await this.workspaceId(userId);
    const custom = await this.prisma.messageTemplate.findMany({
      where: { workspaceId: wsId },
      orderBy: { createdAt: 'asc' },
    });
    return [
      ...BUILTIN.map((t) => ({ ...t, builtin: true })),
      ...custom.map((t) => ({ id: t.id, title: t.title, body: t.body, builtin: false })),
    ];
  }

  async create(userId: string, dto: CreateTemplateRequest): Promise<MessageTemplateDto> {
    const wsId = await this.requireAdmin(userId);
    const t = await this.prisma.messageTemplate.create({
      data: { workspaceId: wsId, title: dto.title, body: dto.body, createdById: userId },
    });
    return { id: t.id, title: t.title, body: t.body, builtin: false };
  }

  async remove(userId: string, id: string): Promise<void> {
    const wsId = await this.requireAdmin(userId);
    await this.prisma.messageTemplate.deleteMany({ where: { id, workspaceId: wsId } });
  }
}
