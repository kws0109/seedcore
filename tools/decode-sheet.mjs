// 캡처 결과(dataURL 텍스트 파일) → PNG 디코드
// 사용법: node tools/decode-sheet.mjs <입력.txt> <출력.png>
import { readFileSync, writeFileSync, statSync, unlinkSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
const raw = readFileSync(input, 'utf8').trim();
const m = raw.match(/base64,([A-Za-z0-9+/=]+)/s);
if (!m) {
  console.error(`디코드 실패: ${input} — dataURL 형식이 아님`);
  process.exit(1);
}
writeFileSync(output, Buffer.from(m[1], 'base64'));
unlinkSync(input);
console.log(`${output} (${Math.round(statSync(output).size / 1024)}KB)`);
