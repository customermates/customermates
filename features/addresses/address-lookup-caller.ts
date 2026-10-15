import type { AddressLookupCaller } from "./address-lookup.service";
import type { TenantUser } from "@/features/user/user.schema";

import { isAppLocale } from "@/i18n/locale-registry";
import { getRequestAppLocale } from "@/i18n/request-app-locale";

export async function addressLookupCaller(user: Readonly<TenantUser>): Promise<AddressLookupCaller> {
  return {
    companyId: user.companyId,
    userId: user.id,
    locale: isAppLocale(user.displayLanguage) ? user.displayLanguage : await getRequestAppLocale(),
    country: user.country,
  };
}
