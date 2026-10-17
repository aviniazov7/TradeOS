/**
 * Start a Google sign-in without losing Safari's user-gesture for window.open.
 *
 * When the popup resolver is already loaded, `popup` runs in the same turn —
 * nothing is awaited before it. Safari only treats that window.open as part
 * of the tap. If the resolver is still loading, opening a popup after the
 * import's await is what the browser blocks, so this path never calls
 * `popup`. It marks a redirect and finishes with `redirect` once the
 * resolver arrives.
 */
export function startGoogleSignIn({
  standalone = false,
  resolver = null,
  popup,
  redirect,
  loadResolver,
  markRedirect,
} = {}) {
  if (!standalone && resolver) {
    return popup(resolver);
  }
  if (typeof markRedirect === 'function') markRedirect();
  const pending = loadResolver();
  return Promise.resolve(pending).then((loaded) => redirect(loaded));
}
