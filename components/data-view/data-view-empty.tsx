"use client";

import type { LucideIcon } from "lucide-react";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { ReactElement, ReactNode } from "react";

import { Inbox } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { PageState } from "@/components/page-state/page-state";

import { DataViewEmptyState } from "./data-view-empty-state";

export type EmptyStateDescriptor = {
  title: string;
  body?: string;
  icon?: LucideIcon;
  ctaLabel?: string;
};

type SharedProps<E extends HasId> = {
  action?: ReactNode;
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
      }
    | { background: ReactElement; reason: "true-empty" }
  );

export const DataViewEmpty = observer(function DataViewEmpty<E extends HasId>({
  store,
  onAdd,
  descriptor,
  reason,
  background,
  actionLabel,
  action,
}: Props<E>) {
  const t = useTranslations();

  const labels = store.recordLabels;
  const Icon = descriptor?.icon ?? Inbox;
  const singularLabel = labels?.singular ?? "";
  const pluralLabel = labels?.plural ?? "";
  const canCreate = Boolean(onAdd) && store.canManage;

  if (reason === "filtered") {
    return (
      <DataViewEmptyState
        body={
          labels
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
    ? labels
      ? t("Common.emptyState.readOnlyTitle", { plural: pluralLabel })
      : (descriptor?.title ?? t("Common.emptyState.genericTitle"))
    : (descriptor?.title ??
      (labels ? t("Common.emptyState.title", { plural: pluralLabel }) : t("Common.emptyState.genericTitle")));
  const description = !store.canManage
    ? labels
      ? t("Common.emptyState.readOnlyBody", { plural: pluralLabel })
      : descriptor?.body
    : (descriptor?.body ?? (labels ? t("Common.emptyState.body", { singular: singularLabel }) : undefined));
  const resolvedActionLabel =
    actionLabel ??
    descriptor?.ctaLabel ??
    (labels ? t("Common.emptyState.cta", { singular: singularLabel }) : t("Common.actions.add"));

  return (
    <PageState
      action={
        action ??
        (canCreate ? (
          <Button size="sm" variant="secondary" onClick={() => onAdd?.()}>
            {resolvedActionLabel}
          </Button>
        ) : undefined)
      }
      background={background}
      description={description}
      icon={Icon}
      state="empty"
      title={title}
    />
  );
});
