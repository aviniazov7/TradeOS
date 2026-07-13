// Auto-bump APP_VERSION (patch), CACHE_NAME (tradeos-vN), and the og-image
// ?v= cache-buster in index.html together.
// Run by CI on every push to main so users always get the update banner.
import { readFileSync, writeFileSync } from 'node:fs';

const constantsPath = 'src/utils/constants.js';
const swPath = 'public/sw.js';
const indexPath = 'index.html';

let constants = readFileSync(constantsPath, 'utf8');
const verMatch = constants.match(/APP_VERSION\s*=\s*'(\d+)\.(\d+)\.(\d+)'/);
if (!verMatch) throw new Error('APP_VERSION not found in ' + constantsPath);
const [, major, minor, patch] = verMatch;
const newVersion = `${major}.${minor}.${Number(patch) + 1}`;
constants = constants.replace(verMatch[0], `APP_VERSION = '${newVersion}'`);
writeFileSync(constantsPath, constants);

let sw = readFileSync(swPath, 'utf8');
const cacheMatch = sw.match(/CACHE_NAME\s*=\s*'tradeos-v(\d+)'/);
if (!cacheMatch) throw new Error('CACHE_NAME not found in ' + swPath);
const newCache = `tradeos-v${Number(cacheMatch[1]) + 1}`;
sw = sw.replace(cacheMatch[0], `CACHE_NAME = '${newCache}'`);
writeFileSync(swPath, sw);

// og-image ?v= cache-buster — without this Telegram/WhatsApp keep serving
// their cached preview image forever, since they cache by exact URL.
let indexHtml = readFileSync(indexPath, 'utf8');
const ogMatches = indexHtml.match(/og-image\.png\?v=\d+\.\d+\.\d+/g);
if (!ogMatches) throw new Error('og-image ?v= tag not found in ' + indexPath);
indexHtml = indexHtml.replaceAll(/og-image\.png\?v=\d+\.\d+\.\d+/g, `og-image.png?v=${newVersion}`);
writeFileSync(indexPath, indexHtml);

console.log(`APP_VERSION -> ${newVersion}, CACHE_NAME -> ${newCache}, og-image ?v= -> ${newVersion}`);
