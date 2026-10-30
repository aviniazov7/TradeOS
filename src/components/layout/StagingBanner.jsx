import { showStagingBanner, STAGING_BANNER_TEXT } from '../../utils/stagingBanner';

// Thin strip above page content. Hidden on tradeoslive.web.app. Shown on
// tradeoslive--*.web.app preview channels, and on any other host when the
// staging build set VITE_STAGING_BANNER=1 (deploy-dev.yml).
export default function StagingBanner({ hostname, stagingFlag, className = '' }) {
  const host = hostname ?? (typeof window === 'undefined' ? '' : window.location.hostname);
  const flag = stagingFlag ?? import.meta.env.VITE_STAGING_BANNER;
  if (!showStagingBanner({ hostname: host, stagingFlag: flag })) return null;
  return (
    <div
      role="status"
      dir="ltr"
      data-testid="staging-banner"
      className={`px-3 py-1 text-center text-[11px] font-semibold tracking-wide text-breakeven bg-breakeven/10 border-b border-breakeven/30 ${className}`}
    >
      {STAGING_BANNER_TEXT}
    </div>
  );
}
