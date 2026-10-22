import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConversationDiary, writeTodayDiary } from '../src/diary.mjs';
import { LongTermMemory } from '../src/memory.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const [command = 'list', scope = `private:${config.ownerQQ}`] = process.argv.slice(2);
const [type, target] = scope.split(':');
const category = type === 'group' ? 'groups' : 'private';
if (!(config.allow[category] ?? []).includes(target) || (config.deny?.[category] ?? []).includes(target)) throw new Error('会话不在白名单');
const state = path.join(root, 'state', 'desktop-auto');
const diary = new ConversationDiary(path.join(state, 'diary'));
if (command === 'list') console.log(JSON.stringify(diary.read(scope), null, 2));
else if (command === 'auto') {
  const role = fs.readFileSync(path.join(root, config.desktopQQ.roleCard), 'utf8');
  const result = await writeTodayDiary({ diary, memory: new LongTermMemory(path.join(state, 'memory')), scope,
    role, settings: config.desktopQQ.autoReply, workDirectory: path.join(state, 'diary-workdir') });
  console.log(JSON.stringify(result ?? { skipped: '今天已有日记或没有当天聊天' }, null, 2));
} else throw new Error('用法：node scripts/diary.mjs list|auto private:QQ或group:群号');
