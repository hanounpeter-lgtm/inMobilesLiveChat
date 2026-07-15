/**
 * Downloads the default animated sticker pack (Google Noto animated emoji)
 * into apps/web/public/stickers. Run once after cloning:  pnpm stickers
 *
 * Keep the code list in sync with apps/web/src/features/stickers.ts.
 */
const fs = require('fs');
const path = require('path');

const CODES = [
  '1f600', '1f602', '1f923', '1f60d', '1f618', '1f61c', '1f914', '1f644',
  '1f62d', '1f622', '1f605', '1f621', '1f973', '1f97a', '1f60e', '1f631',
  '1f971', '1f92f', '1f929', '1f917', '1f44d', '1f44f', '1f64f', '1f4aa',
  '1f389', '2764_fe0f', '1f525', '1f680',
];

const dir = path.join(__dirname, '..', 'apps', 'web', 'public', 'stickers');
fs.mkdirSync(dir, { recursive: true });

(async () => {
  let downloaded = 0;
  let skipped = 0;
  for (const code of CODES) {
    const file = path.join(dir, `${code}.gif`);
    if (fs.existsSync(file)) {
      skipped++;
      continue;
    }
    const url = `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.gif`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`FAILED ${code}: HTTP ${res.status}`);
      continue;
    }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    downloaded++;
  }
  console.log(`Stickers ready: ${downloaded} downloaded, ${skipped} already present.`);
})();
