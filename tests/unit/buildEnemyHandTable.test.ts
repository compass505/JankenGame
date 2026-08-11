import { describe, expect, it } from 'vitest';
import { buildEnemyHandTable } from '@/domain/enemy';
import type { EnemyDef, EnemyPhase } from '@/domain/enemy';
import { HANDS } from '@/domain/hand';
import type { Hand } from '@/domain/hand';
import { NO_HEAT } from '@/domain/handTable';
import type { HandTable, HeatCounts, HeatRule } from '@/domain/handTable';

/**
 * `docs/03_detailed-design.md` 節3（`buildEnemyHandTable`）と
 * `docs/adr/0004-enemy-hand-table.md` が対象。
 *
 * この関数は `application` の非公開関数として設計されていたが、
 * `STAGES`（＝`src/data/`）越しにしか呼べず「`enemy.hands` が使われること」を
 * テストできない穴が見つかったため `domain/enemy.ts` に移された（節3 の解説を参照）。
 * `base` と `rule` を引数で受け取るので、ここでは `src/data/` の値を一切 import せず、
 * テスト内のローカルなリテラルだけで任意の敵・任意のルールを検証できる。
 */

function makeEnemy(overrides: Partial<EnemyDef> = {}): EnemyDef {
  return {
    id: 'test',
    name: 'テスト敵',
    maxHp: 20,
    weightsNormal: { rock: 1, scissors: 1, paper: 1 },
    weightsDesperate: { rock: 1, scissors: 1, paper: 1 },
    resistance: { rock: 1, scissors: 1, paper: 1 },
    desperateBonus: 0,
    drawRule: 'standard',
    ...overrides,
  };
}

describe('buildEnemyHandTable: 節5の具体例（そのまま1本のテストにする）', () => {
  it('「回復せず、にらみが凶器になる敵」が本気×連打2回のとき、グー4/チョキ7/パー5になる', () => {
    // base は「既定の値表」。docs/03 節5 の例中の注釈
    // （「既定は stareBonus 4」「既定は heal 3」）から復元できる値をそのまま使う。
    // enemy.hands が使われていることを強く示すため、base は enemy.hands とはっきり違う値にしてある。
    const base: HandTable = {
      rock: { damage: 3, heal: 0, stareBonus: 4 },
      scissors: { damage: 5, heal: 0, stareBonus: 0 },
      paper: { damage: 3, heal: 3, stareBonus: 0 },
    };
    const enemy = makeEnemy({
      hands: {
        rock: { damage: 3, heal: 0, stareBonus: 6 },
        scissors: { damage: 5, heal: 0, stareBonus: 0 },
        paper: { damage: 3, heal: 0, stareBonus: 0 },
      },
      desperateBonus: 2,
    });
    const history: HeatCounts = ['rock', 'rock'];
    const rule: HeatRule = { window: 4, allowed: 2, maxPenalty: 3 };

    const table = buildEnemyHandTable(base, enemy, history, rule, 'desperate');

    expect(table).toEqual<HandTable>({
      rock: { damage: 4, heal: 0, stareBonus: 6 },
      scissors: { damage: 7, heal: 0, stareBonus: 0 },
      paper: { damage: 5, heal: 0, stareBonus: 0 },
    });
  });
});

describe('buildEnemyHandTable: enemy.hands の有無', () => {
  it('enemy.hands を持つ敵では、その値表が base の代わりに使われる（本体）', () => {
    const base: HandTable = {
      rock: { damage: 1, heal: 0, stareBonus: 0 },
      scissors: { damage: 1, heal: 0, stareBonus: 0 },
      paper: { damage: 1, heal: 0, stareBonus: 0 },
    };
    const hands: HandTable = {
      rock: { damage: 9, heal: 2, stareBonus: 5 },
      scissors: { damage: 8, heal: 1, stareBonus: 4 },
      paper: { damage: 7, heal: 3, stareBonus: 3 },
    };
    const enemy = makeEnemy({ hands, desperateBonus: 0 });
    const rule: HeatRule = { window: 4, allowed: 2, maxPenalty: 3 };

    // 履歴なし・normal フェーズなので、弱化も本気強化も乗らない。
    // enemy.hands がそのまま出てくるはず（base とは似ても似つかない値なので取り違えは検出できる）
    const table = buildEnemyHandTable(base, enemy, NO_HEAT, rule, 'normal');

    expect(table).toEqual(hands);
    expect(table).not.toEqual(base);
  });

  it('enemy.hands を省略した敵では、base がそのまま使われる', () => {
    const base: HandTable = {
      rock: { damage: 2, heal: 0, stareBonus: 7 },
      scissors: { damage: 4, heal: 0, stareBonus: 0 },
      paper: { damage: 6, heal: 5, stareBonus: 0 },
    };
    const enemy = makeEnemy({ desperateBonus: 0 });
    const rule: HeatRule = { window: 4, allowed: 2, maxPenalty: 3 };

    const table = buildEnemyHandTable(base, enemy, NO_HEAT, rule, 'normal');

    expect(table).toEqual(base);
  });
});

describe('buildEnemyHandTable: phase による desperateBonus の有無', () => {
  it('phase が normal のときは desperateBonus が乗らない（hands の有無どちらでも）', () => {
    const base: HandTable = {
      rock: { damage: 2, heal: 0, stareBonus: 0 },
      scissors: { damage: 3, heal: 0, stareBonus: 0 },
      paper: { damage: 4, heal: 0, stareBonus: 0 },
    };
    const hands: HandTable = {
      rock: { damage: 5, heal: 1, stareBonus: 2 },
      scissors: { damage: 6, heal: 0, stareBonus: 0 },
      paper: { damage: 4, heal: 2, stareBonus: 1 },
    };
    const rule: HeatRule = { window: 4, allowed: 2, maxPenalty: 3 };

    const withoutHands = buildEnemyHandTable(base, makeEnemy({ desperateBonus: 3 }), NO_HEAT, rule, 'normal');
    const withHands = buildEnemyHandTable(base, makeEnemy({ hands, desperateBonus: 3 }), NO_HEAT, rule, 'normal');

    expect(withoutHands).toEqual(base);
    expect(withHands).toEqual(hands);
  });

  it('phase が desperate のときは全手の damage に desperateBonus が足される（heal・stareBonusは動かない）', () => {
    const base: HandTable = {
      rock: { damage: 1, heal: 0, stareBonus: 0 },
      scissors: { damage: 1, heal: 0, stareBonus: 0 },
      paper: { damage: 1, heal: 0, stareBonus: 0 },
    };
    const hands: HandTable = {
      rock: { damage: 5, heal: 1, stareBonus: 2 },
      scissors: { damage: 6, heal: 0, stareBonus: 0 },
      paper: { damage: 4, heal: 2, stareBonus: 1 },
    };
    const enemy = makeEnemy({ hands, desperateBonus: 3 });
    const rule: HeatRule = { window: 4, allowed: 2, maxPenalty: 3 };

    const table = buildEnemyHandTable(base, enemy, NO_HEAT, rule, 'desperate');

    for (const hand of HANDS) {
      expect(table[hand].damage).toBe(hands[hand].damage + enemy.desperateBonus);
      expect(table[hand].heal).toBe(hands[hand].heal);
      expect(table[hand].stareBonus).toBe(hands[hand].stareBonus);
    }
  });

  it('desperateBonus が 0 なら desperate でも damage は変わらない', () => {
    const base: HandTable = {
      rock: { damage: 3, heal: 0, stareBonus: 1 },
      scissors: { damage: 4, heal: 0, stareBonus: 0 },
      paper: { damage: 2, heal: 1, stareBonus: 0 },
    };
    const enemy = makeEnemy({ desperateBonus: 0 });
    const rule: HeatRule = { window: 4, allowed: 2, maxPenalty: 3 };

    const table = buildEnemyHandTable(base, enemy, NO_HEAT, rule, 'desperate');

    expect(table).toEqual(base);
  });
});

describe('buildEnemyHandTable: heal と stareBonus は最後まで動かない', () => {
  it('連打の弱化・本気強化のどちらを通しても heal と stareBonus は入力の表のまま', () => {
    const base: HandTable = {
      rock: { damage: 3, heal: 11, stareBonus: 21 },
      scissors: { damage: 5, heal: 12, stareBonus: 22 },
      paper: { damage: 3, heal: 13, stareBonus: 23 },
    };
    const hands: HandTable = {
      rock: { damage: 4, heal: 31, stareBonus: 41 },
      scissors: { damage: 6, heal: 32, stareBonus: 42 },
      paper: { damage: 2, heal: 33, stareBonus: 43 },
    };
    const rule: HeatRule = { window: 4, allowed: 1, maxPenalty: 2 };
    const heavyHistory: HeatCounts = ['rock', 'rock', 'rock'];

    const withoutHands = buildEnemyHandTable(base, makeEnemy({ desperateBonus: 5 }), heavyHistory, rule, 'desperate');
    const withHands = buildEnemyHandTable(
      base,
      makeEnemy({ hands, desperateBonus: 5 }),
      heavyHistory,
      rule,
      'desperate',
    );

    for (const hand of HANDS) {
      expect(withoutHands[hand].heal).toBe(base[hand].heal);
      expect(withoutHands[hand].stareBonus).toBe(base[hand].stareBonus);
      expect(withHands[hand].heal).toBe(hands[hand].heal);
      expect(withHands[hand].stareBonus).toBe(hands[hand].stareBonus);
    }
  });
});

describe('buildEnemyHandTable: 弱化の下限', () => {
  it('弱化で damage が1未満にならない（max(1, …) で止まる）', () => {
    const base: HandTable = {
      rock: { damage: 2, heal: 0, stareBonus: 0 },
      scissors: { damage: 3, heal: 0, stareBonus: 0 },
      paper: { damage: 4, heal: 0, stareBonus: 0 },
    };
    const enemy = makeEnemy({ desperateBonus: 0 });
    const rule: HeatRule = { window: 10, allowed: 0, maxPenalty: 5 };
    // 生の弱化量は5（maxPenalty）。base.rock.damage(2) から引くと -3 になるが 1 に止まる
    const history: HeatCounts = new Array(9).fill('rock') as Hand[];

    const table = buildEnemyHandTable(base, enemy, history, rule, 'normal');

    expect(table.rock.damage).toBe(1);
    expect(table.scissors.damage).toBeGreaterThanOrEqual(1);
    expect(table.paper.damage).toBeGreaterThanOrEqual(1);
  });
});

describe('buildEnemyHandTable: 引数を書き換えない', () => {
  it('base・enemy（hands を含む）・history のいずれも呼び出し後に変化しない', () => {
    const base: HandTable = {
      rock: { damage: 3, heal: 1, stareBonus: 2 },
      scissors: { damage: 4, heal: 0, stareBonus: 1 },
      paper: { damage: 5, heal: 2, stareBonus: 0 },
    };
    const hands: HandTable = {
      rock: { damage: 6, heal: 0, stareBonus: 3 },
      scissors: { damage: 7, heal: 1, stareBonus: 0 },
      paper: { damage: 8, heal: 0, stareBonus: 2 },
    };
    const enemy = makeEnemy({ hands, desperateBonus: 2 });
    const rule: HeatRule = { window: 4, allowed: 1, maxPenalty: 3 };
    const history: HeatCounts = ['rock', 'scissors'];

    const baseSnapshot = JSON.parse(JSON.stringify(base)) as HandTable;
    const enemySnapshot = JSON.parse(JSON.stringify(enemy)) as EnemyDef;
    const historySnapshot = JSON.parse(JSON.stringify(history)) as HeatCounts;

    buildEnemyHandTable(base, enemy, history, rule, 'desperate');

    expect(base).toEqual(baseSnapshot);
    expect(enemy).toEqual(enemySnapshot);
    expect(history).toEqual(historySnapshot);
  });
});

describe('buildEnemyHandTable: rng を受け取らない', () => {
  it('引数は base・enemy・history・rule・phase の5つだけ（rng を含まない）', () => {
    expect(buildEnemyHandTable.length).toBe(5);
  });
});

describe('buildEnemyHandTable: 全フェーズ×hands有無の組み合わせで damage が整数のまま', () => {
  it('どの組み合わせでも 3手すべて damage は1以上の整数のまま返る', () => {
    const base: HandTable = {
      rock: { damage: 3, heal: 0, stareBonus: 1 },
      scissors: { damage: 5, heal: 0, stareBonus: 0 },
      paper: { damage: 3, heal: 3, stareBonus: 0 },
    };
    const hands: HandTable = {
      rock: { damage: 4, heal: 0, stareBonus: 2 },
      scissors: { damage: 2, heal: 1, stareBonus: 0 },
      paper: { damage: 6, heal: 0, stareBonus: 0 },
    };
    const rule: HeatRule = { window: 4, allowed: 2, maxPenalty: 3 };
    const phases: EnemyPhase[] = ['normal', 'desperate'];
    const histories: HeatCounts[] = [NO_HEAT, ['rock'], ['rock', 'rock'], ['paper', 'paper', 'paper']];
    const enemies = [makeEnemy({ desperateBonus: 2 }), makeEnemy({ hands, desperateBonus: 2 })];

    for (const enemy of enemies) {
      for (const phase of phases) {
        for (const history of histories) {
          const table = buildEnemyHandTable(base, enemy, history, rule, phase);
          for (const hand of HANDS) {
            expect(Number.isInteger(table[hand].damage)).toBe(true);
            expect(table[hand].damage).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });
});
