---
description: 設計フェーズ。基本設計 docs/02 と詳細設計 docs/03 を書く
---

`docs/01_requirements.md` と `docs/adr/` を読み、設計フェーズを進める。

## 基本設計 → `docs/02_architecture.md`

- モジュール構成と依存の向き（`ui → application → domain` を守れているか）
- 主要な状態（`GameState`, `BattleState` が何を持つか）
- 画面遷移図

## 詳細設計 → `docs/03_detailed-design.md`

- `domain/` 各モジュールの公開関数シグネチャと不変条件
- ダメージ計算式（変数と定数を明示する）
- 敵AIの手の決め方
- `data/` に置く数値の型定義

## 制約

- CLAUDE.md のレイヤ規約に反する設計を書かない。
- 乱数を使う箇所は、すべて `lib/rng.ts` の RNG を引数で受け取る形にする。
- まだ実装しない。設計が固まってから `/impl` に進む。

$ARGUMENTS
