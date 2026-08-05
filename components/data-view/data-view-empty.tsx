"use client";

import type { LucideIcon } from "lucide-react";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { Building2, CheckCircle2, Inbox, Package, TrendingUp, Users } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";

import { DataViewEmptyState } from "./data-view-empty-state";

export type EmptyStateDescriptor = {
  title: string;
  body?: string;
  icon?: LucideIcon;
  ctaLabel?: string;
};

const ENTITY_ICON: Record<EntityType, LucideIcon> = {
  [EntityType.contact]: Users,
  [EntityType.organization]: Building2,
  [EntityType.deal]: TrendingUp,
  [EntityType.service]: Package,
  [EntityType.task]: CheckCircle2,
};

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  onAdd?: () => void;
  descriptor?: EmptyStateDescriptor;
};

export const DataViewEmpty = observer(function DataViewEmpty<E extends HasId>({ store, onAdd, descriptor }: Props<E>) {
  const t = useTranslations();
  const { singular, plural } = useEntityTerminology();

  const entityType = store.entityType;
  const icon = descriptor?.icon ?? (entityType ? ENTITY_ICON[entityType] : Inbox);
  const singularLabel = entityType ? singular(entityType) : "";
  const pluralLabel = entityType ? plural(entityType) : "";
  const hasActiveQuery = Boolean(store.searchTerm) || (store.filters?.length ?? 0) > 0;
  const canCreate = Boolean(onAdd) && store.canManage;

  if (hasActiveQuery) {
    return (
      <DataViewEmptyState
        body={
          entityType
            ? t("Common.emptyState.filteredBody", { plural: pluralLabel })
            : t("Common.emptyState.genericFilteredBody")
        }
        icon={icon}
        secondaryAction={{
          label: t("Common.emptyState.clearFilters"),
          onClick: () => store.setQueryOptions({ filters: [], searchTerm: "" }),
        }}
        title={t("Common.emptyState.filteredTitle")}
      />
    );
  }

  if (!store.canManage) {
    return (
      <DataViewEmptyState
        body={entityType ? t("Common.emptyState.readOnlyBody", { plural: pluralLabel }) : descriptor?.body}
        icon={icon}
        title={
          entityType
            ? t("Common.emptyState.readOnlyTitle", { plural: pluralLabel })
            : (descriptor?.title ?? t("Common.emptyState.genericTitle"))
        }
      />
    );
  }

  if (descriptor) {
    return (
      <DataViewEmptyState
        body={descriptor.body}
        icon={icon}
        primaryAction={
          canCreate ? { label: descriptor.ctaLabel ?? t("Common.actions.add"), onClick: () => onAdd?.() } : undefined
        }
        title={descriptor.title}
      />
    );
  }

  if (!entityType) {
    return (
      <DataViewEmptyState
        icon={icon}
        primaryAction={canCreate ? { label: t("Common.actions.add"), onClick: () => onAdd?.() } : undefined}
        title={t("Common.emptyState.genericTitle")}
      />
    );
  }

  return (
    <DataViewEmptyState
      body={t("Common.emptyState.body", { singular: singularLabel })}
      icon={icon}
      primaryAction={
        canCreate
          ? { label: t("Common.emptyState.cta", { singular: singularLabel }), onClick: () => onAdd?.() }
          : undefined
      }
      title={t("Common.emptyState.title", { plural: pluralLabel })}
    />
  );
});
