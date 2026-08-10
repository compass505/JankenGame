/**
 * バランス計測。実装済みの src/ をそのまま回して、通しクリア率・ターン数・手の使用分布を測る。
 *
 * `docs/adr/0002-hand-heat.md` の数値は熱を実装する前の見積もりなので、
 * `/balance` に入る前後でここを回して実測値に置き換える。
 *
 *     npx vite-node scripts/measure.ts [試行回数]
 *
 * 判断の材料にするのは次の2つ。
 *
 * 1. **機械的パターンのクリア率** — 評価関数に依存しない実測値。信頼できる
 * 2. **貪欲プレイのクリア率** — 自作のヒューリスティックなので**真の最適とは限らない**。
 *    「機械的パターンが最適でなくなったか」を見るための参考値として読む
 */
import { resolveTurn } from '@/domain/battle';
import type { BattleState } from '@/domain/battle';
import { enemyPhase, handProbabilities } from '@/domain/enemy';
import { HANDS } from '@/domain/hand';
import type { Hand } from '@/domain/hand';
import { advanceHeat, applyHeat, canUpgrade, heatPenalty } from '@/domain/handTable';
import type { HandTable, HeatCounts } from '@/domain/handTable';
import {
  chooseUpgrade,
  createGame,
  currentEnemy,
  playHand,
  playerHandTable,
  startGame,
} from '@/application/game';
import type { GameState } from '@/application/game';
import { BASE_HANDS } from '@/data/hands';
import { HEAT_RULE } from '@/data/heat';
import { STAGES } from '@/data/stages';
import { createRng } from '@/lib/rng';
import type { Rng } from '@/lib/rng';

/** 1周が終わらないまま回り続けるのを防ぐ保険。通常は数十ステップで終わる */
const MAX_STEPS = 2000;

/** にらみを「いつか grade で回収できる火力」として何割の重みで見るか（貪欲プレイの主観） */
const STARE_WEIGHT = 0.5;

/** 手を熱くすることの将来コストを何割で見るか（貪欲プレイ・熱ありのみ） */
const HEAT_WEIGHT = 1.0;

type Strategy = {
  readonly name: string;
  readonly kind: 'machine' | 'greedy';
  /** その局面で出す手を返す */
  readonly pick: (state: GameState, turnIndex: number) => Hand;
};

// ---------------------------------------------------------------- 機械的パターン

function fromPattern(name: string, pattern: readonly Hand[]): Strategy {
  return {
    name,
    kind: 'machine',
    pick: (_state, turnIndex) => {
      const hand = pattern[turnIndex % pattern.length];
      if (hand === undefined) throw new Error('unreachable: pattern is not empty');
      return hand;
    },
  };
}

const MACHINE_STRATEGIES: readonly Strategy[] = [
  fromPattern('1手固定: グー', ['rock']),
  fromPattern('1手固定: チョキ', ['scissors']),
  fromPattern('1手固定: パー', ['paper']),
  fromPattern('2手交互: グー/チョキ', ['rock', 'scissors']),
  fromPattern('2手交互: チョキ/パー', ['scissors', 'paper']),
  fromPattern('2手交互: パー/グー', ['paper', 'rock']),
  fromPattern('3手循環', ['rock', 'scissors', 'paper']),
];

// ---------------------------------------------------------------- 貪欲プレイ

/** 敵の手を e に固定する rng。decideEnemyHand は HANDS 順に確率を積んで比較するだけなので、
 *  その区間の中点を返せば必ず e が選ばれる。next は1回しか呼ばれない（docs/03 節3）。 */
function rngForcing(p: Readonly<Record<Hand, number>>, target: Hand): Rng {
  let acc = 0;
  let mid = 0;
  for (const hand of HANDS) {
    const lo = acc;
    acc += p[hand];
    if (hand === target) {
      mid = (lo + acc) / 2;
      break;
    }
  }
  const fail = (): never => {
    throw new Error('measure: 敵の手の抽選以外で乱数が使われた');
  };
  return { next: () => mid, int: fail, pick: fail };
}

/** 1ターン先だけを見て、HPの取り合いを評価する。にらみは将来の火力として割り引いて数える */
function scoreTurn(before: BattleState, after: BattleState, hands: HandTable): number {
  const enemyLost = (before.enemyHp - after.enemyHp) / before.enemyMaxHp;
  const playerLost = (before.playerHp - after.playerHp) / before.playerMaxHp;
  const stareValue = (stare: number): number =>
    (stare * hands.rock.stareBonus) / before.enemyMaxHp;

  return (
    enemyLost - playerLost + STARE_WEIGHT * (stareValue(after.stare) - stareValue(before.stare))
  );
}

/** その手を出すと次のターンにどれだけ火力が落ちるか。熱を見ない貪欲との差を出すために分けてある */
function heatCost(heat: HeatCounts, hand: Hand, hands: HandTable, enemyMaxHp: number): number {
  const now = heatPenalty(heat, hand, HEAT_RULE);
  const next = heatPenalty(advanceHeat(heat, hand, HEAT_RULE), hand, HEAT_RULE);
  const damage = hands[hand].damage;

  // ダメージは1で止まるので、実際に失う量は「下がりしろ」で頭打ちになる
  const lost = Math.min(next - now, Math.max(0, damage - 1));
  return lost / enemyMaxHp;
}

function greedy(name: string, useHeatCost: boolean): Strategy {
  return {
    name,
    kind: 'greedy',
    pick: (state) => {
      const battle = state.battle;
      const enemy = currentEnemy(state);
      if (battle === null || enemy === null) return 'rock';

      const playerHands = playerHandTable(state);
      const enemyHands = applyHeat(BASE_HANDS, state.enemyHeat, HEAT_RULE);
      const ctx = { playerHands, enemyHands, enemy };
      const p = handProbabilities(enemy, enemyPhase(battle.enemyHp, battle.enemyMaxHp));

      let best: Hand = 'rock';
      let bestScore = -Infinity;

      for (const hand of HANDS) {
        let score = 0;
        for (const enemyHand of HANDS) {
          const result = resolveTurn(battle, hand, ctx, rngForcing(p, enemyHand));
          score += p[enemyHand] * scoreTurn(battle, result.state, playerHands);
        }
        if (useHeatCost) {
          score -= HEAT_WEIGHT * heatCost(state.playerHeat, hand, playerHands, battle.enemyMaxHp);
        }
        if (score > bestScore) {
          bestScore = score;
          best = hand;
        }
      }

      return best;
    },
  };
}

const GREEDY_STRATEGIES: readonly Strategy[] = [
  greedy('貪欲（熱を見ない）', false),
  greedy('貪欲（熱を見る）', true),
];

// ---------------------------------------------------------------- 1周を回す

interface RunResult {
  readonly cleared: boolean;
  /** 何体目で終わったか（0..STAGES.length-1） */
  readonly stageReached: number;
  /** 戦闘ごとのターン数 */
  readonly battleTurns: readonly number[];
  readonly handUse: Readonly<Record<Hand, number>>;
  /** 敵ごとの手の使用回数。**敵の個性が出ているかはここでしか見えない**。
   *  通算の分布が揃っていても、敵ごとに中身が同じなら「どの敵とも同じ戦い方」を意味する */
  readonly handUseByStage: readonly Readonly<Record<Hand, number>>[];
}

function emptyHandCount(): Record<Hand, number> {
  return { rock: 0, scissors: 0, paper: 0 };
}

/** 強化はそのプレイが最も使っている手に寄せる。どの戦略にも同じ規則を当てる */
function pickUpgrade(state: GameState, handUse: Record<Hand, number>): Hand | null {
  let best: Hand | null = null;
  for (const hand of HANDS) {
    if (!canUpgrade(state.upgrades, hand)) continue;
    if (best === null || handUse[hand] > handUse[best]) best = hand;
  }
  return best;
}

function playRun(seed: number, strategy: Strategy): RunResult {
  const rng = createRng(seed);
  let state = startGame(createGame());

  const handUse: Record<Hand, number> = emptyHandCount();
  const handUseByStage: Record<Hand, number>[] = STAGES.map(() => emptyHandCount());
  const battleTurns: number[] = [];
  let turnIndex = 0;

  for (let step = 0; step < MAX_STEPS && state.phase !== 'result'; step += 1) {
    if (state.phase === 'battle') {
      const hand = strategy.pick(state, turnIndex);
      handUse[hand] += 1;
      const atStage = handUseByStage[state.stageIndex];
      if (atStage !== undefined) atStage[hand] += 1;
      turnIndex += 1;
      const before = state;
      state = playHand(state, hand, rng);
      if (state.phase !== 'battle' && before.battle !== null && state.battle !== null) {
        battleTurns.push(state.battle.turn);
      }
    } else if (state.phase === 'upgrade') {
      const hand = pickUpgrade(state, handUse);
      if (hand === null) break;
      state = chooseUpgrade(state, hand);
      turnIndex = 0;
    } else {
      break;
    }
  }

  return {
    cleared: state.cleared,
    stageReached: state.stageIndex,
    battleTurns,
    handUse,
    handUseByStage,
  };
}

// ---------------------------------------------------------------- 集計

interface Summary {
  readonly name: string;
  readonly kind: Strategy['kind'];
  readonly clearRate: number;
  readonly meanBattleTurns: number;
  readonly handShare: Readonly<Record<Hand, number>>;
  /** 各ステージで脱落した割合（到達できなかったぶんは数えない） */
  readonly dropoutByStage: readonly number[];
  /** 敵ごとの手の使用割合 */
  readonly handShareByStage: readonly Readonly<Record<Hand, number>>[];
}

/** 2つの分布の隔たり（総変動距離）。0 なら同じ戦い方、1 なら完全に別物。
 *  **敵ごとの個性は、この値が敵ごとにどれだけ散るかで測る** */
function distance(a: Readonly<Record<Hand, number>>, b: Readonly<Record<Hand, number>>): number {
  return HANDS.reduce((sum, hand) => sum + Math.abs(a[hand] - b[hand]), 0) / 2;
}

function toShare(count: Readonly<Record<Hand, number>>): Record<Hand, number> {
  const total = count.rock + count.scissors + count.paper;
  if (total === 0) return { rock: 0, scissors: 0, paper: 0 };
  return {
    rock: count.rock / total,
    scissors: count.scissors / total,
    paper: count.paper / total,
  };
}

function measure(strategy: Strategy, runs: number): Summary {
  let cleared = 0;
  let turnTotal = 0;
  let battleCount = 0;
  const handTotal: Record<Hand, number> = emptyHandCount();
  const handTotalByStage: Record<Hand, number>[] = STAGES.map(() => emptyHandCount());
  const reachedAt = new Array<number>(STAGES.length).fill(0);
  const lostAt = new Array<number>(STAGES.length).fill(0);

  for (let i = 0; i < runs; i += 1) {
    const result = playRun(i + 1, strategy);
    if (result.cleared) cleared += 1;

    for (const turns of result.battleTurns) {
      turnTotal += turns;
      battleCount += 1;
    }
    for (const hand of HANDS) handTotal[hand] += result.handUse[hand];

    for (let s = 0; s < STAGES.length; s += 1) {
      const from = result.handUseByStage[s];
      const to = handTotalByStage[s];
      if (from === undefined || to === undefined) continue;
      for (const hand of HANDS) to[hand] += from[hand];
    }

    for (let s = 0; s <= result.stageReached && s < STAGES.length; s += 1) {
      const at = reachedAt[s];
      if (at !== undefined) reachedAt[s] = at + 1;
    }
    if (!result.cleared) {
      const at = lostAt[result.stageReached];
      if (at !== undefined) lostAt[result.stageReached] = at + 1;
    }
  }

  const handSum = handTotal.rock + handTotal.scissors + handTotal.paper;

  return {
    name: strategy.name,
    kind: strategy.kind,
    clearRate: cleared / runs,
    meanBattleTurns: battleCount === 0 ? 0 : turnTotal / battleCount,
    handShare: {
      rock: handTotal.rock / handSum,
      scissors: handTotal.scissors / handSum,
      paper: handTotal.paper / handSum,
    },
    dropoutByStage: reachedAt.map((reached, s) => {
      const lost = lostAt[s] ?? 0;
      return reached === 0 ? 0 : lost / reached;
    }),
    handShareByStage: handTotalByStage.map(toShare),
  };
}

// ---------------------------------------------------------------- 出力

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

/** 表示用。`src/ui/` の同名の表を import しない（scripts は ui に依存させない） */
const HAND_LABEL: Readonly<Record<Hand, string>> = {
  rock: 'グー',
  scissors: 'チョキ',
  paper: 'パー',
};

const runsArg = process.argv[2];
const RUNS = runsArg === undefined ? 20000 : Number(runsArg);

const summaries = [...MACHINE_STRATEGIES, ...GREEDY_STRATEGIES].map((s) => measure(s, RUNS));

console.log(`\n=== 通しクリア率（${RUNS}周 / 5戦＋強化4回）===\n`);
console.log('戦略                     クリア率   1戦の平均ターン   グー / チョキ / パー');
for (const s of summaries) {
  const share = `${pct(s.handShare.rock)} / ${pct(s.handShare.scissors)} / ${pct(s.handShare.paper)}`;
  console.log(
    `${s.name.padEnd(22)} ${pct(s.clearRate).padStart(7)}   ${s.meanBattleTurns.toFixed(1).padStart(12)}   ${share}`,
  );
}

const machines = summaries.filter((s) => s.kind === 'machine');
const greedies = summaries.filter((s) => s.kind === 'greedy');
const bestMachine = machines.reduce((a, b) => (b.clearRate > a.clearRate ? b : a));
const bestGreedy = greedies.reduce((a, b) => (b.clearRate > a.clearRate ? b : a));

console.log(`\n=== 判断の材料 ===\n`);
console.log(`最良の機械パターン : ${bestMachine.name} — ${pct(bestMachine.clearRate)}`);
console.log(`最良の貪欲プレイ   : ${bestGreedy.name} — ${pct(bestGreedy.clearRate)}`);
console.log(
  `差                 : ${((bestGreedy.clearRate - bestMachine.clearRate) * 100).toFixed(1)}pt`,
);

/** その敵に到達したプレイのうち、倒せた割合。ADR の「1戦の勝率」に相当する */
const winRate = (s: Summary, i: number): number => 1 - (s.dropoutByStage[i] ?? 0);
const meanWinRate = (s: Summary): number =>
  STAGES.reduce((sum, _e, i) => sum + winRate(s, i), 0) / STAGES.length;

console.log(`\n=== 敵ごとの突破率（その敵に到達したプレイのうち倒せた割合）===\n`);
console.log(`敵           ${bestGreedy.name}   ${bestMachine.name}`);
STAGES.forEach((enemy, i) => {
  console.log(
    `${String(i + 1)}. ${enemy.name.padEnd(6)} ${pct(winRate(bestGreedy, i)).padStart(12)} ${pct(
      winRate(bestMachine, i),
    ).padStart(12)}`,
  );
});
console.log(
  `   平均     ${pct(meanWinRate(bestGreedy)).padStart(12)} ${pct(meanWinRate(bestMachine)).padStart(12)}`,
);

/**
 * **敵の個性はここで測る。** 通算の手の分布が揃っていても、それは
 * 「どの敵にも同じ3手を同じ割合で使っている」ことでも達成できてしまう。
 * 敵ごとに分布が割れて初めて「敵ごとに別の戦い方をしている」と言える。
 *
 * `隔たり` は、その敵での分布と**5体を通した平均**との総変動距離。
 * 0% ならその敵は平均どおりの戦い方しか要求しておらず、**個性が無い**。
 */
console.log(`\n=== 敵ごとの手の分布（${bestGreedy.name}）===\n`);
console.log('敵           グー / チョキ / パー        主な手   隔たり');

const overall = bestGreedy.handShare;
let distanceTotal = 0;
STAGES.forEach((enemy, i) => {
  const share = bestGreedy.handShareByStage[i];
  if (share === undefined) return;
  const top = HANDS.reduce((a, b) => (share[b] > share[a] ? b : a));
  const gap = distance(share, overall);
  distanceTotal += gap;
  const cells = `${pct(share.rock)} / ${pct(share.scissors)} / ${pct(share.paper)}`;
  console.log(
    `${String(i + 1)}. ${enemy.name.padEnd(6)} ${cells.padStart(22)}   ${HAND_LABEL[top].padEnd(5)} ${pct(gap).padStart(7)}`,
  );
});
console.log(`   平均${pct(distanceTotal / STAGES.length).padStart(41)}`);
console.log('');
