import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailService } from './mail.service';
import { WorkspaceInvitesService } from './workspace-invites.service';
import { SignupController, WorkspaceInvitesController } from './workspaces.controller';

@Module({
  imports: [AuthModule],
  controllers: [WorkspaceInvitesController, SignupController],
  providers: [WorkspaceInvitesService, MailService],
})
export class WorkspacesModule {}
