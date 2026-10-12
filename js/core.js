// DOM に依存しないロジック（テスト対象）。

import { METHODS, METHOD_ID_BY_OSM_KEY } from './payments.js?v=9';
import { CHAINS, CHAIN_BY_ID } from './chains.js?v=9';

// 入力のゆれを吸収する：全角/半角・大文字小文字・ひらがな/カタカナ・空白や記号
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/[\s・･\-‐−–—_.'’&＆!！]/g, '')
    .replace(/[ｰー〜~]/g, 'ー');
}

export function findChain(query, { exact = false } = {}) {
  const q = normalize(query);
  if (!q) return null;
  for (const chain of CHAINS) {
    if (chain.aliases.some((a) => normalize(a) === q)) return chain;
  }
  if (exact) return null;
  // 「マクドナルド渋谷店」のように店舗名つきで入力された場合
  for (const chain of CHAINS) {
    if (chain.aliases.some((a) => normalize(a).length >= 3 && q.startsWith(normalize(a)))) return chain;
  }
  return null;
}

export function findMethod(query) {
  const q = normalize(query);
  if (!q) return null;
  return METHODS.find((m) => [m.name, ...m.words].some((w) => normalize(w) === q)) ?? null;
}

// 検索欄の入力を解釈する。
//   「マック 渋谷」     → chain=マクドナルド, area=渋谷
//   「PayPay」          → method=PayPay
//   「セブン イレブン」 → chain=セブン-イレブン（空白を除くと店名として一致するので地名扱いしない）
//   「〇〇食堂 新宿」   → name=〇〇食堂, area=新宿
export function parseQuery(raw) {
  const text = String(raw ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!text) return { name: '', area: '', chain: null, method: null };
  const whole = { name: text, area: '' };
  const method = findMethod(text);
  if (method) return { ...whole, chain: null, method };
  const chain = findChain(text, { exact: true });
  if (chain) return { ...whole, chain, method: null };
  const [first, ...rest] = text.split(' ');
  const area = rest.join(' ');
  const m = findMethod(first);
  if (m) return { name: first, area, chain: null, method: m };
  return { name: first, area, chain: findChain(first), method: null };
}

function osmValueToStatus(value) {
  const v = String(value).trim().toLowerCase();
  if (v === 'yes' || v === 'only') return 'yes';
  if (v === 'no') return 'no';
  return null;
}

// OSM タグ（payment:paypay=yes など）→ { paypay: 'yes', ... }
export function parseOsmPayments(tags = {}) {
  const result = {};
  for (const [key, value] of Object.entries(tags)) {
    if (!key.startsWith('payment:')) continue;
    const id = METHOD_ID_BY_OSM_KEY[key.slice('payment:'.length).toLowerCase()];
    const status = osmValueToStatus(value);
    if (!id || !status) continue;
    // 交通系IC のように複数タグを 1 つにまとめる方法は、どれか 1 つでも yes なら yes
    if (result[id] === 'yes') continue;
    result[id] = status;
  }
  // カードブランドが使えるならクレジットカードも使える
  if (!result.credit && ['visa', 'mastercard', 'jcb', 'amex', 'diners'].some((b) => result[b] === 'yes')) {
    result.credit = 'yes';
  }
  return result;
}

// 情報源を重ねる。優先度：
//   自分の記録（この店舗） ＞ 店舗ごとの地図データ ＞ 自分の記録（チェーン全体） ＞ チェーン共通の目安
export function mergePayments({ chain = {}, osm = {}, mine = {}, mineChain = {} }) {
  const merged = {};
  for (const m of METHODS) {
    if (mine[m.id]) merged[m.id] = { status: mine[m.id], source: 'mine' };
    else if (osm[m.id]) merged[m.id] = { status: osm[m.id], source: 'osm' };
    else if (mineChain[m.id]) merged[m.id] = { status: mineChain[m.id], source: 'mineChain' };
    else if (chain[m.id]) merged[m.id] = { status: chain[m.id], source: 'chain' };
  }
  return merged;
}

export function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10}m`;
  return `${Number((m / 1000).toFixed(m < 10000 ? 1 : 0))}km`; // 2000 → 2km, 2500 → 2.5km
}

// Overpass の正規表現に埋め込めるようにエスケープ
export function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 名前検索用の正規表現。ひらがな入力でもカタカナ表記の店に当たるようにする
export function namePatternFor(query) {
  const raw = String(query).normalize('NFKC').trim();
  const kata = raw.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  return [...new Set([raw, kata])].filter(Boolean).map(escapeRegex).join('|');
}

const PLACE_KEYS = ['shop', 'amenity', 'tourism', 'leisure', 'craft', 'office', 'healthcare'];

// 店名の候補（name:ja / name / official_name …）から、いちばん詳しいものを選ぶ。
// 例：name=スターバックス, official_name=スターバックス コーヒー 渋谷TSUTAYA店 → 後者
export function pickName(tags = {}) {
  const candidates = [tags['name:ja'], tags.name, tags['official_name:ja'], tags.official_name]
    .filter(Boolean)
    .map((t) => String(t).trim());
  if (!candidates.length) return tags['brand:ja'] || tags.brand || '名前のない店舗';
  return candidates.reduce((best, c) => (normalize(c).length > normalize(best).length ? c : best));
}

// 店名がチェーン名だけ（「スターバックス」など）で、どの店舗か区別できないか
export function isGenericName(name, tags = {}, chain = null) {
  const generic = new Set(
    [tags.brand, tags['brand:ja'], tags['brand:en'], chain?.name, ...(chain?.aliases ?? [])]
      .filter(Boolean)
      .map(normalize),
  );
  const n = normalize(name);
  if (generic.has(n)) return true;
  // 「スターバックスコーヒー」「マクドナルド McDonald's」のようにブランド表記の組み合わせだけの場合
  const rest = [...generic].filter((g) => g.length >= 3).sort((a, b) => b.length - a.length)
    .reduce((acc, g) => acc.split(g).join(''), n)
    .replace(/コーヒー|coffee|ストア|store/g, '');
  return rest.length === 0;
}

// Overpass の要素を、アプリで扱う店舗オブジェクトに変換する
export function toShop(el, chain = null) {
  const tags = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  if (!PLACE_KEYS.some((k) => tags[k])) return null; // バス停・交差点名などを除く
  if (chain && !matchesChainKind(tags, chain)) return null;
  const name = pickName(tags);
  const branch = tags['branch:ja'] || tags.branch || '';
  const displayName = branch && !normalize(name).includes(normalize(branch)) ? `${name} ${branch}` : name;
  const chainId = chain?.id ?? detectChainId(tags);
  const addr = [
    tags['addr:province'], tags['addr:city'], tags['addr:quarter'], tags['addr:neighbourhood'],
    tags['addr:block_number'], tags['addr:housenumber'],
  ].filter(Boolean).join('') || tags['addr:full'] || '';
  return {
    key: `${el.type}/${el.id}`,
    osmType: el.type,
    osmId: el.id,
    name,
    branch,
    displayName,
    // 店舗名が登録されていない（チェーン名だけ）の店舗
    noBranchName: !branch && isGenericName(name, tags, chain ?? (chainId ? CHAIN_BY_ID[chainId] : null)),
    lat,
    lon,
    addr,
    openingHours: tags.opening_hours || '',
    chainId,
    osmPayments: parseOsmPayments(tags),
  };
}

// Overpass の結果から駅を取り出す（店舗の場所の目印に使う）
export function extractStations(elements = []) {
  const seen = new Set();
  const stations = [];
  for (const el of elements) {
    const t = el.tags ?? {};
    if (t.railway !== 'station' && t.public_transport !== 'station') continue;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const name = t['name:ja'] || t.name;
    if (lat == null || lon == null || !name) continue;
    const key = `${name}@${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    stations.push({ name: name.endsWith('駅') ? name : `${name}駅`, lat, lon });
  }
  return stations;
}

export function isStation(el) {
  const t = el.tags ?? {};
  return t.railway === 'station' || t.public_transport === 'station';
}

// 最寄り駅（maxMeters 以内）。徒歩は不動産表示と同じ 80m = 1分
export function nearestStation(point, stations, maxMeters = 1200) {
  let best = null;
  for (const st of stations) {
    const d = distanceMeters(point, st);
    if (d <= maxMeters && (!best || d < best.distance)) best = { name: st.name, distance: d };
  }
  if (!best) return null;
  return { ...best, walkMinutes: Math.max(1, Math.ceil(best.distance / 80)) };
}

// 国土地理院の逆ジオコーダーの結果 → 町名（「宇田川町」「道玄坂二丁目」など）。不明なら ''
export function areaFromGsi(results) {
  const town = String(results?.lv01Nm ?? '').trim();
  return town && !/^[-－ー―]+$/.test(town) ? town : '';
}

// Nominatim の逆ジオコーディング結果 → 「渋谷区宇田川町」のような町名
export function areaFromAddress(address = {}) {
  const parts = [
    address.city || address.town || address.village,
    address.city_district,
    address.suburb,
    address.quarter,
    address.neighbourhood,
  ].filter(Boolean);
  return [...new Set(parts)].join('');
}

// 店舗がそのチェーンの業種に合うか（同名の別施設を除くため）。
// チェーンの目印（brand:wikidata）が付いていれば業種は問わない（店名だけだと百貨店の「松屋」などと区別できない）。
// コンビニのように「shop」で表すチェーンは、shop の値（convenience / yes など）を問わない
export function matchesChainKind(tags = {}, chain) {
  if (!chain?.kinds) return true;
  if (tags['brand:wikidata'] && chain.osm?.wikidata?.includes(tags['brand:wikidata'])) return true;
  return Object.entries(chain.kinds).some(([k, vals]) => (k === 'shop' ? Boolean(tags.shop) : vals.includes(tags[k])));
}

export function detectChainId(tags = {}) {
  const hay = [tags.brand, tags['brand:ja'], tags['brand:en'], tags.name, tags['name:ja'], tags['name:en']]
    .filter(Boolean)
    .join(' ');
  for (const c of CHAINS) {
    if (new RegExp(c.pattern, 'i').test(hay) && matchesChainKind(tags, c)) return c.id;
  }
  return null;
}

export function dedupeShops(shops) {
  const seen = new Map();
  for (const s of shops) if (s && !seen.has(s.key)) seen.set(s.key, s);
  return [...seen.values()];
}

// 店舗の総合判定：その支払い方法が使えそうか
export function statusFor(shop, methodId, chainsById, mineByShop = {}, mineByChain = {}) {
  const chainPayments = shop.chainId ? chainsById[shop.chainId]?.payments ?? {} : {};
  const merged = mergePayments({
    chain: chainPayments,
    osm: shop.osmPayments,
    mine: mineByShop[shop.key] ?? {},
    mineChain: (shop.chainId && mineByChain[shop.chainId]) || {},
  });
  return merged[methodId]?.status ?? null;
}

// Google マップ / Apple マップで「この店舗」を開くための URL
export function googleMapsUrl(shop) {
  const q = encodeURIComponent(shop.displayName);
  return `https://www.google.com/maps/search/${q}/@${shop.lat},${shop.lon},18z`;
}

export function appleMapsUrl(shop) {
  const q = encodeURIComponent(shop.displayName);
  return `https://maps.apple.com/?q=${q}&ll=${shop.lat},${shop.lon}&z=18`;
}

export function osmUrl(shop) {
  if (!shop.osmType) return `https://www.openstreetmap.org/#map=19/${shop.lat}/${shop.lon}`;
  return `https://www.openstreetmap.org/${shop.osmType}/${shop.osmId}`;
}

// 店名からチェーンを判定する（自分で追加したお店用）
export function chainIdForName(name) {
  return CHAINS.find((c) => new RegExp(c.pattern, 'i').test(name))?.id ?? findChain(name)?.id ?? null;
}

// 自分で追加したお店 → アプリで扱う店舗オブジェクト
export function customToShop(c) {
  const branch = c.branch || '';
  return {
    key: c.key,
    osmType: null,
    osmId: null,
    name: c.name,
    branch,
    displayName: branch ? `${c.name} ${branch}` : c.name,
    noBranchName: false,
    lat: c.lat,
    lon: c.lon,
    addr: '',
    openingHours: '',
    chainId: c.chainId ?? null,
    osmPayments: {},
    custom: true,
  };
}

// 自分で追加したお店が、今回の検索に当てはまるか（支払い方法での検索は、あとで支払い方法で絞り込む）
export function customMatchesQuery(shop, { chain, method, name }) {
  if (method) return true;
  if (chain) return shop.chainId === chain.id;
  return normalize(shop.displayName).includes(normalize(name));
}
