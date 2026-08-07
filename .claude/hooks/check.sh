#!/usr/bin/env bash
# PostToolUse hook
#
# .ts ファイルが編集された直後に型チェックと関連テストを回し、
# 失敗を Claude に差し戻す。壊れたことを人間が見つけて指摘する手間をなくすのが目的。
#
# 終了コード 2 = stderr の内容が Claude にフィードバックされる。
# それ以外の失敗（node_modules 未導入など）では 0 を返し、作業を止めない。

set -uo pipefail

payload=$(cat)

# stdin の JSON から編集対象ファイルのパスを取り出す
file=$(printf '%s' "$payload" | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    try {
      const j = JSON.parse(s);
      process.stdout.write((j.tool_input && j.tool_input.file_path) || "");
    } catch {
      /* 解析できなければ何も出さない = チェックをスキップ */
    }
  });
' 2>/dev/null)

# TypeScript 以外は対象外
case "$file" in
  *.ts) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# 依存が未導入の段階では黙って通す
[ -d node_modules ] || exit 0

if ! out=$(npx --no-install tsc --noEmit 2>&1); then
  {
    echo "型チェックに失敗しました。次の作業に進む前に直してください。"
    echo "$out"
  } >&2
  exit 2
fi

if ! out=$(npx --no-install vitest related --run --passWithNoTests "$file" 2>&1); then
  {
    echo "テストに失敗しました。次の作業に進む前に直してください。"
    echo "$out"
  } >&2
  exit 2
fi

# レイヤ規約の機械的な検査。ここで拾える違反にモデルのトークンを使わない。
if ! out=$(./scripts/check-layers.sh 2>&1); then
  {
    echo "レイヤ規約に違反しています。次の作業に進む前に直してください。"
    echo "$out"
  } >&2
  exit 2
fi

exit 0
