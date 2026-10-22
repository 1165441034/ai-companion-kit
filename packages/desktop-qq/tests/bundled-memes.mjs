import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { loadReactionCatalog } from '../src/reactions.mjs';

test('随仓库部署的40张素材均存在、哈希唯一且可解码', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const rows = JSON.parse(fs.readFileSync(path.join(root, 'memes/catalog.default.json'), 'utf8'));
  assert.equal(rows.length, 40);
  const hashes = new Set();
  for (const row of rows) {
    assert.match(row.file, /^memes\/btr_\d{3}\.jpg$/);
    const data = fs.readFileSync(path.join(root, row.file));
    assert.equal(createHash('sha256').update(data).digest('hex'), row.sha256);
    hashes.add(row.sha256);
    assert.ok(data.length <= 10 * 1024 * 1024);
    assert.equal((await sharp(data).metadata()).format, 'jpeg');
  }
  assert.equal(hashes.size, 40);
  assert.equal(rows.filter(row => row.moods.length).length, 20);
});

test('新电脑使用内置目录，已有本机目录优先且不被覆盖', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-catalog-'));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  fs.mkdirSync(path.join(root, 'memes'));
  fs.writeFileSync(path.join(root, 'memes/catalog.default.json'), '[{"file":"bundled"}]');
  assert.equal(loadReactionCatalog(root)[0].file, 'bundled');
  fs.writeFileSync(path.join(root, 'memes/catalog.json'), '[{"file":"local"}]');
  assert.equal(loadReactionCatalog(root)[0].file, 'local');
});
