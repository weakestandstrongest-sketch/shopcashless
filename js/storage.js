// 「自分の記録」をこの端末（ブラウザ）に保存する。
// 形式: { [shopKey]: { name, methods: { paypay: 'yes', ... }, updatedAt } }

const KEY = 'shopcashless:records:v1';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeAll(all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function getMine(shopKey) {
  return readAll()[shopKey]?.methods ?? {};
}

export function getAllMine() {
  return Object.fromEntries(Object.entries(readAll()).map(([k, v]) => [k, v.methods ?? {}]));
}

// status: 'yes' | 'no' | null（null で記録を消す）
export function setMine(shop, methodId, status) {
  const all = readAll();
  const entry = all[shop.key] ?? { name: shop.displayName, methods: {} };
  if (status) entry.methods[methodId] = status;
  else delete entry.methods[methodId];
  entry.updatedAt = new Date().toISOString();
  if (Object.keys(entry.methods).length === 0) delete all[shop.key];
  else all[shop.key] = entry;
  return writeAll(all);
}

// 「チェーン全体」の自分の記録（例：ガストは Smart Code が使える）。全店舗に反映される
// 形式: { [chainId]: { paypay: 'yes', ... } }
const CHAIN_KEY = 'shopcashless:chain-records:v1';

function readChains() {
  try {
    return JSON.parse(localStorage.getItem(CHAIN_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function getAllChainMine() {
  return readChains();
}

export function getChainMine(chainId) {
  return readChains()[chainId] ?? {};
}

export function setChainMine(chainId, methodId, status) {
  const all = readChains();
  const entry = all[chainId] ?? {};
  if (status) entry[methodId] = status;
  else delete entry[methodId];
  if (Object.keys(entry).length === 0) delete all[chainId];
  else all[chainId] = entry;
  try {
    localStorage.setItem(CHAIN_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

// 地図データに無いお店を、自分で追加したもの
// 形式: [{ key: 'custom/…', name, branch, lat, lon, chainId, createdAt }]
const CUSTOM_KEY = 'shopcashless:custom-shops:v1';

export function getCustomShops() {
  try {
    const list = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeCustomShops(list) {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function addCustomShop({ name, branch, lat, lon, chainId }) {
  const shop = {
    key: `custom/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name, branch, lat, lon, chainId, createdAt: new Date().toISOString(),
  };
  return writeCustomShops([...getCustomShops(), shop]) ? shop : null;
}

export function removeCustomShop(key) {
  return writeCustomShops(getCustomShops().filter((s) => s.key !== key));
}
