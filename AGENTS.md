# AGENTS.md

じゃんけんの要素を戦闘に組み込んだ小規模RPG。TypeScript + Vite + Vitest。フレームワークは使わない。

このファイルは Codex 向けです。あなたには通常、**`docs/03_detailed-design.md` に書かれた
モジュールを1つ実装する**仕事が渡されます。設計は既に確定しているので、設計を作り直さないでください。

## 完了の定義

次のコマンドが通ることが完了条件です。**これが通るまでが仕事です。**

```bash
npm run check
```

内訳は型チェック（`tsc --noEmit`）、テスト（`vitest`）、レイヤ規約チェック
（`scripts/check-layers.sh`）の3つです。

## レイヤ規約（違反するとビルドが落ちます）

依存の向きは常に `ui → application → domain` の一方向。逆流させないでください。

| ディレクトリ | 責務 | 禁止事項 |
| --- | --- | --- |
| `src/domain/` | 純粋ロジック。状態を受け取り、新しい状態を返す | **`document` / `window` / `localStorage` / `Math.random()` / `Date.now()` / `new Date()` を書かない。`ui` `application` から import しない** |
| `src/application/` | ゲーム進行。domain を繋ぐ | `document` / `window` を触らない。`Math.random()` を書かない |
| `src/data/` | 敵・スキル・ステージの**数値定義のみ** | 関数・アロー関数・`if` / `for` / `switch` を書かない |
| `src/ui/` | 描画と入力 | ここ以外で DOM を触らない |
| `src/lib/` | 汎用ユーティリティ | ゲーム固有の知識を持ち込まない |

### 乱数について

**`Math.random()` を直接呼ばないでください。** `src/lib/rng.ts` の `Rng` を
**引数で受け取る**形にします。同じシードで同じ試合が再現できる状態を壊さないためです。

```ts
// 正しい
export function chooseHand(enemy: Enemy, rng: Rng): Hand { ... }

// 間違い
export function chooseHand(enemy: Enemy): Hand {
  return HANDS[Math.floor(Math.random() * 3)];
}
```

### 数値の置き場所

後で調整したくなる数値（敵のHP、攻撃力、スキルの倍率）は `src/data/` に置き、
ロジック側にハードコードしないでください。構造上の定数（じゃんけんの手が3種類）は例外です。

## 実装の順序

`domain/` を書いたら、**続けて `tests/unit/` に対応するテストを書いてください。**
テストなしで次のモジュールに進まないでください。境界値（HP が 0、空配列、あいこの連続）を含めます。

## 設計と食い違うとき

実装してみて設計が破綻していると分かった場合、**勝手に設計を変えないでください。**
実装を止めて、「設計のどこが、なぜ成立しないか」を報告してください。判断はこちらで行います。

## 触らないもの

- `docs/` 配下（設計ドキュメント）
- `.claude/` 配下
- `CLAUDE.md`, `AGENTS.md`
- `scripts/check-layers.sh`

規約に合わないコードを通すために検査スクリプトを緩めることは、**しないでください。**
