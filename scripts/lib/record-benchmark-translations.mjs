import { createTranslator } from "use-intl/core";
import messages from "../../i18n/locales/en.json" with { type: "json" };

export async function getTranslations(namespace) {
  return createTranslator({ locale: "en", messages, namespace });
}

export async function getLocale() {
  return "en";
}
