// Bump ONLY CACHE_NAME (public/sw.js) on every push to main, so a new deploy
// always registers a fresh service worker and users pick up the update on
// their next open. APP_VERSION is intentionally NOT auto-bumped — it's a
// stable marketing version the owner sets by hand (currently 2.0.0), so it
// doesn't creep to 2.0.1, 2.0.2… on every small deploy. The og-image ?v=
// cache-buster in index.html tracks APP_VERSION and is likewise left alone.
import { readFileSync, writeFileSync } from 'node:fs';

const swPath = 'public/sw.js';
let sw = readFileSync(swPath, 'utf8');
const cacheMatch = sw.match(/CACHE_NAME\s*=\s*'tradeos-v(\d+)'/);
if (!cacheMatch) throw new Error('CACHE_NAME not found in ' + swPath);
const newCache = `tradeos-v${Number(cacheMatch[1]) + 1}`;
sw = sw.replace(cacheMatch[0], `CACHE_NAME = '${newCache}'`);
writeFileSync(swPath, sw);

console.log(`CACHE_NAME -> ${newCache} (APP_VERSION left pinned)`);
