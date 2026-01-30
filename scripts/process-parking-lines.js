/**
 * 将 Parking_Lines.png 转为暗黄色并加粗线条，输出 Parking_Lines_yellow.png
 * 运行：npm run process-parking-lines
 * 然后把 main_sim 里的 PARKING_LINES_TEXTURE 改为 '/textures/Parking_Lines_yellow.png'
 */

import path from 'path';
import { fileURLToPath } from 'url';
import Jimp from 'jimp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcPath = path.join(root, 'public', 'textures', 'Parking_Lines.png');
const outPath = path.join(root, 'public', 'textures', 'Parking_Lines_yellow.png');

const R = 0x8a, G = 0x7b, B = 0x5a; // 暗黄
const ALPHA_THRESH = 20;
const DILATE_PASSES = 3; // 加粗遍数，越大线条越粗

const nb = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];

async function main() {
  let img = await Jimp.read(srcPath);
  const W = img.bitmap.width;
  const H = img.bitmap.height;

  // 1. 线条像素改为暗黄色
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = img.getPixelColor(x, y);
      const { a } = Jimp.intToRGBA(v);
      if (a >= ALPHA_THRESH) {
        img.setPixelColor(Jimp.rgbaToInt(R, G, B, a), x, y);
      }
    }
  }

  // 2. 膨胀加粗
  for (let p = 0; p < DILATE_PASSES; p++) {
    const next = img.clone();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = img.getPixelColor(x, y);
        const { a } = Jimp.intToRGBA(v);
        let isLine = a >= ALPHA_THRESH;
        if (!isLine) {
          for (const [dy, dx] of nb) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < H && nx >= 0 && nx < W) {
              const { a: na } = Jimp.intToRGBA(img.getPixelColor(nx, ny));
              if (na >= ALPHA_THRESH) {
                isLine = true;
                break;
              }
            }
          }
        }
        if (isLine) {
          next.setPixelColor(Jimp.rgbaToInt(R, G, B, 0xff), x, y);
        } else {
          next.setPixelColor(Jimp.rgbaToInt(0, 0, 0, 0), x, y);
        }
      }
    }
    img = next;
  }

  await img.write(outPath);
  console.log('Written:', outPath);
  console.log('将 main_sim 中 PARKING_LINES_TEXTURE 改为 "/textures/Parking_Lines_yellow.png" 后即可使用。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
