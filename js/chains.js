// 主要チェーンの「チェーン共通の目安」データ。
// 公開情報（公式サイト・報道）をもとにした目安で、店舗ごとに違うことがあります。
// yes = 使える / some = 一部店舗のみ・情報が割れている / no = 使えない。載っていない方法は「不明」扱い。
//
// aliases: 略称・表記ゆれ（検索欄の入力と照合）
// pattern: 店名からチェーンを判定する正規表現
// osm: OpenStreetMap で店舗を探すときに使う完全一致の条件（brand:wikidata と店名）。
//      値は Name Suggestion Index（OSM のチェーン店データ）に合わせている
// kinds: 同名の別施設（バス停「マクドナルド前」、百貨店の松屋など）を除くための OSM タグ条件

const CREDIT_ALL = { credit: 'yes', visa: 'yes', mastercard: 'yes', jcb: 'yes', amex: 'yes', diners: 'yes' };
const FOOD = { amenity: ['restaurant', 'fast_food', 'food_court'] };
const CAFE = { amenity: ['cafe', 'fast_food', 'restaurant'] };

// すかいらーくグループ（ガスト・バーミヤン・ジョナサン・しゃぶ葉・夢庵など）は共通の決済
const SKYLARK_PAYMENTS = {
  cash: 'yes', ...CREDIT_ALL, id: 'yes', quicpay: 'yes', edy: 'yes',
  paypay: 'yes', dbarai: 'yes', rakutenpay: 'yes', merpay: 'yes', aupay: 'yes', alipay: 'yes', wechat: 'yes',
};
const SKYLARK_NOTE = '席のタブレットから払う「テーブル決済」は PayPay・d払い・楽天ペイ・メルペイ・クレジットカード（すかいらーくアプリ経由）。';

function skylark(id, name, aliases, wikidata) {
  return {
    id, name, aliases: [name, ...aliases], pattern: name, kinds: FOOD,
    osm: { wikidata: [wikidata], names: [name] },
    note: SKYLARK_NOTE,
    payments: SKYLARK_PAYMENTS,
  };
}

// ゼンショーグループは 2026年10月1日から Smart Code に対応（JCB 発表）


export const CHAINS = [
  {
    id: 'mcdonalds',
    name: 'マクドナルド',
    aliases: ['マクドナルド', 'マック', 'マクド', 'mcdonalds', 'mcdonald', 'mac', 'mcd'],
    pattern: 'マクドナルド|McDonald',
    osm: { wikidata: ['Q38076'], names: ['マクドナルド', "McDonald's"] },
    kinds: { amenity: ['fast_food', 'restaurant', 'food_court'] },
    note: 'コード決済は一部店舗を除く全店で対応（2023年10月発表）。モバイルオーダーでは交通系ICは使えません。',
    payments: {
      cash: 'yes', ...CREDIT_ALL, contactless: 'yes', transit: 'yes', id: 'yes', quicpay: 'yes',
      paypay: 'yes', rakutenpay: 'yes', dbarai: 'yes', aupay: 'yes', merpay: 'some',
    },
  },
  {
    id: 'starbucks',
    name: 'スターバックス',
    aliases: ['スターバックス', 'スタバ', 'スターバックスコーヒー', 'starbucks', 'sbux'],
    pattern: 'スターバックス|Starbucks',
    osm: { wikidata: ['Q37158'], names: ['スターバックス', 'スターバックス コーヒー', 'スターバックスコーヒー', 'Starbucks', 'Starbucks Coffee'] },
    kinds: { amenity: ['cafe', 'fast_food', 'restaurant'] },
    note: '商業施設内の店舗などは施設の決済に従う場合があります。iD・QUICPay は店舗により異なります。',
    payments: {
      cash: 'yes', ...CREDIT_ALL, contactless: 'yes', transit: 'yes', id: 'some', quicpay: 'some',
      paypay: 'yes', dbarai: 'yes', rakutenpay: 'yes', aupay: 'yes', merpay: 'no',
    },
  },
  {
    id: 'seven',
    name: 'セブン-イレブン',
    aliases: ['セブンイレブン', 'セブン', 'セブイレ', '7-11', '711', '7eleven', 'seveneleven', 'seven'],
    pattern: 'セブン.?イレブン|7.?Eleven|Seven.?Eleven',
    osm: { wikidata: ['Q259340'], names: ['セブン-イレブン', 'セブンイレブン', '7-ELEVEN', '7-Eleven'] },
    kinds: { shop: ['convenience', 'supermarket'] },
    note: 'WAON は使えません（nanaco は使えます）。',
    payments: {
      cash: 'yes', ...CREDIT_ALL, contactless: 'yes', transit: 'yes', id: 'yes', quicpay: 'yes',
      edy: 'yes', nanaco: 'yes', waon: 'no',
      paypay: 'yes', dbarai: 'yes', rakutenpay: 'yes', aupay: 'yes', merpay: 'yes', smartcode: 'yes',
    },
  },
  {
    id: 'lawson',
    name: 'ローソン',
    aliases: ['ローソン', 'lawson', 'ナチュラルローソン', 'ローソンストア100'],
    pattern: 'ローソン|LAWSON|Lawson',
    osm: { wikidata: ['Q1557223', 'Q11323850', 'Q11350960'], names: ['ローソン', 'ナチュラルローソン', 'ローソンストア100', 'LAWSON'] },
    kinds: { shop: ['convenience', 'supermarket'] },
    note: 'nanaco は使えません。ナチュラルローソン・ローソンストア100も同じ名前で検索されます。',
    payments: {
      cash: 'yes', ...CREDIT_ALL, contactless: 'yes', transit: 'yes', id: 'yes', quicpay: 'yes',
      edy: 'yes', waon: 'yes', nanaco: 'no',
      paypay: 'yes', dbarai: 'yes', rakutenpay: 'yes', aupay: 'yes', merpay: 'yes', smartcode: 'yes',
    },
  },
  {
    id: 'familymart',
    name: 'ファミリーマート',
    aliases: ['ファミリーマート', 'ファミマ', 'familymart', 'famima'],
    pattern: 'ファミリーマート|FamilyMart|Family Mart',
    osm: { wikidata: ['Q11247682'], names: ['ファミリーマート', 'FamilyMart'] },
    kinds: { shop: ['convenience', 'supermarket'] },
    note: 'nanaco は使えません。独自のコード決済 FamiPay に対応。',
    payments: {
      cash: 'yes', ...CREDIT_ALL, contactless: 'yes', transit: 'yes', id: 'yes', quicpay: 'yes',
      edy: 'yes', waon: 'yes', nanaco: 'no',
      famipay: 'yes', paypay: 'yes', dbarai: 'yes', rakutenpay: 'yes', aupay: 'yes', merpay: 'yes', smartcode: 'yes',
    },
  },
  {
    id: 'sukiya',
    name: 'すき家',
    aliases: ['すき家', 'すきや', 'スキヤ', 'sukiya'],
    pattern: 'すき家|Sukiya',
    osm: { wikidata: ['Q6137375'], names: ['すき家'] },
    kinds: { amenity: ['fast_food', 'restaurant', 'food_court'] },
    note: '商業施設内の店舗は施設の決済に従う場合があります。Smart Code はゼンショーグループとして2026年10月から対応（一部店舗を除く）。',
    payments: {
      cash: 'yes', credit: 'yes', transit: 'yes', id: 'yes', quicpay: 'yes', edy: 'yes',
      paypay: 'yes', dbarai: 'yes', rakutenpay: 'some', aupay: 'some', smartcode: 'yes',
    },
  },
  {
    id: 'matsuya',
    name: '松屋',
    aliases: ['松屋', 'まつや', 'マツヤ', 'matsuya'],
    pattern: '松屋|Matsuya',
    osm: { wikidata: ['Q848773'], names: ['松屋'] },
    kinds: { amenity: ['fast_food', 'restaurant', 'food_court'] },
    note: '券売機で支払います。コード決済の種類が多いのが特徴です（Smart Code は券売機・セルフレジのある店舗）。',
    payments: {
      cash: 'yes', credit: 'some', transit: 'yes',
      paypay: 'yes', dbarai: 'yes', rakutenpay: 'yes', aupay: 'yes', merpay: 'yes', smartcode: 'yes',
    },
  },
  skylark('gusto', 'ガスト', ['gusto', 'すかいらーく'], 'Q87724117'),
  skylark('bamiyan', 'バーミヤン', ['bamiyan'], 'Q11328598'),
  skylark('jonathan', 'ジョナサン', ["jonathan's", 'jonathans'], 'Q11310628'),
  skylark('shabuyo', 'しゃぶ葉', ['しゃぶよう', 'shabuyo'], 'Q67710247'),
  skylark('yumean', '夢庵', ['ゆめあん', 'yumean'], 'Q11253593'),
  {
    id: 'saizeriya',
    name: 'サイゼリヤ',
    aliases: ['サイゼリヤ', 'サイゼリア', 'サイゼ', 'saizeriya'],
    pattern: 'サイゼリ[ヤア]|Saizeriya',
    kinds: FOOD,
    osm: { wikidata: ['Q886564'], names: ['サイゼリヤ', 'Saizeriya'] },
    note: 'クレジットカード・交通系IC が基本。PayPay などのコード決済は商業施設内の一部店舗のみ。',
    payments: { cash: 'yes', ...CREDIT_ALL, contactless: 'yes', transit: 'yes', id: 'no', quicpay: 'no', paypay: 'some' },
  },
  {
    id: 'yoshinoya',
    name: '吉野家',
    aliases: ['吉野家', 'よしのや', 'yoshinoya'],
    pattern: '吉野家|Yoshinoya',
    kinds: FOOD,
    osm: { wikidata: ['Q776272'], names: ['吉野家'] },
    note: '2024年12月から全店でクレジットカード（タッチ決済）に対応。',
    payments: {
      cash: 'yes', ...CREDIT_ALL, contactless: 'yes', transit: 'yes', id: 'yes', quicpay: 'yes',
      paypay: 'yes', rakutenpay: 'yes',
    },
  },
  {
    id: 'doutor',
    name: 'ドトール',
    aliases: ['ドトール', 'ドトールコーヒー', 'ドトールコーヒーショップ', 'doutor'],
    pattern: 'ドトール|DOUTOR',
    kinds: CAFE,
    osm: { wikidata: ['Q11322732'], names: ['ドトールコーヒーショップ', 'ドトール'] },
    payments: { cash: 'yes', credit: 'yes', transit: 'yes', id: 'yes', paypay: 'yes', rakutenpay: 'yes' },
  },
  {
    id: 'komeda',
    name: 'コメダ珈琲店',
    aliases: ['コメダ珈琲店', 'コメダ', 'コメダ珈琲', 'komeda'],
    pattern: 'コメダ|KOMEDA',
    kinds: CAFE,
    osm: { wikidata: ['Q11302679'], names: ['コメダ珈琲店'] },
    note: '店舗（フランチャイズ）によって使える決済が違うことがあります。',
    payments: { cash: 'yes', credit: 'yes', transit: 'yes', id: 'yes', paypay: 'yes', rakutenpay: 'yes', smartcode: 'some' },
  },
  {
    id: 'mos',
    name: 'モスバーガー',
    aliases: ['モスバーガー', 'モス', 'mos', 'mosburger'],
    pattern: 'モスバーガー|MOS ?BURGER',
    kinds: FOOD,
    osm: { wikidata: ['Q1204169'], names: ['モスバーガー'] },
    payments: { cash: 'yes', credit: 'yes', contactless: 'yes', transit: 'some', paypay: 'yes' },
  },
  {
    id: 'kfc',
    name: 'ケンタッキーフライドチキン',
    aliases: ['ケンタッキーフライドチキン', 'ケンタッキー', 'ケンタ', 'kfc'],
    pattern: 'ケンタッキー|KFC',
    kinds: FOOD,
    osm: { wikidata: ['Q524757'], names: ['ケンタッキーフライドチキン', 'KFC'] },
    payments: { cash: 'yes', credit: 'yes', contactless: 'yes', paypay: 'yes', rakutenpay: 'yes' },
  },
  {
    id: 'cocoichi',
    name: 'CoCo壱番屋',
    aliases: ['CoCo壱番屋', 'ココイチ', 'ココ壱', 'ココ壱番屋', 'cocoichi'],
    pattern: 'CoCo壱|ココ壱|ココイチ|COCO ICHIBANYA',
    kinds: FOOD,
    osm: { wikidata: ['Q5986105'], names: ['CoCo壱番屋'] },
    payments: { cash: 'yes', credit: 'yes', visa: 'yes', contactless: 'yes', transit: 'yes', paypay: 'yes', rakutenpay: 'no' },
  },
  {
    id: 'hamasushi',
    name: 'はま寿司',
    aliases: ['はま寿司', 'はますし', 'hamasushi'],
    pattern: 'はま寿司|HAMA-?SUSHI',
    kinds: FOOD,
    osm: { wikidata: ['Q17220385'], names: ['はま寿司'] },
    note: 'ゼンショーグループ。2026年10月から Smart Code に対応。',
    payments: {
      cash: 'yes', credit: 'yes', transit: 'yes', paypay: 'yes', rakutenpay: 'yes', dbarai: 'yes', smartcode: 'yes',
    },
  },
  {
    id: 'nakau',
    name: 'なか卯',
    aliases: ['なか卯', 'なかう', 'nakau'],
    pattern: 'なか卯|Nakau',
    kinds: FOOD,
    osm: { wikidata: ['Q11274132'], names: ['なか卯'] },
    note: 'ゼンショーグループ。2026年10月から Smart Code に対応。nanaco・WAON は使えません。',
    payments: {
      cash: 'yes', credit: 'yes', transit: 'yes', id: 'yes', nanaco: 'no', waon: 'no',
      paypay: 'yes', rakutenpay: 'yes', dbarai: 'yes', smartcode: 'yes',
    },
  },
  {
    id: 'kurasushi',
    name: 'くら寿司',
    aliases: ['くら寿司', 'くらずし', 'kurasushi'],
    pattern: 'くら寿司|Kura ?Sushi',
    kinds: FOOD,
    osm: { wikidata: ['Q6445491'], names: ['くら寿司'] },
    note: '電子マネー（交通系IC・楽天Edy・nanaco・WAON・QUICPay）は使えないとする情報が多いです。',
    payments: {
      cash: 'yes', credit: 'yes', contactless: 'yes', transit: 'no', edy: 'no', nanaco: 'no', waon: 'no', quicpay: 'no',
      paypay: 'yes', rakutenpay: 'yes', dbarai: 'yes', aupay: 'yes',
    },
  },
  {
    id: 'sushiro',
    name: 'スシロー',
    aliases: ['スシロー', 'sushiro'],
    pattern: 'スシロー|Sushiro',
    kinds: FOOD,
    osm: { wikidata: ['Q11257037'], names: ['スシロー'] },
    payments: { cash: 'yes', credit: 'yes', paypay: 'yes', rakutenpay: 'yes' },
  },
];

export const CHAIN_BY_ID = Object.fromEntries(CHAINS.map((c) => [c.id, c]));
