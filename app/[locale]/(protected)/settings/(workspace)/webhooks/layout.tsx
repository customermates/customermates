import { getTranslations } from "next-intl/server";

import { WebhookViews } from "../components/webhook/webhook-views";

export default async function WebhooksLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("SettingsNav");

  return (
    <WebhookViews labels={{ views: t("webhooks"), webhooks: t("webhooks"), deliveries: t("deliveries") }}>
      {children}
    </WebhookViews>
  );
}
