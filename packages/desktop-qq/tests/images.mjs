import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadAllowedImage } from '../src/images.mjs';

test('发图限制目录、文件内容和大小，拒绝远程地址及相邻目录逃逸', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-images-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of ['images', 'memes', 'images-other']) fs.mkdirSync(path.join(root, name));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(path.join(root, 'images', 'ok.png'), png);
  fs.writeFileSync(path.join(root, 'images-other', 'no.png'), png);
  fs.writeFileSync(path.join(root, 'memes', 'fake.png'), 'private text');
  assert.ok(loadAllowedImage('images/ok.png', undefined, root).file.startsWith('base64://'));
  assert.throws(() => loadAllowedImage('images/../images-other/no.png', undefined, root));
  assert.throws(() => loadAllowedImage('memes/fake.png', undefined, root));
  assert.throws(() => loadAllowedImage('https://example.com/a.png', undefined, root));
  assert.throws(() => loadAllowedImage('images/ok.png', { maxMB: .000001 }, root));
  if (process.platform !== 'win32') {
    fs.symlinkSync(path.join(root, 'images-other', 'no.png'), path.join(root, 'images', 'link.png'));
    assert.throws(() => loadAllowedImage('images/link.png', undefined, root));
  }
});
