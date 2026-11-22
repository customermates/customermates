"use client";

import type {
  AutomationDrawerMeta,
  AutomationRuntimeBadge,
} from "@/components/automations/canvas/automation-drawer-shell";
import type { AppModalActions } from "@/components/modal";
import type { AutomationBuilderStore } from "./automation-builder.store";

import { Copy, Trash2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AutomationAgentIcon } from "@/components/automations/automation-agent-icon";
import { AutomationCanvas } from "@/components/automations/canvas/automation-canvas";
import { AutomationDrawerShell } from "@/components/automations/canvas/automation-drawer-shell";
import { AutomationReplayBanner } from "@/components/automations/canvas/automation-replay-summary";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { Alert } from "@/components/shared/alert";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { agentRuntimeLabel, effectKindOf } from "./automation-canvas-steps";
import { unavailableMessage } from "./automation-draft-sentence";
import { dismissAutomationError, showAutomationError } from "./automation-error-toast";
import { ruleCanvasView } from "./automation-rule-canvas";
import { AutomationRulePanel } from "./automation-rule-panel";

type Props = {
  store: AutomationBuilderStore;
};

export const AutomationBuilderModal = observer(function AutomationBuilderModal({ store }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { showConfirmation } = useDeleteConfirmation();
  const { form, model, context } = store;
  const title = store.isExisting ? t("AutomationRules.builder.titleEdit") : t("AutomationRules.builder.titleNew");

  if (!model || !context) return null;

  const save = async () => {
    dismissAutomationError();
    const outcome = await store.save();
    if (outcome === "incomplete") showAutomationError(t("AutomationRules.builder.incomplete"));
    if (outcome === "unavailable" && store.model)
      showAutomationError(unavailableMessage(store.form, store.unavailable[0], store.model, t));
    if (outcome === "saved") toast.success(t("Common.notifications.updated"));
  };

  const readOnly = store.isReadOnly;
  const view = ruleCanvasView(store, t);
  if (!view) return null;
  const { steps, replay } = view;

  const owner = store.rule?.owner ?? (store.isExisting ? null : store.rootStore.userStore.user);
  const agentEffect = form.effects.find((effect) => effectKindOf(effect) === "agent");
  const agentRuntime =
    agentEffect?.kind === "agent"
      ? agentEffect.runtime
      : agentEffect?.kind === "kept" && agentEffect.effect.kind === "agent"
        ? agentEffect.effect.runtime
        : null;
  const runtime: AutomationRuntimeBadge = agentRuntime
    ? { label: agentRuntimeLabel(agentRuntime, t), variant: agentRuntime === "mate" ? "ink" : "outline" }
    : { label: t("Automations.canvas.runtime.free"), variant: "secondary" };
  const meta: AutomationDrawerMeta = {
    owner: owner
      ? {
          name: `${owner.firstName} ${owner.lastName}`.trim(),
          firstName: owner.firstName,
          lastName: owner.lastName,
          avatarUrl: owner.avatarUrl,
        }
      : null,
    runtime,
    lastRun: store.rule?.lastRunAt
      ? t("AutomationRules.lastRun", { time: intlStore.formatRelativeTime(new Date(store.rule.lastRunAt)) })
      : t("AutomationRules.neverRun"),
  };

  const ownerName = store.rule?.owner ? `${store.rule.owner.firstName} ${store.rule.owner.lastName}`.trim() : "";
  const disabledReason = store.rule?.disabledReason;
  const notices = (
    <>
      {readOnly && (
        <Alert
          data-automation-read-only=""
          description={[
            store.isOwner
              ? t("Automations.builder.readOnlyRole")
              : ownerName
                ? t("Automations.builder.readOnlyOwner", { owner: ownerName })
                : t("Automations.builder.readOnlyNoOwner"),
            store.canPauseAsAdmin ? t("Automations.builder.readOnlyAdminPause") : "",
          ]
            .filter(Boolean)
            .join(" ")}
          title={t("RoutineDetail.readOnlyTitle")}
          variant="neutral"
        />
      )}

      {!form.enabled && disabledReason && (
        <p className="text-xs text-warning-soft-foreground" data-automation-paused-reason={disabledReason}>
          {t(`AutomationRules.disabledReason.${disabledReason}`)}
        </p>
      )}

      {store.composedByMate && (
        <p className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm" role="status">
          <AutomationAgentIcon aria-hidden="true" className="size-4 shrink-0" />

          {t("Automations.builder.composedNotice")}
        </p>
      )}

      {form.effects.length === 0 && store.isFlagged("effects") && (
        <p className="text-xs text-destructive" role="alert">
          {t("Automations.builder.needsStep")}
        </p>
      )}
    </>
  );
  const hasNotices =
    readOnly ||
    Boolean(!form.enabled && disabledReason) ||
    store.composedByMate ||
    (form.effects.length === 0 && store.isFlagged("effects"));

  const confirmDelete = () =>
    showConfirmation({
      title: t("AutomationRules.deleteTitle"),
      message: t("AutomationRules.deleteMessage", { name: form.name }),
      confirmLabel: t("Common.actions.delete"),
      confirmVariant: "destructive",
      successKey: "Common.notifications.deleted",
      onConfirm: store.deleteRule,
    });

  const actions: AppModalActions = [
    ...(store.canDuplicate
      ? [
          {
            id: "automation-duplicate",
            label: t("Automations.canvas.duplicateAutomation"),
            icon: Copy,
            disabled: store.isLoading,
            onClick: () => store.duplicateRule(t("Automations.canvas.copyName", { name: form.name.trim() })),
          },
        ]
      : []),
    ...(store.canDelete
      ? [
          {
            id: "automation-delete",
            label: t("Common.actions.delete"),
            icon: Trash2,
            variant: "destructive" as const,
            disabled: store.isLoading,
            onClick: confirmDelete,
          },
        ]
      : []),
  ];

  return (
    <AutomationDrawerShell
      actions={actions}
      active={{
        checked: form.enabled,
        disabled: store.isLoading || (readOnly && !store.canPauseAsAdmin),
        onChange: (enabled) => {
          if (!readOnly) store.setEnabled(enabled);
          else if (!enabled) runUserAction(() => store.pauseAsAdmin());
        },
      }}
      banner={
        store.replay ? (
          <AutomationReplayBanner
            when={intlStore.formatRelativeTime(new Date(store.replay.createdAt))}
            onBack={store.closeRun}
          />
        ) : undefined
      }
      canvas={<AutomationCanvas actions={view.actions} steps={steps} />}
      footer={
        readOnly ? undefined : (
          <div className="border-t px-6 py-4">
            <FormFooterActions
              creating={!store.isExisting}
              saveLabel={!store.isExisting && form.enabled ? t("Automations.builder.switchOn") : undefined}
              saving={store.isLoading}
              store={store}
              onCancel={store.close}
              onSave={() => runUserAction(save)}
            />
          </div>
        )
      }
      idPrefix="automation"
      meta={meta}
      name={form.name.trim() || t("AutomationRules.builder.titleNew")}
      notices={hasNotices ? notices : undefined}
      panel={<AutomationRulePanel replayMatched={replay?.matched ?? true} steps={steps} store={store} />}
      panelLabel={t("Automations.builder.panesLabel")}
      sheetOpen={store.expanded !== null}
      store={store}
      title={title}
    />
  );
});
