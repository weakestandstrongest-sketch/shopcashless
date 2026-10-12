import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  chainIdForName, customMatchesQuery, customToShop, matchesChainKind, areaFromAddress, areaFromGsi, detectChainId, extractStations, findChain, findMethod, isGenericName, isStation,
  mergePayments, namePatternFor, nearestStation, normalize, parseOsmPayments, parseQuery, pickName,
  statusFor, toShop,
} from '../js/core.js';
import { buildChainQuery, buildNameQuery, buildPaymentQuery } from '../js/overpass.js';
import { CHAINS, CHAIN_BY_ID } from '../js/chains.js';
import { METHOD_BY_ID } from '../js/payments.js';

test('normalize: 全角・ひらがな・記号のゆれを吸収する', () => {
  assert.equal(normalize('まっく'), normalize('マック'));
  assert.equal(normalize('ＭＡＣ'), 'mac');
  assert.equal(normalize('セブン-イレブン'), normalize('セブンイレブン'));
  assert.equal(normalize("McDonald's"), 'mcdonalds');
});

test('findChain: 略称からチェーンがわかる', () => {
  assert.equal(findChain('マック')?.id, 'mcdonalds');
  assert.equal(findChain('まっく')?.id, 'mcdonalds');
  assert.equal(findChain('マクド')?.id, 'mcdonalds');
  assert.equal(findChain('スタバ')?.id, 'starbucks');
  assert.equal(findChain('セブン')?.id, 'seven');
  assert.equal(findChain('ファミマ')?.id, 'familymart');
  assert.equal(findChain('マクドナルド渋谷店')?.id, 'mcdonalds');
  assert.equal(findChain('とんかつ屋'), null);
});

test('findMethod: 支払い方法名を判定する', () => {
  assert.equal(findMethod('PayPay')?.id, 'paypay');
  assert.equal(findMethod('ぺいぺい')?.id, 'paypay');
  assert.equal(findMethod('Suica')?.id, 'transit');
  assert.equal(findMethod('交通系IC')?.id, 'transit');
  assert.equal(findMethod('d払い')?.id, 'dbarai');
  assert.equal(findMethod('Smart Code')?.id, 'smartcode');
  assert.equal(findMethod('スマートコード')?.id, 'smartcode');
  assert.equal(findMethod('マック'), null);
});

test('parseQuery: 店名・地名・支払い方法を切り分ける', () => {
  const a = parseQuery('マック 渋谷');
  assert.equal(a.chain?.id, 'mcdonalds');
  assert.equal(a.area, '渋谷');

  const b = parseQuery('PayPay');
  assert.equal(b.method?.id, 'paypay');
  assert.equal(b.area, '');

  const c = parseQuery('セブン イレブン');
  assert.equal(c.chain?.id, 'seven');
  assert.equal(c.area, '');

  const d = parseQuery('au PAY');
  assert.equal(d.method?.id, 'aupay');
  assert.equal(d.area, '');

  const e = parseQuery('〇〇食堂 新宿');
  assert.equal(e.chain, null);
  assert.equal(e.method, null);
  assert.equal(e.name, '〇〇食堂');
  assert.equal(e.area, '新宿');

  const f = parseQuery('PayPay 梅田');
  assert.equal(f.method?.id, 'paypay');
  assert.equal(f.area, '梅田');
});

test('parseOsmPayments: OSM の payment タグを読み取る', () => {
  const p = parseOsmPayments({
    'payment:paypay': 'yes',
    'payment:suica': 'no',
    'payment:pasmo': 'yes',
    'payment:cash': 'no',
    'payment:visa': 'yes',
    'payment:unknown_thing': 'yes',
    'payment:waon': 'maybe',
    name: 'テスト',
  });
  assert.deepEqual(p, { paypay: 'yes', transit: 'yes', cash: 'no', visa: 'yes', credit: 'yes' });
});

test('mergePayments: 自分の記録 > 店舗データ > チェーン目安', () => {
  const merged = mergePayments({
    chain: { paypay: 'yes', waon: 'no', id: 'some' },
    osm: { paypay: 'no', nanaco: 'yes' },
    mine: { paypay: 'yes' },
  });
  assert.deepEqual(merged.paypay, { status: 'yes', source: 'mine' });
  assert.deepEqual(merged.nanaco, { status: 'yes', source: 'osm' });
  assert.deepEqual(merged.waon, { status: 'no', source: 'chain' });
  assert.deepEqual(merged.id, { status: 'some', source: 'chain' });
  assert.equal(merged.merpay, undefined);
});

test('toShop: バス停など店舗でないものは除外し、チェーンを判定する', () => {
  const busStop = { type: 'node', id: 1, lat: 35, lon: 139, tags: { name: 'マクドナルド前', highway: 'bus_stop' } };
  assert.equal(toShop(busStop), null);

  const mac = { type: 'node', id: 2, lat: 35, lon: 139, tags: { name: 'マクドナルド', branch: '渋谷店', amenity: 'fast_food', 'payment:paypay': 'yes' } };
  const shop = toShop(mac, CHAIN_BY_ID.mcdonalds);
  assert.equal(shop.key, 'node/2');
  assert.equal(shop.displayName, 'マクドナルド 渋谷店');
  assert.equal(shop.chainId, 'mcdonalds');
  assert.deepEqual(shop.osmPayments, { paypay: 'yes' });

  // way は center 座標を使う
  const way = { type: 'way', id: 3, center: { lat: 35.1, lon: 139.1 }, tags: { name: 'ローソン', shop: 'convenience' } };
  assert.equal(toShop(way).chainId, 'lawson');
  assert.equal(toShop(way).lat, 35.1);
});

test('detectChainId: 同名の別施設（百貨店の松屋）はチェーン扱いしない', () => {
  assert.equal(detectChainId({ name: '松屋', amenity: 'fast_food' }), 'matsuya');
  assert.equal(detectChainId({ name: '松屋銀座', shop: 'department_store' }), null);
  assert.equal(detectChainId({ name: 'セブン-イレブン 新宿店', shop: 'convenience' }), 'seven');
  assert.equal(detectChainId({ brand: 'Starbucks', amenity: 'cafe' }), 'starbucks');
});

test('statusFor: 支払い方法で探すときの判定', () => {
  const shop = { key: 'node/9', chainId: 'seven', osmPayments: {} };
  assert.equal(statusFor(shop, 'nanaco', CHAIN_BY_ID), 'yes');
  assert.equal(statusFor(shop, 'waon', CHAIN_BY_ID), 'no');
  assert.equal(statusFor(shop, 'waon', CHAIN_BY_ID, { 'node/9': { waon: 'yes' } }), 'yes');
  assert.equal(statusFor({ key: 'x', chainId: null, osmPayments: {} }, 'paypay', CHAIN_BY_ID), null);
});

test('チェーンデータ：未定義の支払い方法IDや不正な状態を含まない', () => {
  for (const c of CHAINS) {
    for (const [id, st] of Object.entries(c.payments)) {
      assert.ok(METHOD_BY_ID[id], `${c.id}: 未知の支払い方法 ${id}`);
      assert.ok(['yes', 'some', 'no'].includes(st), `${c.id}.${id}: 不正な状態 ${st}`);
    }
    assert.doesNotThrow(() => new RegExp(c.pattern, 'i'));
  }
});

test('Overpass クエリ：名前と支払い方法の検索', () => {
  const q = buildNameQuery(namePatternFor('とんかつ"まい泉'), { lat: 35.6, lon: 139.7 }, 1500);
  assert.match(q, /around:1500,35\.600,139\.700/);
  assert.match(q, /\["name"~"とんかつ\\"まい泉\|トンカツ\\"マイ泉",i\]/);
  // 正規表現の \ は Overpass の文字列内で \\ になる
  const r = buildNameQuery(namePatternFor('a.b'), { lat: 0, lon: 0 }, 100);
  assert.ok(r.includes('"a\\\\.b"'));
  const p = buildPaymentQuery('transit', { lat: 1, lon: 2 }, 1000);
  assert.match(p, /payment:suica/);
  assert.match(p, /payment:pasmo/);
});

test('pickName: いちばん詳しい店名を使う', () => {
  assert.equal(pickName({ name: 'スターバックス', official_name: 'スターバックス コーヒー 渋谷TSUTAYA店' }), 'スターバックス コーヒー 渋谷TSUTAYA店');
  assert.equal(pickName({ name: 'マクドナルド 渋谷店', 'name:ja': 'マクドナルド' }), 'マクドナルド 渋谷店');
  assert.equal(pickName({ brand: 'ローソン' }), 'ローソン');
});

test('toShop: 店舗名が登録されていない店舗を見分ける', () => {
  const sb = CHAIN_BY_ID.starbucks;
  const generic = toShop({ type: 'node', id: 10, lat: 35, lon: 139, tags: { name: 'スターバックス', brand: 'スターバックス', amenity: 'cafe' } }, sb);
  assert.equal(generic.noBranchName, true);
  const coffee = toShop({ type: 'node', id: 11, lat: 35, lon: 139, tags: { name: 'スターバックス コーヒー', amenity: 'cafe' } }, sb);
  assert.equal(coffee.noBranchName, true);
  const named = toShop({ type: 'node', id: 12, lat: 35, lon: 139, tags: { name: 'スターバックス コーヒー 渋谷TSUTAYA店', amenity: 'cafe' } }, sb);
  assert.equal(named.noBranchName, false);
  const branch = toShop({ type: 'node', id: 13, lat: 35, lon: 139, tags: { name: 'スターバックス', branch: '渋谷TSUTAYA店', amenity: 'cafe' } }, sb);
  assert.equal(branch.noBranchName, false);
  assert.equal(branch.displayName, 'スターバックス 渋谷TSUTAYA店');
  // チェーン指定なしでも、ブランドから判定できる
  const detected = toShop({ type: 'node', id: 14, lat: 35, lon: 139, tags: { name: 'Starbucks', brand: 'Starbucks', amenity: 'cafe' } });
  assert.equal(detected.noBranchName, true);
  assert.equal(isGenericName('マクドナルド 渋谷店', {}, CHAIN_BY_ID.mcdonalds), false);
});

test('駅：最寄り駅と徒歩分数', () => {
  const elements = [
    { type: 'node', id: 1, lat: 35.6580, lon: 139.7016, tags: { name: '渋谷', railway: 'station' } },
    { type: 'node', id: 2, lat: 35.6580, lon: 139.7016, tags: { name: '渋谷', railway: 'station', operator: '別会社' } },
    { type: 'way', id: 3, center: { lat: 35.6702, lon: 139.7027 }, tags: { name: '原宿駅', railway: 'station' } },
    { type: 'node', id: 4, lat: 35.66, lon: 139.70, tags: { name: 'カフェ', amenity: 'cafe' } },
  ];
  const stations = extractStations(elements);
  assert.deepEqual(stations.map((s) => s.name), ['渋谷駅', '原宿駅']);
  assert.equal(isStation(elements[0]), true);
  assert.equal(isStation(elements[3]), false);
  const near = nearestStation({ lat: 35.6595, lon: 139.7005 }, stations);
  assert.equal(near.name, '渋谷駅');
  assert.equal(near.walkMinutes, Math.ceil(near.distance / 80));
  assert.equal(nearestStation({ lat: 36, lon: 140 }, stations), null);
});

test('areaFromAddress: 逆ジオコーディング結果から町名を作る', () => {
  assert.equal(areaFromAddress({ city: '渋谷区', quarter: '宇田川町', country: '日本' }), '渋谷区宇田川町');
  assert.equal(areaFromAddress({ town: '軽井沢町', suburb: '軽井沢', neighbourhood: '軽井沢' }), '軽井沢町軽井沢');
  assert.equal(areaFromAddress({}), '');
});

test('Overpass クエリ：駅もいっしょに取得し、座標つきで出力する', () => {
  const q = buildNameQuery('スターバックス', { lat: 35, lon: 139 }, 2000);
  assert.match(q, /->\.shops;/);
  assert.match(q, /\.shops out body center/);
  assert.match(q, /around\.shops:1200\)\["railway"="station"\]/);
  assert.doesNotMatch(q, /out center tags/);
});

test('areaFromGsi: 国土地理院の結果から町名を取り出す', () => {
  assert.equal(areaFromGsi({ muniCd: '13113', lv01Nm: '宇田川町' }), '宇田川町');
  assert.equal(areaFromGsi({ muniCd: '13113', lv01Nm: '－' }), '');
  assert.equal(areaFromGsi(null), '');
});

test('Overpass クエリ：チェーンは完全一致（速い）で探し、重い正規表現を使わない', () => {
  const q = buildChainQuery([CHAIN_BY_ID.starbucks], { lat: 35, lon: 139 }, 2000);
  assert.match(q, /\["brand:wikidata"="Q37158"\]\(around:2000,35.000,139.000\)/);
  assert.match(q, /\["name"="スターバックス"\]/);
  assert.match(q, /\["brand"="Starbucks"\]/);
  // 正規表現は、業種の完全一致で絞り込んだ後にだけ使う（重くならないように）
  for (const line of q.split('\n').filter((l) => l.includes('~'))) {
    assert.match(line, /^  nwr\[("amenity"="[a-z_]+"|"shop")\]\(around:/, line);
  }
  // 店名に店舗名まで入っていて、ブランドの目印がない店舗も拾える
  assert.match(q, /\["amenity"="cafe"\]\(around:2000,35.000,139.000\)\["name"~"スターバックス\|Starbucks",i\]/);
  const seven = buildChainQuery([CHAIN_BY_ID.seven], { lat: 35, lon: 139 }, 2000);
  // コンビニは shop の値を問わない（shop=yes で登録された店舗も拾う）
  assert.match(seven, /nwr\["shop"\]\(around:2000,35.000,139.000\)\["name"~/);
  for (const n of ['セブン-イレブン 渋谷道玄坂店', 'セブンイレブン新宿店', 'セブン－イレブン', '7-ELEVEN']) {
    assert.match(n, new RegExp(CHAIN_BY_ID.seven.pattern, 'i'), n);
  }
  // 複数チェーンでも、同じ業種の条件は 1 行にまとめる
  const multi = buildChainQuery([CHAIN_BY_ID.seven, CHAIN_BY_ID.lawson], { lat: 35, lon: 139 }, 1000);
  assert.equal(multi.split('\n').filter((l) => l.startsWith('  nwr["shop"](')).length, 1);
  const m = buildChainQuery([CHAIN_BY_ID.mcdonalds, CHAIN_BY_ID.lawson], { lat: 35, lon: 139 }, 1000);
  assert.match(m, /"McDonald's"/);
  assert.match(m, /Q11323850/); // ナチュラルローソン
  // 支払い方法の検索も完全一致
  assert.doesNotMatch(buildPaymentQuery('paypay', { lat: 35, lon: 139 }, 1000), /~/);
});

test('チェーンデータ：検索用の条件（osm）がそろっている', () => {
  for (const c of CHAINS) {
    assert.ok(c.osm?.wikidata?.every((id) => /^Q\d+$/.test(id)), `${c.id}: wikidata`);
    assert.ok(c.osm?.names?.length, `${c.id}: names`);
  }
});

test('matchesChainKind: 目印つきなら業種を問わず、コンビニは shop の値を問わない', () => {
  const seven = CHAIN_BY_ID.seven;
  assert.equal(matchesChainKind({ name: 'セブン-イレブン 渋谷店', shop: 'yes' }, seven), true);
  assert.equal(matchesChainKind({ name: 'セブン-イレブン前', highway: 'bus_stop' }, seven), false);
  assert.equal(matchesChainKind({ 'brand:wikidata': 'Q259340', building: 'retail' }, seven), true);
  assert.equal(matchesChainKind({ name: '松屋', shop: 'department_store' }, CHAIN_BY_ID.matsuya), false);
  const shop = toShop({ type: 'node', id: 20, lat: 35, lon: 139, tags: { name: 'セブン-イレブン 渋谷店', shop: 'yes' } }, seven);
  assert.equal(shop?.chainId, 'seven');
});

test('チェーン全体の自分の記録：目安より優先、店舗ごとの情報よりは後', () => {
  const merged = mergePayments({
    chain: { smartcode: 'some', paypay: 'yes' },
    mineChain: { smartcode: 'yes', waon: 'no' },
    osm: { waon: 'yes' },
  });
  assert.deepEqual(merged.smartcode, { status: 'yes', source: 'mineChain' });
  assert.deepEqual(merged.waon, { status: 'yes', source: 'osm' });
  assert.deepEqual(merged.paypay, { status: 'yes', source: 'chain' });
  const gusto = { key: 'node/1', chainId: 'gusto', osmPayments: {} };
  assert.equal(statusFor(gusto, 'smartcode', CHAIN_BY_ID), null);
  assert.equal(statusFor(gusto, 'smartcode', CHAIN_BY_ID, {}, { gusto: { smartcode: 'yes' } }), 'yes');
});

test('追加したチェーンも略称で見つかる', () => {
  for (const [q, id] of [['ガスト', 'gusto'], ['サイゼ', 'saizeriya'], ['ケンタ', 'kfc'], ['ココイチ', 'cocoichi'], ['はま寿司', 'hamasushi']]) {
    assert.equal(findChain(q)?.id, id, q);
  }
});

test('自分で追加したお店：チェーン判定と検索への当てはめ', () => {
  assert.equal(chainIdForName('セブン-イレブン'), 'seven');
  assert.equal(chainIdForName('セブンイレブン'), 'seven');
  assert.equal(chainIdForName('ガスト'), 'gusto');
  assert.equal(chainIdForName('喫茶ミドリ'), null);
  const shop = customToShop({ key: 'custom/a', name: 'セブン-イレブン', branch: '岐阜黒野店', lat: 35.45, lon: 136.68, chainId: 'seven' });
  assert.equal(shop.displayName, 'セブン-イレブン 岐阜黒野店');
  assert.equal(shop.custom, true);
  assert.equal(customMatchesQuery(shop, { chain: CHAIN_BY_ID.seven }), true);
  assert.equal(customMatchesQuery(shop, { chain: CHAIN_BY_ID.lawson }), false);
  assert.equal(customMatchesQuery(shop, { name: '黒野' }), true);
  assert.equal(customMatchesQuery(shop, { name: 'ローソン' }), false);
  assert.equal(customMatchesQuery(shop, { method: { id: 'paypay' } }), true);
  // チェーンの目安がそのまま使える
  assert.equal(statusFor(shop, 'nanaco', CHAIN_BY_ID), 'yes');
});
