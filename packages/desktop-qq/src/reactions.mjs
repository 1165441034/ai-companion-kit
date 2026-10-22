export function chooseReaction(text, { policy, context = '', catalog = [], chat = {}, globalAttempts = [], now = Date.now(), random = Math.random }) {
  if (!policy?.enabled || !text.trim() || text.length > 60) return null;
  // Serious topics should not be interrupted by a cheerful sticker.
  if (/难过|伤心|去世|生病|自杀|急救|抑郁|医院|报警|抱歉|对不起/.test(text + context)) return null;
  const recent = (chat.attempts ?? []).filter(time => now - time < 3600000);
  const globalRecent = globalAttempts.filter(time => now - time < 3600000);
  if (recent.length >= policy.maxPerHour || globalRecent.length >= policy.globalMaxPerHour) return null;
  if (recent.length && now - recent.at(-1) < policy.cooldownMs) return null;
  if (globalRecent.length && now - globalRecent.at(-1) < policy.globalCooldownMs) return null;
  if (random() >= policy.probability) return null;
  const mood = /[？?]|啊？|啥|什么|去哪/.test(text) ? 'confused'
    : /哈哈|笑|乐|草|绝了|好耶|摇滚|贝斯|演出/.test(text) ? 'happy'
    : /行|好|来|在|走|收到|没事/.test(text) ? 'smile' : null;
  if (!mood) return null;
  const candidates = catalog.filter(row => row.moods?.includes(mood) && row.file !== chat.lastFile);
  return candidates[Math.floor(random() * candidates.length)] ?? null;
}
