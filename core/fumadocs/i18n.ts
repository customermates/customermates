import { defineI18n } from "fumadocs-core/i18n";

import { CONTENT_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

export const i18n = defineI18n({
  defaultLanguage: DEFAULT_LOCALE,
  languages: [...CONTENT_LOCALES],
  fallbackLanguage: null,
  parser: "dir",
});
