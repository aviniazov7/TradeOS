// Move leftover plaintext exchange API keys out of Firestore into the encrypted
// Worker store. Runs on sign-in (and again when the exchange screen opens) so a
// user does not have to visit that screen first. Never writes the stripped
// document if a store call failed for a reason other than "key can trade" —
// that would delete the only copy of the secret. A key the exchange reports as
// trade/withdraw capable is NOT stored and is dropped from the document.

import { getUserSetting, setUserSetting } from './firestoreService';
import { storeExchangeCredentials } from './exchangeService';

const MARKER_KEYS = ['connected', 'connectedAt', 'connectedAtEstimated', 'address', 'readOnlyVerified'];
const EXTRA_PASSPHRASE = { okx: 'passphrase', bitget: 'passphrase' };

const filled = (v) => typeof v === 'string' && v.trim().length > 0;

export function markerWithoutSecrets(conf) {
  if (!conf || typeof conf !== 'object') return {};
  const out = {};
  for (const key of MARKER_KEYS) {
    if (conf[key] !== undefined) out[key] = conf[key];
  }
  return out;
}

export function entryHasPlaintextSecret(conf) {
  if (!conf || typeof conf !== 'object') return false;
  return filled(conf.apiKey) || filled(conf.apiSecret) || filled(conf.passphrase) || filled(conf.secret);
}

const inflight = new Map();

async function run(uid, deps) {
  const getSetting = deps.getSetting;
  const setSetting = deps.setSetting;
  const storeCredentials = deps.storeCredentials;
  const legacy = await getSetting(uid, 'exchanges');
  if (!legacy || typeof legacy !== 'object') return { migrated: false, droppedTradeKeys: false };

  let hadSecret = false;
  let anyFailed = false;
  let droppedTradeKeys = false;
  const markers = {};

  for (const [eid, conf] of Object.entries(legacy)) {
    if (!conf || typeof conf !== 'object') continue;
    if (!entryHasPlaintextSecret(conf)) {
      if (conf.connected || conf.address) markers[eid] = markerWithoutSecrets(conf);
      continue;
    }
    hadSecret = true;
    if (!(filled(conf.apiKey) && filled(conf.apiSecret))) {
      // A partial secret cannot be stored. Drop it so the rewrite removes it.
      droppedTradeKeys = true;
      continue;
    }
    try {
      const stored = await storeCredentials(eid, {
        apiKey: conf.apiKey,
        apiSecret: conf.apiSecret,
        passphrase: EXTRA_PASSPHRASE[eid] ? conf[EXTRA_PASSPHRASE[eid]] : undefined,
      });
      markers[eid] = {
        ...markerWithoutSecrets(conf),
        connected: true,
        readOnlyVerified: stored?.readOnly === true,
      };
    } catch (err) {
      if (err?.code === 'key_not_readonly') {
        droppedTradeKeys = true;
        continue;
      }
      anyFailed = true;
    }
  }

  if (hadSecret && !anyFailed) {
    await setSetting(uid, 'exchanges', markers, false);
  }
  return { migrated: hadSecret && !anyFailed, droppedTradeKeys };
}

export function migratePlaintextExchangeKeys(uid, deps) {
  if (!uid) return Promise.resolve({ migrated: false, droppedTradeKeys: false });
  const resolved = deps || {
    getSetting: getUserSetting,
    setSetting: setUserSetting,
    storeCredentials: storeExchangeCredentials,
  };
  // Tests pass their own deps and must not share the session lock.
  if (deps) return run(uid, resolved);
  if (inflight.has(uid)) return inflight.get(uid);
  const pending = run(uid, resolved).finally(() => inflight.delete(uid));
  inflight.set(uid, pending);
  return pending;
}
