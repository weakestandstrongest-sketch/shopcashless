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
