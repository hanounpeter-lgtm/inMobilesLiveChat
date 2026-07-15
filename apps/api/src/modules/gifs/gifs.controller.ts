import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GifsService } from './gifs.service';

@Controller('gifs')
@UseGuards(JwtAuthGuard)
export class GifsController {
  constructor(private readonly gifs: GifsService) {}

  @Get('status')
  status() {
    return { configured: this.gifs.isConfigured };
  }

  @Get('search')
  async search(@Query('q') q?: string) {
    return { gifs: await this.gifs.search(q ?? '') };
  }
}
