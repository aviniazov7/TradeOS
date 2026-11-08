// Safari's saved-password popover is a browser UI anchored to the login
// field, not a DOM node. WebKit hides it when that field blurs while it is
// still in the document. Two things in this app skip that signal:
//
// 1. Google sign-in never submits the password form. signInWithPopup opens
//    its window inside the button's click, so the opener window is deactivated
//    before Safari can finish dismissing a popover that was open on the
//    email or password field.
// 2. When the session arrives, LoginPage renders <Navigate> in that same
//    commit. React then removes the credential fields. A blur on a node that
//    is already disconnected does not dismiss the popover, so it stays at the
//    old screen position over the dashboard.
//
// This helper only moves focus. It does not change autocomplete, type, name,
// or value, so password managers still see a normal login form while the
// user is filling it in.

export const LOGIN_FOCUS_SINK_SELECTOR = '[data-login-focus-sink]';

const CREDENTIAL_AUTOCOMPLETE = new Set(['email', 'current-password', 'new-password']);

export function isLoginCredentialField(el) {
  if (!el || el.nodeName !== 'INPUT') return false;
  const type = (el.getAttribute('type') || '').toLowerCase();
  const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
  return type === 'password' || type === 'email' || CREDENTIAL_AUTOCOMPLETE.has(autocomplete);
}

function focusWithoutScroll(el) {
  if (!el || typeof el.focus !== 'function') return false;
  try {
    el.focus({ preventScroll: true });
  } catch {
    try { el.focus(); } catch { return false; }
  }
  return true;
}

/**
 * Blur the active email/password field and move focus to the non-credential
 * sink, while every credential input stays in the document.
 *
 * `preserveControlFocus` is for the Google button's click: if focus is
 * already on that button, leave it there. Stealing it makes Safari restore
 * the password field when the popup closes. A focused credential field is
 * still blurred — that is the popover's dismiss signal, and the sink takes
 * focus so the popup does not restore the password field.
 *
 * Returns whether a credential field was blurred.
 */
export function releaseLoginCredentialFocus(root, doc = typeof document !== 'undefined' ? document : undefined, { preserveControlFocus = false } = {}) {
  if (!root || !doc || typeof root.contains !== 'function') return false;
  const active = doc.activeElement;
  const inside = Boolean(active && active !== root && root.contains(active));
  const blurred = Boolean(inside && isLoginCredentialField(active));
  if (blurred && typeof active.blur === 'function') active.blur();
  if (preserveControlFocus && !blurred) return false;
  if (!inside && !blurred) return false;
  const sink = typeof root.querySelector === 'function'
    ? root.querySelector(LOGIN_FOCUS_SINK_SELECTOR)
    : null;
  if (sink && doc.activeElement !== sink) focusWithoutScroll(sink);
  return blurred;
}
