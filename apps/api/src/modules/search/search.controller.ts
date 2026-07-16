import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SearchService } from './search.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  async run(
    @CurrentUserId() userId: string,
    @Query('q') q?: string,
    @Query('channelId') channelId?: string,
  ) {
    if (channelId && !UUID_RE.test(channelId)) {
      throw new BadRequestException('Invalid channelId');
    }
    if ((q ?? '').length > 200) throw new BadRequestException('Query too long');
    return { results: await this.search.search(userId, q ?? '', channelId) };
  }
}
