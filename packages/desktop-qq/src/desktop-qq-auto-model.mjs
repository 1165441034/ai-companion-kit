import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { validateReply } from './desktop-qq-auto-core.mjs';

export async function generateReply(settings, prompt, workDirectory) {
  fs.mkdirSync(workDirectory, { recursive: true });
  const schemaPath = path.join(workDirectory, 'reply.schema.json');
  fs.writeFileSync(schemaPath, JSON.stringify({
    type: 'object', properties: { reply: { type: 'string' } },
    required: ['reply'], additionalProperties: false,
  }));
  const args = ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check',
    '--sandbox', 'read-only', '--disable', 'shell_tool', '--disable', 'apps', '--disable', 'multi_agent',
    '-c', 'web_search="disabled"', '-c', 'approval_policy="never"',
    '-c', `model_reasoning_effort=${JSON.stringify(settings.reasoningEffort ?? 'low')}`, '--model', settings.model,
    '--output-schema', schemaPath, '--json', '--cd', workDirectory, '-'];
  // Reuse saved ChatGPT authentication; never silently switch to API-key billing.
  const env = { ...process.env };
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL']) delete env[key];
  if (settings.proxyUrl) {
    env.HTTPS_PROXY = settings.proxyUrl;
    env.HTTP_PROXY = settings.proxyUrl;
    env.NO_PROXY = 'localhost,127.0.0.1,::1';
  }
  return new Promise((resolve, reject) => {
    const child = spawn(settings.codexPath, args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let diagnostics = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, settings.timeoutMs ?? 120000);
    child.stdin.on('error', () => {});
    let progressBuffer = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      progressBuffer += chunk;
      const lines = progressBuffer.split('\n');
      progressBuffer = lines.pop();
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (event.type === 'item.completed') console.log(`[codex-generation] item=${event.item?.type}`);
          if (event.type === 'item.completed' && event.item?.type === 'error') {
            console.error(`[codex-generation] ${String(event.item.message ?? event.item.text ?? 'unknown error').slice(0, 1000)}`);
          }
        } catch {}
      }
    });
    child.stderr.on('data', (chunk) => { diagnostics = (diagnostics + chunk).slice(-3000); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error('模型生成超过时限，未发送'));
      if (code !== 0) return reject(new Error(`Codex 退出码 ${code}：${diagnostics.slice(-500)}`));
      try {
        const events = output.split('\n').filter(Boolean).map((line) => JSON.parse(line));
        const items = events.filter((event) => event.type === 'item.completed').map((event) => event.item);
        if (items.some((item) => !['agent_message', 'reasoning'].includes(item.type))) {
          throw new Error(`模型返回非文本事件：${items.map((item) => item.type).join(',')}，回复已拒绝`);
        }
        const answer = items.filter((item) => item.type === 'agent_message').at(-1)?.text;
        resolve(validateReply(answer, { allowSilence: settings.allowSilence === true }));
      } catch (error) { reject(error); }
    });
    child.stdin.end(prompt);
  });
}
