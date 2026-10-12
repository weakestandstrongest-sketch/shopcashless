// OpenStreetMap のデータを取得する（APIキー不要）。
// Overpass API: 店舗の検索 / 国土地理院・Nominatim: 地名 ⇔ 座標
//
// Overpass は公開サーバーなので、重い問い合わせは時間切れになりやすい。
// - チェーン店は brand:wikidata・店名の「完全一致」で探す（索引が効くので速い）
// - 正規表現を使うのは、チェーン以外の店名で探すときだけ
// - 店舗かどうか（shop / amenity …）の判定はサーバーではなく、受け取ってから行う

import { METHOD_BY_ID } from './payments.js?v=8';
import { namePatternFor } from './core.js?v=8';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const ATTEMPT_TIMEOUT_MS = 20000;

// Overpass の文字列リテラル用に \ と " をエスケープ
const q = (text) => String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// 見つかった店舗の近く（1.2km以内）の駅もいっしょに取得する。店舗の場所の目印にする
function wrap(statements, limit) {
  return `[out:json][timeout:25];
(
${statements.join('\n')}
)->.shops;
.shops out body center ${limit};
node(around.shops:1200)["railway"="station"]["name"];
out body 300;`;
}

// チェーン店を探すクエリ（複数チェーンをまとめて探せる）
// 1) brand:wikidata・店名・ブランドの完全一致（チェーンの目印が付いている店舗）
// 2) 「コンビニ」「ファストフード」など業種で絞り込んだ上での店名の部分一致
//    （「セブン-イレブン 渋谷道玄坂店」のように、目印がなく店名に店舗名まで入っている店舗）
//    業種の完全一致で先に絞り込むので、正規表現でも重くならない
export function buildChainQuery(chains, { lat, lon }, radius, limit = 400) {
  const around = `(around:${radius},${lat},${lon})`;
  const lines = [];
  const patternsByKind = new Map();
  for (const c of chains) {
    for (const id of c.osm?.wikidata ?? []) lines.push(`  nwr["brand:wikidata"="${q(id)}"]${around};`);
    for (const n of c.osm?.names ?? []) {
      lines.push(`  nwr["name"="${q(n)}"]${around};`);
      lines.push(`  nwr["brand"="${q(n)}"]${around};`);
    }
    for (const [key, values] of Object.entries(c.kinds ?? {})) {
      // コンビニなど shop で表すチェーンは、shop の値を問わない（shop=yes で登録された店舗も拾う）
      const kinds = key === 'shop' ? ['["shop"]'] : values.map((v) => `["${q(key)}"="${q(v)}"]`);
      for (const kind of kinds) patternsByKind.set(kind, [...(patternsByKind.get(kind) ?? []), c.pattern]);
    }
  }
  for (const [kind, patterns] of patternsByKind) {
    lines.push(`  nwr${kind}${around}["name"~"${q(patterns.join('|'))}",i];`);
  }
  return wrap(lines, limit);
}

// チェーン以外の店名で探すクエリ（部分一致）
export function buildNameQuery(pattern, { lat, lon }, radius, limit = 400) {
  const around = `(around:${radius},${lat},${lon})`;
  const p = q(pattern);
  return wrap([
    `  nwr${around}["name"~"${p}",i];`,
    `  nwr${around}["name:ja"~"${p}",i];`,
    `  nwr${around}["brand"~"${p}",i];`,
  ], limit);
}

// 指定の支払い方法タグが付いた店舗を探すクエリ（例：payment:paypay=yes）
export function buildPaymentQuery(methodId, { lat, lon }, radius, limit = 400) {
  const keys = METHOD_BY_ID[methodId]?.osm ?? [];
  const around = `(around:${radius},${lat},${lon})`;
  return wrap(keys.flatMap((k) => [
    `  nwr["payment:${k}"="yes"]${around};`,
    `  nwr["payment:${k}"="only"]${around};`,
  ]), limit);
}

export class SearchError extends Error {
  constructor(kind, message, detail = '') {
    super(message);
    this.kind = kind; // 'busy'（混雑・時間切れ） | 'blocked'（応答が受け取れない） | 'offline'（端末がオフライン）
    this.detail = detail; // サーバーごとの失敗理由（問い合わせの手がかり用）
  }
}

async function postOverpass(query, signal, onRetry) {
  const failures = [];
  for (const [i, url] of OVERPASS_ENDPOINTS.entries()) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    if (i > 0) onRetry?.(i);
    const host = new URL(url).host;
    // 1 台あたり最大 20 秒。応答がなければ次のサーバーへ
    const attempt = new AbortController();
    const timer = setTimeout(() => attempt.abort(), ATTEMPT_TIMEOUT_MS);
    const stop = () => attempt.abort();
    signal?.addEventListener('abort', stop);
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: attempt.signal });
      if (!res.ok) {
        failures.push(`${host}: HTTP ${res.status}`); // 429（混雑）・504（時間切れ）など
        continue;
      }
      const json = await res.json();
      if (json.remark && /timed out|out of memory/i.test(json.remark) && !json.elements?.length) {
        failures.push(`${host}: 時間切れ`);
        continue;
      }
      return json.elements ?? [];
    } catch (e) {
      if (signal?.aborted) throw e; // 新しい検索が始まった
      // 混雑時のエラー応答は、ブラウザには「読み込み失敗」としか見えないことがある
      failures.push(`${host}: ${attempt.signal.aborted ? '20秒で応答なし' : `応答を受け取れず（${e.message}）`}`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
    }
  }
  const detail = failures.join(' / ');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new SearchError('offline', 'この端末がインターネットに接続されていないようです', detail);
  }
  const busy = failures.some((f) => /HTTP|時間切れ|応答なし/.test(f));
  throw busy
    ? new SearchError('busy', '地図データのサーバーが混み合っています', detail)
    : new SearchError('blocked', '地図データのサーバーから応答を受け取れませんでした', detail);
}

export function searchChains(chains, center, radius, { signal, onRetry } = {}) {
  return postOverpass(buildChainQuery(chains, center, radius), signal, onRetry);
}

export function searchByName(name, center, radius, { signal, onRetry } = {}) {
  return postOverpass(buildNameQuery(namePatternFor(name), center, radius), signal, onRetry);
}

export function searchByPayment(methodId, center, radius, { signal, onRetry } = {}) {
  return postOverpass(buildPaymentQuery(methodId, center, radius), signal, onRetry);
}

// 予備の店舗検索：Overpass が使えないときに Nominatim で店名を探す（最大 40 件・駅の情報なし）。
// 結果は Overpass と同じ形に変換して返す
export async function nominatimSearch(term, { lat, lon }, radius, { signal } = {}) {
  const dLat = radius / 111320;
  const dLon = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  const viewbox = [lon - dLon, lat + dLat, lon + dLon, lat - dLat].map((n) => n.toFixed(5)).join(',');
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=40&countrycodes=jp'
    + `&extratags=1&namedetails=1&accept-language=ja&bounded=1&viewbox=${viewbox}&q=${encodeURIComponent(term)}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`予備の検索に失敗しました（HTTP ${res.status}）`);
  const hits = await res.json();
  return hits.map((h) => ({
    type: h.osm_type,
    id: h.osm_id,
    lat: Number(h.lat),
    lon: Number(h.lon),
    tags: { ...(h.extratags ?? {}), ...(h.namedetails ?? {}), [h.category]: h.type },
  }));
}

// 地名 → 座標（日本国内に限定）
export async function geocode(area, { signal } = {}) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=jp&accept-language=ja&q=${encodeURIComponent(area)}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`地名検索に失敗しました（HTTP ${res.status}）`);
  const [hit] = await res.json();
  if (!hit) return null;
  return { lat: Number(hit.lat), lon: Number(hit.lon), label: hit.display_name };
}

// 座標 → 町名。国土地理院の逆ジオコーダー（無料・キー不要・日本国内向け）
// 返り値の例：{ muniCd: '13113', lv01Nm: '宇田川町' }
export async function gsiReverse({ lat, lon }, { signal } = {}) {
  const url = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lon}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`住所の取得に失敗しました（HTTP ${res.status}）`);
  const json = await res.json();
  return json.results ?? null;
}

// 座標 → 住所（予備）。Nominatim の利用規約に合わせ、呼び出し側で 1 秒に 1 回までにすること
export async function reverseGeocode({ lat, lon }, { signal } = {}) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=ja&lat=${lat}&lon=${lon}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`住所の取得に失敗しました（HTTP ${res.status}）`);
  const json = await res.json();
  return json.address ?? null;
}
