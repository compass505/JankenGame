# 詳細設計

> ステータス: **確定**（2026-08-09）。
> **この文書は「読んで実装できる」粒度で書く。** `/test` はここからテストを書き、
> `/impl` は Codex がここだけを見て実装する。曖昧な箇所を残さない。

前提: `docs/01_requirements.md`（要件）、`docs/adr/0001-battle-model.md`（戦闘方式）、
`docs/02_architecture.md`（モジュール構成）。

## 0. 実装前に知っておく環境の落とし穴

| 落とし穴 | 対処 |
| --- | --- |
| `verbatimModuleSyntax: true` | 型だけの import は必ず `import type { Hand } from '@/domain/hand'` |
| `noUncheckedIndexedAccess: true` | **配列アクセスは `T \| undefined`**。`STAGES[i]` は必ず未定義チェックを通す。`Record<Hand, T>` はリテラル union キーなので `undefined` にならない |
| `noUnusedParameters: true` | 使わない引数を残さない |
| `src/data/` の制約 | `function` / `=>` / `if (` / `for (` / `switch (` が**レイヤチェッカで禁止**。リテラルと `import type` と `satisfies` だけで書く |
| `domain/` は `data/` を import しない | 数値はすべて引数で受け取る |

---

## 1. `src/domain/hand.ts`

```ts
export type Hand = 'rock' | 'scissors' | 'paper';
export type Outcome = 'win' | 'lose' | 'draw';

/** 抽選と表示の順序。この順序は固定する（乱数の再現性が依存する） */
export const HANDS: readonly Hand[] = ['rock', 'scissors', 'paper'];

/** プレイヤー視点の勝敗。グー>チョキ>パー>グー */
export function judge(player: Hand, enemy: Hand): Outcome;
```

**不変条件**

- `judge(a, a) === 'draw'`
- `judge(a, b) === 'win'` ⟺ `judge(b, a) === 'lose'`
- 9通りすべてが `win` 3 / `lose` 3 / `draw` 3 に分かれる

**具体例**: `judge('rock', 'scissors') === 'win'`、`judge('paper', 'scissors') === 'lose'`

---

## 2. `src/domain/handTable.ts`

```ts
import type { Hand } from '@/domain/hand';

export interface HandValue {
  /** 基礎ダメージ。耐性の倍率が掛かるのはここだけ */
  readonly damage: number;
  /** 勝った側が自分に回復する量 */
  readonly heal: number;
  /** にらみ1あたりの追加ダメージ。耐性は掛からない */
  readonly stareBonus: number;
}

export type HandTable = Readonly<Record<Hand, HandValue>>;
export type UpgradeCounts = Readonly<Record<Hand, number>>;

export const UPGRADE_MAX_PER_HAND = 2;
export const NO_UPGRADES: UpgradeCounts; // { rock: 0, scissors: 0, paper: 0 }

/** 上限に達していなければ true */
export function canUpgrade(counts: UpgradeCounts, hand: Hand): boolean;

/** 上限に達していたら counts をそのまま返す（例外を投げない） */
export function applyUpgrade(counts: UpgradeCounts, hand: Hand): UpgradeCounts;

/** 強化は damage にのみ加算する。heal と stareBonus は動かさない */
export function buildHandTable(base: HandTable, counts: UpgradeCounts): HandTable;
```

**不変条件**

- `0 <= counts[hand] <= UPGRADE_MAX_PER_HAND`
- `buildHandTable(base, counts)[h].damage === base[h].damage + counts[h]`
- `buildHandTable(base, counts)[h].heal === base[h].heal`（**回復は絶対に強化されない**。
  強化されると終了保証が壊れる。`docs/01_requirements.md`）
- `buildHandTable(base, NO_UPGRADES)` は `base` と同じ値

**具体例**: `base.rock = { damage: 3, heal: 0, stareBonus: 2 }` に `counts.rock = 1` を渡すと
`{ damage: 4, heal: 0, stareBonus: 2 }`。

---

## 3. `src/domain/enemy.ts`

```ts
import type { Hand } from '@/domain/hand';
import type { Rng } from '@/lib/rng';

export type DrawRule = 'standard' | 'stareDouble';
export type EnemyPhase = 'normal' | 'desperate';
export type HandWeights = Readonly<Record<Hand, number>>;

export interface EnemyDef {
  readonly id: string;
  readonly name: string;
  readonly maxHp: number;
  /** HPが半分より上のときの重み */
  readonly weightsNormal: HandWeights;
  /** HPが半分以下のときの重み */
  readonly weightsDesperate: HandWeights;
  /** プレイヤーの与ダメージ倍率。等倍は 1。3手すべてのキーを必ず持つ */
  readonly resistance: Readonly<Record<Hand, number>>;
  readonly drawRule: DrawRule;
  /** 画面に出す偏りの説明。読み合いの材料は公開情報にする */
  readonly hint: string;
}

/** 一様分布を混ぜる割合。各手の確率が必ず 0.1 以上になる */
export const UNIFORM_MIX = 0.3;

export function enemyPhase(enemyHp: number, enemyMaxHp: number): EnemyPhase;
export function handProbabilities(enemy: EnemyDef, phase: EnemyPhase): Readonly<Record<Hand, number>>;
export function decideEnemyHand(enemy: EnemyDef, enemyHp: number, enemyMaxHp: number, rng: Rng): Hand;
```

### `enemyPhase`

```
enemyHp * 2 <= enemyMaxHp  →  'desperate'
それ以外                    →  'normal'
```

**フェーズの切り替え条件はこれ1つだけ**（`docs/01_requirements.md`）。
にらみはフェーズに影響しない。

### `handProbabilities`

```
total = w.rock + w.scissors + w.paper
total <= 0 なら 3手とも 1/3 を返す（データ不備の保険。例外は投げない）

norm[h] = w[h] / total
p[h]    = (1 - UNIFORM_MIX) * norm[h] + UNIFORM_MIX / 3
```

**不変条件**

- `p.rock + p.scissors + p.paper === 1`（浮動小数の誤差を除く）
- **すべての手で `p[h] >= 0.1`**。`UNIFORM_MIX / 3 = 0.1` が下限になる
- 重みの大小関係は保たれる（`w[a] > w[b]` なら `p[a] > p[b]`）

**具体例**: `w = { rock: 0.6, scissors: 0.2, paper: 0.2 }` →
`p = { rock: 0.52, scissors: 0.24, paper: 0.24 }`

### `decideEnemyHand`

```
p = handProbabilities(enemy, enemyPhase(enemyHp, enemyMaxHp))
r = rng.next()                      ← rng は「ちょうど1回」呼ぶ
acc = 0
HANDS の順（rock, scissors, paper）に:
    acc += p[hand]
    r < acc なら hand を返す
どれにも当たらなければ HANDS の最後（paper）を返す ← 浮動小数の誤差対策
```

**不変条件**

- **`rng.next()` の呼び出しはちょうど1回。** 増やすとシード再現テストが壊れる
- **プレイヤーの手を引数に取らない。** 後出しを構造的に不可能にする
- 履歴を引数に取らない（`docs/01_requirements.md`）

---

## 4. `src/domain/battle.ts`

```ts
import type { Hand, Outcome } from '@/domain/hand';
import type { HandTable } from '@/domain/handTable';
import type { DrawRule, EnemyDef } from '@/domain/enemy';
import type { Rng } from '@/lib/rng';

export const STARE_MAX = 2;
/** にらみが上限のときのあいこで、双方が受けるダメージ */
export const STARE_MAX_DRAW_DAMAGE = 1;
export const STARE_GAIN: Readonly<Record<DrawRule, number>> = { standard: 1, stareDouble: 2 };

export interface BattleState {
  readonly playerHp: number;
  readonly playerMaxHp: number;
  readonly enemyHp: number;
  readonly enemyMaxHp: number;
  readonly stare: number;
  readonly turn: number;
  readonly outcome: 'playerWin' | 'playerLose' | null;
}

export interface TurnLog {
  readonly playerHand: Hand;
  readonly enemyHand: Hand;
  readonly outcome: Outcome;      // プレイヤー視点
  readonly damageToEnemy: number;
  readonly damageToPlayer: number;
  readonly healToPlayer: number;
  readonly healToEnemy: number;
  readonly stareBefore: number;
  readonly stareAfter: number;
}

export interface TurnResult {
  readonly state: BattleState;
  readonly log: TurnLog;
}

export interface BattleContext {
  /** 強化を適用したあとのプレイヤーの手 */
  readonly playerHands: HandTable;
  /** 敵の手。強化は乗らない */
  readonly enemyHands: HandTable;
  readonly enemy: EnemyDef;
}

export function createBattle(playerMaxHp: number, enemy: EnemyDef): BattleState;

export function resolveTurn(
  state: BattleState,
  playerHand: Hand,
  ctx: BattleContext,
  rng: Rng,
): TurnResult;
```

### `createBattle`

```
{
  playerHp: playerMaxHp, playerMaxHp,
  enemyHp: enemy.maxHp,  enemyMaxHp: enemy.maxHp,
  stare: 0, turn: 0, outcome: null,
}
```

### `resolveTurn` の処理順序

**要件の6段階（`docs/01_requirements.md`）をそのまま実装する。順序を変えない。**

**0. 決着済みなら何もしない**

`state.outcome !== null` なら `rng` を呼ばずに `state` をそのまま返す
（`log` はダミーではなく、`playerHand` と `enemyHand: playerHand`、
`outcome: 'draw'`、数値はすべて 0、`stareBefore/After` は現在値で埋める）。
**呼ばれても壊れない**ことを保証するための保険であり、通常は `application` が呼ばない。

**1〜2. 手を決める**

```
enemyHand = decideEnemyHand(ctx.enemy, state.enemyHp, state.enemyMaxHp, rng)
```

**3. 勝敗**

```
outcome = judge(playerHand, enemyHand)
```

**4. あいこのとき**

```
outcome === 'draw':
  state.stare >= STARE_MAX の場合:
      damageToPlayer = STARE_MAX_DRAW_DAMAGE   // 1
      damageToEnemy  = STARE_MAX_DRAW_DAMAGE   // 1
      stareAfter = STARE_MAX
  それ以外:
      damageToPlayer = 0, damageToEnemy = 0
      stareAfter = min(STARE_MAX, state.stare + STARE_GAIN[enemy.drawRule])
  healToPlayer = 0, healToEnemy = 0
```

**5. 決着したとき**

勝者の手の値だけを使う。`stareAfter = 0`。

```
プレイヤーが勝った場合（v = ctx.playerHands[playerHand]、耐性は敵が持つ）
    base   = max(1, floor(v.damage * ctx.enemy.resistance[playerHand]))
    dealt  = base + state.stare * v.stareBonus
    damageToEnemy  = dealt
    healToPlayer   = clamp(min(v.heal, dealt - 1, state.playerMaxHp - state.playerHp), 0)
    damageToPlayer = 0, healToEnemy = 0

敵が勝った場合（v = ctx.enemyHands[enemyHand]、プレイヤーは耐性を持たない）
    dealt  = v.damage + state.stare * v.stareBonus
    damageToPlayer = dealt
    healToEnemy    = clamp(min(v.heal, dealt - 1, state.enemyMaxHp - state.enemyHp), 0)
    damageToEnemy  = 0, healToPlayer = 0
```

> **`dealt - 1` を必ず挟むこと。** これが**戦闘の終了保証**そのもの。
> パーは「4ダメージ＋3回復」なので通常は `min(3, 3)` で 3 のまま変わらないが、
> **耐性でダメージが下がったときに回復が上回ると、HP総和が増えて戦闘が終わらなくなる。**
> 例: パーに耐性 0.5 の敵なら `dealt = 2`、`dealt - 1 = 1` に抑えられ、総和は 1 減る。
> 詳しくは `docs/00_research.md` 節9.7（初版で実際に踏んだ穴）。

**6. HPの更新と決着判定**

```
playerHp = clamp(state.playerHp - damageToPlayer + healToPlayer, 0, state.playerMaxHp)
enemyHp  = clamp(state.enemyHp  - damageToEnemy  + healToEnemy,  0, state.enemyMaxHp)

playerHp <= 0 && enemyHp <= 0  →  outcome = 'playerLose'   // 引き分けは作らない
playerHp <= 0                  →  outcome = 'playerLose'
enemyHp  <= 0                  →  outcome = 'playerWin'
それ以外                        →  outcome = null

turn = state.turn + 1
```

### 不変条件（テストで縛るもの）

1. `0 <= playerHp <= playerMaxHp`、`0 <= enemyHp <= enemyMaxHp`。**HPは負にならない**
2. `0 <= stare <= STARE_MAX`
3. `turn` は毎回ちょうど +1
4. **決着したターンでは `playerHp + enemyHp` が必ず1以上減る**
5. **にらみが上限のあいこでも `playerHp + enemyHp` が2減る**
6. あいこでにらみが上限未満のときは HP が動かない（`stare` だけ増える）
7. 引数の `state` を書き換えない。必ず新しいオブジェクトを返す
8. **連続してあいこになりうる最大ターン数は `STARE_MAX`（2）。** 3ターン目のあいこでは
   必ずHPが減る。したがって**あいこだけで無限に続く実行列は存在しない**

> 4・5・8 を合わせると、**HP総和が高々3ターンに1回は必ず減る**ため、
> どの入力・どの乱数列でも戦闘は有限ターンで終わる。
> `tests/scenario/` の「あいこが連続しても進行する」はここを検証する。

### 具体例（テストにそのまま使える）

**例1: にらみを乗せてグーで勝つ**

```
state = { playerHp:15, playerMaxHp:15, enemyHp:12, enemyMaxHp:12, stare:2, turn:5, outcome:null }
playerHand = 'rock'、敵の手 = 'scissors'（耐性はすべて 1）
playerHands.rock = { damage:3, heal:0, stareBonus:2 }

→ base = max(1, floor(3 * 1)) = 3
→ dealt = 3 + 2 * 2 = 7
→ enemyHp = 12 - 7 = 5、stareAfter = 0、turn = 6、outcome = null
```

**例2: パーで勝つ（削られている）**

```
state.playerHp = 10 / max 15、playerHands.paper = { damage:4, heal:3, stareBonus:0 }、耐性 1
→ dealt = 4、healToPlayer = min(3, 4-1, 15-10) = 3
→ playerHp = 13、enemyHp -= 4  … HP総和は 1 減る
```

**例3: パーで勝つ（耐性 0.5 の敵）**

```
enemy.resistance.paper = 0.5
→ base = max(1, floor(4 * 0.5)) = 2、dealt = 2
→ healToPlayer = min(3, 2-1, ...) = 1
→ HP総和は 1 減る（ここで dealt-1 を外すと +1 になり、戦闘が終わらなくなる）
```

**例4: にらみが上限のあいこ**

```
state.stare = 2、両者が 'paper'
→ damageToPlayer = 1、damageToEnemy = 1、stareAfter = 2
→ HP総和は 2 減る
```

**例5: 同時に0以下**

```
playerHp = 1、enemyHp = 1、stare = 2、あいこ
→ 双方 0 → outcome = 'playerLose'（引き分けは作らない）
```

---

## 5. `src/application/game.ts`

```ts
import type { Hand } from '@/domain/hand';
import type { UpgradeCounts, HandTable } from '@/domain/handTable';
import type { BattleState, TurnLog } from '@/domain/battle';
import type { EnemyDef } from '@/domain/enemy';
import type { Rng } from '@/lib/rng';

export type Phase = 'title' | 'battle' | 'upgrade' | 'result';

export interface GameState {
  readonly phase: Phase;
  readonly stageIndex: number;
  readonly upgrades: UpgradeCounts;
  readonly battle: BattleState | null;
  readonly lastLog: TurnLog | null;
  readonly cleared: boolean;
}

export const PLAYER_MAX_HP = 15;

export function createGame(): GameState;
export function startGame(state: GameState): GameState;
export function playHand(state: GameState, hand: Hand, rng: Rng): GameState;
export function chooseUpgrade(state: GameState, hand: Hand): GameState;
export function backToTitle(state: GameState): GameState;

/** 表示用。stageIndex が範囲外なら null */
export function currentEnemy(state: GameState): EnemyDef | null;
/** 表示用。強化を適用した後のプレイヤーの手 */
export function playerHandTable(state: GameState): HandTable;
```

### 各関数の挙動

| 関数 | 前提 | やること |
| --- | --- | --- |
| `createGame` | — | `{ phase:'title', stageIndex:0, upgrades:NO_UPGRADES, battle:null, lastLog:null, cleared:false }` |
| `startGame` | `phase === 'title'` | `stageIndex = 0`、`createBattle(PLAYER_MAX_HP, STAGES[0])`、`phase = 'battle'` |
| `playHand` | `phase === 'battle'` かつ `battle !== null` | `resolveTurn` を呼び、結果で分岐（下記） |
| `chooseUpgrade` | `phase === 'upgrade'` かつ `canUpgrade` | 強化を足し、`stageIndex + 1` の敵で `createBattle`、`phase = 'battle'` |
| `backToTitle` | どこからでも | `createGame()` と同じ値を返す（**強化もHPも全部リセット**） |

**前提を満たさない呼び出しでは、例外を投げず `state` をそのまま返す。**
UI のボタン制御が漏れても壊れないようにする。

### `playHand` の分岐

```
result = resolveTurn(state.battle, hand, ctx, rng)
lastLog = result.log

result.state.outcome === null       → phase 'battle' のまま
result.state.outcome === 'playerWin'
    stageIndex === STAGES.length-1  → phase 'result'、cleared = true
    それ以外                         → phase 'upgrade'
result.state.outcome === 'playerLose' → phase 'result'、cleared = false
```

`battle` は**どの分岐でも `result.state` に差し替える**（結果画面で最終HPを表示するため）。

### `ctx` の組み立て

```
ctx = {
  playerHands: buildHandTable(BASE_HANDS, state.upgrades),
  enemyHands:  BASE_HANDS,          // 敵は強化されない
  enemy:       STAGES[state.stageIndex],
}
```

`STAGES[i]` は `noUncheckedIndexedAccess` により `EnemyDef | undefined`。
**未定義なら `state` をそのまま返す**（進行不能な状態を作らない）。

### 不変条件

- `phase === 'battle'` ⟺ `battle !== null && battle.outcome === null`
  （例外: `phase === 'result'` のときも `battle` は最後の状態を保持する）
- `0 <= stageIndex < STAGES.length`
- `upgrades` の各値は `0..UPGRADE_MAX_PER_HAND`
- 強化のチャンスは4回、枠は6つなので、**`upgrade` で選べる手が0になることはない**

---

## 6. `src/data/`

**リテラルだけで書く。** 関数・アロー・分岐を書かない（レイヤチェッカが落とす）。

### `src/data/hands.ts`

```ts
import type { HandTable } from '@/domain/handTable';

export const BASE_HANDS: HandTable = {
  rock:     { damage: 3, heal: 0, stareBonus: 2 },
  scissors: { damage: 6, heal: 0, stareBonus: 0 },
  paper:    { damage: 4, heal: 3, stareBonus: 0 },
};
```

### `src/data/enemies.ts`

**ここの数値は `/balance` で動かす出発点。** ロジックは数値に依存しない。

| # | id | 名前 | HP | normal（グー/チョキ/パー） | desperate | 耐性 | あいこ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `scarecrow` | かかし | 12 | .34 / .33 / .33 | 同じ | なし | standard |
| 2 | `rockGuard` | 岩の番人 | 14 | **.60** / .20 / .20 | .50 / .25 / .25 | なし | standard |
| 3 | `shearBird` | はさみ鳥 | 14 | .20 / **.60** / .20 | .25 / .50 / .25 | なし | standard |
| 4 | `paperEnvoy` | 紙の使者 | 16 | .20 / .20 / **.60** | .25 / .25 / .50 | チョキ ×0.5 | standard |
| 5 | `glicoKing` | グリコ王 | 18 | .30 / .30 / .40 | .40 / .20 / .40 | チョキ ×0.5 | **stareDouble** |

`resistance` は**3手すべてのキーを必ず書く**（等倍は `1`）。
`hint` は偏りと耐性を1行で書く（例: 「グーを好む」「チョキが効きにくい／にらみが速く溜まる」）。

**5体目に「グー耐性 × にらみ+2」を作らない。** にらみが速く溜まるのにグーが半減し、
主機構が罠になる（`docs/00_research.md` 節9.5）。チョキ耐性にしてある。

### `src/data/stages.ts`

```ts
import type { EnemyDef } from '@/domain/enemy';
import { ENEMIES } from '@/data/enemies';

/** 一本道。将来ここをグラフに差し替えれば分岐マップにできる */
export const STAGES: readonly EnemyDef[] = [
  ENEMIES.scarecrow, ENEMIES.rockGuard, ENEMIES.shearBird, ENEMIES.paperEnvoy, ENEMIES.glicoKing,
];
```

---

## 7. `src/ui/`

**ここ以外で DOM を触らない。** テストは書かない（`docs/04_test-plan.md`）。

| ファイル | 責務 |
| --- | --- |
| `ui/app.ts` | `GameState` を1つ保持。入力 → `application` の関数 → 新しい state → 再描画 |
| `ui/screens/title.ts` | タイトルと「はじめる」 |
| `ui/screens/battle.ts` | 敵・双方のHP・**にらみ**・敵のヒント・直前の結果・3ボタン |
| `ui/screens/upgrade.ts` | 3択。上限の手は `disabled` で**表示は残す** |
| `ui/screens/result.ts` | クリア / ゲームオーバー、タイトルへ戻る |
| `ui/components/` | HPバー、にらみ表示、手のボタン |

### にらみの表示は最優先

**「にらみ」が伝わらないと、このゲームはただの運ゲーに見える**（`docs/00_research.md` 節9.8）。

- 現在値を**画面の中央付近に大きく**出す（0 / 1 / 2）
- **増えた瞬間が分かる**こと（色か大きさの変化。アニメーションは作り込まない）
- グーのボタンに、いま出したら何ダメージかを出す（`3 + にらみ×2`）

### `src/main.ts`

```ts
const rng = createRng(Date.now() >>> 0);
```

**`Date.now()` を使ってよいのはここだけ**（`domain` / `application` では禁止）。

---

## 8. 実装の順番

依存の順に作る。**1つ作るごとに `npm run check` を通す。**

1. `domain/hand.ts`
2. `domain/handTable.ts`
3. `domain/enemy.ts`
4. `domain/battle.ts` ← ここが本体
5. `data/hands.ts` → `data/enemies.ts` → `data/stages.ts`
6. `application/game.ts`
7. `ui/` 一式

**1〜4 が終わった時点で `tests/unit/` が全部通る**状態になっているのが目安。
