// OpenStreetMap のデータを取得する（APIキー不要）。
// Overpass API: 店舗の検索 / 国土地理院・Nominatim: 地名 ⇔ 座標
//
// Overpass は公開サーバーなので、重い問い合わせは時間切れになりやすい。
// - チェーン店は brand:wikidata・店名の「完全一致」で探す（索引が効くので速い）
// - 正規表現を使うのは、チェーン以外の店名で探すときだけ
// - 店舗かどうか（shop / amenity …）の判定はサーバーではなく、受け取ってから行う

import { METHOD_BY_ID } from './payments.js?v=4';
import { namePatternFor } from './core.js?v=4';

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
export function buildChainQuery(chains, { lat, lon }, radius, limit = 400) {
  const around = `(around:${radius},${lat},${lon})`;
  const lines = [];
  for (const c of chains) {
    for (const id of c.osm?.wikidata ?? []) lines.push(`  nwr["brand:wikidata"="${q(id)}"]${around};`);
    for (const n of c.osm?.names ?? []) {
      lines.push(`  nwr["name"="${q(n)}"]${around};`);
      lines.push(`  nwr["brand"="${q(n)}"]${around};`);
    }
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
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'busy'（混雑・時間切れ） | 'offline'（通信できない）
  }
}

async function postOverpass(query, signal, onRetry) {
  let busy = false;
  for (const [i, url] of OVERPASS_ENDPOINTS.entries()) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    if (i > 0) onRetry?.(i);
    // 1 台あたり最大 20 秒。応答がなければ次のサーバーへ
    const attempt = new AbortController();
    const timer = setTimeout(() => attempt.abort(), ATTEMPT_TIMEOUT_MS);
    const stop = () => attempt.abort();
    signal?.addEventListener('abort', stop);
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: attempt.signal });
      if (!res.ok) {
        busy = true; // 429（混雑）・504（時間切れ）など
        continue;
      }
      const json = await res.json();
      if (json.remark && /timed out|out of memory/i.test(json.remark) && !json.elements?.length) {
        busy = true;
        continue;
      }
      return json.elements ?? [];
    } catch (e) {
      if (signal?.aborted) throw e; // 新しい検索が始まった
      if (attempt.signal.aborted) busy = true; // 20 秒で応答なし
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
    }
  }
  throw busy
    ? new SearchError('busy', '地図データのサーバーが混み合っています。少し待ってからもう一度検索するか、範囲を狭めてお試しください')
    : new SearchError('offline', '地図データのサーバーに接続できませんでした。通信状態を確認して、もう一度お試しください');
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
