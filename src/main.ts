// エントリポイント。
// 実装フェーズでは、ここは application/gameLoop を起動するだけに留める。
// ゲームロジックをこのファイルに書かないこと。

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('#app が見つかりません');
}

app.innerHTML = `
  <main class="placeholder">
    <h1>じゃんけんRPG</h1>
    <p>設計フェーズ中です。</p>
  </main>
`;
