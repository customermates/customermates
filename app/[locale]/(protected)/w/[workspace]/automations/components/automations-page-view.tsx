"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { AutomationRecipe } from "@/features/automation-rules/recipes";
import type { AutomationListItemDto } from "@/features/automation-rules/automations-list.schema";
import type { AutomationBuilderContext } from "./automation-builder.store";
import type { AutomationBuilderModel } from "./automation-builder-model";
import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";
import type { FocusKind } from "@/components/focus/focus-href";

import { History, Pause, Play, Plus, Repeat } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { DataViewContent } from "@/components/data-view/data-view-content";
import { DataViewEmpty } from "@/components/data-view/data-view-empty";
import { DataViewLayout } from "@/components/data-view/data-view-layout";
import { resolveDataViewPageState, resolveDataViewView } from "@/components/data-view/data-view-state";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { RowActions } from "@/components/data-view/row-actions";
import { useDataViewSync } from "@/components/data-view/use-data-view-sync";
import { useFocusTarget } from "@/components/focus/focus-target";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Action, Resource } from "@/generated/prisma";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { browserTimeZone } from "@/core/utils/time-zone";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

import { deleteAutomationRuleAction, setAutomationRuleEnabledAction } from "../actions";
import { upsertRoutineAction } from "../../routines/actions";
import { AutomationBuilderModal } from "./automation-builder-modal";
import { reminderDraft } from "./automation-draft";
import { AutomationsPageSkeleton } from "./automations-page-skeleton";
import { useAutomationColumns } from "./use-automation-columns";

export type AutomationsPrefill =
  | { kind: "new"; typeId: string }
  | { kind: "remind"; typeId: string; fieldId: string }
  | null;

type Props = {
  initial: GetResult<AutomationListItemDto>;
  model: AutomationBuilderModel;
  runtimes: AgentRuntimeAvailability;
  webhooks: { id: string; label: string }[];
  composer: boolean;
  cloud: boolean;
  canCreateRoutine: boolean;
  prefill: AutomationsPrefill;
};

const FOCUS_KINDS: FocusKind[] = ["routine"];

const columnStyle = (columnId: string) =>
  columnId === "name" ? { emphasis: true, flexible: true } : columnId === "sentence" ? { flexible: true } : undefined;

const AutomationsPageViewContent = observer(function AutomationsPageView({
  initial,
  model,
  runtimes,
  webhooks,
  composer,
  cloud,
  canCreateRoutine,
  prefill,
}: Props) {
  const { automationsStore, automationBuilderStore, routineModalStore, userStore } = useRootStore();
  const t = useTranslations();
  const { showConfirmation, showTrashConfirmation } = useDeleteConfirmation();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const prefillApplied = useRef(false);

  useDataViewSync(automationsStore, initial);

  const context = useCallback(
    (): AutomationBuilderContext => ({
      model,
      runtimes,
      webhooks,
      composer,
      cloud,
      timezone: browserTimeZone(),
    }),
    [cloud, composer, model, runtimes, webhooks],
  );
  const refresh = useCallback(() => automationsStore.refresh(), [automationsStore]);

  const openNew = useCallback(
    (typeId?: string) => automationBuilderStore.openForCreate(context(), () => void refresh(), { typeId }),
    [automationBuilderStore, context, refresh],
  );

  useEffect(() => {
    if (!prefill || prefillApplied.current) return;
    prefillApplied.current = true;
    const ctx = context();
    if (!ctx.model.lists.some((list) => list.id === prefill.typeId)) return;
    if (prefill.kind === "remind") {
      automationBuilderStore.openForCreate(ctx, () => void refresh(), {
        draft: reminderDraft(ctx.model, { typeId: prefill.typeId, fieldId: prefill.fieldId, timezone: ctx.timezone }),
      });
    } else openNew(prefill.typeId);
  }, [automationBuilderStore, context, openNew, prefill, refresh]);

  const openItem = useCallback(
    (item: AutomationListItemDto, pane: "preview" | "runs" = "preview") => {
      if (item.rule) {
        automationBuilderStore.openForRule(context(), item.rule, () => void refresh(), { pane });
        return;
      }
      if (!item.routine) return;
      void routineModalStore.openForEdit(item.routine).then(() => {
        if (pane === "runs") routineModalStore.setActiveTab("runs");
      });
    },
    [automationBuilderStore, context, refresh, routineModalStore],
  );

  const userId = userStore.user?.id;
  const isAdmin = routineModalStore.isAdmin;
  const canToggle = useCallback(
    (item: AutomationListItemDto) =>
      userStore.can(Resource.routines, Action.update) && (item.ownerUserId === userId || (item.enabled && isAdmin)),
    [isAdmin, userId, userStore],
  );

  const toggle = useCallback(
    async (item: AutomationListItemDto, enabled: boolean) => {
      setPendingId(item.id);
      try {
        const result =
          item.kind === "rule"
            ? await setAutomationRuleEnabledAction({ id: item.id, enabled })
            : await upsertRoutineAction({ id: item.id, enabled });
        if (!result.ok) toastZodErrorTree(result.error);
        await refresh();
      } finally {
        setPendingId(null);
      }
    },
    [refresh],
  );

  const remove = useCallback(
    (item: AutomationListItemDto) => {
      if (item.kind === "routine") {
        showTrashConfirmation(
          () => routineModalStore.deleteById(item.id),
          item.name,
          undefined,
          () => refresh(),
        );
        return;
      }
      showConfirmation({
        title: t("AutomationRules.deleteTitle"),
        message: t("AutomationRules.deleteMessage", { name: item.name }),
        confirmLabel: t("Common.actions.delete"),
        confirmVariant: "destructive",
        successKey: "Common.notifications.deleted",
        onConfirm: async () => {
          const result = await deleteAutomationRuleAction({ id: item.id });
          if (!result.ok) {
            toastZodErrorTree(result.error);
            return false;
          }
          await refresh();
          return true;
        },
      });
    },
    [refresh, routineModalStore, showConfirmation, showTrashConfirmation, t],
  );

  const columns = useAutomationColumns({
    model,
    pendingId,
    canToggle,
    onToggle: (item, enabled) => void toggle(item, enabled),
  });

  const rowActions = useCallback(
    (item: AutomationListItemDto) => (
      <RowActions
        extraActions={[
          ...(canToggle(item)
            ? [
                {
                  key: "toggle",
                  label: item.enabled ? t("Automations.rowActions.pause") : t("Automations.rowActions.resume"),
                  icon: item.enabled ? Pause : Play,
                  onSelect: () => void toggle(item, !item.enabled),
                },
              ]
            : []),
          {
            key: "history",
            label: t("Automations.rowActions.history"),
            icon: History,
            onSelect: () => openItem(item, "runs"),
          },
        ]}
        name={item.name}
        onDelete={() => remove(item)}
        onOpen={() => openItem(item)}
      />
    ),
    [canToggle, openItem, remove, t, toggle],
  );

  const view = resolveDataViewView(automationsStore.viewMode, automationsStore.canBoard);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(automationsStore.searchTerm?.trim()) || (automationsStore.filters?.length ?? 0) > 0,
    isGrouped: automationsStore.isGrouped,
    itemCount: automationsStore.items.length,
    request: automationsStore.dataRequest,
    total: automationsStore.pagination?.total,
  });
  const descriptor = { title: t("AutomationRules.emptyTitle"), body: t("AutomationRules.emptyBody") };

  const onRoutineRecipe = useCallback(
    (recipe: AutomationRecipe, text: { title: string; prompt: string }) => {
      automationBuilderStore.close();
      void routineModalStore.openForCreate({
        name: text.title,
        prompt: text.prompt,
        cron: recipe.trigger.kind === "schedule" ? recipe.trigger.cron : undefined,
      });
    },
    [automationBuilderStore, routineModalStore],
  );

  const addMenu = useMemo(
    () =>
      canCreateRoutine ? (
        <>
          <DropdownMenuItem onSelect={() => openNew()}>
            <Plus className="size-4" />

            {t("Automations.new.automation")}
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => runUserAction(() => routineModalStore.openForCreate())}>
            <Repeat className="size-4" />

            {t("Automations.new.routine")}
          </DropdownMenuItem>
        </>
      ) : undefined,
    [canCreateRoutine, openNew, routineModalStore, t],
  );

  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={t("AutomationRules.new")}
        addMenu={addMenu}
        anchorScope="automations"
        searchLabel={t("Common.filters.searchFields.routines")}
        store={automationsStore}
        onAdd={() => openNew()}
      />
    ),
    [addMenu, automationsStore, openNew, t],
  );
  useSetTopBarActions(topBarNode);

  useFocusTarget(
    FOCUS_KINDS,
    (target) => {
      const item = automationsStore.items.find((entry) => entry.id === target.id && entry.routine);
      if (item) openItem(item);
      return true;
    },
    pageState !== "loading",
  );

  let body: ReactNode;
  switch (pageState) {
    case "error":
      body = (
        <PageState
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => automationsStore.setQueryOptions({ forceRefresh: true })}
            >
              {t("ErrorCard.retry")}
            </Button>
          }
          description={t("ErrorCard.contactSupport")}
          state="error"
          title={t("ErrorCard.title")}
        />
      );
      break;
    case "loading":
      body = (
        <PageState
          background={<AutomationsPageSkeleton view={view} />}
          label={t("PageState.loading")}
          state="loading"
        />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty descriptor={descriptor} reason="filtered" store={automationsStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          action={
            automationsStore.canCreate ? (
              <Button size="sm" variant="secondary" onClick={() => openNew()}>
                <Plus aria-hidden="true" className="size-4" />

                {t("AutomationRules.new")}
              </Button>
            ) : undefined
          }
          actionLabel={t("AutomationRules.new")}
          background={<AutomationsPageSkeleton animated={false} view={view} />}
          descriptor={descriptor}
          reason="true-empty"
          store={automationsStore}
          onAdd={() => openNew()}
        />
      );
      break;
    case "content":
      body = (
        <DataViewContent
          columnStyle={columnStyle}
          columns={columns}
          rowActions={rowActions}
          store={automationsStore}
          view={view}
          onRowClick={(item) => openItem(item)}
        />
      );
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <>
      <DataViewLayout
        showPagination={pageState === "content" && view !== "board" && !automationsStore.isGrouped}
        store={automationsStore}
      >
        {body}
      </DataViewLayout>

      <AutomationBuilderModal store={automationBuilderStore} onRoutineRecipe={onRoutineRecipe} />
    </>
  );
});

export const AutomationsPageView = serverRenderedClient(AutomationsPageViewContent);
