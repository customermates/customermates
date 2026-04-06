"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";

import { WebhookDeliveryStatus } from "@/generated/prisma";

import { WEBHOOK_DELIVERY_QUEUE_STATUS_CHIP_COLOR } from "@/features/webhook/webhook-delivery-chip-colors";
import { getEntityName } from "@/features/event/entity-name.utils";
import { XModal } from "@/components/x-modal/x-modal";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { XInfoRow } from "@/components/x-info-row";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XChip } from "@/components/x-chip/x-chip";
import { XCodeBlockAccordion } from "@/components/x-code-block-accordion";

export const WebhookDeliveryModal = observer(() => {
  const t = useTranslations("");
  const { webhookDeliveryModalStore: store, intlStore } = useRootStore();
  const delivery = store.form;

  return (
    <XModal size="xl" store={store}>
      <XCard>
        <XCardHeader>
          <div className="flex items-center gap-2 mr-auto">
            <h2 className="text-x-lg grow">{t("WebhookDeliveryModal.title")}</h2>

            <XChip color={WEBHOOK_DELIVERY_QUEUE_STATUS_CHIP_COLOR[delivery.status]} size="sm">
              {t(`WebhookDeliveryModal.deliveryStatus.${delivery.status}`)}
            </XChip>
          </div>

          {store.canManage &&
            (delivery.status === WebhookDeliveryStatus.success || delivery.status === WebhookDeliveryStatus.failed) && (
              <Button
                color="primary"
                isLoading={store.isResending}
                size="sm"
                variant="flat"
                onPress={() => void store.resend()}
              >
                {t("WebhookDeliveryModal.resend")}
              </Button>
            )}
        </XCardHeader>

        <XCardBody>
          <XInfoRow label={t("WebhookDeliveryModal.url")}>{delivery.url}</XInfoRow>

          {delivery.event && (
            <XInfoRow label={t("WebhookDeliveryModal.event")}>
              <XChip size="sm" variant="flat">
                {t(`Common.events.${delivery.event}`)}
              </XChip>
            </XInfoRow>
          )}

          {delivery.event && (
            <XInfoRow label={t("WebhookDeliveryModal.entity")}>
              {getEntityName(delivery.event, delivery.requestBody?.data, t) || "-"}
            </XInfoRow>
          )}

          <XInfoRow label={t("WebhookDeliveryModal.createdAt")}>
            {intlStore.formatNumericalShortDateTime(delivery.createdAt)}
          </XInfoRow>

          <XInfoRow label={t("WebhookDeliveryModal.statusCode")}>{delivery.statusCode?.toString() ?? "-"}</XInfoRow>

          <XInfoRow label={t("WebhookDeliveryModal.responseMessage")}>{delivery.responseMessage ?? "-"}</XInfoRow>

          <XCodeBlockAccordion
            code={JSON.stringify(delivery.requestBody, null, 2)}
            title={t("WebhookDeliveryModal.requestBody")}
          />
        </XCardBody>
      </XCard>
    </XModal>
  );
});
