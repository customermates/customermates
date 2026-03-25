"use client";

import type { AuditLogDto } from "@/ee/audit-log/get/get-audit-logs-by-entity-id.interactor";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { getEntityName } from "@/features/event/entity-name.utils";
import { XDataViewContainer } from "@/components/x-data-view/x-data-view-container";
import { XDataViewCell } from "@/components/x-data-view/x-data-view-cell";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XChip } from "@/components/x-chip/x-chip";
import { XCopyableChip } from "@/components/x-chip/x-copyable-chip";
import { XAvatarStack } from "@/components/x-avatar-stack";

export const AuditLogsCard = observer(() => {
  const t = useTranslations("");
  const { auditLogModalStore, auditLogsStore, intlStore, userModalStore } = useRootStore();

  function renderCell(item: AuditLogDto, columnKey: React.Key): string | number | JSX.Element {
    switch (columnKey) {
      case "name": {
        const entityName = getEntityName(item.event, item.eventData, t);
        return entityName ? <XDataViewCell>{entityName}</XDataViewCell> : <XDataViewCell>-</XDataViewCell>;
      }

      case "user":
        return (
          <XAvatarStack
            items={item.user ? [item.user] : []}
            onAvatarClick={(user) => void userModalStore.loadById(user.id)}
          />
        );

      case "event":
        return (
          <XChip size="sm" variant="flat">
            {t(`Common.events.${item.event}`)}
          </XChip>
        );

      case "entityId":
        return (
          <XCopyableChip size="sm" value={item.entityId} variant="flat">
            {item.entityId}
          </XCopyableChip>
        );

      case "createdAt":
        return <XDataViewCell>{intlStore.formatNumericalShortDateTime(item.createdAt)}</XDataViewCell>;

      default:
        return "";
    }
  }

  return (
    <XDataViewContainer
      renderCell={renderCell}
      searchTooltip={t("AuditLogsCard.searchTooltip")}
      store={auditLogsStore}
      title={t("AuditLogsCard.title")}
      onRowAction={(item) => {
        auditLogModalStore.onInitOrRefresh(item);
        auditLogModalStore.open();
      }}
    />
  );
});
