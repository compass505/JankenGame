import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages はリポジトリ名のサブディレクトリ配信になる。
  // 相対にしておくと、ローカルの `/` でも Pages の `/JankenGame/` でも同じものが動く。
  // **画像を `/assets/...` と直書きするとここが効かず 404 になる**ので、
  // 参照は必ず `src/ui/assetUrl.ts` を通すこと。
  base: './',
  server: {
    // ポートが埋まっている環境でも起動できるよう PORT を尊重する
    port: process.env['PORT'] ? Number(process.env['PORT']) : 5173,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // domain / application は純粋ロジックなので node 環境で十分。
    // UI のテストを足すときだけ environment を 'jsdom' に変える。
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
