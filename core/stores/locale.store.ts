import type { RootStore } from "./root.store";
import type { ROUTING_LOCALES } from "@/i18n/routing";

import { action, observable } from "mobx";
import { makeObservable } from "mobx";

import { ROUTING_DEFAULT_LOCALE } from "@/i18n/routing";

type Locale = (typeof ROUTING_LOCALES)[number];
type TranslationFunction = ((key: string, values?: Record<string, any>) => string) | null;

export class LocaleStore {
  public locale: Locale = ROUTING_DEFAULT_LOCALE;
  public translation: TranslationFunction = null;

  constructor(public readonly rootStore: RootStore) {
    makeObservable(this, {
      locale: observable,
      translation: observable,
      setLocale: action,
      setTranslation: action,
    });
  }

  setLocale = (locale: Locale) => {
    this.locale = locale;
  };

  setTranslation = (translation: TranslationFunction) => {
    this.translation = translation;
  };

  getTranslation = (key: string, values?: Record<string, any>): string => {
    if (!this.translation) return key;

    return this.translation(key, values);
  };
}
