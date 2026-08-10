import { getLocale } from "next-intl/server";

import { appLocaleOrDefault, type AppLocale } from "./locale-registry";

export async function getRequestAppLocale(): Promise<AppLocale> {
  return appLocaleOrDefault(await getLocale());
}
