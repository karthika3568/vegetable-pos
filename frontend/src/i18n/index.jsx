/**
 * Centralized i18n provider.
 *
 * The active language is owned by the backend settings (`app_language`),
 * served anonymously through GET /public/app-config so the login page
 * and POS can read it before/without a session. An authenticated admin
 * changing the language in Settings applies it immediately via
 * setLanguage(), which stores a local override that takes precedence
 * until the backend value matches again.
 *
 * Only UI strings are translated - database values (product names,
 * customer names, settings values) are never translated.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './en.js';
import ta from './ta.js';
import { api } from '../api/client.js';

const DICTIONARIES = { en, ta };
const STORAGE_KEY = 'pos.language';

function readOverride() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value && DICTIONARIES[value]) return value;
  } catch {
    // ignore storage failures
  }
  return null;
}

const LanguageContext = createContext(null);

export function resolveT(lang) {
  const dictionary = DICTIONARIES[lang] || DICTIONARIES.en;
  return function t(key, params) {
    const value = key.split('.').reduce((obj, part) => (obj ? obj[part] : undefined), dictionary);
    if (value === undefined) return key;
    if (typeof value !== 'string') return String(value);
    if (!params) return value;
    return value.replace(/\{(\w+)\}/g, (match, name) =>
      params[name] !== undefined ? String(params[name]) : match
    );
  };
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => readOverride() || 'en');
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get('/public/app-config')
      .then((payload) => {
        if (!active) return;
        const configured = payload?.data?.language || 'en';
        setLang(readOverride() || configured);
      })
      .catch(() => {
        // Keep the current (or default) language when offline.
      })
      .finally(() => {
        if (active) setResolved(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const t = useMemo(() => resolveT(lang), [lang]);

  const setLanguage = useCallback((nextLang) => {
    if (!DICTIONARIES[nextLang]) return;
    try {
      localStorage.setItem(STORAGE_KEY, nextLang);
    } catch {
      // ignore storage failures
    }
    setLang(nextLang);
  }, []);

  const value = useMemo(
    () => ({ lang, t, setLanguage, resolved }),
    [lang, t, setLanguage, resolved]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>.');
  return ctx;
}