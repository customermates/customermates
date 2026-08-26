"use client";

import type { ReactNode } from "react";
import type { CustomFieldValueDto } from "@/core/base/base-entity.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { EntityDetailPreviewItem } from "./entity-detail-personalization";

import { observer } from "mobx-react-lite";
import type { EntityType } from "@/generated/prisma";

import { AppChipStack } from "@/components/chip/app-chip-stack";
import { CustomFieldValue } from "@/components/data-view/custom-columns/custom-field-value";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { TruncatedText } from "@/components/shared/truncated-text";
import { cn } from "@/core/utils/cn";

import { useEntityHref } from "./hooks/use-entity-drawer-stack";
import { useEntityDetailPersonalization } from "./entity-detail-personalization";
import {
  getSummaryCellGridColumn,
  getSummarySeparatorColumns,
  isSummaryGroupStart,
} from "./entity-detail-summary-geometry";
import { useEntityDetailSummaryGeometry } from "./entity-detail-summary-geometry-context";

export type EntityDetailSummaryField = {
  id: string;
  label: string;
  value: ReactNode;
};

type SummaryProps = {
  entityId: string;
  fields: EntityDetailSummaryField[];
  customColumns: CustomColumnDto[];
  customFieldValues: readonly CustomFieldValueDto[];
};

type ChipItem = {
  id: string;
  label: string;
  startContent?: ReactNode;
};

type AvatarItem = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  email?: string | null;
};

export function previewItems<T extends { id: string }>(
  preview: EntityDetailPreviewItem[] | undefined,
  fallback: readonly T[],
): T[] {
  if (!preview) return [...fallback];
  const fallbackById = new Map(fallback.map((item) => [item.id, item]));
  return preview.flatMap((item) => {
    const value = item.data as T | undefined;
    const fallbackItem = fallbackById.get(item.key);
    return value ? [value] : fallbackItem ? [fallbackItem] : [];
  });
}

export function EntityDetailChipSummaryValue({ entityType, items }: { entityType: EntityType; items: ChipItem[] }) {
  const entityHref = useEntityHref();

  if (items.length === 0) return "—";

  return <AppChipStack chipHref={(item) => entityHref(entityType, item.id)} items={items} />;
}

export function EntityDetailAvatarSummaryValue({
  items,
  entityType,
}: {
  items: readonly AvatarItem[];
  entityType?: EntityType;
}) {
  const entityHref = useEntityHref();

  return items.length > 0 ? (
    <AvatarStack
      avatarHref={entityType ? (item) => entityHref(entityType, item.id) : undefined}
      items={[...items]}
      size="default"
    />
  ) : (
    "—"
  );
}

function SummaryValue({ children }: { children: ReactNode }) {
  const value = children === null || children === undefined || children === "" ? "—" : children;
  const isPlainText = typeof value === "string" || typeof value === "number";

  return (
    <div data-summary-value className="mt-1 flex min-h-6 min-w-0 items-center overflow-hidden text-sm text-foreground">
      {isPlainText ? <TruncatedText className="w-full">{String(value)}</TruncatedText> : value}
    </div>
  );
}

function SummaryEntry({ item }: { item: EntityDetailSummaryField }) {
  return (
    <div className="min-w-0" data-summary-field={item.id}>
      <div data-summary-label>
        <TruncatedText className="w-full text-[11px] font-medium text-muted-foreground">{item.label}</TruncatedText>
      </div>

      <SummaryValue>{item.value}</SummaryValue>
    </div>
  );
}

export const EntityDetailSummary = observer(function EntityDetailSummary({
  entityId,
  fields,
  customColumns,
  customFieldValues,
}: SummaryProps) {
  const { starredFieldIds } = useEntityDetailPersonalization();
  const geometry = useEntityDetailSummaryGeometry();
  const builtIn = new Map(fields.map((field) => [field.id, field]));
  const customItem = {
    id: entityId,
    customFieldValues: [...customFieldValues],
  };
  const custom = new Map(
    customColumns.map<readonly [string, EntityDetailSummaryField]>((column) => [
      column.id,
      {
        id: column.id,
        label: column.label,
        value: <CustomFieldValue showOverflowTooltip column={column} item={customItem} />,
      },
    ]),
  );
  const items = starredFieldIds
    .map((fieldId) => builtIn.get(fieldId) ?? custom.get(fieldId))
    .filter((item): item is EntityDetailSummaryField => Boolean(item));

  if (items.length === 0) return null;

  const hasWideGrid = Boolean(geometry.gridTemplateColumns);
  const separatorColumns = getSummarySeparatorColumns(geometry.groupSizes);
  const wideGridCapacity = geometry.groupSizes.reduce((total, groupSize) => total + groupSize, 0);
  const alignedItemCount = hasWideGrid ? Math.min(items.length, wideGridCapacity) : items.length;
  const alignedItems = items.slice(0, alignedItemCount);
  const overflowItems = items.slice(alignedItemCount);

  const renderCell = (item: EntityDetailSummaryField, index: number, isAligned: boolean) => (
    <div
      key={item.id}
      className={cn(
        "w-32 flex-none border-border p-3",
        index === 0 && cn("pl-0", hasWideGrid && "@6xl/detail:pl-4"),
        index > 0 && "border-l",
        index === items.length - 1 && cn("pr-0", hasWideGrid && "@6xl/detail:pr-4"),
        hasWideGrid && isAligned && "@6xl/detail:w-auto @6xl/detail:min-w-0",
        hasWideGrid && isAligned && isSummaryGroupStart(index, geometry.groupSizes) && "@6xl/detail:border-l-0",
      )}
      data-summary-cell={item.id}
      data-summary-overflow={hasWideGrid && !isAligned ? "true" : undefined}
      style={
        hasWideGrid && isAligned
          ? {
              gridColumn: getSummaryCellGridColumn(index, geometry.groupSizes),
              gridRow: 1,
            }
          : undefined
      }
    >
      <SummaryEntry item={item} />
    </div>
  );

  return (
    <section
      data-entity-detail-summary
      className="border-b border-border bg-background px-4"
      data-summary-variant="divided-rail"
    >
      <div
        className={cn(
          "-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          hasWideGrid && "@6xl/detail:px-0",
        )}
      >
        <div
          data-summary-rail
          className={cn("flex w-max min-w-full items-stretch", hasWideGrid && "@6xl/detail:w-full")}
          data-summary-geometry={geometry.id}
        >
          <div
            data-summary-aligned-grid
            className={cn("contents", hasWideGrid && "@6xl/detail:grid @6xl/detail:w-full @6xl/detail:flex-none")}
            style={hasWideGrid ? { gridTemplateColumns: geometry.gridTemplateColumns } : undefined}
          >
            {alignedItems.map((item, index) => renderCell(item, index, true))}

            {hasWideGrid
              ? separatorColumns.map((column) => (
                  <div
                    key={column}
                    aria-hidden
                    data-summary-panel-divider
                    className="hidden bg-border @6xl/detail:block"
                    style={{ gridColumn: column, gridRow: 1 }}
                  />
                ))
              : null}
          </div>

          {overflowItems.map((item, overflowIndex) => renderCell(item, alignedItemCount + overflowIndex, false))}
        </div>
      </div>
    </section>
  );
});
