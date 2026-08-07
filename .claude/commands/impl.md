---
description: 実装フェーズ。設計に従って domain から順に実装する
---

`docs/02_architecture.md` と `docs/03_detailed-design.md` に従って実装する。

## 順序

必ず内側から外側へ。

1. `src/domain/` — 純粋ロジック。**書いたらすぐ `tests/unit/` にテストを書く**
2. `src/data/` — 敵とスキルの数値
3. `src/application/` — ゲーム進行
4. `src/ui/` — 画面

## 守ること

- 設計と違う実装が必要になったら、勝手に変えず**先に `docs/03` を更新**してから実装する。
- `domain/` で `Math.random()` / `Date.now()` / DOM を使わない。
- `npm run check` が通らない状態で次のモジュールに進まない。
- UI まで到達したら開発サーバを起動し、ブラウザで自分で表示と操作を確認する。

$ARGUMENTS
