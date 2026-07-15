import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private readonly redisUrl: string;
  private readonly webOrigin: string;

  constructor(app: INestApplication, config: ConfigService) {
    super(app);
    this.redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.webOrigin = config.get<string>('WEB_ORIGIN', 'http://localhost:5173');
  }

  async connect() {
    const pubClient = new Redis(this.redisUrl);
    const subClient = pubClient.duplicate();
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.webOrigin, credentials: true },
    });
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
