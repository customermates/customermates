import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";

import { UpsellPreviewFrame, UpsellPreviewTitle } from "./upsell-preview-frame";

type Props = {
  className?: string;
};

export function UpsellWebhooksPreview({ className }: Props) {
  const t = useTranslations();
  const rows = [
    { url: "https://hooks.example.com/new-client", event: t("Common.events.record.created") },
    { url: "https://n8n.example.com/webhook/follow-up", event: t("Common.events.record.updated") },
  ];

  return (
    <UpsellPreviewFrame className={className} label={t("Upsell.preview.webhooks.label")}>
      <UpsellPreviewTitle>{t("SettingsNav.webhooks")}</UpsellPreviewTitle>

      {rows.map((row, index) => (
        <div
          key={row.url}
          aria-hidden
          className={
            index === 0
              ? "flex items-center gap-2.5 rounded-lg bg-accent px-2.5 py-2"
              : "flex items-center gap-2.5 px-2.5 py-2"
          }
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-foreground">{row.url}</span>

            <span className="mt-1 block">
              <AppChip size="sm" variant="secondary">
                {row.event}
              </AppChip>
            </span>
          </span>

          <AppChip className="shrink-0" size="sm" variant="success">
            {t("WebhookModal.enabled")}
          </AppChip>
        </div>
      ))}
    </UpsellPreviewFrame>
  );
}
