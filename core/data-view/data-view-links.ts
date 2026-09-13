import { APP_LOCALES, stripLocalePrefix } from "@/i18n/locale-registry";

import { ViewKeySchema } from "./data-view-identity.schema";
import { DATA_VIEW_PATHS } from "./data-view-paths";

export function dataViewNavigationHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const separator = href.indexOf("?");
  if (separator < 0) return null;
  const pathname = href.slice(0, separator);
  const path = stripLocalePrefix(pathname);
  if (!Object.values(DATA_VIEW_PATHS).includes(path)) return null;
  if (pathname !== path && !APP_LOCALES.some((locale) => pathname === `/${locale}${path}`)) return null;

  const query = href.slice(separator + 1);
  if (!query.startsWith("view=")) return null;
  const viewKey = query.slice("view=".length);
  if (!ViewKeySchema.safeParse(viewKey).success) return null;
  return `${path}?view=${viewKey}`;
}
