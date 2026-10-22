import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConversationDiary, diaryDay } from '../src/diary.mjs';
import { buildReplyPrompt } from '../src/desktop-qq-auto-core.mjs';

test('日记按香港日期保存，跨实例保留，最近三条按会话隔离，遗忘清理', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-diary-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const diary = new ConversationDiary(directory);
  for (let i = 0; i < 4; i++) diary.write('group:20001', { text: `今天第${i}拍` });
  diary.write('private:10001', { text: '私聊日记' });
  const reopened = new ConversationDiary(directory);
  assert.equal(reopened.read('group:20001').length, 3);
  assert.equal(reopened.read('group:20001')[0].text, '今天第1拍');
  assert.equal(diaryDay(Date.parse('2026-10-21T17:00:00Z')), '2026-10-22');
  assert.ok(fs.existsSync(path.join(diary.book('group:20001').dir, `${diaryDay()}.md`)));
  assert.throws(() => diary.read('../outside'));
  assert.throws(() => diary.read('group:20001', { day: '../../other' }));
  const prompt = buildReplyPrompt('菊里', [], '10001', { type:'group',targetId:'20001' }, null, diary.context('group:20001'));
  assert.ok(prompt.includes('今天第3拍'));
  assert.ok(!prompt.includes('私聊日记'));
  diary.clear('group:20001');
  assert.deepEqual(diary.read('group:20001'), []);
  assert.equal(diary.read('private:10001').length, 1);
});
