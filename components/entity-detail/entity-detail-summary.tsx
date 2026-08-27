"use client";

import type { ReactNode } from "react";
import type { CustomFieldValueDto } from "@/core/base/base-entity.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { EntityDetailPreviewItem } from "./entity-detail-personalization";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { EntityType } from "@/generated/prisma";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppChipStack } from "@/components/chip/app-chip-stack";
import { CustomFieldValue } from "@/components/data-view/custom-columns/custom-field-value";
import { AvatarStack } from "@/components/shared/avatar-stack";
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
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const updateOverflow = useCallback(() => {
    const scrollRegion = scrollRegionRef.current;
    setIsOverflowing(Boolean(scrollRegion && scrollRegion.scrollWidth > scrollRegion.clientWidth));
  }, []);

  useEffect(() => {
    const scrollRegion = scrollRegionRef.current;
    if (!scrollRegion) return;

    updateOverflow();
    window.addEventListener("resize", updateOverflow);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            updateOverflow();
          });
    resizeObserver?.observe(scrollRegion);
    if (scrollRegion.firstElementChild) resizeObserver?.observe(scrollRegion.firstElementChild);

    return () => {
      window.removeEventListener("resize", updateOverflow);
      resizeObserver?.disconnect();
    };
  }, [items.length, updateOverflow]);

  return (
    <section
      data-entity-detail-summary
      className="shrink-0 border-b border-border bg-background px-4"
      data-summary-variant="pinned-mini-cards"
    >
      <div
        ref={scrollRegionRef}
        data-summary-scroll-region
        aria-label={isOverflowing ? t("NavigationBar.overview") : undefined}
        className="-mx-4 overflow-x-auto px-4 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-summary-overflow={isOverflowing || undefined}
        role={isOverflowing ? "region" : undefined}
        tabIndex={isOverflowing ? 0 : undefined}
      >
        <div
          data-summary-rail
          className="flex w-max min-w-full items-stretch gap-2 pt-0 pb-4"
          data-summary-geometry="cards"
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
        </div>
      </div>
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
