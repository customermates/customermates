"use client";

import type { ReactNode } from "react";
import type { CustomFieldValueDto } from "@/core/base/base-entity.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { EntityDetailPreviewItem } from "./entity-detail-personalization";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { EntityType } from "@/generated/prisma";

import { AppChipStack } from "@/components/chip/app-chip-stack";
import { CustomFieldValue } from "@/components/data-view/custom-columns/custom-field-value";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { OverflowRail } from "@/components/shared/overflow-rail";
import { TruncatedText } from "@/components/shared/truncated-text";
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

type AvatarSummaryValueProps =
  | {
      entityType: EntityType;
      items: readonly AvatarItem[];
      onItemClick?: never;
    }
  | {
      entityType?: never;
      items: readonly AvatarItem[];
      onItemClick: (item: AvatarItem) => void;
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

export function EntityDetailAvatarSummaryValue({ items, entityType, onItemClick }: AvatarSummaryValueProps) {
  const entityHref = useEntityHref();

  return items.length > 0 ? (
    <AvatarStack
      avatarHref={entityType ? (item) => entityHref(entityType, item.id) : undefined}
      items={[...items]}
      size="default"
      onAvatarClick={onItemClick}
    />
  ) : (
    "—"
  );
}

function SummaryValue({ children }: { children: ReactNode }) {
  const value = children === null || children === undefined || children === "" ? "—" : children;
  const isPlainText = typeof value === "string" || typeof value === "number";

  return (
    <div
      data-summary-value
      className="mt-0.5 flex min-h-6 min-w-0 items-center overflow-hidden text-sm text-foreground"
    >
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

function SummaryRail({ items }: { items: EntityDetailSummaryField[] }) {
  const t = useTranslations();

  return (
    <section
      data-entity-detail-summary
      className="shrink-0 border-b border-border bg-background px-4 ps-[calc(1rem+var(--safe-left,0px))] pe-[calc(1rem+var(--safe-right,0px))]"
      data-summary-variant="pinned-mini-cards"
    >
      <OverflowRail
        focusable
        ariaLabel={t("NavigationBar.overview")}
        observedKey={items.length}
        overflowAttribute="data-summary-overflow"
        railClassName="gap-2 pt-0 pb-4"
        railProps={{ "data-summary-geometry": "cards", "data-summary-rail": "" }}
        regionProps={{ "data-summary-scroll-region": "" }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="min-w-0 w-fit max-w-56 flex-none rounded-md border border-border/60 bg-card/40 px-3 py-2"
            data-summary-cell={item.id}
          >
            <SummaryEntry item={item} />
          </div>
        ))}
      </OverflowRail>
    </section>
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
        value: <CustomFieldValue showOverflowTooltip column={column} item={customItem} />,
      },
    ]),
  );
  const items = starredFieldIds
    .map((fieldId) => builtIn.get(fieldId) ?? custom.get(fieldId))
    .filter((item): item is EntityDetailSummaryField => Boolean(item));

  if (items.length === 0) return null;

  return <SummaryRail items={items} />;
});
