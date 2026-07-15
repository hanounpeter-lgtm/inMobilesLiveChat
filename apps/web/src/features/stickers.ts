// Default animated sticker pack — Google Noto animated emoji (OFL licensed),
// self-hosted from /public/stickers so they work offline.
// A sticker message stores exactly `[sticker:<code>]` as its content.

export interface Sticker {
  code: string;
  label: string;
}

export const STICKER_PACK: Sticker[] = [
  { code: '1f600', label: 'Grinning' },
  { code: '1f602', label: 'Tears of joy' },
  { code: '1f923', label: 'ROFL' },
  { code: '1f60d', label: 'Heart eyes' },
  { code: '1f618', label: 'Blowing a kiss' },
  { code: '1f61c', label: 'Winking tongue' },
  { code: '1f914', label: 'Thinking' },
  { code: '1f644', label: 'Eye roll' },
  { code: '1f62d', label: 'Sobbing' },
  { code: '1f622', label: 'Crying' },
  { code: '1f605', label: 'Sweat smile' },
  { code: '1f621', label: 'Angry' },
  { code: '1f973', label: 'Partying' },
  { code: '1f97a', label: 'Pleading' },
  { code: '1f60e', label: 'Cool' },
  { code: '1f631', label: 'Screaming' },
  { code: '1f971', label: 'Yawning' },
  { code: '1f92f', label: 'Mind blown' },
  { code: '1f929', label: 'Star struck' },
  { code: '1f917', label: 'Hug' },
  { code: '1f44d', label: 'Thumbs up' },
  { code: '1f44f', label: 'Clap' },
  { code: '1f64f', label: 'Thank you' },
  { code: '1f4aa', label: 'Strong' },
  { code: '1f389', label: 'Party popper' },
  { code: '2764_fe0f', label: 'Heart' },
  { code: '1f525', label: 'Fire' },
  { code: '1f680', label: 'Rocket' },
];

const STICKER_RE = /^\[sticker:([0-9a-f_]+)\]$/;
const KNOWN_CODES = new Set(STICKER_PACK.map((s) => s.code));

export const stickerContent = (code: string) => `[sticker:${code}]`;

export function parseSticker(content: string): Sticker | null {
  const match = STICKER_RE.exec(content.trim());
  if (!match || !KNOWN_CODES.has(match[1])) return null;
  return STICKER_PACK.find((s) => s.code === match[1]) ?? null;
}

export const stickerUrl = (code: string) => `/stickers/${code}.gif`;
