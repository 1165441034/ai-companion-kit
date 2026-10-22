import fs from 'node:fs';
import path from 'node:path';

export function loadAllowedImage(image, { allowDirs = ['images', 'memes'], maxMB = 10 } = {}, projectRoot) {
  if (typeof image !== 'string' || !image.trim() || /^(https?:|file:|data:|base64:)/i.test(image)) throw new Error('只接受本机白名单目录内的图片路径');
  if (!Number.isFinite(maxMB) || maxMB <= 0 || maxMB > 10) throw new Error('图片上限必须在 0～10 MB 之间');
  const filename = fs.realpathSync(path.resolve(projectRoot, image));
  const permitted = allowDirs.some(directory => {
    const root = fs.realpathSync(path.resolve(projectRoot, directory));
    const relative = path.relative(root, filename);
    return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });
  if (!permitted) throw new Error('图片不在允许目录内');
  const handle = fs.openSync(filename, 'r');
  try {
    const stat = fs.fstatSync(handle);
    if (!stat.isFile() || stat.size > maxMB * 1024 * 1024 || !stat.size) throw new Error('图片为空、不是普通文件或超过大小限制');
    const data = fs.readFileSync(handle);
    if (data.length > maxMB * 1024 * 1024) throw new Error('图片超过大小限制');
    const png = data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255;
    const gif = ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString());
    const webp = data.subarray(0,4).toString() === 'RIFF' && data.subarray(8,12).toString() === 'WEBP';
    if (!png && !jpeg && !gif && !webp) throw new Error('只支持 PNG、JPEG、GIF、WebP 图片');
    return { file: `base64://${data.toString('base64')}`, bytes: data.length, name: path.basename(filename) };
  } finally { fs.closeSync(handle); }
}
