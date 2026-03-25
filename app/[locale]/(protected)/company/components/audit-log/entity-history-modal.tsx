"use client";

import type { AuditLogDto } from "@/ee/audit-log/get/get-audit-logs-by-entity-id.interactor";

import { Avatar } from "@heroui/avatar";
import { Spinner } from "@heroui/spinner";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/table";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { processChanges } from "./entity-history-details.utils";

import { XModal } from "@/components/x-modal/x-modal";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { XChip } from "@/components/x-chip/x-chip";
import { XDataViewCell } from "@/components/x-data-view/x-data-view-cell";
import { useRootStore } from "@/core/stores/root-store.provider";

type TableColumnDef = { key: "user" | "event" | "changesCount" | "timestamp"; label: string };

export const EntityHistoryModal = observer(() => {
  const t = useTranslations("");
  const { entityHistoryModalStore: store, entityHistoryDetailsModalStore, intlStore } = useRootStore();
  const customColumnsById = new Map(store.customColumns.map((c) => [c.id, c]));
  const columns: TableColumnDef[] = [
    { key: "user", label: t("Common.table.columns.user") },
    { key: "event", label: t("Common.table.columns.event") },
    { key: "changesCount", label: t("AuditLogModal.changes") },
    { key: "timestamp", label: t("AuditLogModal.createdAt") },
  ];

  function renderTableCell(item: AuditLogDto, columnKey: TableColumnDef["key"]) {
    switch (columnKey) {
      case "user":
        return (
          <div className="flex items-center gap-2 min-w-0">
            <Avatar
              showFallback
              className="shrink-0"
              name={`${item.user.firstName} ${item.user.lastName}`.trim()}
              size="sm"
              src={item.user.avatarUrl ?? undefined}
            />

            <div className="max-w-full overflow-hidden">
              <XDataViewCell className="text-x-sm max-w-full">
                {`${item.user.firstName} ${item.user.lastName}`.trim()}
              </XDataViewCell>

              <XDataViewCell className="text-subdued text-xs max-w-full">{item.user.email}</XDataViewCell>
            </div>
          </div>
        );
      case "event":
        return <XChip>{t(`Common.events.${item.event}`)}</XChip>;
      case "changesCount":
        return <XDataViewCell>{processChanges(item, customColumnsById, t).length}</XDataViewCell>;
      case "timestamp":
        return <XDataViewCell>{intlStore.formatNumericalShortDateTime(item.createdAt)}</XDataViewCell>;
    }
  }

  return (
    <XModal size="2xl" store={store}>
      <XCard>
        <XCardHeader>
          <h2 className="text-x-lg grow">{t("AuditLogModal.titleHistory")}</h2>
        </XCardHeader>

        <XCardBody className="p-3">
          {store.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : store.items.length === 0 ? (
            <p className="text-subdued py-8 text-center text-x-sm">{t("AuditLogModal.emptyHistory")}</p>
          ) : (
            <Table
              removeWrapper
              classNames={{
                base: "contents",
                th: "bg-transparent",
                tbody: "[&>tr:hover>td]:bg-content2 dark:[&>tr:hover>td]:bg-content4",
                td: "group-data-[first=true]/tr:first:before:rounded-none group-data-[first=true]/tr:last:before:rounded-none group-data-[middle=true]/tr:before:rounded-none group-data-[last=true]/tr:first:before:rounded-none group-data-[last=true]/tr:last:before:rounded-none",
              }}
              selectionMode="none"
              onRowAction={(key) => {
                const item = store.items.find((entry) => entry.id === key);
                if (item) entityHistoryDetailsModalStore.openWithData(item, store.customColumns);
              }}
            >
              <TableHeader columns={columns}>
                {(column) => (
                  <TableColumn key={column.key} className="relative text-subdued truncate">
                    {column.label.toUpperCase()}
                  </TableColumn>
                )}
              </TableHeader>

              <TableBody items={store.items}>
                {(item) => (
                  <TableRow key={item.id}>
                    {(columnKey) => (
                      <TableCell data-column-uid={columnKey}>
                        <div className="max-w-full overflow-hidden">
                          {renderTableCell(item, columnKey as TableColumnDef["key"])}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </XCardBody>
      </XCard>
    </XModal>
  );
});
