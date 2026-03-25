"use client";

import type { WebhookDto } from "@/features/webhook/webhook.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { XDataViewContainer } from "@/components/x-data-view/x-data-view-container";
import { XDataViewCell } from "@/components/x-data-view/x-data-view-cell";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XChipStack } from "@/components/x-chip/x-chip-stack";
import { XChip } from "@/components/x-chip/x-chip";
export const WebhooksCard = observer(() => {
  const t = useTranslations("");
  const { webhookModalStore, webhooksStore, intlStore } = useRootStore();

  function renderCell(item: WebhookDto, columnKey: React.Key): string | number | JSX.Element {
    switch (columnKey) {
      case "name":
        return <XDataViewCell className="text-x-sm">{item.url}</XDataViewCell>;

      case "description":
        return <XDataViewCell className="text-x-sm">{item.description ?? ""}</XDataViewCell>;

      case "events":
        return (
          <XChipStack
            items={item.events.map((event) => {
              const [entity, action] = event.split(".");
              return { id: event, label: t(`Common.events.${entity}.${action}`) };
            })}
            size="sm"
            variant="flat"
          />
        );

      case "status":
        return item.enabled ? (
          <XChip color="success" size="sm">
            {t("WebhookModal.enabled")}
          </XChip>
        ) : (
          <XChip color="danger" size="sm">
            {t("WebhookModal.disabled")}
          </XChip>
        );

      case "createdAt":
        return <XDataViewCell>{intlStore.formatNumericalShortDateTime(item.createdAt)}</XDataViewCell>;

      case "updatedAt":
        return <XDataViewCell>{intlStore.formatNumericalShortDateTime(item.updatedAt)}</XDataViewCell>;

      default:
        return "";
    }
  }

  return (
    <XDataViewContainer
      renderCell={renderCell}
      store={webhooksStore}
      title={t("WebhooksCard.title")}
      onAdd={() => void webhookModalStore.add()}
      onRowAction={(item) => void webhookModalStore.edit(item)}
    />
  );
});
