import type { HeatRule } from '@/domain/handTable';

/** 熱の効き方。値は ADR 0002 のまま（置き場所だけ domain から移した） */
export const HEAT_RULE: HeatRule = { gain: 4, maxPenalty: 3 };
