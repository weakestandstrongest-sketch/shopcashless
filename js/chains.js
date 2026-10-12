// 主要チェーンの「チェーン共通の目安」データ。
// 公開情報（公式サイト・報道）をもとにした目安で、店舗ごとに違うことがあります。
// yes = 使える / some = 一部店舗のみ・情報が割れている / no = 使えない。載っていない方法は「不明」扱い。
//
// aliases: 略称・表記ゆれ（検索欄の入力と照合）
// pattern: OpenStreetMap で店舗を探すときの name / brand に対する正規表現
// kinds: 同名の別施設（バス停「マクドナルド前」、百貨店の松屋など）を除くための OSM タグ条件

const CREDIT_ALL = { credit: 'yes', visa: 'yes', mastercard: 'yes', jcb: 'yes', amex: 'yes', diners: 'yes' };

export const CHAINS = [
  {
    id: 'mcdonalds',
    name: 'マクドナルド',
    aliases: ['マクドナルド', 'マック', 'マクド', 'mcdonalds', 'mcdonald', 'mac', 'mcd'],
    pattern: 'マクドナルド|McDonald',
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
    pattern: 'セブン-?‐?イレブン|7-Eleven|Seven-Eleven|セブンイレブン',
    kinds: { shop: ['convenience', 'supermarket'] },
    note: 'WAON は使えません（nanaco は使えます）。',
    payments: {
      cash: 'yes', ...CREDIT_ALL, contactless: 'yes', transit: 'yes', id: 'yes', quicpay: 'yes',
      edy: 'yes', nanaco: 'yes', waon: 'no',
      paypay: 'yes', dbarai: 'yes', rakutenpay: 'yes', aupay: 'yes', merpay: 'yes',
    },
  },
  {
    id: 'lawson',
    name: 'ローソン',
    aliases: ['ローソン', 'lawson', 'ナチュラルローソン', 'ローソンストア100'],
    pattern: 'ローソン|LAWSON|Lawson',
    kinds: { shop: ['convenience', 'supermarket'] },
    note: 'nanaco は使えません。ナチュラルローソン・ローソンストア100も同じ名前で検索されます。',
    payments: {
      cash: 'yes', ...CREDIT_ALL, contactless: 'yes', transit: 'yes', id: 'yes', quicpay: 'yes',
      edy: 'yes', waon: 'yes', nanaco: 'no',
      paypay: 'yes', dbarai: 'yes', rakutenpay: 'yes', aupay: 'yes', merpay: 'yes',
    },
  },
  {
    id: 'familymart',
    name: 'ファミリーマート',
    aliases: ['ファミリーマート', 'ファミマ', 'familymart', 'famima'],
    pattern: 'ファミリーマート|FamilyMart|Family Mart',
    kinds: { shop: ['convenience', 'supermarket'] },
    note: 'nanaco は使えません。独自のコード決済 FamiPay に対応。',
    payments: {
      cash: 'yes', ...CREDIT_ALL, contactless: 'yes', transit: 'yes', id: 'yes', quicpay: 'yes',
      edy: 'yes', waon: 'yes', nanaco: 'no',
      famipay: 'yes', paypay: 'yes', dbarai: 'yes', rakutenpay: 'yes', aupay: 'yes', merpay: 'yes',
    },
  },
  {
    id: 'sukiya',
    name: 'すき家',
    aliases: ['すき家', 'すきや', 'スキヤ', 'sukiya'],
    pattern: 'すき家|Sukiya',
    kinds: { amenity: ['fast_food', 'restaurant', 'food_court'] },
    note: '商業施設内の店舗は施設の決済に従う場合があります。',
    payments: {
      cash: 'yes', credit: 'yes', transit: 'yes', id: 'yes', quicpay: 'yes', edy: 'yes',
      paypay: 'yes', dbarai: 'yes', rakutenpay: 'some', aupay: 'some',
    },
  },
  {
    id: 'matsuya',
    name: '松屋',
    aliases: ['松屋', 'まつや', 'マツヤ', 'matsuya'],
    pattern: '松屋|Matsuya',
    kinds: { amenity: ['fast_food', 'restaurant', 'food_court'] },
    note: '券売機で支払います。コード決済の種類が多いのが特徴です。',
    payments: {
      cash: 'yes', credit: 'some', transit: 'yes',
      paypay: 'yes', dbarai: 'yes', rakutenpay: 'yes', aupay: 'yes', merpay: 'yes',
    },
  },
];

export const CHAIN_BY_ID = Object.fromEntries(CHAINS.map((c) => [c.id, c]));
