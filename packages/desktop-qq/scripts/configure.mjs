import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function configure(directory, options) {
  const qq = (value) => { if (!/^[1-9]\d{4,14}$/.test(String(value))) throw new Error('QQ / 群号无效'); return String(value); };
  const ownerQQ = qq(options.ownerQQ);
  const botQQ = qq(options.botQQ);
  const privateQQ = (options.privateQQ ?? []).filter(Boolean).map(qq);
  const groups = (options.groups ?? []).filter(Boolean).map(qq);
  const configPath = path.join(directory, 'config.json');
  const template = JSON.parse(fs.readFileSync(path.join(directory, 'config.example.json'), 'utf8'));
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '')) : template;
  config.ownerQQ = ownerQQ;
  config.allow = { private: [...new Set([...(config.allow?.private ?? []), ownerQQ, botQQ, ...privateQQ])],
    groups: [...new Set([...(config.allow?.groups ?? []), ...groups])] };
  config.deny ??= { private: [], groups: [] };
  config.snowluma = { ...template.snowluma, ...config.snowluma, homeDir: path.resolve(options.snowLumaHome) };
  const onebotFile = path.join(config.snowluma.homeDir, 'config', `onebot_${botQQ}.json`);
  if (fs.existsSync(onebotFile)) {
    const onebot = JSON.parse(fs.readFileSync(onebotFile, 'utf8').replace(/^\uFEFF/, ''));
    const http = onebot.networks?.httpServers?.[0];
    const ws = onebot.networks?.wsServers?.[0];
    if (http) { config.snowluma.httpUrl = `http://127.0.0.1:${http.port}`; config.snowluma.accessToken = http.accessToken; }
    if (ws) config.snowluma.wsUrl = `ws://127.0.0.1:${ws.port}`;
  }
  config.desktopQQ = { ...template.desktopQQ, ...config.desktopQQ };
  config.desktopQQ.memory = { enabled: true, ...config.desktopQQ.memory };
  config.desktopQQ.autoReply = { ...template.desktopQQ.autoReply, ...config.desktopQQ.autoReply,
    enabled: false, ownerQQ, botQQ, codexPath: options.codexPath,
    model: 'gpt-6.1-sol', reasoningEffort: 'low' };
  if (options.proxyUrl !== undefined) config.desktopQQ.autoReply.proxyUrl = options.proxyUrl;
  const rolePath = path.join(directory, 'roles', '广井菊里.local.md');
  if (!fs.existsSync(rolePath)) {
    const role = fs.readFileSync(path.join(directory, 'roles', '广井菊里.md'), 'utf8').replaceAll('{{ADMIN_QQ}}', ownerQQ);
    fs.writeFileSync(rolePath, role);
  }
  config.desktopQQ.roleCard = 'roles/广井菊里.local.md';
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  return { ownerQQ, botQQ, privateQQ: config.allow.private, groups: config.allow.groups };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const summary = configure(fileURLToPath(new URL('../', import.meta.url)), JSON.parse(input.replace(/^\uFEFF/, '')));
  console.log(JSON.stringify(summary));
}
