import { createRng } from '@/lib/rng';
import { mountApp } from '@/ui/app';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('#app が見つかりません');
}

const rng = createRng(Date.now() >>> 0);
mountApp(app, rng);
