# 詳細設計

> ステータス: **確定**（2026-08-09）。
> **2026-08-10 追記**: 連打の罰を追加し、その後**方式を「熱」から「直近4手の窓」に変えた**
> （節2.5・節5）。`docs/adr/0002-hand-heat.md` → `docs/adr/0003-repetition-window.md`。
> あわせて強化の行き先を手ごとに変え（節2）、本気フェーズの強化を足した（節3・節5）。
> **2026-08-11 追記**: **敵ごとに値表を持てるようにした**（節3・節5・節6・節7）。
> `docs/adr/0004-enemy-hand-table.md`。敵の個性が「偏り・耐性・HP・本気強化」の
> 数値違いしか無く、仕掛けの種類が1つしかなかったため。**`hint` は落とした。**
> **`domain/battle.ts` と `BattleState` は変更しない。**
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

/** 強化1回がどこに乗るか。手ごとに違う（`docs/adr/0003-repetition-window.md`） */
export type UpgradeTargets = Readonly<Record<Hand, 'damage' | 'stareBonus'>>;

/** 強化を targets の指す側にだけ加算する。**heal は絶対に動かさない** */
export function buildHandTableWith(
  base: HandTable,
  counts: UpgradeCounts,
  targets: UpgradeTargets,
): HandTable;
```

> **`domain` に「グーはにらみが伸びる」と直書きしない。**
> どの手がどこに乗るかは `src/data/hands.ts` の `UPGRADE_TARGETS` から渡す
> （`CLAUDE.md` のレイヤ規約。`/balance` で行き先そのものを動かせる）。

**不変条件**

- `0 <= counts[hand] <= UPGRADE_MAX_PER_HAND`
- `targets[h] === 'damage'` なら `damage` が `counts[h]` だけ増え、`stareBonus` は動かない
- `targets[h] === 'stareBonus'` なら `stareBonus` が `counts[h]` だけ増え、`damage` は動かない
- **`heal` はどちらの場合も動かない**（強化されると終了保証が壊れる。`docs/01_requirements.md`）
- `buildHandTableWith(base, NO_UPGRADES, targets)` は `base` と同じ値

**具体例**

```
base.rock = { damage: 3, heal: 0, stareBonus: 4 }、targets.rock = 'stareBonus'
  counts.rock = 1 → { damage: 3, heal: 0, stareBonus: 5 }

base.paper = { damage: 3, heal: 3, stareBonus: 0 }、targets.paper = 'damage'
  counts.paper = 1 → { damage: 4, heal: 3, stareBonus: 0 }
```

> **パーの強化は回復も解禁する。** `heal` は 3 のままだが、
> 実際の回復は「与ダメージ − 1」で頭打ちになる（節4）。
> 打点3のときは 2 止まりで、**1回強化して打点4になって初めて 3 が出る。**

---

## 2.5. 連打の罰（`src/domain/handTable.ts` に同居）

`docs/adr/0003-repetition-window.md`。**同じ手ばかり出すと威力が下がる。散らせば下がらない。**

```ts
import type { Hand } from '@/domain/hand';

/** 直近に出した手。新しいほど後ろ。長さは rule.window - 1 で頭打ち */
export type HeatCounts = readonly Hand[];

export interface HeatRule {
  /** 数える窓の広さ（今回の手を含む） */
  readonly window: number;
  /** 窓の中で何回までなら罰なしか */
  readonly allowed: number;
  /** 弱化の上限。窓を広げたときに深くなりすぎないための蓋 */
  readonly maxPenalty: number;
}

export const NO_HEAT: HeatCounts; // []

/** その手を「いま出したら」何段弱化するか。**段数の式はここだけに置く** */
export function heatPenalty(history: HeatCounts, hand: Hand, rule: HeatRule): number;

/** 弱化を damage にだけ適用した表を返す */
export function applyHeat(base: HandTable, history: HeatCounts, rule: HeatRule): HandTable;

/** ターン終わりの更新。履歴に1手足し、窓からはみ出した古い手を捨てる */
export function advanceHeat(history: HeatCounts, used: Hand, rule: HeatRule): HeatCounts;
```

> **型と関数の名前は `heat` のまま残してある。** 改名のコストが3日の規模に見合わないため
> （ADR 0003）。**ただし「溜まって冷める」という説明はもう正しくない。**
> 中身は「直近の履歴を数えるだけ」で、状態は履歴の配列1つ。
> **画面の表示は「連打 -N」にする**（節7）。

### `heatPenalty`

```
count = 1                       ← 今回出す1手を数に入れる
history の中で hand と同じものを数えて count に足す
penalty = min(rule.maxPenalty, max(0, count - rule.allowed))
```

### `applyHeat`

```
各手 h について:
    damage = max(1, base[h].damage - heatPenalty(history, h, rule))
heal と stareBonus は動かさない
```

**段数の式を書き写さない。** `application` の `heatPenalties`（節5）も必ず `heatPenalty` を呼ぶ
（節4 の `dealtDamage` と同じ理由）。

### `advanceHeat`

```
next = [...history, used]
末尾から rule.window - 1 個だけ残す
```

**`window - 1` を残す理由。** `heatPenalty` が「今回の手」を自分で1つ数えるので、
履歴側は残り `window - 1` 手ぶんを覚えていればよい。

**不変条件**

- `applyHeat(base, NO_HEAT, rule)` は `base` と同じ値
- `applyHeat` は `heal` と `stareBonus` を変えない（**強化と同じく damage にしか触らない**）
- `damage` は 1 未満にならない
- 弱化量は `rule.maxPenalty` を超えない
- `advanceHeat` は引数を書き換えず、新しい配列を返す
- `advanceHeat` の結果の長さは `rule.window - 1` 以下

### 具体例（`rule = { window: 4, allowed: 2, maxPenalty: 3 }`）

出した順に見ていったときの弱化。**均等回しと2連続は罰なし、3連続から付く。**

| 出し方 | 各ターンの弱化 |
| --- | --- |
| 均等に回す グチパグチパグ | 0 0 0 0 0 0 0 |
| 2連続を挟む ググチパググチ | 0 0 0 0 0 0 0 |
| 3連続 ググ**グ**チパグ | 0 0 **-1** 0 0 0 |
| 同じ手だけ ググ**ググググ** | 0 0 **-1 -2 -2 -2** |
| 2手交互 グチグチグチ | 0 0 0 0 0 0 |

**2手交互に罰が付かないのは承知のうえ。** ADR 0002 は「連続型」を
「2手交互で素通りできる」として却下したが、本方式では**実測で機械的パターンの最良が
9.9%** に留まり（貪欲プレイは 33.5%）、素通りにはなっていない。

### 熱・強化・耐性・にらみの適用順序

**この順序を変えるとバランスの実測値と合わなくなる。**

```
1. 強化を足す      buildHandTableWith(BASE_HANDS, upgrades, UPGRADE_TARGETS)
2. 弱化を引く      applyHeat(表, 履歴, rule)                  … damage −penalty、最低1
3. 耐性を掛ける    max(1, floor(damage × resistance))         … dealtDamage が行う
4. にらみを足す    + stare × stareBonus                       … 耐性も弱化も掛からない
```

1と2は `application` が組み立て、3と4は `resolveTurn`（`dealtDamage`）が行う。
**`domain/battle.ts` は変更しない。**

## 3. `src/domain/enemy.ts`

```ts
import type { Hand } from '@/domain/hand';
import type { HandTable } from '@/domain/handTable';
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
  /** 本気（desperate）のとき、敵の全手のダメージに足す量。0 なら強化なし */
  readonly desperateBonus: number;
  readonly drawRule: DrawRule;
  /** この敵だけの値表。**省略すると `BASE_HANDS`**（プレイヤーと同じ値）を使う
   *  （`docs/adr/0004-enemy-hand-table.md`）。強化は乗らない */
  readonly hands?: HandTable;
}

/** 一様分布を混ぜる割合。各手の確率が必ず 0.1 以上になる */
export const UNIFORM_MIX = 0.3;

export function enemyPhase(enemyHp: number, enemyMaxHp: number): EnemyPhase;
export function handProbabilities(enemy: EnemyDef, phase: EnemyPhase): Readonly<Record<Hand, number>>;
export function decideEnemyHand(enemy: EnemyDef, enemyHp: number, enemyMaxHp: number, rng: Rng): Hand;

/**
 * 敵の値表を組み立てる。**唯一の出どころ**（`docs/adr/0004-enemy-hand-table.md`）。
 * `base` は既定の値表。**`domain` は `data` を知らないので引数で受け取る。**
 */
export function buildEnemyHandTable(
  base: HandTable,
  enemy: EnemyDef,
  history: HeatCounts,
  rule: HeatRule,
  phase: EnemyPhase,
): HandTable;
```

> **`application` ではなく `domain` に置く理由。** ここは分岐を3つ持つロジックであり、
> **`application` に置くと `STAGES`（＝`src/data/`）越しにしか呼べず、
> 「`enemy.hands` が使われること」をテストできない。**
> 数値を引数で受け取る形にすれば、任意の `EnemyDef` を渡して確かめられ、
> `/balance` で `src/data/` を書き換えてもテストは1本も壊れない
> （`docs/02_architecture.md`「なぜ domain が data を import しないのか」）。
>
> **`/test` で実際にこの穴が見つかった。** 当初は `application` の非公開関数として
> 設計していたが、テストから任意の敵を注入する経路が無く、
> `?? base` 側しか検証できなかったため、ここへ移した。

### `enemyPhase`

```
enemyHp * 2 <= enemyMaxHp  →  'desperate'
それ以外                    →  'normal'
```

**フェーズの切り替え条件はこれ1つだけ**（`docs/01_requirements.md`）。
にらみはフェーズに影響しない。

**`desperate` では敵の全手のダメージに `desperateBonus` を足す**
（`docs/adr/0003-repetition-window.md`）。**掛けるのは `application`**（節5）で、
`domain/enemy.ts` は値を持つだけ。**条件はフェーズ判定と同じ1つのまま**で増やさない。

### `buildEnemyHandTable`

```
表 = enemy.hands ?? base                     ← 敵ごとの値表を選ぶのはここだけ
表 = applyHeat(表, history, rule)            ← damage −弱化、最低1
phase === 'desperate' かつ enemy.desperateBonus > 0 なら
    3手それぞれの damage に enemy.desperateBonus を足す
heal と stareBonus は最後まで動かさない
```

**段の順序を変えない。** 弱化と本気強化は、どの値表の上にも同じように乗る。

**不変条件**

- `enemy.hands` を省略した敵では、`base` をそのまま使ったのと同じ結果になる
- `phase === 'normal'` では `desperateBonus` は乗らない
- **`heal` と `stareBonus` は入力の表のまま**（弱化も本気強化も `damage` にしか触らない）
- `damage` は 1 未満にならない（`applyHeat` の規則）
- 引数を書き換えず、新しい表を返す
- **`rng` を受け取らない。** 値表の組み立てに乱数は関わらない

### `handProbabilities`

```
w[h]  = Math.max(0, weights[h])     ← 負の重みは 0 として扱う
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
for (const hand of HANDS)  ← 添字アクセスを使わない（後述）
    acc += p[hand]
    r < acc なら hand を返す
ループを抜けたら 'paper' を返す      ← 浮動小数の誤差対策
```

> **`HANDS[HANDS.length - 1]` と書かないこと。** `noUncheckedIndexedAccess` により
> 配列の添字アクセスは `Hand | undefined` になり、そのまま返すと型エラーになる。
> `for...of` なら要素は `Hand` 型になり、最後の `return 'paper'` はリテラルなので問題ない
> （`HANDS` の順序は固定と定めてあるので、ここを直書きしてよい）。

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

/**
 * 勝った側が実際に与えるダメージ。
 * 耐性は `damage` にだけ掛かり、**にらみのぶんには掛からない**。
 * 耐性を持たない側（プレイヤーが受ける側）は `resistance` に 1 を渡す。
 */
export function dealtDamage(value: HandValue, resistance: number, stare: number): number;

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
    dealt  = dealtDamage(v, ctx.enemy.resistance[playerHand], state.stare)
    damageToEnemy  = dealt
    healToPlayer   = Math.max(0, Math.min(v.heal, dealt - 1, state.playerMaxHp - state.playerHp))
    damageToPlayer = 0, healToEnemy = 0

敵が勝った場合（v = ctx.enemyHands[enemyHand]、プレイヤーは耐性を持たない）
    dealt  = dealtDamage(v, 1, state.stare)
    damageToPlayer = dealt
    healToEnemy    = Math.max(0, Math.min(v.heal, dealt - 1, state.enemyMaxHp - state.enemyHp))
    damageToEnemy  = 0, healToPlayer = 0
```

`dealtDamage` の中身はこれだけ。

```
Math.max(1, Math.floor(value.damage * resistance)) + stare * value.stareBonus
```

**`clamp` のような汎用ヘルパは作らない。** `Math.max` / `Math.min` / `Math.floor` を直接書く。

> **`dealtDamage` だけを関数に切り出す理由。** ここは**画面にも出る値**であり、
> `resolveTurn` と UI が同じ式を別々に持っていた結果、
> **耐性0.5の敵に対してボタンが「6ダメージ」と表示して実際は3しか入らない**状態になっていた
> （2026-08-10・実測で 4,523 ターン中 426 件のずれを検出）。
> 式が2箇所にあると必ずずれるので、**唯一の出どころをここに置く。**
> `application` の `damagePreview` もこの関数を通す（節5）。

> **`dealt - 1` を必ず挟むこと。** これが**戦闘の終了保証**そのもの。
> パーは「4ダメージ＋3回復」なので通常は `min(3, 3)` で 3 のまま変わらないが、
> **耐性でダメージが下がったときに回復が上回ると、HP総和が増えて戦闘が終わらなくなる。**
> 例: パーに耐性 0.5 の敵なら `dealt = 2`、`dealt - 1 = 1` に抑えられ、総和は 1 減る。
> 詳しくは `docs/00_research.md` 節9.7（初版で実際に踏んだ穴）。

**6. HPの更新と決着判定**

```
playerHp = Math.min(state.playerMaxHp, Math.max(0, state.playerHp - damageToPlayer + healToPlayer))
enemyHp  = Math.min(state.enemyMaxHp,  Math.max(0, state.enemyHp  - damageToEnemy  + healToEnemy))

playerHp <= 0 && enemyHp <= 0  →  outcome = 'playerLose'   // 引き分けは作らない
playerHp <= 0                  →  outcome = 'playerLose'
enemyHp  <= 0                  →  outcome = 'playerWin'
それ以外                        →  outcome = null

turn = state.turn + 1
```

### 入力の前提（契約）

**`domain/` は渡された値を検証しない。** 次を満たす値だけが渡される前提で書き、
守るのは呼び出し側（`application/` と `data/`）。テストもこの範囲だけを対象にする。

- `playerMaxHp` / `enemyMaxHp` は **1以上の整数**
- `HandValue.damage` は **1以上の整数**、`heal` と `stareBonus` は **0以上の整数**
- `resistance` は **0 より大きい有限の数**
- `HandWeights` は **0以上の有限の数**（負なら 0 として扱う）
- `STAGES` は**空でない**
- `resolveTurn` に渡す `state` は `createBattle` が作ったか、`resolveTurn` が返したもの

### 不変条件（テストで縛るもの）

**以下はすべて「`state.outcome === null`（未決着）の state に `resolveTurn` を呼んだとき」に成り立つ。**
決着済みの state を渡した場合は手順0のとおり**何もしない**（`turn` も増えず、同じ state を返す）。

1. `0 <= playerHp <= playerMaxHp`、`0 <= enemyHp <= enemyMaxHp`。**HPは負にならない**
2. `0 <= stare <= STARE_MAX`
3. `turn` はちょうど +1
4. **`playerHp + enemyHp` が増えるのは、相手を倒したターンだけ。**
   相手が生き残るなら必ず1以上減る（あいこでにらみが上限未満のときだけ据え置き）
5. にらみが上限のあいこでは `playerHp + enemyHp` がちょうど2減る
6. あいこでにらみが上限未満のときは HP が動かない（`stare` だけ増える）
7. 引数の `state` を書き換えない。新しいオブジェクトを返す
8. **HPが減らないターンが連続するのは、`standard` で高々2回、`stareDouble` で高々1回。**
   にらみが上限に達した後のあいこは必ず双方1ダメージになるため

> **4 の「倒したターンだけ増えうる」について。** 回復は `dealt - 1` で抑えてあるので、
> 相手が生き残る限り総和は必ず減る。相手の残HPが `dealt` 未満のときだけ、
> 実際の減少量が回復量を下回って総和が増えうるが、**そのターンで `outcome` が確定する**ので
> 戦闘は終わる。終了保証は壊れない。
> 例: 敵HP2 に4ダメージ＋3回復 → 敵は 0（−2）、自分は +3 で総和 +1。だが敵は倒れている。

> **4 と 8 を合わせると、HP総和は高々3ターンに1回必ず減る。**
> 減らないまま無限に続く実行列は存在せず、**戦闘はどの乱数列でも有限ターンで終わる。**
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
import type { UpgradeCounts, HandTable, HeatCounts } from '@/domain/handTable';
import type { BattleState, TurnLog } from '@/domain/battle';
import type { EnemyDef } from '@/domain/enemy';
import type { Rng } from '@/lib/rng';
import { PLAYER_MAX_HP } from '@/data/player';

export type Phase = 'title' | 'battle' | 'upgrade' | 'result';

export interface GameState {
  readonly phase: Phase;
  readonly stageIndex: number;
  readonly upgrades: UpgradeCounts;
  readonly battle: BattleState | null;
  readonly lastLog: TurnLog | null;
  readonly cleared: boolean;
  /** 直近に出した手の履歴。戦闘ごとに `NO_HEAT`（空）に戻す
   *  （`docs/adr/0003-repetition-window.md`。「溜まって冷める数値」ではない） */
  readonly playerHeat: HeatCounts;
  readonly enemyHeat: HeatCounts;
}

export function createGame(): GameState;
export function startGame(state: GameState): GameState;
export function playHand(state: GameState, hand: Hand, rng: Rng): GameState;
export function chooseUpgrade(state: GameState, hand: Hand): GameState;
export function backToTitle(state: GameState): GameState;

/** 表示用。stageIndex が範囲外なら null */
export function currentEnemy(state: GameState): EnemyDef | null;
/**
 * 表示用。**強化と熱の両方**を適用した後のプレイヤーの手。
 * `ctx.playerHands` に渡すものと同じ値を返すこと（画面の数字と実ダメージを一致させる）
 */
export function playerHandTable(state: GameState): HandTable;
/**
 * 表示・計測用。いまの敵の値表（**敵ごとの値表・弱化・本気強化をすべて適用したあと**）。
 * 戦闘中でなければ `null`。`ctx.enemyHands` と**同じ値を返すこと**。
 * **公開する理由**は「唯一の出どころ」を `application` の外にも使わせるため（下記）。
 */
export function enemyHandTable(state: GameState): HandTable | null;
/** 表示用。熱による弱化量（0〜HEAT_MAX_PENALTY）。UI が「-1」等を出すのに使う */
export function heatPenalties(state: GameState): Readonly<Record<Hand, number>>;

/**
 * 表示用。その手をいま出して**勝ったとき**に実際に与えるダメージ。
 * 強化・熱・**耐性**・にらみをすべて含む。**必ず `dealtDamage` を通すこと**（節4）。
 * 戦闘中でなければ 0。
 */
export function damagePreview(state: GameState, hand: Hand): number;

/**
 * 表示用。その手を**いま選んだらどうなるか**を、3つの結果に分けて返す。
 * 期待値に丸めない。**プレイヤーが天秤にかけるのは結果そのもの**であり、
 * 平均値では「勝てば大きいが負けると痛い」が消える。
 */
export function handOutlook(state: GameState, hand: Hand): HandOutlook | null;

export interface HandOutlook {
  /** 勝ったときに敵へ与えるダメージ。damagePreview と同じ値 */
  readonly onWin: number;
  /** 勝ったときに自分が回復する量。0 なら回復しない */
  readonly healOnWin: number;
  /** あいこのときのにらみの増加。上限に達しているときは 0 */
  readonly stareOnDraw: number;
  /** あいこのときに双方が受けるダメージ。にらみが上限のときだけ 1 以上 */
  readonly damageOnDraw: number;
  /** 負けたときに受けるダメージのうち、**最も大きいもの**（最悪ケース） */
  readonly worstOnLose: number;
  /** この手を使うと、次のターンからこの手の damage が何下がるか（0 以上） */
  readonly heatCost: number;
}

/**
 * 表示用。**強化画面**で見せる「いまの値」と「強化したあとの値」。
 * 上限に達している手は両方が同じ値になる。
 * **熱は含めない**（次の戦闘の頭で `NO_HEAT` に戻るため。節5「熱の更新」）。
 * **耐性も含めない**（次にどの敵と戦うかは、この画面の関心ではない）。
 */
export function upgradePreview(state: GameState, hand: Hand): UpgradePreview;

export interface UpgradePreview {
  readonly current: HandValue;
  readonly next: HandValue;
}

/**
 * 表示用。敵がいま各手を出す確率と、その手で**敵が勝ったとき**にこちらが受けるダメージ。
 * 確率は現在のフェーズ（`normal` / `desperate`）のもの。敵の熱も反映する。
 * 戦闘中でなければ null。
 */
export function enemyForecast(state: GameState): EnemyForecast | null;

export interface EnemyForecast {
  readonly phase: EnemyPhase;
  readonly probability: Readonly<Record<Hand, number>>;
  readonly damage: Readonly<Record<Hand, number>>;
}
```

### 各関数の挙動

| 関数 | 前提 | やること |
| --- | --- | --- |
| `createGame` | — | 上の全フィールドの初期値。`upgrades:NO_UPGRADES`、`playerHeat`/`enemyHeat` は `NO_HEAT` |
| `startGame` | `phase === 'title'` | **`createGame()` の値から作り直す**（`upgrades` を `NO_UPGRADES`、`lastLog` を `null`、`cleared` を `false`、`stageIndex` を 0、**両方の熱を `NO_HEAT`** にリセット）。そのうえで `createBattle(PLAYER_MAX_HP, STAGES[0])`、`phase = 'battle'` |
| `playHand` | `phase === 'battle'` かつ `battle !== null` | `resolveTurn` を呼び、**両方の熱を進め**、結果で分岐（下記） |
| `chooseUpgrade` | `phase === 'upgrade'` かつ `canUpgrade(upgrades, hand)` | 強化を足し、`stageIndex + 1` の敵で `createBattle`、**`lastLog = null`**、**両方の熱を `NO_HEAT` に戻し**、`phase = 'battle'` |
| `backToTitle` | どこからでも | `createGame()` と同じ値を返す（**強化もHPも全部リセット**） |

**前提を満たさない呼び出しでは、例外を投げず `state` をそのまま返す。**
UI のボタン制御が漏れても壊れないようにする。

**`lastLog` は戦闘ごとにリセットする。** 次の敵に前の敵の最後のログを持ち越さない。
`startGame` と `chooseUpgrade` の両方で `null` にする。

**`STAGES` の添字が `undefined` になる経路について。**
`STAGES` は空でない前提（節4「入力の前提」）なので `STAGES[0]` は必ず存在し、
`chooseUpgrade` は最終ステージでは呼ばれない（`playHand` が `phase = 'result'` にするため）。
それでも `noUncheckedIndexedAccess` により型は `EnemyDef | undefined` になるので、
**未定義なら `state` をそのまま返す**。これは型を通すための防御であり、通常は到達しない。

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

**強化を足してから弱化を引く**（節2.5 の適用順序）。

```
playerHands = applyHeat(
  buildHandTableWith(BASE_HANDS, state.upgrades, UPGRADE_TARGETS),
  state.playerHeat,
  HEAT_RULE,
)
enemyHands  = enemyHandTable(state, enemy, enemyPhase(battle.enemyHp, battle.enemyMaxHp))
ctx = { playerHands, enemyHands, enemy: STAGES[state.stageIndex] }
```

**`playerHands` は `playerHandTable(state)` から取る。** 式を2箇所に持つと、
片方だけ直したときに画面の数字と実ダメージがずれる。

### 敵の手の表（`enemyHandTable`）

**組み立て自体は `domain` の `buildEnemyHandTable`（節3）が持つ。**
`application` がやるのは**既定値と設定を渡すことだけ**で、式はここに書かない。

```ts
/** 内部用。playHand と enemyForecast が使う */
function enemyHandTableWith(state: GameState, enemy: EnemyDef, phase: EnemyPhase): HandTable {
  return buildEnemyHandTable(BASE_HANDS, enemy, state.enemyHeat, HEAT_RULE, phase);
}

/** 公開。state だけから今の敵の表を返す。戦闘中でなければ null */
export function enemyHandTable(state: GameState): HandTable | null;
```

`playerHandTableWith` / `playerHandTable` と同じ分け方にする。
**`BASE_HANDS` と `HEAT_RULE`（＝`src/data/`）を知っているのは `application` だけ。**

**公開版の `null` の条件は、`enemyForecast` / `damagePreview` と完全に同じにする。**

```
state.phase !== 'battle' || state.battle === null || currentEnemy(state) === null  →  null
```

**`phase` が `'upgrade'` や `'result'` のときは `battle` が残っていても `null`**
（節5 の不変条件のとおり `battle` は最後の状態を保持するため、`battle === null` だけでは足りない）。

**公開する理由。** `scripts/measure.ts` が**この式の2つ目の写しを持っていて、すでにずれている。**
貪欲プレイの読みを作るところで `applyHeat(BASE_HANDS, state.enemyHeat, HEAT_RULE)` と
自前で組み立てており、**`desperateBonus` を落としている**（本気の敵を弱く見積もっている）。
敵ごとの値表を入れると、この写しは**必ず**ずれる。

**バランスの判断はこのスクリプトの数字で行う**ので、ここがずれると
**設計の検証そのものが成立しない。** 写しを消し、`enemyHandTable(state)` を呼ばせる。

> **`handOutlook.worstOnLose` は既に一本化されている**（`enemyForecast.damage` を参照している）。
> 敵のダメージを導出している箇所は、これで `enemyHandTableWith` の1本になる。

### 具体例（`buildEnemyHandTable` にそのまま渡せる）

**「回復せず、にらみが凶器になる敵」が本気に入り、直近2手ともグーだった局面。**
**`base` には既定の値表を渡す**（この敵は `hands` を持つので使われない）。

```
enemy.hands = {
  rock:     { damage: 3, heal: 0, stareBonus: 6 },   ← 既定は stareBonus 4
  scissors: { damage: 5, heal: 0, stareBonus: 0 },
  paper:    { damage: 3, heal: 0, stareBonus: 0 },   ← 既定は heal 3
}
enemy.desperateBonus = 2、phase = 'desperate'
state.enemyHeat = ['rock', 'rock']
HEAT_RULE = { window: 4, allowed: 2, maxPenalty: 3 }
```

```
1. 表を選ぶ    enemy.hands（省略していないので BASE_HANDS は使わない）
2. 弱化        グーは history に2つ ＋ 今回1 = 3 回、allowed 2 → penalty 1
               damage 3 → max(1, 3 − 1) = 2。チョキとパーは penalty 0
3. 本気強化    3手それぞれ +2  →  グー 4 / チョキ 7 / パー 5
               **heal と stareBonus は動かない**

結果 = {
  rock:     { damage: 4, heal: 0, stareBonus: 6 },
  scissors: { damage: 7, heal: 0, stareBonus: 0 },
  paper:    { damage: 5, heal: 0, stareBonus: 0 },
}
```

**にらみ 2 のときに敵がグーで勝つと**、`dealtDamage(rock, 1, 2)` は
`max(1, floor(4 × 1)) + 2 × 6 = 16`。**プレイヤーの最大HP 25 に対して16。**

> **この例が、`stareBonus` を画面に出さなければならない理由そのもの。**
> プレイヤーはあいこでにらみを溜めた側であり、**自分で溜めたものに16殴られる。**
> 溜める前にそれが読めないなら、それは読み合いではなく罠になる。

このとき固有能力の行に出る文（節7 の順序で組み立てる）。

```
耐性なし／あいこ時のにらみ+1／グーはにらみ1つにつき +6／パーで回復しない
```

**境界の扱い**

| 場面 | どうなるか |
| --- | --- |
| `enemy.hands` を省略 | `BASE_HANDS` を使う。**既存の4体は1文字も変わらない** |
| `enemyHandTable(state)` を戦闘外で呼ぶ | `null`（`currentEnemy` / `enemyForecast` と同じ約束） |
| `heal` を大きく書いた | `resolveTurn` が `dealt − 1` で抑える。**終了保証は値表では壊れない** |
| 弱化で `damage` が 0 以下になる | `applyHeat` が `max(1, …)` で 1 に止める（既存の規則） |

**`ctx.enemyHands` と `enemyForecast` の両方がこの関数を通ること。**
片方だけ本気の強化を掛けると、**画面の「負けたら -N」が実ダメージと食い違う**
（節4 の `dealtDamage` と同じ理由）。

### 履歴の更新

`resolveTurn` を呼んだあと、**両陣営ぶん**進める。敵が出した手は `result.log.enemyHand`。

```
playerHeat = advanceHeat(state.playerHeat, hand, HEAT_RULE)
enemyHeat  = advanceHeat(state.enemyHeat, result.log.enemyHand, HEAT_RULE)
```

**決着したターンでも更新してよい**（次の戦闘の頭で `NO_HEAT` に戻るため影響しない）。
**あいこのターンも更新する。** 手は出しているので履歴には残る。

`STAGES[i]` は `noUncheckedIndexedAccess` により `EnemyDef | undefined`。
**未定義なら `state` をそのまま返す**（進行不能な状態を作らない）。

### 不変条件

- `phase === 'battle'` なら `battle !== null && battle.outcome === null`
- **`phase === 'upgrade'` と `'result'` のときも `battle` は最後の状態を保持する**
  （結果画面で最終HPを見せるため。`null` に戻さない）
- `phase === 'title'` なら `battle === null` かつ `lastLog === null` かつ `upgrades` は全て 0
- `0 <= stageIndex < STAGES.length`
- `upgrades` の各値は `0..UPGRADE_MAX_PER_HAND`
- **戦闘が始まった直後（`startGame` / `chooseUpgrade` の直後）は両方の熱が `NO_HEAT`**
- 熱の各値は 0 以上（上限は設けない。弱化量の側が `HEAT_MAX_PENALTY` で頭打ちになる）
- 強化のチャンスは4回、枠は6つなので、**`upgrade` で選べる手が0になることはない**

> **`GameState` は判別可能ユニオンではない**ので、型のうえでは
> 「`phase === 'battle'` なのに `battle === null`」のような不正な組み合わせも表現できる。
> **上の不変条件を守るのは `application/game.ts` の各関数の責任**であり、
> 型では保証されない。`tests/scenario/` はここを通しで確認する。

---

## 6. `src/data/`

**リテラルだけで書く。** 関数・アロー・分岐を書かない（レイヤチェッカが落とす）。

> **この節に書いた数値は、正ではなくスナップショットである。**
> HP・威力・確率・熱の効き方は `/balance` で動かし続ける前提の値で、
> **正しい値は常に `src/data/` の側**にある。この節が持つのは
> **構造**（どの敵がどの手を好むか、誰が耐性を持つか、キー名、型の形）で、
> そこが実装と食い違っていたら実装のほうが誤り。
>
> したがって **`/conform` で「数値が設計と違う」と出ても、それ自体は違反ではない。**
> `/balance` を回したあとに気づいた範囲でここを合わせ直せばよい。
> 最終更新: 2026-08-11（`/balance` で難易度カーブを一本の下り坂にした時点）。

### `src/data/heat.ts`

```ts
import type { HeatRule } from '@/domain/handTable';

/** 連打の罰の効き方（`docs/adr/0003-repetition-window.md`）。
 *  window=4 / allowed=2 のとき弱化は最大2段までしか届かない。
 *  maxPenalty は窓を広げたときの蓋として置いてある */
export const HEAT_RULE: HeatRule = { window: 4, allowed: 2, maxPenalty: 3 };
```

### `src/data/player.ts`

```ts
/** プレイヤーの最大HP。5戦を通して増えない（回復は戦闘中のパーだけ） */
export const PLAYER_MAX_HP = 25;
```

> **`application` ではなくここに置く理由。** 敵HPを動かすとクリア率が動くので、
> 釣り合いを取るためにプレイヤーHPも一緒に触ることになる。**両方が `src/data/` に
> 揃っていないと、バランス調整がロジック側に染み出す**（`CLAUDE.md` のレイヤ規約）。

### `src/data/hands.ts`

```ts
import type { HandTable, UpgradeTargets } from '@/domain/handTable';

export const BASE_HANDS: HandTable = {
  rock:     { damage: 3, heal: 0, stareBonus: 4 },
  scissors: { damage: 5, heal: 0, stareBonus: 0 },
  paper:    { damage: 3, heal: 3, stareBonus: 0 },
};

/** 強化1回がどこに乗るか（`docs/adr/0003-repetition-window.md`） */
export const UPGRADE_TARGETS: UpgradeTargets = {
  rock: 'stareBonus',
  scissors: 'damage',
  paper: 'damage',
};
```

> **グーの強化はにらみ倍率に乗る。** にらみはあいこを狙う読みでしか溜まらないので、
> **グーの強化はまともに読んだプレイヤーにしか還元されない。**
> 実測でも、これだけで機械的パターンの最良が 12.0% → 9.9% に落ちた（ADR 0003）。
>
> **パーの `heal` は 3 のまま。** 打点3のときは「与ダメージ − 1」で 2 止まりだが、
> **1回強化して打点4になると 3 が出る。** 回復側に +1 を乗せているわけではないので、
> 終了保証は壊れない（`docs/01_requirements.md`）。
>
> **非対称の構造（グー=溜め／チョキ=火力／パー=回復）は ADR 0001 から変えていない。**

### `src/data/enemies.ts`

**ここの数値は `/balance` で動かす出発点。** ロジックは数値に依存しない。

| # | id | 名前 | HP | normal（グー/チョキ/パー） | desperate | 耐性 | 本気強化 | あいこ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `scarecrow` | かかし | 15 | .34 / .33 / .33 | 同じ | なし | +1 | standard |
| 2 | `shearBird` | はさみ鳥 | 26 | .15 / **.55** / .30 | .20 / .45 / .35 | なし | **+2** | standard |
| 3 | `rockGuard` | 岩の番人 | 21 | **.60** / .20 / .20 | .50 / .25 / .25 | なし | +1 | standard |
| 4 | `paperEnvoy` | 紙の使者 | 23 | .20 / .20 / **.60** | .25 / .25 / .50 | チョキ ×0.5 | +1 | standard |
| 5 | `glicoKing` | グリコ王 | 28 | .30 / .30 / .40 | .40 / .20 / .40 | チョキ ×0.5 | **+2** | **stareDouble** |

**本気強化（`desperateBonus`）は難易度の段として使う**（2026-08-11 の `/balance`。
ADR 0003 が「敵ごとに差をつける余地」として残していた項目）。**+1 が既定で、+2 は終盤の2体だけ。**
`0` にはしない。**0 にすると本気モードの全画面演出が「何も起きない」ものになる**
（かかしは normal と desperate の偏りも同じなので、`desperateBonus` が唯一の中身になる）。

`resistance` は**3手すべてのキーを必ず書く**（等倍は `1`）。

### 難易度カーブ（`scripts/measure.ts`・20,000周）

**5体は「一本の下り坂」にする。** ここが崩れると、中盤に休憩所ができてボスが山にならない。

| | 1 かかし | 2 はさみ鳥 | 3 岩の番人 | 4 紙の使者 | 5 グリコ王 |
| --- | --- | --- | --- | --- | --- |
| 突破率（貪欲） | 88.6% | 80.5% | 84.5% | 70.3% | **61.6%** |

> **2026-08-11 に計測側を直したので、それ以前の数字とは直接比べられない。**
> 貪欲プレイが敵の表を自前で組み立てており `desperateBonus` を落としていた
> （ADR 0004 の実装中に発見）。**本気の敵を弱く見積もったまま測っていた。**
> 直した結果、通しクリア率は 30.1% → **26.1%** に下がったが、
> **ゲームの挙動は1バイトも変わっていない**（この時点では全敵が既定の値表）。
> 正しい被弾を見た貪欲プレイが守りに寄った（岩の番人の主な手がグー→パー）だけで、
> **1手先読みのヒューリスティックの方針が変わったにすぎない。**
> 数値を動かしたくなったら、**まずこの表を測り直してから**判断すること。

**チョキ好みの敵は構造的に安全。** 返しがグーで、外したときに返ってくるのが
**最も軽いパー**だからで、逆にパー好みの敵（返しがチョキ、外すとにらみの乗ったグーが返る）が
最も重い。**手の順（グー→チョキ→パー）で敵を並べると、最も安全な敵が中盤に来て谷になる。**
はさみ鳥は **HP・パーの比率・本気強化 +2** で埋めたうえ、岩の番人と順番を入れ替えてある。

通しクリア率 26.1% / 1戦 12.9ターン / 機械パターン最良 6.0%（差 **20.1pt**）。

### 敵ごとの手の分布（同じ計測・2026-08-11）

**通算の分布だけを見てはいけない。** 3手が揃っていても、それは
「どの敵にも同じ3手を同じ割合で使っている」ことでも達成できる。
**敵ごとに割れて初めて「敵ごとに別の戦い方をしている」と言える。**
`隔たり` は5体を通した平均との総変動距離で、0% はその敵に固有の要求が無いことを意味する。

| 敵 | グー / チョキ / パー | 主な手 | 隔たり |
| --- | --- | --- | --- |
| 1 かかし | 25.5 / 57.3 / 17.3 | チョキ | 12.9% |
| 2 はさみ鳥 | 26.2 / 72.1 / **1.7** | チョキ | 28.4% |
| 3 岩の番人 | 41.6 / 15.4 / 43.0 | パー | **29.8%** |
| 4 紙の使者 | **7.6** / 48.8 / 43.6 | チョキ | 17.1% |
| 5 グリコ王 | 22.1 / 18.7 / 59.2 | パー | 29.1% |
| | | | 平均 23.5% |

**戦術的な個性は既に出ている。** 主な手が3種類に割れ、はさみ鳥ではパーが 2.2%、
紙の使者ではグーが 9.4% と、**敵ごとに「使えない手」がはっきりある。**
かかしの 12.8% が最も低いのは、練習台として正しい。

> **はさみ鳥への最適手はグーではなくチョキだった**（72.1%）。
> チョキ偏重の敵にチョキを出すとあいこになり、**にらみが溜まる**。
> 「返しの手」で敵を設計すると読み違える。**必ずこの表で確かめること。**

> **並び替えの代償: 手の使用分布が 28.8/39.6/31.6 → 28.1/43.9/28.0 に開いた。**
> ADR 0003 が揃えた指標なので、**次に `/balance` を回すときの最初の宿題はここ。**
> はさみ鳥のパー比率を .30 → .25 に戻す線は試して外れている
> （チョキ 43.1% とほぼ動かず、クリア率だけ 1.2pt 落ちた）。原因は偏りではなく順番の側にある。

**公開する形はこれ。** キー名は上の表の `id` と一致させる（`stages.ts` が名前で引くため）。

```ts
import type { EnemyDef } from '@/domain/enemy';

export const ENEMIES = {
  scarecrow: { id: 'scarecrow', name: 'かかし', maxHp: 12, /* … */ },
  rockGuard: { /* … */ },
  shearBird: { /* … */ },
  paperEnvoy: { /* … */ },
  glicoKing: { /* … */ },
} satisfies Readonly<Record<string, EnemyDef>>;
```

`satisfies` を使う（`: Record<string, EnemyDef>` と注釈すると、
`ENEMIES.scarecrow` の型が広がって `stages.ts` 側で不便になる）。

### 敵ごとの値表（`hands`・`docs/adr/0004-enemy-hand-table.md`）

**書かない敵は `BASE_HANDS` のまま。** 差をつけたい敵にだけ書く。

```ts
  paperEnvoy: {
    // …既存のフィールド…
    hands: { rock: { damage: 3, heal: 0, stareBonus: 4 }, /* … */ },
  },
```

**契約は節4 と同じ**（`damage` は1以上の整数、`heal` と `stareBonus` は0以上の整数）。
`heal` を大きくしても**終了保証は壊れない**。`resolveTurn` が `heal ≤ dealt − 1` で
抑えているので、保証は `domain` 側にあり、値表の側は関知しない。

**にらみは共有**なので、敵の `stareBonus` を上げると
**プレイヤーがあいこで溜めた にらみが、そのまま敵の武器になる。**
これは ADR 0001 の帰結を使っているのであって、破っていない。

**どの敵にどう振るかはここでは決めない。** `/balance` の仕事であり、
`scripts/measure.ts` の「敵ごとの手の分布」の隔たりが散ることと、
突破率のカーブが崩れないことの両方で判断する。

> **`hint` は持たない**（ADR 0004）。節7 のとおり、画面には
> `BASE_HANDS` との**差分を自動生成**して出す。手書きの説明は実値とずれる。

**5体目に「グー耐性 × にらみ+2」を作らない。** にらみが速く溜まるのにグーが半減し、
主機構が罠になる（`docs/00_research.md` 節9.5）。チョキ耐性にしてある。

### `src/data/stages.ts`

```ts
import type { EnemyDef } from '@/domain/enemy';
import { ENEMIES } from '@/data/enemies';

/** 一本道。将来ここをグラフに差し替えれば分岐マップにできる */
export const STAGES: readonly EnemyDef[] = [
  ENEMIES.scarecrow, ENEMIES.shearBird, ENEMIES.rockGuard, ENEMIES.paperEnvoy, ENEMIES.glicoKing,
];
```

---

## 7. `src/ui/`

**ここ以外で DOM を触らない。** テストは書かない（`docs/04_test-plan.md`）。

> **`src/ui/` は Codex に出さず、メイン（Opus）が実装してブラウザで確認する。**
> UI はテストで守られず、正しさの判定に「見て分かるか」が要る。
> そのため**この節は関数単位の契約までは書かない**（書いても検証手段がない）。
> `domain` / `data` / `application` は逆に、ここに書いた契約だけで実装できる粒度にしてある。

### `ui/app.ts` の形だけは固定する

```ts
export function mountApp(root: HTMLElement, rng: Rng): void;
```

- `GameState` を1つだけ保持する
- 入力 → `application` の関数 → 返ってきた新しい state に差し替え → `root` を再描画
- **再描画は毎回 `root` の中身を作り直す。** 差分更新はしない（画面数が4つなので不要）
- 各 `screens/*.ts` は `(state, actions) => HTMLElement` の形で要素を返し、DOM に自分で挿さない

| ファイル | 責務 |
| --- | --- |
| `ui/app.ts` | `GameState` を1つ保持。入力 → `application` の関数 → 新しい state → 再描画 |
| `ui/screens/title.ts` | タイトルと「はじめる」 |
| `ui/screens/battle.ts` | 敵・双方のHP・**にらみ**・**敵の手の確率と威力**・**直前の手合わせ**・3ボタン |
| `ui/screens/upgrade.ts` | 3択。**各手の現在値と強化後の値**。上限の手は `disabled` で**表示は残す** |
| `ui/screens/result.ts` | クリア / ゲームオーバー、タイトルへ戻る |
| `ui/components/` | HPバー、にらみ表示、手のボタン |

### にらみの表示は最優先

**「にらみ」が伝わらないと、このゲームはただの運ゲーに見える**（`docs/00_research.md` 節9.8）。

- 現在値を**画面の中央付近に大きく**出す（0 / 1 / 2）
- **増えた瞬間が分かる**こと（色か大きさの変化。アニメーションは作り込まない）
- 各ボタンに、いま出して勝ったら何ダメージかを出す。
  **必ず `damagePreview(state, hand)` を使うこと**（節5）。
  自分で `damage + stare * stareBonus` と組み立てると**耐性が抜ける。**
  `3 + にらみ×3` と直書きすると**強化ぶんも熱ぶんも乗らない**

### 読み合いの材料を数字で出す（2026-08-10 追加）

**情報が足りないと、プレイヤーは運ゲーを強いられていると感じる。**
「グーを好む」という一行では、どれくらい好むのかも、外したら何が起きるのかも分からない。
`docs/01_requirements.md` は敵の偏りを**公開情報**と定めているので、数字で出す。

敵パネルに**3手ぶんの行**を出す。`enemyForecast(state)` の値をそのまま使う。

| 列 | 中身 | なぜ要るか |
| --- | --- | --- |
| 手 | グー / チョキ / パー のアイコン | — |
| 敵が出す確率 | `52%` のような整数％とバー | **読み合いの土台。これが無いと勘になる** |
| 受けるダメージ | その手で敵が勝ったときにこちらが受ける値 | 「負けたらどれだけ痛いか」で手を選べる |
| こちらの耐性表示 | `×0.5` は**プレイヤーのボタン側**に出す | 与ダメージに効くものは与ダメージの隣に置く |

- 確率は**現在のフェーズのもの**。`desperate` に入ったら値が変わるので、
  **フェーズが変わったことが分かる**ようにする（見出しの色か文言）
- **敵の熱は数値としては出さない**が、「受けるダメージ」には反映される
  （`enemyForecast` が熱を適用した値を返す）。**画面に出る数字は必ず実値**にする
### 固有能力の行は自動生成する（2026-08-11 改訂・ADR 0004）

敵パネルの固有能力の行（`ui/components/enemyForecast.ts`）は、
**`EnemyDef` から組み立てる。敵ごとに文言を手書きしない。**
手書きすると実値とずれる（節4 の `dealtDamage` で一度踏んだ）。

いま出しているもの（耐性 `<1`・あいこルール）に加えて、
**`enemy.hands` が `BASE_HANDS` と違うところだけ**を出す。

**比べる相手は `BASE_HANDS`。** 3手 × 3項目を順に見て、違うものだけ文を足す。

| 見るもの | 条件 | 出す文 |
| --- | --- | --- |
| `heal` | `0` になった | `{手}で回復しない` |
| `heal` | 増減した | `{手}で{n}回復する` |
| `stareBonus` | `0` になった | `{手}ににらみが乗らない` |
| `stareBonus` | 増減した | `{手}はにらみ1つにつき +{n}` |
| `damage` | 違う | **出さない**（被弾の列に実値が出ている） |

**並び順は `HANDS` の順（グー・チョキ・パー）→ 項目は `heal` → `stareBonus` の順**に固定する。
既存の耐性・あいこルールの文の**後ろ**に足し、区切りは既存どおり `／`。

- **`damage` を出さない理由**は、被弾の列（`enemyForecast.damage`）が
  **弱化と本気強化まで含んだ実値**を既に出しているため。ここで基礎値を併記すると、
  画面に2つの数字が並んで**どちらが本物か分からなくなる**
- **`heal` と `stareBonus` を出す理由**は、**どちらも画面のどこにも出ていない**から。
  とくに `stareBonus` は、にらみが共有である以上
  **「溜めるか否か」というこのゲームの中心の判断を直接動かす**
- 差が無い敵は、これまでどおり `耐性なし／あいこ時のにらみ+1` のまま

**耐性が `>1`（弱点）のときの表示は、この設計では決めない。**
現在の実装は敵パネルが `resistance < 1` しか拾わず、ボタン側は `耐性 ×1.5` と
**逆の意味で**表示する。弱点を使うと決めた時点で別途直す（ADR 0004 は弱点を必須にしていない）。

### 強化画面にも数字を出す（2026-08-10 追加）

`docs/01_requirements.md` の画面一覧は強化選択画面に「**グー/チョキ/パーの現在値**と3択」と
書いているが、**数字が1つも出ていなかった。** どの手が今いくつで、+1 で何になるかが
見えないまま選ばされるのは、戦闘画面と同じ「情報が足りない」問題。

- 各手に `upgradePreview(state, hand)` の値を出す。**`3 → 4` のように前後を並べる**
- **矢印を出すのは、その手で実際に伸びる側だけ**（`UPGRADE_TARGETS`。ADR 0003）。
  ダメージ欄に決め打ちすると、**グーが「3 → 3」になり強化しても何も増えないように見える。**
  伸びない側は現在値だけを出す
- 上限の手は `disabled` のまま**値は出す**（何が上限なのかが分かるように）
- **パーの回復量とグーのにらみ倍率も併記する。** ダメージだけ見せると、
  この3手が非対称であること（`docs/adr/0001-battle-model.md`）が伝わらない
- **熱と耐性は出さない。** どちらも次の戦闘の話であり、この画面の関心ではない

### 手のボタンに「選んだらどうなるか」を出す（2026-08-10 追加）

**測って分かったこと**（`scripts/` の計測・55,833局面）。
手を選ぶ局面のうち **95.4% で選択肢が2つ以上**あり、決め手になっている軸は
**にらみ 54.0% / HP収支 40.3% / リスク 26.8% / 熱 24.1%** と入れ替わっている。
**構造としては判断が成立している。** それでも「熱がない手を選ぶだけ」に感じるのは、
**画面が熱しか語っていない**ため。熱だけが `-1 熱` と明示され、
にらみの得も、外したときの痛さも、ボタンに出ていない。

**期待値を出さない。** 「平均 +2.1」ではプレイヤーは判断できないし、
**「勝てば大きいが負けると痛い」という形が消える。** 3つの結果をそのまま出す。

各ボタンに `handOutlook(state, hand)`（節5）の値を次の形で出す。

| 行 | 中身 | 例 |
| --- | --- | --- |
| 勝ち | `onWin` ダメージ。`healOnWin > 0` なら回復も | `勝ち +5 / HP+3` |
| あいこ | `stareOnDraw > 0` ならにらみ、そうでなければ `damageOnDraw` | `あいこ にらみ+1` |
| 負け | `worstOnLose`（**最悪ケース**。平均にしない） | `負け -5` |
| 連打 | `heatCost > 0` のときだけ | `使うと次から -1` |

- **にらみが上限のときは「あいこ」の行が `双方 -1` に変わる。** ここが読めないと、
  上限で粘る判断ができない
- **既存のバッジ（いまの弱化）と、`使うと次から -N`（これから増える弱化）は別物。**
  混ぜない。前者は現在の状態、後者はこの選択のコスト
- **バッジの文言は `連打 -N` にする**（`-N 熱` から変更。ADR 0003）。
  「溜まって冷める」ではなく「同じ手ばかり出している」ことが起きているので、そう書く
- 耐性の `×0.5` は既存どおり残す
- **4行が縦に伸びるので、狭い画面での折り返しを必ず確認する**（強化画面で一度踏んだ）

### 直前の手合わせを見せる（2026-08-10 追加）

**何が起きたのか分からないと、勝ち負けが理不尽に見える。**
文章だけでなく、**両者の手を並べて出す。**

- 自分の手と敵の手を**アイコンで左右に並べ**、中央に勝敗を出す
- 出た瞬間に動く（`transform` と `opacity` の短いアニメーション）。
  **凝った演出は作らない。** 何が出たかが分かることが目的
- ダメージは**受けた側の数字が動いたことが分かる**ように出す（HPバーの変化＋数字のポップ）

### 迫力（2026-08-10 追加）

- 戦闘画面に背景を敷く。**`public/assets/battle-bg.png` が入るまでは CSS で代替する**
  （`docs/05_assets.md`・`docs/10_workflow.md`「素材待ちで実装を止めない」）
- 敵は**待機の微動**と**被弾の反応**を持つ。CSS アニメーションだけで作る
- **`docs/00_research.md` 節9.8 の制約は守る。** 背景も演出も
  **画面中央のにらみの表示を邪魔しない**

### 連打の罰が見えること（`docs/adr/0003-repetition-window.md`）

**`playerHandTable` は強化と熱を両方適用した表を返す**ので、ボタンの数字は自動的に下がる。
ただし**なぜ下がったのかが分からないと理不尽になる**ので、次を満たす。

- **弱化している手は、下がっていることが一目で分かる**（色を変える、`-1` を添える等）
- 弱化量が深いほど強く見せる（`-1` / `-2` / `-3`）
- **敵側の弱化は数値としては出さなくてよい。** ただし `enemyForecast` の
  「負けたら -N」には反映される（画面に出る数字は必ず実値）

> **`heatRecoveryPreview` は消す。** ADR 0002 の「溜まった熱があと何ターンで冷めるか」を
> 出すための関数で、**ADR 0003 には冷めるという状態が無い**（履歴が窓から出ていくだけ）。
> 窓方式では罰は 3連続からしか付かず最大 -2 で、**散らせば次のターンには消える**ので、
> 「あと何ターン」を出す意味がない。`src/application/game.ts` から関数を、
> `src/ui/screens/battle.ts` と `src/ui/components/handButton.ts` から表示を落とす。

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

### 熱の追加ぶん（2026-08-10・`docs/adr/0002-hand-heat.md`）

**すべて実装済みのモジュールへの追加。** この順で入れる。

1. `domain/handTable.ts` — `HeatCounts` / `applyHeat` / `advanceHeat` / 定数（節2.5）
2. `data/hands.ts` — グーの `stareBonus` 3、チョキの `damage` 5
3. `application/game.ts` — `GameState` に履歴2つ、`ctx` の組み立て、`enemyHandTable`、履歴の更新、リセット
4. `ui/screens/battle.ts` — 弱化が見えるようにする

**`domain/battle.ts` は触らない。** 触る必要が出たら設計が間違っているので、
実装を進める前に `docs/03` に戻ること。

### 敵ごとの値表ぶん（2026-08-11・`docs/adr/0004-enemy-hand-table.md`）

**これも既存モジュールへの追加のみ。** この順で入れる。

1. `domain/enemy.ts` — `EnemyDef` に `hands?: HandTable` を足し、**`hint` を消す**。
   **`buildEnemyHandTable` を足す**（組み立ての本体。節3）
2. `data/enemies.ts` — 5体から `hint` を消す（**値表はまだ書かない**。`/balance` の仕事）
3. `application/game.ts` — `enemyHandTableWith` を `buildEnemyHandTable` への委譲に変え、
   公開版 `enemyHandTable(state)` を足す
4. `scripts/measure.ts` — 敵の表の写しを消し、`enemyHandTable(state)` を呼ぶ
5. `ui/components/enemyForecast.ts` — 固有能力の行に `BASE_HANDS` との差分を足す（節7）

> **`hint` を消すと既存のテストが2本巻き添えで落ちる。**
> `tests/unit/enemy.test.ts` と `tests/unit/battle.test.ts` のフィクスチャが
> `hint: 'テスト用'` を持っている。**この2行を消すのは 1 と同じコミットで行う**
> （`/test` で見つけた。テストの意図は変わらないので、書き換えではなく削除）。

**1〜4 まで入れた時点で、画面も計測も見た目は1つも変わらない**
（値表を書いていないので全敵が既定に落ちる）。**ここで `npm run check` が緑に戻ること**が、
「仕組みだけを入れた」ことの確認になる。5 は差分が無い間は何も出さない。

**`domain/battle.ts` と `BattleState` は触らない。**
**`/balance` に入るまで `src/data/enemies.ts` に値表を1つも書かない。**
仕組みの不具合と数値の善し悪しを、同じ差分に混ぜない。
