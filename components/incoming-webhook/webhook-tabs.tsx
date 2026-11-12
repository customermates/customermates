"use client";

import { useTranslations } from "next-intl";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { useRouter } from "@/i18n/navigation";

export type WebhookTab = "outgoing" | "incoming";

const INCOMING_HREF = "?tab=incoming";
const OUTGOING_HREF = "?";

export function WebhookTabs({ active }: { active: WebhookTab }) {
  const t = useTranslations();
  const router = useRouter();

  return (
    <div className="shrink-0 border-b border-border px-4 py-3 md:px-6">
      <SegmentedControl<WebhookTab>
        className="max-w-sm"
        idPrefix="webhook-direction"
        items={[
          { value: "outgoing", label: t("IncomingWebhooks.tabOutgoing") },
          { value: "incoming", label: t("IncomingWebhooks.tabIncoming") },
        ]}
        label={t("IncomingWebhooks.tabsLabel")}
        value={active}
        onValueChange={(value) => router.push(value === "incoming" ? INCOMING_HREF : OUTGOING_HREF)}
      />
    </div>
  );
}
