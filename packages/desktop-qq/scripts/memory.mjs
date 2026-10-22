import fs from 'node:fs';
import { LongTermMemory } from '../src/memory.mjs';
const [command, filename] = process.argv.slice(2);
if (!['export', 'import'].includes(command) || !filename) throw new Error('用法：node scripts/memory.mjs export|import <本机备份文件.json>，导入前停止服务');
const memory = new LongTermMemory(new URL('../state/desktop-auto/memory/', import.meta.url));
if (command === 'export') fs.writeFileSync(filename, JSON.stringify(memory.exportData(), null, 2), { flag: 'wx' });
else memory.importData(JSON.parse(fs.readFileSync(filename, 'utf8')));
console.log(command === 'export' ? '记忆已导出；备份含聊天内容，请保存在本机。' : '记忆已恢复。');
