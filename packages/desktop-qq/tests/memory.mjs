import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LongTermMemory } from '../src/memory.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-qq-memory-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, memory: new LongTermMemory(directory) };
}
const message = { id: 'test-1', key: 'private:10001', senderId: '10001', senderName: '测试用户', text: '记住：我喜欢摇滚和贝斯', receivedAt: 1 };
test('长期记忆跨实例保留，明确记忆带来源并去重', (t) => {
  const { directory, memory } = fixture(t);
  memory.observe(message); memory.observe(message);
  const restarted = new LongTermMemory(directory);
  assert.equal(restarted.read(message.key).records.length, 1);
  assert.equal(restarted.context(message.key, '我的爱好', ['10001']).notes[0].text, '我喜欢摇滚和贝斯');
});
test('私聊和不同群不串记忆，其他群友不能删除本人的记忆', (t) => {
  const { memory } = fixture(t);
  memory.observe(message);
  memory.observe({ ...message, id: 'group-note', key: 'group:20001' });
  memory.observe({ ...message, id: 'other-forget', key: 'group:20001', senderId: '10002', text: '忘记：全部' });
  assert.equal(memory.context('group:20001', '摇滚', ['10001']).notes.length, 1);
  assert.equal(memory.context('group:20002', '摇滚', ['10001']).notes.length, 0);
  assert.equal(memory.context('private:10002', '摇滚', ['10001']).notes.length, 0);
});
test('遗忘同时移除来源记录并增加版本，防止旧回复复活记忆', (t) => {
  const { memory } = fixture(t);
  memory.observe(message);
  const epoch = memory.epoch(message.key);
  assert.equal(memory.observe({ ...message, id: 'forget', text: '忘记：我喜欢摇滚和贝斯' }).forgotten, true);
  const context = memory.context(message.key, '摇滚和贝斯', ['10001']);
  assert.equal(context.notes.length, 0); assert.equal(context.relatedMessages.length, 0);
  assert.equal(memory.epoch(message.key), epoch + 1);
});
test('旧对话片段可检索，导出恢复保留记忆且拒绝覆盖', (t) => {
  const { memory } = fixture(t);
  memory.observe({ ...message, text: '昨天我们聊了电贝斯的音色' });
  assert.equal(memory.context(message.key, '电贝斯音色', ['10001']).relatedMessages.length, 1);
  const second = fixture(t).memory;
  second.importData(memory.exportData());
  assert.equal(second.read(message.key).records.length, 1);
  assert.throws(() => second.importData(memory.exportData()), /拒绝覆盖/);
  assert.throws(() => second.read('../../config'), /无效/);
});
