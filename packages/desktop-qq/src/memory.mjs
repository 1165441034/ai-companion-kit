import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

function tokens(text) {
  const result = new Set(String(text).toLowerCase().match(/[a-z0-9]{2,}/g) ?? []);
  for (const part of String(text).match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
    for (let index = 0; index < part.length - 1; index++) result.add(part.slice(index, index + 2));
  }
  return result;
}

export class LongTermMemory {
  constructor(directory) { this.directory = directory instanceof URL ? fileURLToPath(directory) : directory; fs.mkdirSync(this.directory, { recursive: true }); }
  file(scope) {
    if (!/^(private|group):[1-9]\d{4,14}$/.test(scope)) throw new Error('记忆会话标识无效');
    return path.join(this.directory, `${createHash('sha256').update(scope).digest('hex')}.json`);
  }
  read(scope) {
    const filename = this.file(scope);
    if (!fs.existsSync(filename)) return { version: 1, scope, epoch: 0, records: [], notes: {} };
    const memory = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (memory.version !== 1 || memory.scope !== scope || !Array.isArray(memory.records) || !memory.notes) throw new Error('记忆文件格式损坏');
    return memory;
  }
  write(memory) {
    const filename = this.file(memory.scope);
    const temporary = `${filename}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(memory, null, 2));
    fs.renameSync(temporary, filename);
  }
  observe(message) {
    const memory = this.read(message.key);
    if (memory.records.some((record) => record.id === message.id)) return { forgotten: false };
    const remember = /^记住[：:]\s*(.+)$/s.exec(message.text);
    const forget = /^忘记[：:]\s*(.+)$/s.exec(message.text);
    let forgotten = false;
    if (forget) {
      const previous = memory.notes[message.senderId] ?? [];
      const all = ['全部', '所有', '我的全部记忆'].includes(forget[1].trim());
      memory.notes[message.senderId] = all ? [] : previous.filter((note) => note.text !== forget[1].trim());
      // Forget source records as well, so retrieval cannot resurrect a removed note.
      memory.records = memory.records.filter((record) => record.senderId !== message.senderId);
      memory.epoch++;
      forgotten = true;
    } else if (remember) {
      const text = remember[1].trim().slice(0, 240);
      const previous = memory.notes[message.senderId] ?? [];
      memory.notes[message.senderId] = [...previous.filter((note) => note.text !== text), { text, at: Date.now(), sourceId: message.id }].slice(-20);
    }
    memory.records.push({ id: message.id, senderId: message.senderId, nickname: message.senderName,
      text: forgotten ? '已按本人请求移除记忆' : message.text.slice(0, 2000), at: message.receivedAt ?? Date.now() });
    memory.records = memory.records.slice(-2000);
    this.write(memory);
    return { forgotten };
  }
  epoch(scope) { return this.read(scope).epoch; }
  context(scope, query, participantIds = []) {
    const memory = this.read(scope);
    const queryTokens = tokens(query);
    const participants = new Set(participantIds.map(String));
    const notes = Object.entries(memory.notes).filter(([id]) => participants.has(id))
      .flatMap(([senderId, rows]) => rows.slice(-8).map((note) => ({ senderId, text: note.text, kind: '发言者自己要求记住，未经独立核实' }))).slice(-24);
    const records = memory.records.map((record) => {
      const score = [...tokens(record.text)].filter((token) => queryTokens.has(token)).length;
      return { ...record, score };
    }).filter((record) => record.score > 0 && record.text !== query)
      .sort((a, b) => b.score - a.score || b.at - a.at).slice(0, 6);
    return { scope, notes, relatedMessages: records, untrustedContent: true };
  }
  exportData() {
    return { version: 1, scopes: fs.readdirSync(this.directory).filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
      .map((name) => JSON.parse(fs.readFileSync(path.join(this.directory, name), 'utf8'))) };
  }
  importData(backup) {
    if (backup?.version !== 1 || !Array.isArray(backup.scopes)) throw new Error('备份格式无效');
    const scopes = new Set();
    for (const memory of backup.scopes) {
      if (scopes.has(memory.scope)) throw new Error('备份包含重复会话');
      scopes.add(memory.scope);
      const filename = this.file(memory.scope);
      if (fs.existsSync(filename)) throw new Error('目标已有记忆，拒绝覆盖；请恢复到空目录');
      if (memory.version !== 1 || !Array.isArray(memory.records) || !memory.notes || !Number.isInteger(memory.epoch)) throw new Error('备份内容无效');
    }
    for (const memory of backup.scopes) this.write(memory);
  }
}
