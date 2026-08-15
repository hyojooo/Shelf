import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import ru from './locales/ru.json';
import vi from './locales/vi.json';
import type { Language } from '../types';

type Dict = Record<string, string>;

const DICTS: Record<Language, Dict> = {
  en: en as Dict,
  'zh-CN': zhCN as Dict,
  'zh-TW': zhTW as Dict,
  ja: ja as Dict,
  ko: ko as Dict,
  ru: ru as Dict,
  vi: vi as Dict,
};

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'ru', label: 'Русский' },
  { code: 'vi', label: 'Tiếng Việt' },
];

export function getLang(l: string): Language {
  return (l in DICTS ? l : 'en') as Language;
}

export function t(
  lang: string,
  key: string,
  params?: Record<string, string | number>,
): string {
  const dict = DICTS[getLang(lang)] ?? DICTS.en;
  let str: string = dict[key] ?? DICTS.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

export type { Language };
