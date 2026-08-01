// public/assets 하위의 모든 PNG를 WebP로 변환한다 (알파 유지, 시각 무손실 수준 q90).
// 게임은 .webp를 로드하며, PNG 원본은 파이프라인(gen-assets / 캡처)으로 재생성 가능하므로 삭제한다.
// 사용법: node tools/optimize-assets.mjs [--dry]
import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const dirs = ['public/assets', 'public/assets/anim'];
const dry = process.argv.includes('--dry');

let before = 0;
let after = 0;
for (const dir of dirs) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.png'));
  for (const f of files) {
    const src = path.join(dir, f);
    const dst = src.replace(/\.png$/, '.webp');
    const srcSize = (await stat(src)).size;
    before += srcSize;
    if (dry) {
      console.log(`(dry) ${src}`);
      continue;
    }
    await sharp(src).webp({ quality: 90, alphaQuality: 95, effort: 5 }).toFile(dst);
    const dstSize = (await stat(dst)).size;
    after += dstSize;
    await unlink(src);
    console.log(`${f}: ${Math.round(srcSize / 1024)}KB → ${Math.round(dstSize / 1024)}KB`);
  }
}
console.log(`\n합계: ${Math.round(before / 1024)}KB → ${Math.round(after / 1024)}KB (${Math.round((1 - after / before) * 100)}% 절감)`);
