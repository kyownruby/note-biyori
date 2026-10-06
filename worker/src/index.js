// のーとびより専用の note API 中継（CORSプロキシ）
// 受け付ける形式: https://{worker}/?url={エンコードしたnoteのAPI URL}

// 中継を許可する note API のパス（これ以外は403）
const ALLOWED_PATHS = [
  { re: /^\/api\/v2\/creators\/[A-Za-z0-9_-]+$/, cache: true }, // プロフィール（10分キャッシュ）
  { re: /^\/api\/v2\/creators\/[A-Za-z0-9_-]+\/contents$/, cache: false }, // 記事一覧
  { re: /^\/api\/v3\/notes\/[A-Za-z0-9]+$/, cache: false }, // 記事情報
  { re: /^\/api\/v3\/notes\/[A-Za-z0-9]+\/note_comments$/, cache: false }, // コメント
];

// 公開ドメイン（GitHub Pages）と開発用の localhost / 127.0.0.1 だけ許可
const ALLOWED_ORIGINS = [
  /^https:\/\/kyownruby\.github\.io$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

const PROFILE_CACHE_SECONDS = 600;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

function corsHeaders(origin) {
  return { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' };
}

function jsonError(status, message, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(origin ? corsHeaders(origin) : {}) },
  });
}

// ?url= の中身を検証し、許可パスなら転送先URL（_t を除いたもの）を返す
function resolveTarget(raw) {
  if (!raw) return null;
  let target;
  try { target = new URL(raw); } catch (e) { return null; }
  if (target.protocol !== 'https:' || target.hostname !== 'note.com' || target.port
    || target.username || target.password) return null;
  const rule = ALLOWED_PATHS.find(r => r.re.test(target.pathname));
  if (!rule) return null;
  // アプリが付けるキャッシュ回避用の _t は転送先・キャッシュキーの両方から外す
  target.searchParams.delete('_t');
  target.hash = '';
  return { url: target.toString(), cache: rule.cache };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.some(re => re.test(origin))) {
      return jsonError(403, 'origin not allowed');
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin),
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    if (request.method !== 'GET') {
      return jsonError(405, 'method not allowed', origin);
    }

    const target = resolveTarget(new URL(request.url).searchParams.get('url'));
    if (!target) return jsonError(403, 'url not allowed', origin);

    const init = {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
    };
    if (target.cache) {
      // 成功レスポンスだけ10分キャッシュする（エラーはキャッシュしない）
      init.cf = {
        cacheEverything: true,
        cacheKey: target.url,
        cacheTtlByStatus: { '200-299': PROFILE_CACHE_SECONDS, '300-599': -1 },
      };
    }

    let upstream;
    try {
      upstream = await fetch(target.url, init);
    } catch (e) {
      return jsonError(502, 'upstream fetch failed', origin);
    }

    // note側のステータスコードと本文はそのまま返す
    const headers = {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
    };
    const cacheStatus = upstream.headers.get('CF-Cache-Status');
    if (cacheStatus) headers['X-Upstream-Cache'] = cacheStatus;
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
