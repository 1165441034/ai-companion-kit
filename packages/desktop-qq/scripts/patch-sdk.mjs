// Adapted from Derpyu520/qq-bridge; see LICENSE-qq-bridge.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dist = path.dirname(fileURLToPath(import.meta.resolve('@snowluma/sdk')));
function patch(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) { patch(filename); continue; }
    if (!filename.endsWith('.js')) continue;
    const original = fs.readFileSync(filename, 'utf8');
    const next = original.replace(/from\s+(['"])(\.[^'"]+)\1/g, (match, quote, specifier) => {
      if (path.extname(specifier)) return match;
      for (const extension of ['.js', '.json']) {
        if (fs.existsSync(path.resolve(directory, specifier + extension))) return match.replace(`${quote}${specifier}${quote}`, `${quote}${specifier}${extension}${quote}`);
      }
      return match;
    });
    if (next !== original) fs.writeFileSync(filename, next);
  }
}
patch(dist);
console.log('SnowLuma SDK ESM imports verified.');
