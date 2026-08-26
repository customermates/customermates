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

import { useEntityHref } from "./hooks/use-entity-drawer-stack";
import { useEntityDetailPersonalization } from "./entity-detail-personalization";

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

  return <div className="mt-1 flex min-h-6 min-w-0 items-center truncate text-sm text-foreground">{value}</div>;
}

function SummaryEntry({ item }: { item: EntityDetailSummaryField }) {
  return (
    <div className="min-w-0" data-summary-field={item.id}>
      <div className="truncate text-[11px] font-medium text-muted-foreground">{item.label}</div>

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
        value: <CustomFieldValue column={column} item={customItem} />,
      },
    ]),
  );
  const items = starredFieldIds
    .map((fieldId) => builtIn.get(fieldId) ?? custom.get(fieldId))
    .filter((item): item is EntityDetailSummaryField => Boolean(item));

  if (items.length === 0) return null;

  return (
    <section
      data-entity-detail-summary
      className="border-b border-border bg-background px-4"
      data-summary-variant="divided-rail"
    >
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max min-w-full items-stretch divide-x divide-border">
          {items.map((item) => (
            <div key={item.id} className="w-32 flex-none p-3 first:pl-0 last:pr-0" data-summary-cell={item.id}>
              <SummaryEntry item={item} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});
