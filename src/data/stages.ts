import { ENEMIES } from '@/data/enemies';
import type { EnemyDef } from '@/domain/enemy';

/** 一本道。将来ここをグラフに差し替えれば分岐マップにできる */
export const STAGES: readonly EnemyDef[] = [
  ENEMIES.scarecrow,
  ENEMIES.shearBird,
  ENEMIES.rockGuard,
  ENEMIES.paperEnvoy,
  ENEMIES.glicoKing,
];
