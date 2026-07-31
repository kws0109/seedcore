// 이미지 생성 AI 에셋 파이프라인.
// 사용법:
//   node --env-file=.env tools/gen-assets.mjs            # manifest 전체 생성
//   node --env-file=.env tools/gen-assets.mjs player-knight enemy-ghoul  # 일부만
//   node tools/gen-assets.mjs --dry                      # 요청 내용만 출력 (키 불필요)
// 같은 스타일 템플릿을 모든 프롬프트에 접두해 에셋 간 일관성을 강제한다.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MODEL = 'gpt-image-1';
const SIZE = '1024x1024';
const QUALITY = 'medium';

const manifest = JSON.parse(await readFile('assets/manifest.json', 'utf8'));
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const only = args.filter((a) => !a.startsWith('--'));
const targets = manifest.assets.filter((a) => only.length === 0 || only.includes(a.id));

if (targets.length === 0) {
  console.error('대상 에셋이 없습니다. manifest의 id를 확인하세요.');
  process.exit(1);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!dry && !apiKey) {
  console.error('OPENAI_API_KEY가 없습니다. .env 파일을 확인하세요. (--dry로 검토만 가능)');
  process.exit(1);
}

await mkdir(manifest.output, { recursive: true });

for (const asset of targets) {
  // styleKey가 있으면 해당 대체 스타일 템플릿 사용 (예: 바닥 텍스처는 isolated/transparent 문구 금지)
  const style = asset.styleKey ? manifest.styles[asset.styleKey] : manifest.style;
  // editFrom이 있으면 스타일 접두 없이 편집 지시문 그대로 사용 (원본 스타일 유지가 목적)
  const prompt = asset.editFrom ? asset.prompt : `${asset.prompt}, ${style}`;
  if (dry) {
    console.log(`--- ${asset.id}${asset.editFrom ? ` (edit from ${asset.editFrom})` : ''}\n${prompt}\n`);
    continue;
  }
  console.log(`생성 중: ${asset.id} ...`);
  let res;
  if (asset.editFrom) {
    // 기존 에셋을 레퍼런스로 편집 (images/edits, multipart)
    const src = await readFile(`${manifest.output}/${asset.editFrom}.png`);
    const form = new FormData();
    form.append('model', MODEL);
    form.append('prompt', prompt);
    form.append('size', SIZE);
    form.append('quality', QUALITY);
    form.append('background', asset.opaque ? 'opaque' : 'transparent');
    form.append('image[]', new Blob([src], { type: 'image/png' }), `${asset.editFrom}.png`);
    res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } else {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        size: SIZE,
        quality: QUALITY,
        background: asset.opaque ? 'opaque' : 'transparent',
        n: 1,
      }),
    });
  }
  if (!res.ok) {
    console.error(`실패 (${asset.id}): HTTP ${res.status}\n${await res.text()}`);
    process.exit(1);
  }
  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    console.error(`실패 (${asset.id}): 응답에 이미지가 없습니다.`, JSON.stringify(data).slice(0, 300));
    process.exit(1);
  }
  const file = path.join(manifest.output, `${asset.id}.png`);
  await writeFile(file, Buffer.from(b64, 'base64'));
  console.log(`저장: ${file}`);
}
console.log(dry ? '드라이런 완료.' : '완료.');
