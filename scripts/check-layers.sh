#!/usr/bin/env bash
# レイヤ規約の機械的な検査。
#
# CLAUDE.md のレイヤ規約のうち、grep で確実に判定できるものだけをここで潰す。
# これをスクリプトにしておくことで、同じ検査にモデルのトークンを使わずに済む。
# ここで拾えない「設計との差分」だけを design-conformance エージェントに回す。
#
# 終了コード: 0 = 適合 / 1 = 違反あり

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

violations=0

# コード行だけを対象にする（コメント行の誤検出を避ける）
scan() {
  local dir="$1" pattern="$2"
  [ -d "$dir" ] || return 0
  find "$dir" -name '*.ts' -type f 2>/dev/null | while read -r f; do
    grep -nE "$pattern" "$f" 2>/dev/null \
      | grep -vE '^[0-9]+: *(//|\*|/\*)' \
      | sed "s|^|${f}:|"
  done
}

report() {
  local title="$1" hits="$2" why="$3"
  [ -z "$hits" ] && return 0
  echo "✗ ${title}"
  echo "$hits" | sed 's/^/    /'
  echo "  → ${why}"
  echo
  violations=1
}

echo "レイヤ規約チェック"
echo

# --- src/domain/ は純粋であること ---
#
# メンバアクセスの形（window. / document[ 等）だけを拾う。
# 名前だけで弾くと HeatRule.window（docs/03 節2.5 の「窓の広さ」）のような
# 正当なプロパティ名まで違反になる。DOM は必ず何かを生やして使うので、
# 「. か [ が続くこと」を条件にしても検出力はほぼ落ちない。
report "domain が DOM に触れている" \
  "$(scan src/domain '(^|[^.[:alnum:]_$])(document|window|localStorage|sessionStorage)[[:space:]]*[.[]')" \
  "domain はブラウザなしでテストできなければならない。UI 層へ移すこと。"

report "domain が Math.random を直接呼んでいる" \
  "$(scan src/domain 'Math\.random')" \
  "同じ試合を再現できなくなる。lib/rng.ts の Rng を引数で受け取ること。"

report "domain が現在時刻を参照している" \
  "$(scan src/domain '(Date\.now|new Date)')" \
  "実行するたびに結果が変わり、テストが不安定になる。"

report "domain から上位層への import がある（依存の逆流）" \
  "$(scan src/domain "from '(@/(ui|application)|\.\./(ui|application))")" \
  "依存は ui → application → domain の一方向。domain は誰にも依存しない。"

report "domain が data を import している" \
  "$(scan src/domain "from '(@/data|\.\./data)")" \
  "domain は数値を知らない。手の値も敵の定義も引数で受け取ること。
     ここを守ると、/balance で src/data を書き換えても domain のテストが壊れない。
     型だけが必要なら、その型は domain 側に置く。"

# --- src/application/ は DOM を触らないこと ---
report "application が DOM を直接操作している" \
  "$(scan src/application '\b(document|window)\b')" \
  "DOM を触るのは ui 層だけ。application は進行制御に徹すること。"

report "application が Math.random を直接呼んでいる" \
  "$(scan src/application 'Math\.random')" \
  "lib/rng.ts の Rng を引数で受け取ること。"

# --- src/data/ はデータだけであること ---
report "data にロジックが混ざっている" \
  "$(scan src/data '(\bfunction\b|=>|\bif *\(|\bfor *\(|\bswitch *\()')" \
  "data は数値定義だけを置く。ロジックは domain へ移すこと。"

echo "───────────────"
if [ "$violations" -eq 0 ]; then
  echo "✓ 適合"
else
  echo "✗ 違反あり"
fi
exit "$violations"
