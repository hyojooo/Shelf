import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useStore } from './store/useStore';
import { getLang, t, type Language } from '../shared/i18n';

const LangContext = createContext<Language>('en');

export function I18nProvider({ children }: { children: ReactNode }) {
  const settings = useStore((s) => s.settings);
  const [lang, setLang] = useState<Language>(
    getLang(settings?.language ?? 'en'),
  );

  useEffect(() => {
    setLang(getLang(settings?.language ?? 'en'));
  }, [settings?.language]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Language {
  return useContext(LangContext);
}

export function useT() {
  const lang = useContext(LangContext);
  return (key: string, params?: Record<string, string | number>) =>
    t(lang, key, params);
}
