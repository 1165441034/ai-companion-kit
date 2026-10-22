import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { messageSegments, qqImageUrl, downloadQQImage, prepareIncomingImages } from '../src/incoming-images.mjs';
import { incomingText } from '../src/desktop-qq-auto-core.mjs';

test('纯图、动画表情、QQ表情与CQ编码均能接收，仍检查真实账号白名单', () => {
  const now = Date.now();
  const settings = {selfId:'10002',ownerQQ:'10001',startedAt:now,now,allowedGroups:['20001'],groupEnabled:true};
  const event = {post_type:'message',message_type:'group',self_id:10002,user_id:10003,group_id:20001,message_id:1,time:Math.floor(now/1000),message:[{type:'image',data:{url:'https://gchat.qpic.cn/test'}}]};
  const message = incomingText(event,settings);
  assert.equal(message.images[0].senderId,'10003');
  assert.equal(message.text,'[收到图片或动画表情]');
  assert.equal(incomingText({...event,group_id:20002},settings),null);
  assert.equal(incomingText({...event,message:[{type:'face',data:{id:14}}]},settings).text,'[QQ表情ID:14]');
  const cq = messageSegments('[CQ:at,qq=10002][CQ:image,url=https://gchat.qpic.cn/a?x=1&amp;y=2]啊&#44;？');
  assert.equal(cq[1].data.url,'https://gchat.qpic.cn/a?x=1&y=2');
  assert.equal(cq[2].data.text,'啊,？');
});

test('下载限制QQ CDN、重定向和流式大小，图片解码为首帧PNG', async t => {
  for(const url of ['file:///C:/secret','https://127.0.0.1/a','https://gchat.qpic.cn.evil.test/a','https://user:pass@gchat.qpic.cn/a']) assert.throws(()=>qqImageUrl(url));
  await assert.rejects(downloadQQImage('https://gchat.qpic.cn/a',{fetcher:async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}})}));
  await assert.rejects(downloadQQImage('https://gchat.qpic.cn/a',{maxBytes:1,fetcher:async()=>new Response('too big')}));
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'qq-vision-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const gif=await sharp({create:{width:8,height:8,channels:3,background:'red'}}).gif().toBuffer();
  const result=await prepareIncomingImages([{url:'https://gchat.qpic.cn/a',senderId:'10003',messageId:'1'}],directory,{fetcher:async()=>new Response(gif)});
  assert.equal(result.files.length,1);
  assert.equal((await sharp(result.files[0].file).metadata()).format,'png');
  const invalid=await prepareIncomingImages([{url:'https://gchat.qpic.cn/a'}],directory,{fetcher:async()=>new Response('not an image')});
  assert.equal(invalid.failed.length,1);
});
