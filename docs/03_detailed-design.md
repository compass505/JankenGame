# 詳細設計

> ステータス: **確定**（2026-08-09）。
> **2026-08-10 追記**: 手の「熱」を追加（節2.5・節5）。`docs/adr/0002-hand-heat.md`。
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

/** 強化は damage にのみ加算する。heal と stareBonus は動かさない */
export function buildHandTable(base: HandTable, counts: UpgradeCounts): HandTable;
```

**不変条件**

- `0 <= counts[hand] <= UPGRADE_MAX_PER_HAND`
- `buildHandTable(base, counts)[h].damage === base[h].damage + counts[h]`
- `buildHandTable(base, counts)[h].heal === base[h].heal`（**回復は絶対に強化されない**。
  強化されると終了保証が壊れる。`docs/01_requirements.md`）
- `buildHandTable(base, NO_UPGRADES)` は `base` と同じ値

**具体例**: `base.rock = { damage: 3, heal: 0, stareBonus: 3 }` に `counts.rock = 1` を渡すと
`{ damage: 4, heal: 0, stareBonus: 3 }`。

---

## 2.5. 手の「熱」（`src/domain/handTable.ts` に同居）

`docs/adr/0002-hand-heat.md`。**同じ手を続けて出すと威力が下がり、使わなければ戻る。**

```ts
import type { Hand } from '@/domain/hand';

export type HeatCounts = Readonly<Record<Hand, number>>;

export interface HeatRule {
  /** 熱がこの値たまるごとに弱化が1段深くなる */
  readonly gain: number;
  /** 弱化の上限 */
  readonly maxPenalty: number;
}

export const NO_HEAT: HeatCounts; // { rock: 0, scissors: 0, paper: 0 }

/** 熱1つぶんの弱化の段数。**段数の式はここだけに置く** */
export function heatPenalty(heat: number, rule: HeatRule): number;

/** 熱による弱化を damage にだけ適用した表を返す */
export function applyHeat(base: HandTable, heat: HeatCounts, rule: HeatRule): HandTable;

/** ターン終わりの更新。全部を1冷ましてから、出した手に rule.gain を足す */
export function advanceHeat(heat: HeatCounts, used: Hand, rule: HeatRule): HeatCounts;
```

> **数値を `HeatRule` で受け取る理由**（2026-08-10）。
> `gain` と `maxPenalty` は**バランス調整で動かしたくなる数値**だが、
> `domain/` は `src/data/` を import できない（`CLAUDE.md` のレイヤ規約）。
> 定数として `domain/` に置くと `/balance` で触れなくなるので、**引数で受け取る。**
> 実際の値は `src/data/heat.ts`（節6）にあり、**値そのものは ADR 0002 のまま**
> （`gain: 4` / `maxPenalty: 3`）。置き場所を変えただけで決定は覆していない。

### `applyHeat`

```
heatPenalty(h, rule) = min(rule.maxPenalty, floor(h / rule.gain))

各手 h について:
    damage = max(1, base[h].damage - heatPenalty(heat[h], rule))
heal と stareBonus は動かさない
```

**段数の式を書き写さない。** `application` の `heatPenalties`（節5）も
必ず `heatPenalty` を呼ぶ。同じ式が2箇所にあるとずれる（節4 の `dealtDamage` と同じ理由）。

### `advanceHeat`

```
各手 h について: next[h] = max(0, heat[h] - 1)
そのあと next[used] += rule.gain
```

**順序が重要。** 先に全部冷ましてから足す。逆にすると出した手が1ターンぶん軽く冷める。

**不変条件**

- `applyHeat(base, NO_HEAT, rule)` は `base` と同じ値
- `applyHeat` は `heal` と `stareBonus` を変えない（**強化と同じく damage にしか触らない**）
- `damage` は 1 未満にならない
- 弱化量は `rule.maxPenalty` を超えない
- `advanceHeat` は引数を書き換えず、新しいオブジェクトを返す
- `heat[h] >= 0`

**具体例**

```
base.scissors = { damage: 5, heal: 0, stareBonus: 0 }

heat.scissors = 0  → penalty 0 → damage 5
heat.scissors = 4  → penalty 1 → damage 4
heat.scissors = 7  → penalty 1 → damage 4     （floor(7/4) = 1）
heat.scissors = 13 → penalty 3 → damage 2     （floor(13/4) = 3）
heat.scissors = 40 → penalty 3 → damage 2     （上限で止まる）

advanceHeat({rock:0,scissors:4,paper:0}, 'scissors', rule) = {rock:0,scissors:7,paper:0}
advanceHeat({rock:0,scissors:4,paper:0}, 'rock', rule)     = {rock:4,scissors:3,paper:0}
```

（上の数値はすべて `rule = { gain: 4, maxPenalty: 3 }` のとき）

### 深めるのは速く、戻すのは遅い（実測・2026-08-10）

**式からは読み取りにくいが、この非対称がこの機構の本体。** 熱は1ターンに1しか冷めず、
1回使うと4たまるので、**焦がすのに使ったターン数の約4倍のターンが復帰に要る。**

| 同じ手の連打 | 到達する熱 | そのときの弱化 | 弱化が消えるまで |
| --- | --- | --- | --- |
| 1回 | 4 | -1 | **1ターン** |
| 2回 | 7 | -1 | 4ターン |
| 3回 | 10 | -2 | 7ターン |
| 4回 | 13 | -3 | 10ターン |
| 5回 | 16 | -3 | **13ターン** |

**1戦の平均は約9ターン**（`scripts/measure.ts` の実測）。つまり
**同じ手を4回以上連打すると、その手はその戦闘の間もう戻らない。**
逆に**1回使っただけの弱化は次のターンには消えている**ので、
「1手空ける」だけで弱化は避けられる。

**この2つは UI では説明していない**（画面に出しているのは現在の弱化量だけ）。
プレイヤーには触って気づいてもらう前提であり、**説明を増やすより先に、
弱化している手が一目で分かること**を優先する（節7）。

### 熱・強化・耐性・にらみの適用順序

**この順序を変えるとバランスの実測値と合わなくなる。**

```
1. 強化を足す      buildHandTable(BASE_HANDS, upgrades)      … damage +1 ずつ
2. 熱を引く        applyHeat(表, heat)                        … damage −penalty、最低1
3. 耐性を掛ける    max(1, floor(damage × resistance))         … battle.ts が既にやっている
4. にらみを足す    + stare × stareBonus                       … 耐性も熱も掛からない
```

1と2は `application` が組み立て、3と4は `resolveTurn` が行う。
**`domain/battle.ts` は変更しない。**

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
  /** 手の熱。戦闘ごとに 0 に戻す（`docs/adr/0002-hand-heat.md`） */
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
/** 表示用。熱による弱化量（0〜HEAT_MAX_PENALTY）。UI が「-1」等を出すのに使う */
export function heatPenalties(state: GameState): Readonly<Record<Hand, number>>;

/**
 * 表示用。その手をいま出して**勝ったとき**に実際に与えるダメージ。
 * 強化・熱・**耐性**・にらみをすべて含む。**必ず `dealtDamage` を通すこと**（節4）。
 * 戦闘中でなければ 0。
 */
export function damagePreview(state: GameState, hand: Hand): number;

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

**強化を足してから熱を引く**（節2.5 の適用順序）。

```
ctx = {
  playerHands: applyHeat(buildHandTable(BASE_HANDS, state.upgrades), state.playerHeat),
  enemyHands:  applyHeat(BASE_HANDS, state.enemyHeat),   // 敵は強化されないが熱は持つ
  enemy:       STAGES[state.stageIndex],
}
```

### 熱の更新

`resolveTurn` を呼んだあと、**両陣営ぶん**進める。敵が出した手は `result.log.enemyHand`。

```
playerHeat = advanceHeat(state.playerHeat, hand)
enemyHeat  = advanceHeat(state.enemyHeat, result.log.enemyHand)
```

**決着したターンでも更新してよい**（次の戦闘の頭で `NO_HEAT` に戻るため影響しない）。
**あいこのターンも更新する。** 手は出しているので熱はたまる。

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
> 最終更新: 2026-08-10（`/balance` で1戦を10〜14ターンに伸ばした時点）。

### `src/data/heat.ts`

```ts
import type { HeatRule } from '@/domain/handTable';

/** 熱の効き方。値は ADR 0002 のまま（置き場所だけ domain から移した） */
export const HEAT_RULE: HeatRule = { gain: 4, maxPenalty: 3 };
```

### `src/data/player.ts`

```ts
/** プレイヤーの最大HP。5戦を通して増えない（回復は戦闘中のパーだけ） */
export const PLAYER_MAX_HP = 18;
```

> **`application` ではなくここに置く理由。** 敵HPを動かすとクリア率が動くので、
> 釣り合いを取るためにプレイヤーHPも一緒に触ることになる。**両方が `src/data/` に
> 揃っていないと、バランス調整がロジック側に染み出す**（`CLAUDE.md` のレイヤ規約）。

### `src/data/hands.ts`

```ts
import type { HandTable } from '@/domain/handTable';

export const BASE_HANDS: HandTable = {
  rock:     { damage: 3, heal: 0, stareBonus: 3 },
  scissors: { damage: 5, heal: 0, stareBonus: 0 },
  paper:    { damage: 4, heal: 3, stareBonus: 0 },
};
```

> **グーの `stareBonus` は 2→3、チョキの `damage` は 6→5**（`docs/adr/0002-hand-heat.md`）。
> 熱の導入で手の価値の計算が変わったため、あわせて改定した。
> **非対称の構造（グー=溜め／チョキ=火力／パー=回復）は変えていない。**

### `src/data/enemies.ts`

**ここの数値は `/balance` で動かす出発点。** ロジックは数値に依存しない。

| # | id | 名前 | HP | normal（グー/チョキ/パー） | desperate | 耐性 | あいこ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `scarecrow` | かかし | 16 | .34 / .33 / .33 | 同じ | なし | standard |
| 2 | `rockGuard` | 岩の番人 | 18 | **.60** / .20 / .20 | .50 / .25 / .25 | なし | standard |
| 3 | `shearBird` | はさみ鳥 | 18 | .20 / **.60** / .20 | .25 / .50 / .25 | なし | standard |
| 4 | `paperEnvoy` | 紙の使者 | 21 | .20 / .20 / **.60** | .25 / .25 / .50 | チョキ ×0.5 | standard |
| 5 | `glicoKing` | グリコ王 | 23 | .30 / .30 / .40 | .40 / .20 / .40 | チョキ ×0.5 | **stareDouble** |

`resistance` は**3手すべてのキーを必ず書く**（等倍は `1`）。

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

`hint` は**画面にそのまま出す1行**。5体分をここで確定させる。

| id | hint |
| --- | --- |
| `scarecrow` | くせがない |
| `rockGuard` | グーを好む |
| `shearBird` | チョキを好む |
| `paperEnvoy` | パーを好む／チョキが効きにくい |
| `glicoKing` | チョキが効きにくい／にらみが倍で溜まる |

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
`hint` の一行（「グーを好む」）では、どれくらい好むのかも、外したら何が起きるのかも分からない。
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
- `hint` の一行は残す。数字と併記して読み方の助けにする

### 強化画面にも数字を出す（2026-08-10 追加）

`docs/01_requirements.md` の画面一覧は強化選択画面に「**グー/チョキ/パーの現在値**と3択」と
書いているが、**数字が1つも出ていなかった。** どの手が今いくつで、+1 で何になるかが
見えないまま選ばされるのは、戦闘画面と同じ「情報が足りない」問題。

- 各手に `upgradePreview(state, hand)` の値を出す。**`3 → 4` のように前後を並べる**
- 上限の手は `disabled` のまま**値は出す**（何が上限なのかが分かるように）
- **パーの回復量とグーのにらみ倍率も併記する。** ダメージだけ見せると、
  この3手が非対称であること（`docs/adr/0001-battle-model.md`）が伝わらない
- **熱と耐性は出さない。** どちらも次の戦闘の話であり、この画面の関心ではない

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

### 熱が見えること（`docs/adr/0002-hand-heat.md`）

**`playerHandTable` は強化と熱を両方適用した表を返す**ので、ボタンの数字は自動的に下がる。
ただし**なぜ下がったのかが分からないと理不尽になる**ので、次を満たす。

- **弱化している手は、下がっていることが一目で分かる**（色を変える、`-1` を添える等）
- 弱化量が深いほど強く見せる（`-1` / `-2` / `-3`）
- **敵側の熱は画面に出さなくてよい。** 出す情報を増やすと画面が読めなくなる

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
3. `application/game.ts` — `GameState` に熱2つ、`ctx` の組み立て、熱の更新、リセット
4. `ui/screens/battle.ts` — 弱化が見えるようにする

**`domain/battle.ts` は触らない。** 触る必要が出たら設計が間違っているので、
実装を進める前に `docs/03` に戻ること。
