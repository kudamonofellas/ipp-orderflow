/**
 * LanguageProvider — the active language is a **team-wide** setting
 * (`settings.lang` in Directus, per Settings page's own copy: "Sets the
 * default UI language for the whole team"), not a personal per-browser
 * preference like theme. `localStorage` (`ipp_language`) is only a fast-load
 * cache so the UI doesn't flash English while the settings row is still
 * being fetched — Directus wins once it responds.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LanguageContext, type LanguageState } from './language-context';
import { t as translate, type Lang } from '../i18n/translations';
import { readSettings } from '../lib/directus';

const STORAGE_KEY = 'ipp_language';

function getCachedLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'id') {
      return stored;
    }
  } catch {
    // ignore (private mode etc.)
  }
  return 'en';
}

function cacheLang(next: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore (private mode etc.)
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getCachedLang);

  // Directus's settings.lang is the team-wide source of truth — fetch it
  // once on mount and let it override the cached value if they differ.
  useEffect(() => {
    let cancelled = false;
    readSettings().then((res) => {
      if (cancelled || !res.data) return;
      const remote = res.data.lang;
      if (remote === 'en' || remote === 'id') {
        cacheLang(remote);
        setLangState(remote);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLang = useCallback((next: Lang) => {
    cacheLang(next);
    setLangState(next);
  }, []);

  const t = useCallback((key: string) => translate(key, lang), [lang]);

  const value = useMemo<LanguageState>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
