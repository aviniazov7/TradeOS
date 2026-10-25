// Client-side view of the same rules the Worker uses, plus the signup stash
// that survives a Google redirect (the in-memory ref does not).
export {
  normalizeMarketingEmails,
  shouldBackfillMarketingEmail,
  receivesMarketingEmail,
} from '../../worker/marketingConsent.js';

const STASH_KEY = 'tradeos.signupMarketingEmails';

export function rememberSignupMarketingChoice(value) {
  try { sessionStorage.setItem(STASH_KEY, value ? '1' : '0'); } catch { /* private mode */ }
}

export function peekSignupMarketingChoice() {
  try {
    const v = sessionStorage.getItem(STASH_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* private mode */ }
  return null;
}

export function clearSignupMarketingChoice() {
  try { sessionStorage.removeItem(STASH_KEY); } catch { /* private mode */ }
}

/** Bool to write on a brand-new profile. No stash → the checkbox default, off. */
export function marketingChoiceForNewProfile(capturedRef, peeked) {
  if (capturedRef === true || capturedRef === false) return capturedRef;
  if (peeked === true || peeked === false) return peeked;
  return false;
}
