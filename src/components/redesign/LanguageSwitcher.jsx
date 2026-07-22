import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS } from '../../i18n';

// Minimal he ⇄ en toggle. Persists via i18next's localStorage detector and
// flips <html dir> automatically (handled in src/i18n/index.js).
export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = SUPPORTED_LANGS.includes(i18n.language) ? i18n.language : 'he';

  return (
    <div
      role="group"
      aria-label={t('language.label')}
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 3,
        borderRadius: 999,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      {SUPPORTED_LANGS.map((lng) => {
        const active = current === lng;
        return (
          <button
            key={lng}
            type="button"
            onClick={() => i18n.changeLanguage(lng)}
            aria-pressed={active}
            style={{
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 11,
              padding: '4px 12px',
              borderRadius: 999,
              color: active ? '#06060a' : '#8a8f9c',
              background: active ? '#3b82f6' : 'transparent',
            }}
          >
            {t(`language.${lng}`)}
          </button>
        );
      })}
    </div>
  );
}
