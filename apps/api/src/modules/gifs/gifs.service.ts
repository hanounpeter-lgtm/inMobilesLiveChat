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

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyResult {
  id: string;
  images: Record<string, GiphyImage>;
}

/**
 * Server-side GIF search proxy — keys stay on the server and clients get a
 * normalized shape regardless of provider. GIPHY is the primary provider
 * (free self-serve keys at developers.giphy.com); Tenor is supported for
 * projects that still have access.
 */
@Injectable()
export class GifsService {
  private readonly giphyKey?: string;
  private readonly tenorKey?: string;

  constructor(config: ConfigService) {
    this.giphyKey = config.get<string>('GIPHY_API_KEY') || undefined;
    this.tenorKey = config.get<string>('TENOR_API_KEY') || undefined;
  }

  get isConfigured() {
    return !!(this.giphyKey || this.tenorKey);
  }

  async search(query: string, limit = 24): Promise<GifDto[]> {
    if (this.giphyKey) return this.searchGiphy(query, limit);
    if (this.tenorKey) return this.searchTenor(query, limit);
    throw new ServiceUnavailableException(
      'GIF search is not configured. Get a free key at https://developers.giphy.com and set GIPHY_API_KEY in .env',
    );
  }

  private async searchGiphy(query: string, limit: number): Promise<GifDto[]> {
    const base = query.trim()
      ? `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(query)}&`
      : 'https://api.giphy.com/v1/gifs/trending?';
    const url = `${base}api_key=${this.giphyKey}&limit=${limit}&rating=pg-13`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new ServiceUnavailableException(
        res.status === 401 || res.status === 403
          ? 'GIPHY rejected the key — double-check GIPHY_API_KEY in .env'
          : `GIF provider error (${res.status})`,
      );
    }
    const data = (await res.json()) as { data: GiphyResult[] };
    return data.data
      .filter((r) => r.images.fixed_height && r.images.fixed_width_small)
      .map((r) => ({
        id: r.id,
        url: r.images.fixed_height.url,
        preview: r.images.fixed_width_small.url,
        width: Number(r.images.fixed_width_small.width),
        height: Number(r.images.fixed_width_small.height),
      }));
  }

  private async searchTenor(query: string, limit: number): Promise<GifDto[]> {
    const base = query.trim()
      ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}`
      : 'https://tenor.googleapis.com/v2/featured?';
    const url = `${base}&key=${this.tenorKey}&limit=${limit}&media_filter=gif,tinygif&contentfilter=medium`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new ServiceUnavailableException(
        res.status === 403
          ? 'Tenor rejected the key (403) — Tenor is closed to new projects; use a GIPHY key instead (developers.giphy.com)'
          : `GIF provider error (${res.status})`,
      );
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
