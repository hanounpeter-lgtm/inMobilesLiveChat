import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: nodemailer.Transporter;
  readonly webOrigin: string;

  constructor(config: ConfigService) {
    this.webOrigin = config.get<string>('WEB_ORIGIN', 'http://localhost:5173');
    this.transport = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST', 'localhost'),
      port: Number(config.get('SMTP_PORT', 1025)),
      secure: false,
    });
  }

  /** Best-effort — an unreachable SMTP server must not break invite creation. */
  async sendWorkspaceInvite(to: string, invitedBy: string, workspaceName: string, token: string) {
    const link = `${this.webOrigin}/signup/${token}`;
    try {
      await this.transport.sendMail({
        from: '"inChat" <chat@inmobiles.local>',
        to,
        subject: `${invitedBy} invited you to ${workspaceName} on inChat`,
        text: `${invitedBy} invited you to join the ${workspaceName} workspace.\n\nCreate your account: ${link}\n\nThis invite expires in 7 days.`,
        html: `<p><strong>${invitedBy}</strong> invited you to join the <strong>${workspaceName}</strong> workspace.</p><p><a href="${link}">Create your account</a></p><p style="color:#888">This invite expires in 7 days.</p>`,
      });
    } catch (err) {
      this.logger.warn(`Could not send invite email to ${to}: ${(err as Error).message}`);
    }
  }
}
