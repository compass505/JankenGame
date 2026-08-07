# じゃんけんRPG

じゃんけんの要素を戦闘に組み込んだ小規模RPG。ブラウザで動く。

## セットアップ

```bash
npm install
```

## コマンド

```bash
npm run dev        # 開発サーバ
npm run check      # 型チェック + テスト
npm test           # テストのみ
npm run typecheck  # 型チェックのみ
npm run build      # 本番ビルド
```

## 進め方

工程の成果物は `docs/` にある。作業は Claude Code のスラッシュコマンドで進める。

| コマンド | 工程 | 出力先 |
| --- | --- | --- |
| `/research` | 調査 | `docs/00_research.md` |
| `/spec` | 要件定義 | `docs/01_requirements.md`, `docs/adr/` |
| `/design` | 基本設計・詳細設計 | `docs/02_architecture.md`, `docs/03_detailed-design.md` |
| `/impl` | 実装 | `src/` |
| `/conform` | 設計適合レビュー | 報告のみ |
| `/assets` | 画像素材の発注仕様 | `docs/05_assets.md` |
| `/balance` | バランス調整 | `src/data/` |

画像は imagegen で生成する。`/assets` で仕様を作り、Codex 経由で生成したものを
`public/assets/` に置く。

`.ts` を編集すると hook（`.claude/hooks/check.sh`）が型チェックと関連テストを自動実行する。

コーディング規約とレイヤの責務は [CLAUDE.md](CLAUDE.md) を参照。
