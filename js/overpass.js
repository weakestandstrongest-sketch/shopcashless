// OpenStreetMap のデータを取得する（APIキー不要）。
// Overpass API: 店舗の検索 / Nominatim: 地名 → 座標

import { METHOD_BY_ID } from './payments.js';
import { namePatternFor } from './core.js';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const PLACE = '[~"^(shop|amenity|tourism|leisure|craft|office|healthcare)$"~"."]';

// 名前・ブランドで店舗を探すクエリ
export function buildNameQuery(pattern, { lat, lon }, radius, limit = 80) {
  const around = `(around:${radius},${lat},${lon})`;
  // Overpass の文字列リテラル用に \ と " をエスケープ
  const p = pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `[out:json][timeout:25];
(
  nwr["name"~"${p}",i]${PLACE}${around};
  nwr["name:ja"~"${p}",i]${PLACE}${around};
  nwr["brand"~"${p}",i]${PLACE}${around};
);
out center tags ${limit};`;
}

// 指定の支払い方法タグが付いた店舗を探すクエリ（例：payment:paypay=yes）
export function buildPaymentQuery(methodId, { lat, lon }, radius, limit = 80) {
  const keys = METHOD_BY_ID[methodId]?.osm ?? [];
  const around = `(around:${radius},${lat},${lon})`;
  const lines = keys.map((k) => `  nwr["payment:${k}"~"^(yes|only)$"]${around};`).join('\n');
  return `[out:json][timeout:25];
(
${lines}
);
out center tags ${limit};`;
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
