// Staging and Firebase preview channels share the production Firestore.
// The banner is a reminder of that. Production (tradeoslive.web.app) never
// shows it, including when a staging build is opened on that host.

export const PRODUCTION_HOST = 'tradeoslive.web.app';

export const STAGING_BANNER_TEXT = 'STAGING – shared production data';

// Preview channels: https://tradeoslive--CHANNEL-HASH.web.app
// (site tradeoslive only). Same shape as the Worker CORS allowlist.
const PREVIEW_HOST_RE = /^tradeoslive--[a-z0-9-]+\.web\.app$/i;

export function normalizeHost(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
}

export function isProductionHost(hostname) {
  return normalizeHost(hostname) === PRODUCTION_HOST;
}

export function isPreviewChannelHost(hostname) {
  return PREVIEW_HOST_RE.test(normalizeHost(hostname));
}

export function stagingFlagEnabled(flag) {
  if (flag === true || flag === 1) return true;
  const value = String(flag ?? '').trim().toLowerCase();
  return value === '1' || value === 'true';
}

// Production hostname wins over the build flag and over any other host check.
export function showStagingBanner({ hostname, stagingFlag } = {}) {
  if (isProductionHost(hostname)) return false;
  if (isPreviewChannelHost(hostname)) return true;
  return stagingFlagEnabled(stagingFlag);
}
