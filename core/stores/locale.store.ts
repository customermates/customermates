import type { RootStore } from "./root.store";
import type { RoutingLocale } from "@/i18n/locale-registry";

import { action, observable } from "mobx";
import { makeObservable } from "mobx";

import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

type TranslationFunction = ((key: string, values?: Record<string, any>) => string) | null;

export class LocaleStore {
  public locale: RoutingLocale = DEFAULT_LOCALE;
  public translation: TranslationFunction = null;

  constructor(public readonly rootStore: RootStore) {
    makeObservable(this, {
      locale: observable,
      translation: observable,
      setLocale: action,
      setTranslation: action,
    });
  }

  setLocale = (locale: RoutingLocale) => {
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
