import { describe, expect, it } from 'vitest';
import { handProbabilities } from '@/domain/enemy';
import type { EnemyDef } from '@/domain/enemy';
import type { HandTable } from '@/domain/handTable';
import { STAGES } from '@/data/stages';

/**
 * `docs/adr/0004-enemy-hand-table.md` と `docs/03_detailed-design.md` 節3（`EnemyDef`）が対象。
 *
 * ここで見るのは `domain/enemy.ts` 側の型そのものに関わる部分だけ。
 * - `EnemyDef.hands?: HandTable` を持てること（省略可能なフィールド）
 * - `hands` の有無が `handProbabilities` / `enemyPhase` などの既存の手選択ロジックに
 *   一切影響しないこと（ADR 0004: 「適用は application の enemyHandTable 1箇所だけで行う」）
 * - `EnemyDef.hint` が消えていること（ADR 0004。「実装は5体とも一度も表示していない」ので落とす）
 *
 * `hands` が実際に `enemyHandTable` の計算に反映されることの確認は
 * `tests/unit/enemyHandTable.test.ts`（application 層）の担当。
 * このファイルでは「値表を持てる／持たなくても壊れない」という型の契約だけを見る。
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
    // hint は持たない（ADR 0004。EnemyDef から削除される）
    ...overrides,
  };
}

describe('EnemyDef.hands（docs/03 節3・ADR 0004）', () => {
  it('hands を省略しても EnemyDef として成立する（省略可能なフィールド。省略時は application 側で BASE_HANDS を使う）', () => {
    const enemy = makeEnemy();

    expect(enemy.hands).toBeUndefined();
  });

  it('hands を指定すると、その値がそのまま保持される（まるごと差し替え。部分上書きではない）', () => {
    const hands: HandTable = {
      rock: { damage: 3, heal: 0, stareBonus: 6 },
      scissors: { damage: 5, heal: 0, stareBonus: 0 },
      paper: { damage: 3, heal: 0, stareBonus: 0 },
    };
    const enemy = makeEnemy({ hands });

    expect(enemy.hands).toEqual(hands);
  });

  it('hands の有無は handProbabilities に影響しない（決めるのは weightsNormal/weightsDesperate だけ）', () => {
    const weightsNormal = { rock: 5, scissors: 1, paper: 1 };
    const withoutHands = makeEnemy({ weightsNormal });
    const withHands = makeEnemy({
      weightsNormal,
      hands: {
        rock: { damage: 1, heal: 0, stareBonus: 0 },
        scissors: { damage: 1, heal: 0, stareBonus: 0 },
        paper: { damage: 1, heal: 0, stareBonus: 0 },
      },
    });

    expect(handProbabilities(withHands, 'normal')).toEqual(handProbabilities(withoutHands, 'normal'));
    expect(handProbabilities(withHands, 'desperate')).toEqual(handProbabilities(withoutHands, 'desperate'));
  });

  // `enemyPhase` は `enemyHp` / `enemyMaxHp` の2引数しか取らず、`EnemyDef` を受け取らない。
  // 「hands の有無がフェーズ判定に影響しない」ことは型のうえで自明なので、テストは置かない
  // （同じ引数どうしを比べるだけの、何も検証しないテストになる）。
});

describe('EnemyDef.hint の削除（ADR 0004）', () => {
  it('src/data/enemies.ts（STAGES）のどの敵も hint プロパティを持たない', () => {
    for (const enemy of STAGES) {
      expect('hint' in enemy).toBe(false);
    }
  });
});
