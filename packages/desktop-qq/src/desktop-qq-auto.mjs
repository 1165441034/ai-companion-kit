import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SnowLumaWebSocketClient } from '@snowluma/sdk';
import { discoverSnowLumaConnection } from './snowluma-conn.js';
import { incomingText, groupReplyDecision, buildReplyPrompt } from './desktop-qq-auto-core.mjs';
import { generateReply } from './desktop-qq-auto-model.mjs';
import { LongTermMemory } from './memory.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const configPath = path.join(root, 'config.json');
const stateDirectory = path.join(root, 'state', 'desktop-auto');
const lockPath = path.join(stateDirectory, 'service.lock');
const statusPath = path.join(stateDirectory, 'status.json');
const statePath = path.join(stateDirectory, 'conversation.json');
const startedAt = Date.now();
const loadConfig = () => JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
const config = loadConfig();
const settings = config.desktopQQ?.autoReply;
if (!settings?.enabled) throw new Error('desktopQQ.autoReply.enabled 未开启');
if (!settings.codexPath || !fs.existsSync(settings.codexPath)) {
  const { execFileSync } = await import('node:child_process');
  const found = execFileSync('where.exe', ['codex.exe'], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/)[0];
  settings.codexPath = found;
}
if (String(settings.ownerQQ) !== String(config.ownerQQ)) throw new Error('自动回复主号与管理员不一致');
fs.mkdirSync(stateDirectory, { recursive: true });
const memory = config.desktopQQ.memory?.enabled === false ? null : new LongTermMemory(path.join(stateDirectory, 'memory'));

function atomicWrite(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, file);
}

function acquireLock() {
  if (fs.existsSync(lockPath)) {
    const old = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    let alive = true;
    try { process.kill(old.pid, 0); } catch (error) {
      if (error.code === 'ESRCH') alive = false;
      else throw error;
    }
    if (alive) throw new Error(`自动回复已在运行，PID ${old.pid}`);
    fs.unlinkSync(lockPath);
  }
  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt }), { flag: 'wx' });
}
acquireLock();
process.on('exit', () => {
  try {
    if (JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid === process.pid) fs.unlinkSync(lockPath);
  } catch {}
});

let currentStatus = { pid: process.pid, startedAt, state: 'starting', model: settings.model,
  reasoningEffort: settings.reasoningEffort ?? 'low', ownerQQ: settings.ownerQQ,
  allowedGroups: settings.groups?.enabled ? config.allow.groups : [], groupPolicy: settings.groups };
function status(update) {
  currentStatus = { ...currentStatus, ...update, updatedAt: Date.now() };
  atomicWrite(statusPath, currentStatus);
}
function log(message) { console.log(`${new Date().toISOString()} [desktop-auto] ${message}`); }
let conversation = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { seen: [], chats: {} };
if (!Array.isArray(conversation.seen)) throw new Error('会话状态格式损坏');
if (!conversation.chats) {
  if (!Array.isArray(conversation.history)) throw new Error('旧会话状态格式损坏');
  conversation.chats = { [`private:${settings.ownerQQ}`]: { history: conversation.history, attempts: [] } };
}
const seen = new Set(conversation.seen);
function chatState(key) {
  return conversation.chats[key] ??= { history: [], attempts: [] };
}
function saveConversation() {
  for (const chat of Object.values(conversation.chats)) {
    chat.history = chat.history.slice(-16);
    chat.attempts = chat.attempts.filter((time) => Date.now() - time < 600000);
  }
  conversation = { seen: [...seen].slice(-500), chats: conversation.chats };
  atomicWrite(statePath, conversation);
}

const connection = await discoverSnowLumaConnection({ cfg: config });
if (!connection.ok || !connection.wsToken) throw new Error('无法发现 SnowLuma HTTP/WS 连接');
const selfId = String(connection.self.user_id);
if (selfId !== String(settings.botQQ)) throw new Error('登录的机器人账号与配置不一致');
const bot = new SnowLumaWebSocketClient({
  url: connection.wsUrl, accessToken: connection.wsToken,
  reconnect: { retries: 20, minDelayMs: 2000, maxDelayMs: 30000 },
});
const pending = new Map();
let busy = false;
let debounceTimer;
let attemptedAt = [];

function allowedTarget(latest, message) {
  if (!latest.desktopQQ?.autoReply?.enabled) return false;
  if (message.type === 'group' && !latest.desktopQQ.autoReply.groups?.enabled) return false;
  const category = message.type === 'group' ? 'groups' : 'private';
  return (latest.allow?.[category] ?? []).map(String).includes(message.targetId)
    && !(latest.deny?.[category] ?? []).map(String).includes(message.targetId);
}

async function sendReply(text, message) {
  const latest = loadConfig();
  if (!allowedTarget(latest, message)) {
    throw new Error('自动回复已关闭或目标不在白名单，未发送');
  }
  const group = message.type === 'group';
  const response = await fetch(`${connection.baseUrl}/${group ? 'send_group_msg' : 'send_private_msg'}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${connection.token}` },
    body: JSON.stringify({ [group ? 'group_id' : 'user_id']: Number(message.targetId), message: [{ type: 'text', data: { text } }] }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`发送 HTTP ${response.status}，不自动重发`);
  const result = await response.json();
  if (result.status !== 'ok' || result.retcode !== 0) throw new Error(`发送失败 ${result.retcode}，不自动重发`);
  return result.data?.message_id;
}

function schedule() {
  clearTimeout(debounceTimer);
  debounceTimer = null;
  if (busy || !pending.size) return;
  const next = Math.min(...[...pending.values()].map((batch) => batch.readyAt));
  debounceTimer = setTimeout(() => { debounceTimer = null; void drain(); }, Math.max(0, next - Date.now()));
}

async function drain() {
  if (busy || !pending.size) return;
  const batch = [...pending.values()].filter((entry) => entry.readyAt <= Date.now())
    .sort((a, b) => Number(b.type === 'private' || b.mentioned) - Number(a.type === 'private' || a.mentioned))[0];
  if (!batch) { schedule(); return; }
  busy = true;
  try {
    attemptedAt = attemptedAt.filter((time) => Date.now() - time < 60000);
    if (attemptedAt.length >= 3) {
      batch.readyAt = attemptedAt[0] + 60050;
      return;
    }
    pending.delete(batch.key);
    const latest = loadConfig();
    if (!allowedTarget(latest, batch)) return;
    const chat = chatState(batch.key);
    const decision = groupReplyDecision(batch, { policy: latest.desktopQQ.autoReply.groups,
      attempts: chat.attempts, lastReplyAt: chat.lastReplyAt });
    if (!decision.reply) {
      log(`群聊保持安静：${batch.key}，原因 ${decision.reason}`);
      return;
    }
    const relativeRole = latest.desktopQQ.roleCard;
    const rolePath = path.resolve(root, relativeRole);
    const relative = path.relative(path.join(root, 'roles'), rolePath);
    if (relative.startsWith('..') || path.isAbsolute(relative) || path.extname(rolePath) !== '.md') throw new Error('角色卡路径无效');
    const role = fs.readFileSync(rolePath, 'utf8');
    const memoryEpoch = memory?.epoch(batch.key);
    const recalled = memory?.context(batch.key, batch.text, chat.history.map((turn) => turn.senderId).filter(Boolean));
    status({ state: 'generating', activeChat: batch.key, lastError: null });
    attemptedAt.push(Date.now());
    chat.attempts.push(Date.now());
    saveConversation();
    log(`生成回复：${batch.key}，触发 ${decision.reason}，角色 ${path.basename(rolePath, '.md')}`);
    const reply = await generateReply({ ...settings, allowSilence: batch.type === 'group' },
      buildReplyPrompt(role, chat.history, settings.ownerQQ, batch, recalled), path.join(stateDirectory, 'model-workdir'));
    if (!reply) { status({ state: 'listening', activeChat: null }); log(`模型选择保持安静：${batch.key}`); return; }
    if (memory && memory.epoch(batch.key) !== memoryEpoch) { status({ state: 'listening', activeChat: null }); log('记忆已被遗忘请求更新，取消旧回复'); return; }
    const messageId = await sendReply(reply, batch);
    chat.lastReplyAt = Date.now();
    chat.history.push({ who: '菊里', senderId: selfId, text: reply });
    saveConversation();
    status({ state: 'listening', activeChat: null, lastSentChat: batch.key, lastSentMessageId: messageId, lastSentAt: Date.now(), lastError: null });
    log(`回复发送成功，chat=${batch.key}，message_id=${messageId}`);
  } catch (error) {
    log(`回复失败：${error.message}`);
    status({ state: 'listening', activeChat: null, lastError: error.message });
  } finally {
    busy = false;
    schedule();
  }
}

bot.on('event', (event) => {
  const latest = loadConfig();
  if (!latest.desktopQQ?.autoReply?.enabled) return;
  const groupPolicy = latest.desktopQQ.autoReply.groups;
  const message = incomingText(event, { selfId, ownerQQ: settings.ownerQQ, startedAt,
    allowedPrivate: latest.allow.private,
    allowedGroups: latest.allow.groups, deniedGroups: latest.deny?.groups, deniedPrivate: latest.deny?.private,
    groupEnabled: groupPolicy?.enabled, names: groupPolicy?.names });
  if (!message || seen.has(message.id)) return;
  if (!allowedTarget(latest, message)) return;
  seen.add(message.id);
  if (seen.size > 500) seen.delete(seen.values().next().value);
  const memoryChange = memory?.observe(message);
  if (memoryChange?.forgotten) { chatState(message.key).history = []; pending.delete(message.key); }
  chatState(message.key).history.push({ who: message.senderId === String(settings.ownerQQ) ? '管理员' : '群友',
    senderId: message.senderId, nickname: message.senderName, text: message.text });
  saveConversation();
  const previous = pending.get(message.key);
  pending.set(message.key, { ...message, mentioned: message.mentioned || Boolean(previous?.mentioned),
    hasReply: message.hasReply && !previous?.mentioned,
    readyAt: Date.now() + (message.type === 'group' ? groupPolicy.debounceMs : 1500) });
  schedule();
});
bot.on('open', () => { status({ state: 'listening', connected: true }); log(`已连接 QQ ${selfId}，主号 ${settings.ownerQQ}，白名单群 ${currentStatus.allowedGroups.join(',') || '无'}，模型 ${settings.model}/${settings.reasoningEffort ?? 'low'}`); });
bot.on('close', () => { status({ state: 'reconnecting', connected: false }); log('QQ WS 断开，等待重连'); });
bot.on('error', () => { log('QQ WS 连接错误'); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  clearTimeout(debounceTimer);
  bot.close();
  status({ state: 'stopped', connected: false });
  process.exit(0);
});
await bot.connect();
