/**
 * `public/assets/` に置いた画像のURL。
 *
 * **`/assets/...` と直書きしないこと。** GitHub Pages はリポジトリ名の
 * サブディレクトリ（`/JankenGame/`）で配信されるため、先頭の `/` はサイトの
 * ルートを指してしまい、**画像が1枚も出なくなる。**
 * `vite.config.ts` の `base` を通すこの関数が唯一の出どころ。
 */
export function assetUrl(name: string): string {
  // **必ず絶対URLまで解決する。** 相対のまま返すと、`img.src` は文書基準で正しく引けるのに、
  // **CSS カスタムプロパティに入れたものだけが外部スタイルシート基準で解決され**、
  // `/JankenGame/assets/assets/…` と二重になって 404 する
  // （`--battle-background` と `--defeat-background` で実際に踏んだ）。
  return new URL(`${import.meta.env.BASE_URL}assets/${name}`, document.baseURI).href;
}
