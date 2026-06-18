"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { WebhookDeliveryStatus } from "@/generated/prisma";

import { Button } from "@/components/ui/button";
import { WEBHOOK_DELIVERY_QUEUE_STATUS_CHIP_COLOR } from "@/features/webhook/webhook-delivery-chip-colors";
import { getEntityName } from "@/features/event/entity-name.utils";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { InfoRow } from "@/components/shared/info-row";
import { useRootStore } from "@/core/stores/root-store.provider";
import { AppChip } from "@/components/chip/app-chip";
import { CodeBlockAccordion } from "@/components/shared/code-block-accordion";

export const WebhookDeliveryModal = observer(() => {
  const t = useTranslations();
  const { webhookDeliveryModalStore: store, intlStore } = useRootStore();
  const delivery = store.form;

  return (
    <AppModal size="xl" store={store} title={t("WebhookDeliveryModal.title")}>
      <AppCard>
        <AppCardHeader>
          <div className="flex items-center gap-2 mr-auto">
            <h2 className="text-x-lg grow">{t("WebhookDeliveryModal.title")}</h2>

            <AppChip size="sm" variant={WEBHOOK_DELIVERY_QUEUE_STATUS_CHIP_COLOR[delivery.status]}>
              {t(`WebhookDeliveryModal.deliveryStatus.${delivery.status}`)}
            </AppChip>
          </div>

          {store.canManage &&
            (delivery.status === WebhookDeliveryStatus.success || delivery.status === WebhookDeliveryStatus.failed) && (
              <Button disabled={store.isResending} size="sm" variant="secondary" onClick={() => void store.resend()}>
                {t("WebhookDeliveryModal.resend")}
              </Button>
            )}
        </AppCardHeader>

        <AppCardBody>
          <InfoRow label={t("WebhookDeliveryModal.url")}>{delivery.url}</InfoRow>

          {delivery.event && (
            <InfoRow label={t("WebhookDeliveryModal.event")}>
              <AppChip size="sm" variant="secondary">
                {t(`Common.events.${delivery.event}`)}
              </AppChip>
            </InfoRow>
          )}

          {delivery.event && (
            <InfoRow label={t("WebhookDeliveryModal.entity")}>
              {getEntityName(delivery.event, delivery.requestBody?.data, t) || "-"}
            </InfoRow>
          )}

          <InfoRow label={t("WebhookDeliveryModal.createdAt")}>
            {intlStore.formatNumericalShortDateTime(delivery.createdAt)}
          </InfoRow>

          <InfoRow label={t("WebhookDeliveryModal.statusCode")}>{delivery.statusCode?.toString() ?? "-"}</InfoRow>

          <InfoRow label={t("WebhookDeliveryModal.responseMessage")}>{delivery.responseMessage ?? "-"}</InfoRow>

          <CodeBlockAccordion
            code={JSON.stringify(delivery.requestBody, null, 2)}
            title={t("WebhookDeliveryModal.requestBody")}
          />
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
