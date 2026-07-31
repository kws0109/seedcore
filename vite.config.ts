import { defineConfig } from 'vite';

// GitHub Pages는 https://kws0109.github.io/seedcore/ 하위 경로에서 서빙되므로
// base를 레포 이름으로 맞추지 않으면 빌드 산출물의 에셋 경로가 전부 깨진다.
export default defineConfig({
  base: '/seedcore/',
});
