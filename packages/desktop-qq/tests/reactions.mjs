import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseReaction } from '../src/reactions.mjs';
const now = 10_000_000;
const policy = { enabled:true, probability:.1, cooldownMs:900000, maxPerHour:2, globalCooldownMs:300000, globalMaxPerHour:4 };
const catalog = [{file:'memes/happy.png',moods:['happy']},{file:'memes/smile.jpg',moods:['smile']},{file:'memes/question.jpg',moods:['confused']}];
const options = {policy,catalog,now,random:()=>0};
test('只给合适短回复低概率附表情，严肃话题、空回复、重复图片不发', () => {
  assert.equal(chooseReaction('草，绝了', options)?.file, 'memes/happy.png');
  assert.equal(chooseReaction('去哪？', options)?.file, 'memes/question.jpg');
  for(const text of ['', '好难过', '今天生病去医院了', '这需要核实资料']) assert.equal(chooseReaction(text,options),null);
  assert.equal(chooseReaction('来了',{...options,random:()=>.2}),null);
  assert.equal(chooseReaction('来了',{...options,context:'我今天住院了，医院'}),null);
  assert.equal(chooseReaction('来了',{...options,chat:{lastFile:'memes/smile.jpg'}}),null);
});
test('表情限频按尝试计数，私聊群聊共享全局限制，重启恢复后依然有效', () => {
  for(const extra of [
    {chat:{attempts:[now-1000]}},
    {chat:{attempts:[now-2000000,now-1000000]}},
    {globalAttempts:[now-1000]},
    {globalAttempts:[now-3500000,now-2500000,now-1500000,now-500000]},
  ]) assert.equal(chooseReaction('来了',{...options,...JSON.parse(JSON.stringify(extra))}),null);
  assert.ok(chooseReaction('来了',{...options,chat:{attempts:[now-3600001]}}));
});
