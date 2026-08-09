# 基本設計

> ステータス: **確定**（2026-08-09）。要件は `docs/01_requirements.md`、戦闘方式は `docs/adr/0001-battle-model.md`。

## モジュール構成と依存の向き

依存は `ui → application → domain` の一方向。詳細は CLAUDE.md のレイヤ規約を参照。

```
src/
  main.ts               起動。シードを作り、app を立ち上げる
  lib/
    rng.ts              シード付き乱数（実装済み）
  domain/               純粋ロジック。data を import しない
    hand.ts             Hand / Outcome / judge
    handTable.ts        手の値、強化の適用
    enemy.ts            EnemyDef の型、敵の手の抽選
    battle.ts           BattleState、1ターンの解決
  data/                 数値定義のみ。リテラルだけ
    hands.ts            グー/チョキ/パーの基礎値
    enemies.ts          敵5体の定義
    stages.ts           敵の並び（一本道）
  application/          進行制御。DOM を触らない
    game.ts             GameState、画面遷移、domain の呼び出し
  ui/                   描画と入力。ここだけが DOM を触る
    app.ts              GameState を保持し、phase で画面を描き分ける
    screens/            title / battle / upgrade / result
    components/         HPバー、にらみ表示、手のボタン
    styles/main.css
```

### なぜ domain が data を import しないのか

**`domain/` は数値を一切知らない。** 手の値も敵の定義も、すべて**引数で受け取る**。

- テストが `src/data/` の実際の数値に依存しなくなる。
  `docs/04_test-plan.md` の「バランス調整でテストが壊れない」を満たすための設計。
- `/balance` で `src/data/` を書き換えても `domain/` のテストは1本も壊れない。

型は `domain/` が持ち、`data/` がそれを実装する（`import type` のみ。値の依存は発生しない）。

### `src/data/` に書けるもの

レイヤチェッカ（`scripts/check-layers.sh`）が `src/data/` で
`function` / `=>` / `if (` / `for (` / `switch (` を**禁止**している。

書いてよいのは**リテラル・`import type`・`satisfies`・他の data からの値 import** まで
（`stages.ts` が `enemies.ts` の `ENEMIES` を参照するのはこれに当たる）。
**禁止しているのはロジックであって、値の参照ではない。**
ヘルパ関数を作りたくなったら、それは `domain/` に置くべきロジック。

## 主要な状態

### `BattleState`（domain）— 1回の戦闘

| フィールド | 型 | 意味 |
| --- | --- | --- |
| `playerHp` / `playerMaxHp` | `number` | プレイヤーのHP。`0 <= hp <= max` |
| `enemyHp` / `enemyMaxHp` | `number` | 敵のHP。同上 |
| `stare` | `number` | **にらみ**。`0 <= stare <= STARE_MAX(2)` |
| `turn` | `number` | 経過ターン数。1ターンごとに +1 |
| `outcome` | `'playerWin' \| 'playerLose' \| null` | `null` は継続中 |

**増える状態は `stare` の1つだけ**（ADR 0001）。手の履歴は持たない。
敵AIが履歴を見ないと決めたため（`docs/01_requirements.md`）、保持する理由がない。

### `GameState`（application）— 1周のプレイ

| フィールド | 型 | 意味 |
| --- | --- | --- |
| `phase` | `'title' \| 'battle' \| 'upgrade' \| 'result'` | 今どの画面か |
| `stageIndex` | `number` | 何体目か（0 起点） |
| `upgrades` | `UpgradeCounts` | 手ごとの強化回数。各 0〜2 |
| `battle` | `BattleState \| null` | `title` のときだけ `null`。**`upgrade` と `result` でも最後の状態を保持する**（結果画面で最終HPを見せるため） |
| `lastLog` | `TurnLog \| null` | 直前のターンの内訳（画面表示用） |
| `cleared` | `boolean` | 結果画面がクリアかゲームオーバーか |

**保存しないので、これがすべて。** リロードで `createGame()` の初期値に戻る。

### 状態を持つ場所は1つだけ

`ui/app.ts` が `GameState` を1つ持ち、入力のたびに `application` の関数へ渡して
**新しい `GameState` を受け取り、差し替えて再描画する。** `domain` も `application` も
状態を書き換えず、必ず新しい値を返す。

## 画面遷移

```
                  ┌──────────┐
                  │  title   │
                  └────┬─────┘
                       │ はじめる
                       ▼
                  ┌──────────┐
       ┌─────────▶│  battle  │
       │          └────┬─────┘
       │               │
       │    ┌──────────┼───────────┐
       │    │勝ち       │勝ち        │負け
       │    │(最終でない)│(5体目)     │
       │    ▼          ▼           ▼
       │ ┌────────┐  ┌────────────────┐
       └─┤upgrade │  │     result     │
   選択   └────────┘  │ クリア/ゲームオーバー│
                      └───────┬────────┘
                              │ タイトルへ
                              ▼
                           title
```

**行き止まりを作らない。** `result` からは必ず `title` に戻れる。
`upgrade` は必ず選択肢が1つ以上残る（下記）。

### `upgrade` が詰まないことの確認

強化のチャンスは**4回**（1〜4体目を倒したとき）。1手あたりの上限は**2**。
3手 × 2 = 6枠あるので、4回使い切っても**必ず空きが残る**。
最悪でも2手が埋まるだけで、3手目は必ず選べる。**選択肢が0になる経路は存在しない。**

## 乱数

- 乱数を使うのは `domain/enemy.ts` の `decideEnemyHand` **1箇所だけ**
- `Rng` は必ず**引数で受け取る**。`domain` / `application` は `Rng` を生成しない
- シードを作るのは `src/main.ts`（`ui` 層）。`Date.now()` を使ってよいのはここだけ
- テストは固定シードの `createRng(seed)` を渡す。同じシードなら同じ試合が再現される

## テストの当て所

`docs/04_test-plan.md` の3層に対応させる。

| 層 | 対象 |
| --- | --- |
| `tests/unit/` | `domain/hand.ts`・`handTable.ts`・`enemy.ts`・`battle.ts` の純粋関数 |
| `tests/scenario/` | `application/game.ts` を通した1周（勝ち / 負け / あいこ連続） |
| 手動 | `ui/` を含めた画面遷移と表示 |
