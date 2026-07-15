import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../modules/auth/auth.module';
import { ChatGateway } from './chat.gateway';
import { RealtimeService } from './realtime.service';

@Global()
@Module({
  imports: [AuthModule],
  providers: [ChatGateway, RealtimeService],
  exports: [RealtimeService],
})
export class GatewayModule {}
