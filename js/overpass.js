// OpenStreetMap のデータを取得する（APIキー不要）。
// Overpass API: 店舗の検索 / Nominatim: 地名 → 座標

import { METHOD_BY_ID } from './payments.js?v=3';
import { namePatternFor } from './core.js?v=3';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const PLACE = '[~"^(shop|amenity|tourism|leisure|craft|office|healthcare)$"~"."]';

// 見つかった店舗の近く（1.2km以内）の駅もいっしょに取得する。店舗の場所の目印にする
function wrap(statements, limit) {
  return `[out:json][timeout:40];
(
${statements}
)->.shops;
.shops out body center ${limit};
nwr(around.shops:1200)["railway"="station"]["name"];
out body center 400;`;
}

// 名前・ブランドで店舗を探すクエリ
export function buildNameQuery(pattern, { lat, lon }, radius, limit = 400) {
  const around = `(around:${radius},${lat},${lon})`;
  // Overpass の文字列リテラル用に \ と " をエスケープ
  const p = pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return wrap([
    `  nwr["name"~"${p}",i]${PLACE}${around};`,
    `  nwr["name:ja"~"${p}",i]${PLACE}${around};`,
    `  nwr["brand"~"${p}",i]${PLACE}${around};`,
  ].join('\n'), limit);
}

// 指定の支払い方法タグが付いた店舗を探すクエリ（例：payment:paypay=yes）
export function buildPaymentQuery(methodId, { lat, lon }, radius, limit = 400) {
  const keys = METHOD_BY_ID[methodId]?.osm ?? [];
  const around = `(around:${radius},${lat},${lon})`;
  return wrap(keys.map((k) => `  nwr["payment:${k}"~"^(yes|only)$"]${around};`).join('\n'), limit);
}

async function postOverpass(query, signal) {
  let lastError;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.elements ?? [];
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      lastError = e;
    }
  }
  throw lastError ?? new Error('Overpass に接続できませんでした');
}

export function searchByName(nameOrPattern, center, radius, { isPattern = false, signal } = {}) {
  const pattern = isPattern ? nameOrPattern : namePatternFor(nameOrPattern);
  return postOverpass(buildNameQuery(pattern, center, radius), signal);
}

export function searchByPayment(methodId, center, radius, { signal } = {}) {
  return postOverpass(buildPaymentQuery(methodId, center, radius), signal);
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
