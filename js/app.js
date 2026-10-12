import { CATEGORIES, METHODS, METHOD_BY_ID, SOURCE_LABEL, STATUS } from './payments.js';
import { CHAINS, CHAIN_BY_ID } from './chains.js';
import {
  appleMapsUrl, areaFromAddress, dedupeShops, distanceMeters, extractStations, formatDistance, googleMapsUrl,
  isStation, mergePayments, nearestStation, osmUrl, parseQuery, statusFor, toShop,
} from './core.js';
import { geocode, reverseGeocode, searchByName, searchByPayment } from './overpass.js';
import { getAllMine, getMine, setMine } from './storage.js';

const DEFAULT_CENTER = { lat: 35.681236, lon: 139.767125 }; // 東京駅
const MAX_RESULTS = 80;
const RADIUS_KEY = 'shopcashless:radius';
const AREA_CACHE_KEY = 'shopcashless:areas:v1';
const AREA_LOOKUPS = 12; // 店舗名が無い店舗のうち、住所（町名）を調べる件数
const CARD_BRANDS = ['visa', 'mastercard', 'jcb', 'amex', 'diners'];
const ORDERED_METHODS = CATEGORIES.flatMap((cat) => METHODS.filter((m) => m.cat === cat.id));

const $ = (sel) => document.querySelector(sel);
const els = {
  form: $('#search-form'),
  q: $('#q'),
  quick: $('#quick'),
  radius: $('#radius'),
  status: $('#status'),
  chainCard: $('#chain-card'),
  results: $('#results'),
  intro: $('#intro'),
  locate: $('#locate'),
  searchHere: $('#search-here'),
  detail: $('#detail'),
  detailTitle: $('#detail-title'),
  detailSub: $('#detail-sub'),
  detailLinks: $('#detail-links'),
  detailNote: $('#detail-note'),
  detailBody: $('#detail-body'),
  detailUnknown: $('#detail-unknown'),
  detailMore: $('#detail-more'),
  detailClose: $('#detail-close'),
};

const state = {
  me: null,            // 現在地
  searchCenter: null,  // 直近の検索の中心
  lastQuery: '',
  lastParsed: null,
  shops: [],
  focusMethod: null,   // 支払い方法で探したときの方法ID
  activeKey: null,
  controller: null,
};

// ---------- 検索範囲（半径） ----------
try {
  const saved = localStorage.getItem(RADIUS_KEY);
  if (saved && [...els.radius.options].some((o) => o.value === saved)) els.radius.value = saved;
} catch { /* 保存できない環境では既定値のまま */ }

const getRadius = () => Number(els.radius.value);

// ---------- 小さなユーティリティ ----------
function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setStatus(text, { error = false } = {}) {
  els.status.textContent = text;
  els.status.classList.toggle('error', error);
}

function badge(method, status, { focus = false } = {}) {
  const cls = status ?? 'unknown';
  const mark = status ? STATUS[status].mark : '？';
  const title = status ? STATUS[status].label : '不明';
  return `<span class="badge ${cls}${focus ? ' focus' : ''}" title="${esc(title)}">${mark} ${esc(method.short ?? method.name)}</span>`;
}

// ---------- 地図 ----------
const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lon], 15);
L.control.zoom({ position: 'topright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
let rangeCircle = null;
const markers = new Map();
let meMarker = null;

const pinIcon = (active) => L.divIcon({
  className: '',
  html: `<div class="pin${active ? ' active' : ''}"></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

map.on('moveend', () => {
  if (!state.searchCenter || !state.lastQuery) return;
  const c = map.getCenter();
  const moved = distanceMeters(state.searchCenter, { lat: c.lat, lon: c.lng }) > 600;
  els.searchHere.hidden = !moved;
});

function showMe(pos) {
  const ll = [pos.lat, pos.lon];
  if (meMarker) meMarker.setLatLng(ll);
  else meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [16, 16] }), interactive: false }).addTo(map);
}

function getLocation({ timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 },
    );
  });
}

// ---------- 検索 ----------
async function resolveCenter(area, { preferMap = false } = {}) {
  if (area) {
    setStatus(`「${area}」の場所を調べています…`);
    return geocode(area, { signal: state.controller.signal }); // 見つからなければ null
  }
  if (preferMap) {
    const c = map.getCenter();
    return { lat: c.lat, lon: c.lng };
  }
  if (!state.me) {
    setStatus('現在地を取得しています…');
    state.me = await getLocation();
    if (state.me) showMe(state.me);
  }
  if (state.me) return state.me;
  const c = map.getCenter();
  return { lat: c.lat, lon: c.lng };
}

async function runSearch(raw, { preferMap = false, center: fixedCenter = null } = {}) {
  const query = String(raw ?? '').trim();
  if (!query) return;
  state.controller?.abort();
  state.controller = new AbortController();
  const { signal } = state.controller;
  els.searchHere.hidden = true;
  els.intro.hidden = true;

  // 範囲だけ変えて探し直すときは、前回の解釈（店名・地名の切り分け）をそのまま使う
  let parsed = fixedCenter && state.lastParsed && state.lastQuery === query ? state.lastParsed : parseQuery(query);
  state.lastQuery = query;

  renderChainCard(parsed.chain);
  els.results.innerHTML = '';

  try {
    let center = fixedCenter ?? await resolveCenter(parsed.area, { preferMap });
    if (!center) {
      // 「とんかつ まい泉」のように、空白の後ろが地名ではなかった場合は全体を店名として探す
      parsed = { name: query, area: '', chain: null, method: null };
      center = await resolveCenter('', { preferMap });
    }
    const { name, method, chain } = parsed;
    state.lastParsed = parsed;
    renderChainCard(chain);
    state.searchCenter = center;
    state.focusMethod = method?.id ?? null;

    const radius = getRadius();
    let elements = [];
    if (method) {
      setStatus(`${method.name} が使えそうなお店を探しています…（半径${formatDistance(radius)}）`);
      elements = await findElementsForMethod(method, center, radius, signal);
    } else {
      setStatus(`「${chain?.name ?? name}」を探しています…（半径${formatDistance(radius)}）`);
      elements = await searchByName(chain ? chain.pattern : name, center, radius, { isPattern: Boolean(chain), signal });
    }

    const stations = extractStations(elements);
    let shops = dedupeShops(elements.filter((e) => !isStation(e)).map((e) => toShop(e, method ? null : chain)))
      .filter((s) => distanceMeters(center, s) <= radius * 1.05); // 建物の中心が範囲外の場合を除く
    if (method) {
      const mineAll = getAllMine();
      shops = shops.filter((s) => ['yes', 'some'].includes(statusFor(s, method.id, CHAIN_BY_ID, mineAll)));
    }

    for (const s of shops) {
      s.distance = distanceMeters(center, s);
      s.station = nearestStation(s, stations);
    }
    shops.sort((a, b) => a.distance - b.distance);
    const total = shops.length;
    state.shops = shops.slice(0, MAX_RESULTS);
    state.radius = radius;

    renderResults();
    renderMarkers();
    fitToResults(center);

    if (state.shops.length === 0) {
      setStatus(`半径${formatDistance(radius)}以内に見つかりませんでした。検索ボタン左の範囲を広げるか、「${name} 渋谷」のように地名をつけてみてください。`);
    } else {
      const what = method ? `${method.name} が使えそうなお店` : `「${chain?.name ?? name}」`;
      const more = total > state.shops.length ? `（近い順に${state.shops.length}件を表示）` : '（近い順）';
      setStatus(`${what}：半径${formatDistance(radius)}以内に${total}件${more}`);
    }
    lookupAreas(signal);
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.error(e);
    setStatus(`${e.message || '検索に失敗しました'}。電波の良いところで、もう一度お試しください。`, { error: true });
  }
}

async function findElementsForMethod(method, center, radius, signal) {
  // 1) 店舗データに支払い方法のタグがある店
  const tagged = await searchByPayment(method.id, center, radius, { signal });
  // 2) チェーン共通の目安で「使える」チェーンの店
  const chains = CHAINS.filter((c) => c.payments[method.id] === 'yes' || c.payments[method.id] === 'some');
  if (!chains.length) return tagged;
  const pattern = chains.map((c) => `(${c.pattern})`).join('|');
  const chained = await searchByName(pattern, center, radius, { isPattern: true, signal });
  return [...tagged, ...chained];
}

// 店舗名が登録されていない店舗は、町名を調べて「どこの店舗か」わかるようにする。
// Nominatim の利用規約（1秒に1回まで）に合わせて順番に問い合わせ、結果は端末に保存して再利用する
function readAreaCache() {
  try { return JSON.parse(localStorage.getItem(AREA_CACHE_KEY) || '{}') || {}; } catch { return {}; }
}

async function lookupAreas(signal) {
  const cache = readAreaCache();
  const keyOf = (s) => `${s.lat.toFixed(4)},${s.lon.toFixed(4)}`;
  const targets = state.shops.filter((s) => s.noBranchName && !s.addr).slice(0, AREA_LOOKUPS);
  let changed = false;
  for (const s of targets) {
    if (cache[keyOf(s)] !== undefined) { s.area = cache[keyOf(s)]; changed = true; }
  }
  if (changed) refreshList();
  for (const s of targets) {
    if (signal.aborted) return;
    if (cache[keyOf(s)] !== undefined) continue;
    try {
      const address = await reverseGeocode(s, { signal });
      s.area = areaFromAddress(address ?? {});
      cache[keyOf(s)] = s.area;
      try { localStorage.setItem(AREA_CACHE_KEY, JSON.stringify(cache)); } catch { /* 保存できなくても表示はする */ }
      refreshList();
    } catch (e) {
      if (e.name === 'AbortError') return;
      return; // 混雑などで失敗したら、駅からの距離だけで表示する
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
}

function refreshList() {
  renderResults();
  const key = els.detail.open ? els.detail.dataset.key : null;
  const shop = key && state.shops.find((x) => x.key === key);
  if (shop) {
    const moreOpen = els.detailMore.open;
    renderDetail(shop);
    els.detailMore.open = moreOpen;
  }
}

// 「渋谷駅 徒歩3分 ・ 渋谷区宇田川町」のような、店舗の場所の目印
function whereText(s) {
  return [
    s.station ? `${s.station.name} 徒歩${s.station.walkMinutes}分` : '',
    s.addr || s.area || '',
  ].filter(Boolean).join(' ・ ');
}

function fitToResults(center) {
  // 検索した範囲を円で表示し、近い店舗が見えるように地図を合わせる
  if (rangeCircle) rangeCircle.remove();
  rangeCircle = L.circle([center.lat, center.lon], {
    radius: state.radius, color: '#0b7a5c', weight: 1.5, dashArray: '6 6', fillOpacity: 0.04, interactive: false,
  }).addTo(map);
  const pts = state.shops.slice(0, 15).map((s) => [s.lat, s.lon]);
  if (pts.length === 0) {
    map.fitBounds(rangeCircle.getBounds(), { padding: [10, 10] });
    return;
  }
  pts.push([center.lat, center.lon]);
  map.fitBounds(pts, { padding: [30, 30], maxZoom: 17 });
}

// ---------- 描画 ----------
function renderChainCard(chain) {
  if (!chain) {
    els.chainCard.innerHTML = '';
    return;
  }
  // カードブランドは「クレジットカード」にまとめ、1 行に並べてコンパクトに
  const items = ORDERED_METHODS.filter((m) => chain.payments[m.id] && !CARD_BRANDS.includes(m.id));
  els.chainCard.innerHTML = `
    <div class="chain-card">
      <h2>${esc(chain.name)} <span class="src src-chain">チェーン共通の目安</span></h2>
      <div class="badges">${items.map((m) => badge(m, chain.payments[m.id])).join('')}</div>
      <p class="sub">${chain.note ? esc(chain.note) + ' ' : ''}店舗によって違うことがあるので、下のリストから店舗を選んで確認・記録できます。</p>
    </div>`;
}

function shopMerged(shop) {
  const chain = shop.chainId ? CHAIN_BY_ID[shop.chainId] : null;
  return mergePayments({ chain: chain?.payments ?? {}, osm: shop.osmPayments, mine: getMine(shop.key) });
}

function renderResults() {
  if (state.shops.length === 0) {
    els.results.innerHTML = '';
    return;
  }
  els.results.innerHTML = state.shops.map((s) => {
    const merged = shopMerged(s);
    const hasMine = Object.values(merged).some((v) => v.source === 'mine');
    const hasOsm = Object.values(merged).some((v) => v.source === 'osm');
    // リストには主なキャッシュレス手段だけを出す（現金とカードブランドは詳細で）
    const shown = ORDERED_METHODS.filter((m) => m.cat !== 'cash' && m.cat !== 'card' && merged[m.id]);
    let badges = shown
      .sort((a, b) => (a.id === state.focusMethod ? -1 : b.id === state.focusMethod ? 1 : 0))
      .slice(0, 8)
      .map((m) => badge(m, merged[m.id].status, { focus: m.id === state.focusMethod }))
      .join('');
    if (merged.credit) badges = badge(METHOD_BY_ID.credit, merged.credit.status) + badges;
    if (!badges) badges = '<span class="badge unknown">支払い方法の情報なし — タップして記録できます</span>';
    const sources = [
      hasMine ? '<span class="src src-mine">自分の記録あり</span>' : '',
      hasOsm ? '<span class="src src-osm">店舗データあり</span>' : '',
    ].join(' ');
    return `
      <li data-key="${esc(s.key)}" class="${s.key === state.activeKey ? 'active' : ''}">
        <button type="button">
          <span class="r-name">${esc(s.displayName)}</span>
          <span class="r-dist">${formatDistance(s.distance)}</span>
          <span class="r-where">${esc(whereText(s))}</span>
          ${sources.trim() ? `<span class="r-meta">${sources}</span>` : ''}
          <span class="r-badges">${badges}</span>
        </button>
      </li>`;
  }).join('');
}

function renderMarkers() {
  markerLayer.clearLayers();
  markers.clear();
  for (const s of state.shops) {
    const m = L.marker([s.lat, s.lon], { icon: pinIcon(s.key === state.activeKey), title: s.displayName });
    m.on('click', () => openDetail(s.key));
    m.addTo(markerLayer);
    markers.set(s.key, m);
  }
}

function setActive(key) {
  const prev = state.activeKey;
  state.activeKey = key;
  if (prev && markers.get(prev)) markers.get(prev).setIcon(pinIcon(false));
  if (key && markers.get(key)) {
    markers.get(key).setIcon(pinIcon(true));
    markers.get(key).setZIndexOffset(1000);
  }
  els.results.querySelectorAll('li').forEach((li) => li.classList.toggle('active', li.dataset.key === key));
}

// ---------- 詳細 ----------
function openDetail(key) {
  const shop = state.shops.find((s) => s.key === key);
  if (!shop) return;
  setActive(key);
  map.panTo([shop.lat, shop.lon]);
  renderDetail(shop);
  if (!els.detail.open) els.detail.showModal();
}

function renderDetail(shop) {
  const chain = shop.chainId ? CHAIN_BY_ID[shop.chainId] : null;
  const merged = shopMerged(shop);
  const mine = getMine(shop.key);

  els.detailTitle.textContent = shop.displayName;
  els.detailSub.textContent = [
    shop.distance != null ? `ここから ${formatDistance(shop.distance)}` : '',
    whereText(shop),
    shop.openingHours ? `営業時間: ${shop.openingHours}` : '',
  ].filter(Boolean).join(' ・ ');

  els.detailLinks.innerHTML = `
    <a class="primary" href="${esc(googleMapsUrl(shop))}" target="_blank" rel="noopener">Google マップで見る</a>
    <a href="${esc(appleMapsUrl(shop))}" target="_blank" rel="noopener">Apple マップ</a>
    <a href="${esc(osmUrl(shop))}" target="_blank" rel="noopener">OpenStreetMap</a>`;

  const notes = [];
  if (shop.noBranchName) {
    notes.push('地図データにこの店舗の正式な店名（○○店）が登録されていません。「Google マップで見る」を開くと店名を確認できます。');
  }
  if (chain?.note) notes.push(`<b>${esc(chain.name)}：</b>${esc(chain.note)}`);
  else if (Object.keys(merged).length === 0) {
    notes.push('この店舗の支払い方法の情報はまだありません。Google マップの店舗ページや店頭の表示で確認して、下の「ほかの支払い方法を記録する」から記録できます。');
  }
  els.detailNote.innerHTML = notes.map((n) => `<div class="note">${n}</div>`).join('');

  const row = (m) => {
    const info = merged[m.id];
    const src = info ? `<span class="src src-${info.source}">${SOURCE_LABEL[info.source]}</span>` : '';
    return `
      <div class="method-row" data-method="${m.id}">
        <div class="m-left">${badge(m, info?.status, { focus: m.id === state.focusMethod })} ${src}</div>
        <div class="m-vote">
          <button type="button" class="v-yes" data-vote="yes" aria-pressed="${mine[m.id] === 'yes'}" aria-label="${esc(m.name)}が使えた">使えた</button>
          <button type="button" class="v-no" data-vote="no" aria-pressed="${mine[m.id] === 'no'}" aria-label="${esc(m.name)}は使えなかった">使えず</button>
        </div>
      </div>`;
  };

  const known = (cat) => METHODS.filter((m) => m.cat === cat.id && merged[m.id]);
  const unknown = (cat) => METHODS.filter((m) => m.cat === cat.id && !merged[m.id]);

  els.detailBody.innerHTML = CATEGORIES.map((cat) => {
    const items = known(cat);
    if (!items.length) return '';
    return `<div class="cat"><h3>${esc(cat.label)}</h3>${items.map(row).join('')}</div>`;
  }).join('') || '';

  els.detailUnknown.innerHTML = CATEGORIES.map((cat) => {
    const items = unknown(cat);
    if (!items.length) return '';
    return `<div class="cat"><h3>${esc(cat.label)}</h3>${items.map(row).join('')}</div>`;
  }).join('');
  els.detailMore.open = Object.keys(merged).length === 0;
  els.detail.dataset.key = shop.key;
}

els.detail.addEventListener('click', (e) => {
  // 背景（シートの外）をタップしたら閉じる
  if (e.target === els.detail) {
    els.detail.close();
    return;
  }
  const btn = e.target.closest('[data-vote]');
  if (!btn) return;
  const shop = state.shops.find((s) => s.key === els.detail.dataset.key);
  const methodId = btn.closest('[data-method]')?.dataset.method;
  if (!shop || !methodId) return;
  const current = getMine(shop.key)[methodId];
  const next = current === btn.dataset.vote ? null : btn.dataset.vote; // もう一度押すと取り消し
  if (!setMine(shop, methodId, next)) {
    setStatus('記録を保存できませんでした（プライベートブラウズでは保存できないことがあります）', { error: true });
  }
  const moreOpen = els.detailMore.open;
  renderDetail(shop);
  els.detailMore.open = moreOpen || els.detailMore.open;
  renderResults();
});

els.detailClose.addEventListener('click', () => els.detail.close());

// ---------- イベント ----------
els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  els.q.blur();
  runSearch(els.q.value);
});

els.radius.addEventListener('change', () => {
  try { localStorage.setItem(RADIUS_KEY, els.radius.value); } catch { /* 保存できなくても検索はできる */ }
  // 検索済みなら、同じ場所・同じ条件で範囲だけ変えて探し直す
  if (state.lastQuery) runSearch(state.lastQuery, { preferMap: false, center: state.searchCenter });
});

els.quick.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-q]');
  if (!btn) return;
  els.q.value = btn.dataset.q;
  runSearch(btn.dataset.q);
});

els.results.addEventListener('click', (e) => {
  const li = e.target.closest('li[data-key]');
  if (li) openDetail(li.dataset.key);
});

els.searchHere.addEventListener('click', () => {
  // 地名つき検索だった場合は地名を外して、地図の中心で探し直す
  runSearch(state.lastParsed?.name || state.lastQuery, { preferMap: true });
});

els.locate.addEventListener('click', async () => {
  setStatus('現在地を取得しています…');
  const pos = await getLocation();
  if (!pos) {
    setStatus('現在地を取得できませんでした。設定 → プライバシー → 位置情報サービス → Safari の許可を確認してください。', { error: true });
    return;
  }
  state.me = pos;
  showMe(pos);
  map.setView([pos.lat, pos.lon], 16);
  setStatus('');
  if (state.lastQuery) runSearch(state.lastParsed?.name || state.lastQuery);
});

// ヘッダーの高さ（横並びレイアウトで地図の高さ計算に使う）
const header = document.querySelector('.topbar');
const syncHeader = () => document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
new ResizeObserver(syncHeader).observe(header);
syncHeader();

// URL の ?q=マック で直接検索できるようにする（ブックマーク・共有用）
const initial = new URLSearchParams(location.search).get('q');
if (initial) {
  els.q.value = initial;
  runSearch(initial);
}
