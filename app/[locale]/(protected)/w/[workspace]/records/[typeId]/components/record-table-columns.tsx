"use client";

import type { CellContext, ColumnDef } from "@tanstack/react-table";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { RecordsStore } from "./records.store";
import type { RecordOpener } from "./record-inline-field";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRootStore } from "@/core/stores/root-store.provider";
import { linkedRecordsTarget, openLinkedRecords } from "./open-linked-records";
import { Sigma } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { recordDisplayName } from "@/features/records/record-display-name";
import { RecordCell } from "./record-cell";
import { RecordCardContent } from "./record-chip-row";
import { DataViewItemLayout } from "@/components/data-view/data-view-item-layout";
import { UNTITLED_COLUMN_ID } from "./records.store";
import {
  RecordCalculatedValue,
  RecordInlineField,
  RecordInlineAssignees,
  RecordInlineRelationship,
  RecordOpenLink,
  CalculatedFieldText,
  canEditInline,
  canEditAssignees,
  isCalculatedField,
  hasInlineRelationshipEditor,
} from "./record-inline-field";

const EDIT_TARGET_CONTAINER_CLASS =
  "flex min-w-0 pr-3 in-data-[align=end]:justify-end in-data-[align=end]:pr-0 in-data-[align=end]:pl-3";

function recordOpener(record: RecordRow, open: (trigger: HTMLElement) => void): RecordOpener {
  return { href: `/records/${record.ref.typeId}/${record.ref.recordId}`, onOpen: open };
}

function recordAvatarFieldId(store: RecordsStore) {
  return store.recordPictureFieldId;
}

export function useRecordTableColumns(
  store: RecordsStore,
  openRelated: (ref: RecordRef) => void,
  {
    markCalculated = false,
    openRecord,
  }: {
    markCalculated?: boolean;
    openRecord?: (record: RecordRow) => void;
  } = {},
) {
  const t = useTranslations();
  const root = useRootStore();
  const avatarFieldId = recordAvatarFieldId(store);
  const columnHeaders = store.columnHeaders;
  const untitledHeader = store.type && !store.type.primaryFieldId ? store.type.label : null;
  return useMemo<ColumnDef<RecordRow>[]>(
    () => [
      ...(untitledHeader
        ? [
            {
              id: UNTITLED_COLUMN_ID,
              header: untitledHeader,
              cell: ({ row }: CellContext<RecordRow, unknown>) => (
                <RecordCell
                  avatarFieldId={avatarFieldId}
                  fallbackTitle={recordDisplayName(undefined, untitledHeader, t)}
                  linkColors={store.presentation.linkColors}
                  linkIcons={store.presentation.linkIcons}
                  linkLabels={store.presentation.linkLabels}
                  record={row.original}
                  onOpen={openRelated}
                />
              ),
            },
          ]
        : []),
      ...columnHeaders.map(([id, label]): ColumnDef<RecordRow> => {
        const definition = store.recordColumns.find((candidate) => candidate.id === id);
        const calculated =
          markCalculated && definition?.kind === "field" && isCalculatedField(store, definition.field)
            ? definition.field
            : undefined;
        return {
          id,
          header: calculated
            ? () => (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1" data-calculated-header="">
                      <Sigma aria-hidden className="size-3 shrink-0" />

                      {label}
                    </span>
                  </TooltipTrigger>

                  <TooltipContent>
                    <CalculatedFieldText field={calculated} model={store.formulaModel} />
                  </TooltipContent>
                </Tooltip>
              )
            : label,
          cell: ({ row }) => {
            const column = store.recordColumns.find((candidate) => candidate.id === id);
            if (!column) return null;
            const renderCell = (inTrigger: boolean) => (
              <RecordCell
                avatarFieldId={column.id === store.type?.primaryFieldId ? avatarFieldId : undefined}
                column={column}
                inTrigger={inTrigger}
                linkColors={store.presentation.linkColors}
                linkIcons={store.presentation.linkIcons}
                linkLabels={store.presentation.linkLabels}
                record={row.original}
                onMore={
                  column.kind === "relationship" || column.kind === "relationshipPath"
                    ? (trigger) =>
                        openLinkedRecords(
                          root,
                          {
                            source: row.original,
                            model: store.presentation.model,
                            ...linkedRecordsTarget(column),
                            label: column.label,
                            t,
                          },
                          trigger,
                        )
                    : undefined
                }
                onOpen={openRelated}
              />
            );
            if (column.id === "system:assignedTo" && canEditAssignees(store, row.original)) {
              return (
                <div className={EDIT_TARGET_CONTAINER_CLASS}>
                  <RecordInlineAssignees record={row.original} records={store}>
                    {renderCell(true)}
                  </RecordInlineAssignees>
                </div>
              );
            }
            if (column.kind === "relationship" && hasInlineRelationshipEditor(store, row.original, column.relation)) {
              const summary = row.original.relationships.find(
                (entry) => entry.relationId === column.relation.id && entry.direction === column.direction,
              );
              return (
                <div className={EDIT_TARGET_CONTAINER_CLASS}>
                  <RecordInlineRelationship
                    direction={column.direction}
                    empty={!summary?.records.length}
                    label={column.label}
                    record={row.original}
                    records={store}
                    relation={column.relation}
                    onOpenRecord={openRelated}
                  >
                    {renderCell(false)}
                  </RecordInlineRelationship>
                </div>
              );
            }
            if (column.kind !== "field") return renderCell(false);
            const opener =
              column.id === store.type?.primaryFieldId
                ? recordOpener(row.original, () =>
                    openRecord ? openRecord(row.original) : openRelated(row.original.ref),
                  )
                : undefined;
            if (canEditInline(store, row.original, column.field)) {
              return (
                <div className={EDIT_TARGET_CONTAINER_CLASS}>
                  <RecordInlineField field={column.field} opener={opener} record={row.original} records={store}>
                    {renderCell(true)}
                  </RecordInlineField>
                </div>
              );
            }
            const value = opener ? (
              <RecordOpenLink opener={opener} record={row.original} records={store}>
                {renderCell(false)}
              </RecordOpenLink>
            ) : (
              renderCell(false)
            );
            return !opener && isCalculatedField(store, column.field) ? (
              <RecordCalculatedValue field={column.field} model={store.formulaModel}>
                {calculated ? <span className="text-muted-foreground">{value}</span> : value}
              </RecordCalculatedValue>
            ) : (
              value
            );
          },
        };
      }),
    ],
    [columnHeaders, openRelated, openRecord, avatarFieldId, store, markCalculated, t, untitledHeader, root],
  );
}

export function useRecordCardRenderer(store: RecordsStore, openRelated: (ref: RecordRef) => void) {
  const t = useTranslations();
  const avatarFieldId = recordAvatarFieldId(store);
  return useCallback(
    (record: RecordRow) => {
      const primary = store.recordColumns.find((column) => column.id === store.type?.primaryFieldId);
      const showTitle = !primary || store.visibleColumns.some((column) => column.uid === primary.id);
      const title = (
        <RecordCell
          avatarFieldId={avatarFieldId}
          column={primary}
          fallbackTitle={recordDisplayName(undefined, store.type?.label, t)}
          linkColors={store.presentation.linkColors}
          linkIcons={store.presentation.linkIcons}
          linkLabels={store.presentation.linkLabels}
          record={record}
          onOpen={openRelated}
        />
      );
      return (
        <DataViewItemLayout.Provider value="card">
          <RecordCardContent
            record={record}
            records={store}
            title={
              !showTitle ? null : primary?.kind === "field" && canEditInline(store, record, primary.field) ? (
                <RecordInlineField
                  field={primary.field}
                  opener={recordOpener(record, () => openRelated(record.ref))}
                  record={record}
                  records={store}
                >
                  {title}
                </RecordInlineField>
              ) : (
                title
              )
            }
            onOpenRecord={openRelated}
          />
        </DataViewItemLayout.Provider>
      );
    },
    [avatarFieldId, openRelated, store, t],
  );
}
