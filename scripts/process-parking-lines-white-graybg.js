/**
 * 给 parking_lines_white.png 透明区域填灰，直接覆盖原图
 * 运行：npm run process-parking-lines-white-graybg
 */

import path from 'path';
import { fileURLToPath } from 'url';
import Jimp from 'jimp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const filePath = path.join(root, 'public', 'textures', 'parking_lines_white.png');

const R = 0x7f, G = 0x7f, B = 0x7f; // #7F7F7F
const ALPHA_THRESH = 10;

async function main() {
  const img = await Jimp.read(filePath);
  const W = img.bitmap.width;
  const H = img.bitmap.height;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = img.getPixelColor(x, y);
      const { a } = Jimp.intToRGBA(v);
      if (a < ALPHA_THRESH) {
        img.setPixelColor(Jimp.rgbaToInt(R, G, B, 0xff), x, y);
      }
    }
  }

  await img.write(filePath);
  console.log('Updated (gray bg):', filePath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
