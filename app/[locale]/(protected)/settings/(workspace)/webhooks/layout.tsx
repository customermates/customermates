import { getTranslations } from "next-intl/server";

import { RouteTabs } from "@/components/editor-tabs/route-tabs";
import { WEBHOOK_DELIVERIES_HREF, settingsHref } from "@/app/components/navigation/settings-routes";

export default async function WebhooksLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("SettingsNav");

  return (
    <RouteTabs
      label={t("webhooks")}
      tabs={[
        { href: settingsHref("webhooks"), label: t("webhooks") },
        { href: WEBHOOK_DELIVERIES_HREF, label: t("deliveries") },
      ]}
    >
      {children}
    </RouteTabs>
  );
}
