// 支払い方法のカタログ。
// osm: OpenStreetMap の payment:* タグのキー（表記ゆれも含めて列挙）
// words: 検索欄に入力されたときに「この支払い方法が使える店を探す」と判定する語

// 表示順：よく気にされるキャッシュレス手段を先に
export const CATEGORIES = [
  { id: 'code', label: 'コード決済（QR・バーコード）' },
  { id: 'transit', label: '交通系IC' },
  { id: 'emoney', label: '電子マネー' },
  { id: 'card', label: 'クレジットカード・タッチ決済' },
  { id: 'cash', label: '現金' },
];

export const SOURCE_LABEL = { mine: '自分', osm: '店舗', chain: '目安' };

export const METHODS = [
  { id: 'cash', name: '現金', cat: 'cash', osm: ['cash', 'coins', 'notes'], words: ['現金'] },

  { id: 'credit', name: 'クレジットカード', cat: 'card', osm: ['credit_cards'], words: ['クレジットカード', 'クレカ', 'カード'] },
  { id: 'visa', name: 'VISA', cat: 'card', osm: ['visa'], words: ['visa', 'ビザ'] },
  { id: 'mastercard', name: 'Mastercard', cat: 'card', osm: ['mastercard'], words: ['mastercard', 'master', 'マスターカード'] },
  { id: 'jcb', name: 'JCB', cat: 'card', osm: ['jcb'], words: ['jcb'] },
  { id: 'amex', name: 'American Express', cat: 'card', osm: ['american_express', 'amex'], words: ['amex', 'アメックス', 'americanexpress'] },
  { id: 'diners', name: 'Diners Club', cat: 'card', osm: ['diners_club'], words: ['diners', 'ダイナース'] },
  { id: 'debit', name: 'デビットカード', cat: 'card', osm: ['debit_cards'], words: ['デビット', 'デビットカード'] },
  { id: 'contactless', name: 'タッチ決済', cat: 'card', osm: ['contactless'], words: ['タッチ決済', 'コンタクトレス', 'nfc'] },

  {
    id: 'transit', name: '交通系IC（Suica・PASMOなど）', short: '交通系IC', cat: 'transit',
    osm: ['suica', 'pasmo', 'icoca', 'kitaca', 'toica', 'manaca', 'sugoca', 'nimoca', 'hayakaken', 'pitapa', 'transportation_ic'],
    words: ['交通系', '交通系ic', 'suica', 'スイカ', 'pasmo', 'パスモ', 'icoca', 'イコカ', 'kitaca', 'toica', 'manaca', 'sugoca', 'nimoca'],
  },

  { id: 'id', name: 'iD', cat: 'emoney', osm: ['id'], words: ['id', 'アイディ', 'アイディー'] },
  { id: 'quicpay', name: 'QUICPay', cat: 'emoney', osm: ['quicpay'], words: ['quicpay', 'クイックペイ'] },
  { id: 'edy', name: '楽天Edy', cat: 'emoney', osm: ['rakuten_edy', 'edy'], words: ['edy', '楽天edy', 'エディ'] },
  { id: 'waon', name: 'WAON', cat: 'emoney', osm: ['waon'], words: ['waon', 'ワオン'] },
  { id: 'nanaco', name: 'nanaco', cat: 'emoney', osm: ['nanaco'], words: ['nanaco', 'ナナコ'] },

  { id: 'paypay', name: 'PayPay', cat: 'code', osm: ['paypay'], words: ['paypay', 'ペイペイ'] },
  { id: 'dbarai', name: 'd払い', cat: 'code', osm: ['d_barai', 'd_payment', 'dbarai'], words: ['d払い', 'dばらい', 'ドコモ払い'] },
  { id: 'rakutenpay', name: '楽天ペイ', cat: 'code', osm: ['rakuten_pay'], words: ['楽天ペイ', '楽天pay', 'rakutenpay'] },
  { id: 'aupay', name: 'au PAY', cat: 'code', osm: ['au_pay', 'aupay'], words: ['aupay', 'auペイ'] },
  { id: 'merpay', name: 'メルペイ', cat: 'code', osm: ['merpay'], words: ['メルペイ', 'merpay'] },
  {
    id: 'smartcode', name: 'Smart Code', cat: 'code', osm: ['smart_code', 'smartcode'],
    words: ['smartcode', 'スマートコード', 'スマコ'],
    hint: 'JCB の共通コード決済。マークのある店で メルペイ・au PAY・ANA Pay・ゆうちょPay などが使えます',
  },
  { id: 'famipay', name: 'FamiPay', cat: 'code', osm: ['famipay'], words: ['famipay', 'ファミペイ'] },
  { id: 'alipay', name: 'Alipay', cat: 'code', osm: ['alipay'], words: ['alipay', 'アリペイ'] },
  { id: 'wechat', name: 'WeChat Pay', cat: 'code', osm: ['wechat', 'wechat_pay'], words: ['wechatpay', 'wechat', 'ウィーチャットペイ'] },
];

export const METHOD_BY_ID = Object.fromEntries(METHODS.map((m) => [m.id, m]));

// OSM の payment:<key> → 支払い方法ID
export const METHOD_ID_BY_OSM_KEY = Object.fromEntries(
  METHODS.flatMap((m) => m.osm.map((k) => [k, m.id])),
);

export const STATUS = {
  yes: { label: '使える', mark: '◯' },
  some: { label: '一部店舗', mark: '△' },
  no: { label: '使えない', mark: '✕' },
};
