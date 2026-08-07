---
description: 実装フェーズ。Codex (gpt-5.6-luna) に1モジュールずつ実装させ、判断はこちらで持つ
---

`docs/03_detailed-design.md` に従って実装する。**実装の手を動かすのは Codex、
判断するのはこちら**という分担で進める。

## 前提条件

`docs/03_detailed-design.md` が**関数シグネチャのレベルまで**書けていること。
曖昧なままなら Codex に渡さない。先に `/design` を仕上げる。

## 順序

必ず内側から外側へ。**1モジュールずつ**渡す。まとめて渡さない。

1. `src/domain/` — 純粋ロジック + 対応するテスト
2. `src/data/` — 敵とスキルの数値
3. `src/application/` — ゲーム進行
4. `src/ui/` — 画面

## 1モジュールごとの手順

**1. 渡す前に必ずコミットする**

```bash
git add -A && git commit -m "wip: <直前までの内容>"
```

これで Codex の変更が `git diff` にそのまま出る。まずければ `git checkout .` で戻せる。

**2. Codex に実装させる**

```bash
codex exec --model gpt-5.6-luna --full-auto "docs/03_detailed-design.md の <モジュール名> を実装し、tests/unit に対応するテストを書く。npm run check が通るまで仕上げる。" < /dev/null
```

`< /dev/null` は必須。付けないと Codex が stdin からの追加入力を待って止まる。

規約は `AGENTS.md` に書いてあるので、プロンプトに規約を書き写さない。
**設計のどの部分を実装するのかだけを指定する。**

**3. 結果を検証する**

```bash
git diff --stat && npm run check
```

**4. 差分を自分で読む。** `npm run check` は通るが設計と違う、という状態はあり得る。

## エラーが出たときの切り分け

| 状況 | 対応 |
| --- | --- |
| `npm run check` が落ちる（1回目） | Codex に差し戻す。エラー出力をそのまま渡す |
| 同じ箇所で2回落ちる | **こちら（Opus）で直す。** 差し戻しを繰り返さない |
| 設計の破綻が原因 | コードではなく `docs/03` を直し、ユーザーに報告してから再実装 |
| レイヤ規約違反 | `scripts/check-layers.sh` の出力を渡して差し戻す |

2回で切り上げるのは、原因が設計側にあるとき Codex は何度やっても同じ壁に当たるため。

## 守ること

- **設計と違う実装が必要になったら、先に `docs/03` を更新**してから実装する。
- `npm run check` が通らない状態で次のモジュールに進まない。
- UI まで到達したら開発サーバを起動し、ブラウザで自分で表示と操作を確認する。
- モジュールが1つ完成するごとにコミットして push する。

$ARGUMENTS
