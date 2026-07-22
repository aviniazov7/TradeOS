import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import he from './he.json';
import en from './en.json';

// i18n for the TradeOS redesign. Hebrew is the default/fallback; English is
// available and auto-detected from the browser. The chosen language is stored
// in localStorage ('tradeos_lang') so it persists across sessions.
//
// Adding a language later = one more JSON file + an entry in resources.
export const SUPPORTED_LANGS = ['he', 'en'];
export const RTL_LANGS = ['he'];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      he: { translation: he },
      en: { translation: en },
    },
    fallbackLng: 'he',
    supportedLngs: SUPPORTED_LANGS,
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'tradeos_lang',
      caches: ['localStorage'],
    },
  });

// Keep <html dir/lang> in sync with the active language (RTL ⇄ LTR).
const applyDir = (lng) => {
  const dir = RTL_LANGS.includes(lng) ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', lng);
};
applyDir(i18n.language || 'he');
i18n.on('languageChanged', applyDir);

export default i18n;
