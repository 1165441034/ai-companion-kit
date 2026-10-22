import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const decodeCQ = value => String(value).replace(/&#44;/g, ',').replace(/&#91;/g, '[').replace(/&#93;/g, ']').replace(/&amp;/g, '&');
export function messageSegments(message) {
  if (Array.isArray(message)) return message;
  const result = [];
  const raw = String(message ?? '');
  let offset = 0;
  for (const match of raw.matchAll(/\[CQ:([^,\]]+)((?:,[^\]]*)?)\]/g)) {
    if (match.index > offset) result.push({ type:'text', data:{text:decodeCQ(raw.slice(offset, match.index))} });
    const data = {};
    for (const field of match[2].split(',').filter(Boolean)) {
      const equals = field.indexOf('=');
      if (equals > 0) data[field.slice(0, equals)] = decodeCQ(field.slice(equals + 1));
    }
    result.push({ type:match[1], data });
    offset = match.index + match[0].length;
  }
  if (offset < raw.length) result.push({ type:'text', data:{text:decodeCQ(raw.slice(offset))} });
  return result;
}

export function qqImageUrl(value) {
  const url = new URL(String(value).replace(/&amp;/g, '&'));
  const hosts = ['multimedia.nt.qq.com.cn','gchat.qpic.cn','c2cpicdw.qpic.cn','gxh.vip.qq.com','gxh.vip.qq.com.cn','i.gtimg.cn'];
  if (!['http:', 'https:'].includes(url.protocol) || !hosts.includes(url.hostname) || url.username || url.password || (url.port && !['80','443'].includes(url.port))) throw new Error('图片地址不在 QQ CDN 白名单');
  return url;
}

export async function downloadQQImage(source, { fetcher = fetch, maxBytes = 10 * 1024 * 1024 } = {}) {
  let url = qqImageUrl(source);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetcher(url, { redirect:'manual', signal:AbortSignal.timeout(12000) });
    if ([301,302,303,307,308].includes(response.status)) {
      await response.body?.cancel();
      url = qqImageUrl(new URL(response.headers.get('location'), url));
      continue;
    }
    if (!response.ok || !response.body) throw new Error('图片下载失败');
    if (Number(response.headers.get('content-length')) > maxBytes) { await response.body.cancel(); throw new Error('图片超过 10 MB'); }
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) throw new Error('图片超过 10 MB');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    return Buffer.concat(chunks);
  }
  throw new Error('图片重定向次数过多');
}

export async function prepareIncomingImages(images, directory, { fetcher = fetch } = {}) {
  fs.mkdirSync(directory, { recursive:true });
  const files = [], failed = [];
  for (const image of images.slice(0,2)) {
    try {
      if (!image.url) throw new Error('消息未提供图片下载地址');
      const data = await downloadQQImage(image.url, { fetcher });
      // First frame only for animated stickers; decode with a strict pixel cap.
      const png = await sharp(data, { page:0, pages:1, limitInputPixels:20000000 }).rotate()
        .resize({ width:1280, height:1280, fit:'inside', withoutEnlargement:true }).png().toBuffer();
      const filename = path.join(directory, `image-${files.length + 1}.png`);
      fs.writeFileSync(filename, png);
      files.push({ file:filename, senderId:image.senderId, messageId:image.messageId });
    } catch { failed.push('有一张图片无法下载或解码，不能假装看到了内容'); }
  }
  return { files, failed };
}
