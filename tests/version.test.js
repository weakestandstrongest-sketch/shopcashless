import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// iPhone の Safari に古いファイルが残らないよう、すべての読み込みに同じ ?v= を付けている。
// ファイルを更新したら index.html と js/*.js の v をそろえて上げること。
test('すべての読み込みに同じバージョン（?v=）が付いている', () => {
  const root = new URL('../', import.meta.url);
  const html = readFileSync(new URL('index.html', root), 'utf8');
  const versions = new Set();
  for (const m of html.matchAll(/(?:href|src)="(css\/style\.css|js\/app\.js)(\?v=([^"]+))?"/g)) {
    assert.ok(m[3], `${m[1]} に ?v= がない`);
    versions.add(m[3]);
  }
  for (const f of readdirSync(new URL('js/', root))) {
    const src = readFileSync(new URL(`js/${f}`, root), 'utf8');
    for (const m of src.matchAll(/from '(\.\/[^']+)'/g)) {
      const v = /\?v=(.+)$/.exec(m[1]);
      assert.ok(v, `js/${f}: ${m[1]} に ?v= がない`);
      versions.add(v[1]);
    }
  }
  assert.equal(versions.size, 1, `バージョンがそろっていない: ${[...versions].join(', ')}`);
});
