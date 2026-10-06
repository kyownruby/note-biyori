# notebiyori-proxy（Cloudflare Worker）

のーとびより（`index.html`）専用の note API 中継です。
ブラウザから直接呼べない note API を、CORS ヘッダー付きで返します。
アプリ側ではこの Worker を最優先で使い、失敗したときは公開 CORS プロキシにフォールバックします。

## 仕様

- 形式：`https://notebiyori-proxy.<サブドメイン>.workers.dev/?url=<エンコードした note API URL>`
- メソッド：`GET` と `OPTIONS`（プリフライト）のみ。それ以外は 405
- 中継を許可するパス（`https://note.com` のみ・それ以外は 403）
  - `/api/v2/creators/{urlname}`（プロフィール：成功時のみ 10 分キャッシュ）
  - `/api/v2/creators/{urlname}/contents`
  - `/api/v3/notes/{key}`
  - `/api/v3/notes/{key}/note_comments`
- 許可する Origin：`https://kyownruby.github.io`、`http://localhost[:port]`、`http://127.0.0.1[:port]`（それ以外・Origin なしは 403）
- アプリが付ける `_t`（キャッシュ回避用）は、転送先 URL とキャッシュキーから除外
- note 側のステータスコードと JSON 本文をそのまま返す

## 初回デプロイ／再デプロイ

```bash
cd worker
npm install
npx wrangler login     # 初回のみ（ブラウザで Cloudflare にログイン）
npx wrangler deploy
```

初回デプロイ後に表示された `https://notebiyori-proxy.<サブドメイン>.workers.dev` を、
`index.html` の `NOTEBIYORI_PROXY_URL` に設定します（末尾の `/` は付けない）。
空文字のあいだはアプリから使われません。

## ローカル確認

```bash
npx wrangler dev
# 別ターミナルで
curl -H "Origin: http://localhost" "http://localhost:8787/?url=https%3A%2F%2Fnote.com%2Fapi%2Fv2%2Fcreators%2Fkyownruby"
```
