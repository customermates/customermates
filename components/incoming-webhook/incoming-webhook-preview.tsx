"use client";

import type { IncomingWebhookPreview } from "@/features/incoming-webhook/incoming-webhook.schema";

import { useTranslations } from "next-intl";

export function IncomingWebhookPreviewTable({ preview }: { preview: IncomingWebhookPreview }) {
  const t = useTranslations();
  const headline = !preview.ok
    ? t("IncomingWebhooks.previewRefused")
    : preview.outcome === "update"
      ? t("IncomingWebhooks.previewUpdate")
      : t("IncomingWebhooks.previewCreate");

  return (
    <div className="flex flex-col gap-2" id="incoming-webhook-preview">
      <p className="text-sm font-medium" role="status">
        {headline}
      </p>

      <ul className="flex flex-col gap-1 text-xs">
        {preview.values.map((value) => (
          <li key={value.fieldId} className="flex flex-wrap gap-x-2">
            <code className="text-muted-foreground">{value.path}</code>

            {value.error ? (
              <span className="text-destructive">
                {value.error === "required"
                  ? t("IncomingWebhooks.previewMissing")
                  : t("IncomingWebhooks.previewInvalid")}
              </span>
            ) : (
              <span>{value.value ?? ""}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
