"use client";

import type {
  IncomingWebhookDeliveryDto,
  IncomingWebhookDto,
} from "@/features/incoming-webhook/incoming-webhook.schema";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { AppModal } from "@/components/modal/app-modal";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { manageIncomingWebhookAction } from "./incoming-webhook-actions";

type Props = {
  webhook: IncomingWebhookDto | null;
  onClose: () => void;
};

function outcomeText(t: ReturnType<typeof useTranslations>, outcome: IncomingWebhookDeliveryDto["outcome"]): string {
  switch (outcome) {
    case "created":
      return t("IncomingWebhooks.outcomes.created");
    case "updated":
      return t("IncomingWebhooks.outcomes.updated");
    case "rejected_signature":
      return t("IncomingWebhooks.outcomes.rejected_signature");
    case "rejected_payload":
      return t("IncomingWebhooks.outcomes.rejected_payload");
    case "rejected_plan":
      return t("IncomingWebhooks.outcomes.rejected_plan");
    case "rejected_limit":
      return t("IncomingWebhooks.outcomes.rejected_limit");
    case "failed":
      return t("IncomingWebhooks.outcomes.failed");
  }
}

export function IncomingWebhookDeliveries({ webhook, onClose }: Props) {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  const [deliveries, setDeliveries] = useState<IncomingWebhookDeliveryDto[] | null>(null);
  const id = webhook?.id ?? null;

  useEffect(() => {
    if (!id) return;
    let active = true;
    setDeliveries(null);
    manageIncomingWebhookAction({ action: "deliveries", id, limit: 50 })
      .then((result) => {
        if (!active) return;
        if (result.ok) setDeliveries(result.data.deliveries ?? []);
        else toastZodErrorTree(result.error);
      })
      .catch(reportApplicationError);
    return () => {
      active = false;
    };
  }, [id]);

  if (!webhook) return null;

  return (
    <AppModal open size="3xl" title={t("IncomingWebhooks.deliveriesTitle", { name: webhook.name })} onClose={onClose}>
      <div className="flex flex-col gap-2" id="incoming-webhook-deliveries">
        {deliveries === null ? (
          <p className="text-sm text-muted-foreground">{t("IncomingWebhooks.loading")}</p>
        ) : deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground" id="incoming-webhook-deliveries-empty">
            {t("IncomingWebhooks.noDeliveries")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
                <time className="text-xs text-muted-foreground" dateTime={delivery.createdAt}>
                  {intl.formatNumericalShortDateTime(new Date(delivery.createdAt))}
                </time>

                <span className="font-medium">{outcomeText(t, delivery.outcome)}</span>

                <span className="text-xs text-muted-foreground">{delivery.statusCode}</span>

                {delivery.message ? <span className="text-xs text-muted-foreground">{delivery.message}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppModal>
  );
}
