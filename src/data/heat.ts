import type { HeatRule } from '@/domain/handTable';

/** 連打の罰の効き方（`docs/adr/0003-repetition-window.md`）。
 *  直近 window 手のうち allowed 回までは罰なし。超えた回数ぶん damage が下がる。
 *  window=4 / allowed=2 のとき弱化は最大2段までしか届かないので、
 *  maxPenalty は窓を広げたときの蓋として置いてある */
export const HEAT_RULE: HeatRule = { window: 4, allowed: 2, maxPenalty: 3 };
