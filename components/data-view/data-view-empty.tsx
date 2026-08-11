"use client";

import type { LucideIcon } from "lucide-react";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { ReactElement } from "react";

import { Building2, CheckCircle2, Inbox, Package, TrendingUp, Users } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { Button } from "@/components/ui/button";
import { PageState } from "@/components/page-state/page-state";

import type { PageSkeletonSpec } from "@/components/page-state/page-skeleton";

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

type SharedProps<E extends HasId> = {
  store: BaseDataViewStore<E>;
  onAdd?: () => void;
  descriptor?: EmptyStateDescriptor;
  actionLabel?: string;
};

type Props<E extends HasId> = SharedProps<E> &
  (
    | {
        reason: "filtered";
        background?: never;
        skeleton?: never;
      }
    | ({ reason: "true-empty" } & (
        | {
            background: ReactElement;
            skeleton?: never;
          }
        | {
            background?: never;
            skeleton: PageSkeletonSpec;
          }
      ))
  );

export const DataViewEmpty = observer(function DataViewEmpty<E extends HasId>({
  store,
  onAdd,
  descriptor,
  reason,
  background,
  skeleton,
  actionLabel,
}: Props<E>) {
  const t = useTranslations();
  const { singular, plural } = useEntityTerminology();

  const entityType = store.entityType;
  const Icon = descriptor?.icon ?? (entityType ? ENTITY_ICON[entityType] : Inbox);
  const singularLabel = entityType ? singular(entityType) : "";
  const pluralLabel = entityType ? plural(entityType) : "";
  const canCreate = Boolean(onAdd) && store.canManage;

  if (reason === "filtered") {
    return (
      <DataViewEmptyState
        body={
          entityType
            ? t("Common.emptyState.filteredBody", { plural: pluralLabel })
            : t("Common.emptyState.genericFilteredBody")
        }
        icon={Icon}
        secondaryAction={{
          label: t("Common.emptyState.clearFilters"),
          onClick: () => store.setQueryOptions({ filters: [], searchTerm: "" }),
        }}
        title={t("Common.emptyState.filteredTitle")}
      />
    );
  }

  const title = !store.canManage
    ? entityType
      ? t("Common.emptyState.readOnlyTitle", { plural: pluralLabel })
      : (descriptor?.title ?? t("Common.emptyState.genericTitle"))
    : (descriptor?.title ??
      (entityType ? t("Common.emptyState.title", { plural: pluralLabel }) : t("Common.emptyState.genericTitle")));
  const description = !store.canManage
    ? entityType
      ? t("Common.emptyState.readOnlyBody", { plural: pluralLabel })
      : descriptor?.body
    : (descriptor?.body ?? (entityType ? t("Common.emptyState.body", { singular: singularLabel }) : undefined));
  const resolvedActionLabel =
    actionLabel ??
    descriptor?.ctaLabel ??
    (entityType ? t("Common.emptyState.cta", { singular: singularLabel }) : t("Common.actions.add"));

  return (
    <PageState
      {...(background ? { background } : { skeleton })}
      action={
        canCreate ? (
          <Button size="sm" variant="secondary" onClick={() => onAdd?.()}>
            {resolvedActionLabel}
          </Button>
        ) : undefined
      }
      description={description}
      icon={Icon}
      state="empty"
      title={title}
    />
  );
});
