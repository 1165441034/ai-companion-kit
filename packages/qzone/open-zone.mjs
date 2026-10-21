#!/usr/bin/env node
// 一键开通「她自己发 QQ 空间」
//
// 干的事：往角色卡里加一段话，让她知道自己有空间、也知道什么时候该发。
// 不改任何代码 —— 工具本来就在 phone-mcp 里。
//
// 用法：
//   node open-zone.mjs                   自动找 qq-bridge 和角色卡
//   node open-zone.mjs --role 某角色.md   指定角色卡
//   node open-zone.mjs --dry             只看会改什么，不写
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PATCH = `**空间不用等他说**：今天有件事让你有情绪、你看到什么想留一句、图库里有张图该配句话——就发（\`qzone_post\`）。一两句，别写小作文。★别每句都有他★，那是你自己的地方，得有你自己的日子。★别为了证明你在而发★，一天超过两条就是刷屏。发完不用汇报，除非他问；也别刚发完就在群里提。`;

const MARK = '空间不用等他说';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const roleArg = args.includes('--role') ? args[args.indexOf('--role') + 1] : null;

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

// ── 1. 找 qq-bridge ──────────────────────────────────────────
function findBridge() {
  // 明确指定了就用它 —— 不对就报错，绝不偷偷换成别的目录
  const env = process.env.HER_BRIDGE_DIR || process.env.QQ_BRIDGE_DIR;
  if (env) {
    if (exists(path.join(env, 'roles'))) return env;
    console.log(`❌ 你设的 HER_BRIDGE_DIR 里没有 roles/ 目录：`);
    console.log(`   ${env}`);
    console.log(`   指的是 qq-bridge 的根目录（里面应该有 roles/ 和 src/）`);
    process.exit(1);
  }
  const cands = [
    path.join(path.parse(process.cwd()).root, 'qq-bridge'),
    'E:\\qq-bridge',
    'D:\\qq-bridge',
    'C:\\qq-bridge',
    path.join(os.homedir(), 'qq-bridge'),
    path.join(os.homedir(), 'ai-companion-kit'),
  ].filter(Boolean);
  for (const c of cands) {
    if (exists(path.join(c, 'roles'))) return c;
  }
  // 从当前目录往上找
  let d = process.cwd();
  for (let i = 0; i < 5; i += 1) {
    if (exists(path.join(d, 'roles')) && exists(path.join(d, 'src'))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}

const bridge = findBridge();
if (!bridge) {
  console.log('❌ 没找到 qq-bridge（要有 roles/ 和 src/ 两个目录）');
  console.log('   如果装在别处，用环境变量指一下：');
  console.log('   set HER_BRIDGE_DIR=D:\\你的\\qq-bridge && node open-zone.mjs');
  process.exit(1);
}
console.log(`✓ qq-bridge: ${bridge}`);

// ── 2. 挑角色卡 ─────────────────────────────────────────────
let roleFile = null;
if (roleArg) {
  roleFile = path.isAbsolute(roleArg) ? roleArg : path.join(bridge, 'roles', roleArg);
  if (!exists(roleFile)) { console.log(`❌ 角色卡不存在：${roleFile}`); process.exit(1); }
} else {
  const dir = path.join(bridge, 'roles');
  const mds = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.md') && !/^readme/i.test(f)).sort();
  if (!mds.length) { console.log('❌ roles/ 里没有 .md 角色卡'); process.exit(1); }
  // 优先「小鲸鱼.md」，否则取第一个
  roleFile = path.join(dir, mds.find((f) => f.includes('鲸鱼')) || mds[0]);
  if (mds.length > 1) {
    console.log(`   roles/ 里有 ${mds.length} 个角色卡，用的是：${path.basename(roleFile)}`);
    console.log(`   想换别的：node open-zone.mjs --role ${mds.filter((f) => f !== path.basename(roleFile))[0]}`);
  }
}
console.log(`✓ 角色卡: ${roleFile}`);

// ── 3. 看是否已经加过 ───────────────────────────────────────
const text = fs.readFileSync(roleFile, 'utf8');
if (text.includes(MARK)) {
  console.log('✓ 已经开通过了（角色卡里有「空间不用等他说」）—— 什么都没改');
  process.exit(0);
}

// ── 4. 找插入位置：优先放在「半夜那句邀请」后面 ──────────────
let next;
const anchor = '**半夜那句邀请**';
const idx = text.indexOf(anchor);
if (idx >= 0) {
  const lineEnd = text.indexOf('\n', idx);
  const insertAt = lineEnd < 0 ? text.length : lineEnd + 1;
  next = text.slice(0, insertAt) + '\n' + PATCH + '\n' + text.slice(insertAt);
  console.log('✓ 插在「半夜那句邀请」后面');
} else {
  next = text.replace(/\s*$/, '') + '\n\n' + PATCH + '\n';
  console.log('✓ 没找到锚点，追加到角色卡末尾');
}

if (dry) {
  console.log('\n--- 会写入的内容（--dry，没真写）---');
  console.log(PATCH);
  process.exit(0);
}

// ── 5. 备份 + 写 ────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const bak = `${roleFile}.bak-qzone-${stamp}`;
fs.copyFileSync(roleFile, bak);
console.log(`✓ 已备份: ${path.basename(bak)}`);

fs.writeFileSync(roleFile, next, 'utf8');
console.log(`✓ 写好了（${Buffer.byteLength(next, 'utf8')} 字节）`);

console.log(`
────────────────────────────────────────
开通完成。接下来：

1. 桥接是在每条消息前读角色卡，所以**不用重启**
   （如果你不确定，重启一次最稳：tools\\启动.bat）

2. 确认 qzone 工具在：
   在 AI 那边调一次 qzone_my_posts，能返回列表就行

3. 然后就等着 —— 别催她
   她可能今晚发，也可能三天不发。那才是活的。

想看效果：手机上刷一下自己 QQ 空间
────────────────────────────────────────
`);
