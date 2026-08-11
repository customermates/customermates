import { createTranslator } from "next-intl";

import de from "@/i18n/locales/de.json";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import it from "@/i18n/locales/it.json";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

export type AgentTranslator = (key: string, values?: Record<string, string | number>) => string;

const CATALOGS = { de, en, es, fr, it };

export function agentTranslator(locale: string): AgentTranslator {
  const appLocale = appLocaleOrDefault(locale);
  const translate = createTranslator({ locale: appLocale, messages: CATALOGS[appLocale] });

  return (key, values) => (translate as unknown as AgentTranslator)(key, values);
}
