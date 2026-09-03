// i18n setup — mirrors mobile (tallydekho-mobile-V4 src/i18n/index.ts).
// Locale files are copied verbatim from the mobile app so both apps share translations.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import hi from './locales/hi.json';
import gu from './locales/gu.json';
import mr from './locales/mr.json';
import ta from './locales/ta.json';
import te from './locales/te.json';
import kn from './locales/kn.json';
import pa from './locales/pa.json';
import bn from './locales/bn.json';
import ml from './locales/ml.json';
import or from './locales/or.json';

// Map stored language values (English or native names) to i18n codes.
export const LANGUAGE_CODE_MAP = {
  English: 'en', Hindi: 'hi', Gujarati: 'gu', Marathi: 'mr', Tamil: 'ta',
  Telugu: 'te', Kannada: 'kn', Punjabi: 'pa', Bengali: 'bn', Malayalam: 'ml', Odia: 'or',
  'हिन्दी': 'hi', 'ગુજરાતી': 'gu', 'मराठी': 'mr', 'தமிழ்': 'ta', 'తెలుగు': 'te',
  'ಕನ್ನಡ': 'kn', 'ਪੰਜਾਬੀ': 'pa', 'বাংলা': 'bn', 'മലയാളം': 'ml', 'ଓଡ଼ିଆ': 'or',
};

// The 11 languages offered (same set as mobile), with native labels for the picker.
export const LANGUAGES = [
  { name: 'English', native: 'English', code: 'en' },
  { name: 'Hindi', native: 'हिन्दी', code: 'hi' },
  { name: 'Gujarati', native: 'ગુજરાતી', code: 'gu' },
  { name: 'Marathi', native: 'मराठी', code: 'mr' },
  { name: 'Tamil', native: 'தமிழ்', code: 'ta' },
  { name: 'Telugu', native: 'తెలుగు', code: 'te' },
  { name: 'Kannada', native: 'ಕನ್ನಡ', code: 'kn' },
  { name: 'Punjabi', native: 'ਪੰਜਾਬੀ', code: 'pa' },
  { name: 'Bengali', native: 'বাংলা', code: 'bn' },
  { name: 'Malayalam', native: 'മലയാളം', code: 'ml' },
  { name: 'Odia', native: 'ଓଡ଼ିଆ', code: 'or' },
];

export const languageToCode = (value) => LANGUAGE_CODE_MAP[value] || 'en';

const resources = { en, hi, gu, mr, ta, te, kn, pa, bn, ml, or };

/**
 * Portal string translation: locale files carry a "portal" dictionary keyed by
 * the exact English string. Unknown strings (and dynamic values) fall back to
 * the English original, so instrumentation is always safe.
 */
export function trPortal(str) {
  if (typeof str !== 'string' || !str) return str;
  const slug = str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const dict = resources[i18n.language]?.portal?.labels;
  return (dict && dict[slug]) || str;
}

i18n
  .use(initReactI18next)
  .init({
    resources: Object.fromEntries(
      Object.entries(resources).map(([code, translations]) => [code, { translation: translations }])
    ),
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
  });

export default i18n;
