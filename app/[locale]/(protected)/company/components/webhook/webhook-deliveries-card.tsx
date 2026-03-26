"use client";

import type { WebhookDeliveryDto } from "@/features/webhook/get-webhook-deliveries.interactor";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { WEBHOOK_DELIVERY_QUEUE_STATUS_CHIP_COLOR } from "@/features/webhook/webhook-delivery-chip-colors";
import { getEntityName } from "@/features/event/entity-name.utils";
import { XDataViewContainer } from "@/components/x-data-view/x-data-view-container";
import { XDataViewCell } from "@/components/x-data-view/x-data-view-cell";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XChip } from "@/components/x-chip/x-chip";

export const WebhookDeliveriesCard = observer(() => {
  const t = useTranslations("");
  const { webhookDeliveryModalStore, webhookDeliveriesStore, intlStore } = useRootStore();

  function renderCell(item: WebhookDeliveryDto, columnKey: React.Key): string | number | JSX.Element {
    switch (columnKey) {
      case "name":
        return <XDataViewCell className="text-x-sm">{item.url}</XDataViewCell>;

      case "event":
        const [entity, action] = item.event.split(".");
        return (
          <XChip size="sm" variant="flat">
            {t(`Common.events.${entity}.${action}`)}
          </XChip>
        );

      case "entity": {
        const entityName = getEntityName(item.event, item.requestBody?.data, t);
        return entityName ? <XDataViewCell>{entityName}</XDataViewCell> : <XDataViewCell>-</XDataViewCell>;
      }

      case "status": {
        return (
          <XChip color={WEBHOOK_DELIVERY_QUEUE_STATUS_CHIP_COLOR[item.status]} size="sm">
            {t(`WebhookDeliveryModal.deliveryStatus.${item.status}`)}
          </XChip>
        );
      }

      case "statusCode":
        return item.statusCode ? <XDataViewCell className="text-x-sm">{item.statusCode}</XDataViewCell> : "";

      case "createdAt":
        return <XDataViewCell>{intlStore.formatNumericalShortDateTime(item.createdAt)}</XDataViewCell>;

      default:
        return "";
    }
  }

  return (
    <XDataViewContainer
      renderCell={renderCell}
      store={webhookDeliveriesStore}
      title={t("WebhookDeliveriesCard.title")}
      onRowAction={(item) => {
        webhookDeliveryModalStore.onInitOrRefresh(item);
        webhookDeliveryModalStore.open();
      }}
    />
  );
});
