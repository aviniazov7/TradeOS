// READ-ONLY. Counts how many users still have exchange API keys stored in
// plaintext in Firestore (users/{uid}/settings/exchanges). Prints counts only:
// no uids, no key values, and it never writes.
//
// Run from GitHub → Actions → "Scan plaintext exchange keys" → Run workflow
// (uses the project's service account). Locally: needs `npm ci --prefix
// functions` and GOOGLE_APPLICATION_CREDENTIALS pointing at a service account.
import { createRequire } from 'node:module';
import { appendFileSync } from 'node:fs';
import { plaintextExchanges, summarize } from './exchangeKeyScan.mjs';

const require = createRequire(new URL('../functions/', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ projectId: 'tradeos-91a58' });
const db = getFirestore();

const userRefs = await db.collection('users').listDocuments();
const perUser = [];
const BATCH = 200;
for (let i = 0; i < userRefs.length; i += BATCH) {
  const refs = userRefs.slice(i, i + BATCH).map((u) => u.collection('settings').doc('exchanges'));
  const snaps = await db.getAll(...refs);
  for (const snap of snaps) perUser.push(snap.exists ? plaintextExchanges(snap.data()) : null);
}

const s = summarize(perUser);
const lines = [
  '### Plaintext exchange keys (read-only scan)',
  '',
  `- users scanned: **${s.users}**`,
  `- with a settings/exchanges document: **${s.withExchangesDoc}**`,
  `- **still holding plaintext keys: ${s.withPlaintextKeys}**`,
  `- by exchange: ${Object.keys(s.byExchange).length ? JSON.stringify(s.byExchange) : 'none'}`,
];
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
