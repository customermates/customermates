"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { RecordsStore } from "./records.store";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Sigma } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { RecordCell } from "./record-cell";
import { RecordCardContent } from "./record-chip-row";
import {
  RecordCalculatedValue,
  RecordInlineField,
  RecordInlineRelationship,
  calculatedFieldLabel,
  canEditInline,
  isCalculatedField,
  hasInlineRelationshipEditor,
} from "./record-inline-field";

export function recordAvatarFieldId(store: RecordsStore) {
  return store.presentation.model.capabilities
    .find((binding) => binding.kind === "avatar" && binding.typeId === store.presentation.typeId)
    ?.fields.find((field) => field.role === "image")?.fieldId;
}

export function useRecordTableColumns(
  store: RecordsStore,
  openRelated: (ref: RecordRef) => void,
  { markCalculated = false }: { markCalculated?: boolean } = {},
) {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  const locale = intl.formattingLocale;
  const avatarFieldId = recordAvatarFieldId(store);
  const columnHeaders = JSON.stringify(store.recordColumns.map((column) => [column.id, column.label]));
  return useMemo<ColumnDef<RecordRow>[]>(
    () =>
      (JSON.parse(columnHeaders) as [string, string][]).map(([id, label]) => {
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
                    {calculatedFieldLabel(calculated, store.presentation.model, t, locale)}
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
                onOpen={openRelated}
              />
            );
            if (column.kind === "relationship" && hasInlineRelationshipEditor(store, row.original, column.relation)) {
              const summary = row.original.relationships.find(
                (entry) => entry.relationId === column.relation.id && entry.direction === column.direction,
              );
              return (
                <RecordInlineRelationship
                  direction={column.direction}
                  empty={!summary?.records.length}
                  label={column.label}
                  record={row.original}
                  records={store}
                  relation={column.relation}
                  onOpenRecord={openRelated}
                >
                  {renderCell(true)}
                </RecordInlineRelationship>
              );
            }
            if (column.kind !== "field") return renderCell(false);
            if (canEditInline(store, row.original, column.field)) {
              return (
                <RecordInlineField field={column.field} record={row.original} records={store}>
                  {renderCell(true)}
                </RecordInlineField>
              );
            }
            return isCalculatedField(store, column.field) ? (
              <RecordCalculatedValue field={column.field} model={store.presentation.model}>
                {calculated ? <span className="text-muted-foreground">{renderCell(false)}</span> : renderCell(false)}
              </RecordCalculatedValue>
            ) : (
              renderCell(false)
            );
          },
        };
      }),
    [columnHeaders, openRelated, avatarFieldId, store, markCalculated, t, locale],
  );
}

export function useRecordCardRenderer(store: RecordsStore, openRelated: (ref: RecordRef) => void) {
  const avatarFieldId = recordAvatarFieldId(store);
  return useCallback(
    (record: RecordRow) => {
      const primary = store.recordColumns.find((column) => column.id === store.primaryColumnId);
      return (
        <RecordCardContent
          record={record}
          records={store}
          title={
            primary && (
              <RecordCell
                avatarFieldId={avatarFieldId}
                column={primary}
                linkColors={store.presentation.linkColors}
                linkIcons={store.presentation.linkIcons}
                linkLabels={store.presentation.linkLabels}
                record={record}
                onOpen={openRelated}
              />
            )
          }
          onOpenRecord={openRelated}
        />
      );
    },
    [avatarFieldId, openRelated, store],
  );
}
