import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GifDto } from '@inmobiles/shared-types';

interface TenorMediaFormat {
  url: string;
  dims: [number, number];
}

interface TenorResult {
  id: string;
  media_formats: Record<string, TenorMediaFormat>;
}

/**
 * Server-side proxy to the Tenor v2 API — the key stays on the server and
 * clients get a normalized shape regardless of provider.
 */
@Injectable()
export class GifsService {
  private readonly apiKey?: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('TENOR_API_KEY') || undefined;
  }

  get isConfigured() {
    return !!this.apiKey;
  }

  async search(query: string, limit = 24): Promise<GifDto[]> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'GIF search is not configured. Get a free key at https://developers.google.com/tenor and set TENOR_API_KEY in .env',
      );
    }
    const base = query.trim()
      ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}`
      : 'https://tenor.googleapis.com/v2/featured?';
    const url = `${base}&key=${this.apiKey}&limit=${limit}&media_filter=gif,tinygif&contentfilter=medium`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new ServiceUnavailableException(`GIF provider error (${res.status})`);
    }
    const data = (await res.json()) as { results: TenorResult[] };
    return data.results
      .filter((r) => r.media_formats.gif && r.media_formats.tinygif)
      .map((r) => ({
        id: r.id,
        url: r.media_formats.gif.url,
        preview: r.media_formats.tinygif.url,
        width: r.media_formats.tinygif.dims[0],
        height: r.media_formats.tinygif.dims[1],
      }));
  }
}
