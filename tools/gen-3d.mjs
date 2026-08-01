// 이미지 → 3D → 리깅 → 애니메이션 파이프라인 (Meshy API).
// 사용법: node --env-file=.env tools/gen-3d.mjs <에셋id> [클립,클립...]
//   예: node --env-file=.env tools/gen-3d.mjs player-knight idle,walk,attack
// 산출물: assets/3d/<id>.glb (리깅), assets/3d/<id>-<클립>.glb (클립별)
// 중간 태스크 ID는 assets/3d/<id>.tasks.json에 기록해 재실행 시 완료 단계를 건너뛴다.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API = 'https://api.meshy.ai/openapi';
const KEY = process.env.MESHY_API_KEY;
if (!KEY) {
  console.error('MESHY_API_KEY가 없습니다. .env를 확인하세요.');
  process.exit(1);
}

// Meshy 애니메이션 라이브러리 액션 ID
const CLIPS = { idle: 0, idle2: 11, idle3: 12, walk: 30, walk2: 1, attack: 4, slash: 97, shoot: 224, heavy: 128, death: 8 };

const [id, clipArg] = process.argv.slice(2);
if (!id) {
  console.error('에셋 id가 필요합니다. 예: player-knight');
  process.exit(1);
}
const clips = (clipArg ?? 'idle,walk,attack').split(',').filter((c) => c in CLIPS);

const OUT = 'assets/3d';
await mkdir(OUT, { recursive: true });
const stateFile = path.join(OUT, `${id}.tasks.json`);
let tasks = {};
try {
  tasks = JSON.parse(await readFile(stateFile, 'utf8'));
} catch {
  /* 첫 실행 */
}
const saveTasks = () => writeFile(stateFile, JSON.stringify(tasks, null, 2));

let creditsUsed = 0;

async function api(method, endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${endpoint} → HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function poll(endpoint, label) {
  for (let i = 0; i < 120; i++) {
    const task = await api('GET', endpoint);
    const status = task.status;
    if (status === 'SUCCEEDED') {
      if (typeof task.task_error?.message === 'string' && task.task_error.message) {
        console.log(`  경고(${label}): ${task.task_error.message}`);
      }
      creditsUsed += task.consumed_credits ?? 0;
      return task;
    }
    if (status === 'FAILED' || status === 'CANCELED') {
      throw new Error(`${label} 실패: ${JSON.stringify(task.task_error ?? task).slice(0, 400)}`);
    }
    process.stdout.write(`\r  ${label}: ${status} ${task.progress ?? 0}%   `);
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error(`${label} 타임아웃`);
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`다운로드 실패 ${file}: HTTP ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  console.log(`\n  저장: ${file}`);
}

// 1단계: 이미지 → 3D
if (!tasks.model) {
  const png = await readFile(`public/assets/${id}.png`);
  const dataUri = `data:image/png;base64,${png.toString('base64')}`;
  console.log(`[1/4] 이미지→3D 생성: ${id}`);
  const { result } = await api('POST', '/v1/image-to-3d', {
    image_url: dataUri,
    should_texture: true,
    enable_pbr: false,
  });
  tasks.model = result;
  await saveTasks();
}
await poll(`/v1/image-to-3d/${tasks.model}`, '모델 생성');
console.log(`\n[1/4] 완료 (task ${tasks.model})`);

// 2단계: 리메시 (리깅 한도 30만 페이스 대응 — 사전 렌더 용도라 3만이면 충분)
if (!tasks.remesh) {
  console.log(`[2/4] 리메시 (3만 페이스)`);
  const { result } = await api('POST', '/v1/remesh', {
    input_task_id: tasks.model,
    target_formats: ['glb'],
    topology: 'triangle',
    target_polycount: 30000,
  });
  tasks.remesh = result;
  await saveTasks();
}
const remesh = await poll(`/v1/remesh/${tasks.remesh}`, '리메시');
console.log(`\n[2/4] 완료 (task ${tasks.remesh})`);

// 'norig': 무기·소품 등 리깅이 필요 없는 정적 메시 — 리메시 결과만 저장하고 종료
if (clipArg === 'norig') {
  const url = remesh.result?.model_urls?.glb ?? remesh.model_urls?.glb;
  if (!url) throw new Error(`리메시 GLB URL 없음 — ${JSON.stringify(remesh).slice(0, 300)}`);
  await download(url, path.join(OUT, `${id}.glb`));
  console.log(`\n정적 메시 완료. 소모 크레딧(이번 실행 폴링 기준): ${creditsUsed}`);
  process.exit(0);
}

// 3단계: 리깅
if (!tasks.rig) {
  console.log(`[3/4] 리깅`);
  const { result } = await api('POST', '/v1/rigging', {
    input_task_id: tasks.remesh,
    height_meters: 1.7,
  });
  tasks.rig = result;
  await saveTasks();
}
const rig = await poll(`/v1/rigging/${tasks.rig}`, '리깅');
if (rig.result?.rigged_character_glb_url) {
  await download(rig.result.rigged_character_glb_url, path.join(OUT, `${id}.glb`));
}
console.log(`[3/4] 완료 (task ${tasks.rig})`);

// 4단계: 클립별 애니메이션
tasks.anims ??= {};
for (const clip of clips) {
  if (!tasks.anims[clip]) {
    console.log(`[4/4] 애니메이션: ${clip} (action ${CLIPS[clip]})`);
    const { result } = await api('POST', '/v1/animations', {
      rig_task_id: tasks.rig,
      action_id: CLIPS[clip],
    });
    tasks.anims[clip] = result;
    await saveTasks();
  }
  const anim = await poll(`/v1/animations/${tasks.anims[clip]}`, `애니메이션 ${clip}`);
  const url = anim.result?.animation_glb_url;
  if (!url) throw new Error(`${clip}: GLB URL 없음 — ${JSON.stringify(anim.result).slice(0, 300)}`);
  await download(url, path.join(OUT, `${id}-${clip}.glb`));
}

console.log(`\n전체 완료. 소모 크레딧(이번 실행 폴링 기준): ${creditsUsed}`);
