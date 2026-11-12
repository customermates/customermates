"use client";

import { History, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { AutomationBuilderModel } from "@/features/automation-rules/automation-builder-model";
import type { AutomationDraft } from "@/features/automation-rules/automation-draft";
import type { AutomationRuleDto } from "@/features/automation-rules/automation-rule.schema";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { TopBarPrimaryButton } from "@/components/shared/top-bar-action-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { browserTimeZone } from "@/core/utils/time-zone";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { emptyDraft, fieldOfList, listOf, reminderDraft, ruleToDraft } from "@/features/automation-rules/automation-draft";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

import { deleteAutomationRuleAction, setAutomationRuleEnabledAction } from "../actions";
import { AutomationBuilder } from "./automation-builder";
import { AutomationRunHistory } from "./automation-run-history";

export type AutomationsPrefill =
  | { kind: "new"; typeId: string }
  | { kind: "remind"; typeId: string; fieldId: string }
  | null;

type Props = { initialRules: AutomationRuleDto[]; model: AutomationBuilderModel; prefill: AutomationsPrefill };

const STATUS_VARIANT = {
  queued: "secondary",
  running: "info",
  applied: "success",
  skipped: "warning",
  failed: "destructive",
} as const;

const AutomationsViewContent = ({ initialRules, model, prefill }: Props) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { showConfirmation } = useDeleteConfirmation();
  const [rules, setRules] = useState(initialRules);
  const [draft, setDraft] = useState<AutomationDraft | null>(() => {
    if (!prefill || !listOf(model, prefill.typeId)) return null;
    const timezone = browserTimeZone();
    return prefill.kind === "remind"
      ? reminderDraft(model, { typeId: prefill.typeId, fieldId: prefill.fieldId, timezone })
      : emptyDraft(model, { typeId: prefill.typeId, timezone });
  });
  const [history, setHistory] = useState<AutomationRuleDto | null>(null);
  const [pending, startTransition] = useTransition();

  const create = useCallback(() => setDraft(emptyDraft(model, { timezone: browserTimeZone() })), [model]);
  const topBar = useMemo(
    () => <TopBarPrimaryButton label={t("AutomationRules.new")} onClick={create} />,
    [create, t],
  );
  useSetTopBarActions(topBar);

  const replace = (rule: AutomationRuleDto) =>
    setRules((current) =>
      current.some((item) => item.id === rule.id)
        ? current.map((item) => (item.id === rule.id ? rule : item))
        : [rule, ...current],
    );

  const toggle = (rule: AutomationRuleDto, enabled: boolean) =>
    startTransition(async () => {
      const result = await setAutomationRuleEnabledAction({ id: rule.id, enabled });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      replace(result.data as AutomationRuleDto);
    });

  const remove = (rule: AutomationRuleDto) =>
    showConfirmation({
      title: t("AutomationRules.deleteTitle"),
      message: t("AutomationRules.deleteMessage", { name: rule.name }),
      confirmLabel: t("Common.actions.delete"),
      confirmVariant: "destructive",
      successKey: "Common.notifications.deleted",
      onConfirm: async () => {
        const result = await deleteAutomationRuleAction({ id: rule.id });
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return false;
        }
        setRules((current) => current.filter((item) => item.id !== rule.id));
        return true;
      },
    });

  const summary = (rule: AutomationRuleDto) => {
    const { trigger } = rule;
    const typeId = "typeId" in trigger && trigger.typeId ? trigger.typeId : "";
    const list = typeId ? (listOf(model, typeId)?.label ?? "") : "";
    const field = "fieldId" in trigger ? (fieldOfList(model, typeId, trigger.fieldId)?.label ?? "") : "";
    return t(`AutomationRules.summary.${trigger.kind}`, {
      list,
      field,
      days: trigger.kind === "dateReached" ? trigger.days : 0,
      direction: trigger.kind === "dateReached" ? trigger.direction : "before",
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t("AutomationRules.title")}</h1>

        <p className="text-sm text-muted-foreground">{t("AutomationRules.subtitle")}</p>
      </div>

      {rules.length === 0 ? (
        <AppCard>
          <AppCardBody className="items-start">
            <h2 className="text-base font-semibold">{t("AutomationRules.emptyTitle")}</h2>

            <p className="text-sm text-muted-foreground">{t("AutomationRules.emptyBody")}</p>

            <Button onClick={create}>
              <Plus aria-hidden="true" className="size-4" />

              {t("AutomationRules.new")}
            </Button>
          </AppCardBody>
        </AppCard>
      ) : (
        <ul className="flex flex-col gap-3">
          {rules.map((rule) => (
            <li key={rule.id}>
              <AppCard>
                <AppCardBody className="gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <h2 className="truncate text-base font-semibold">{rule.name}</h2>

                      <p className="text-sm text-muted-foreground">{summary(rule)}</p>

                      <p className="text-xs text-muted-foreground">
                        {rule.effects.map((effect) => t(`AutomationRules.effect.${effect.kind}`)).join(", ")}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {rule.lastRunStatus && (
                        <Badge variant={STATUS_VARIANT[rule.lastRunStatus]}>
                          {t(`AutomationRules.status.${rule.lastRunStatus}`)}
                        </Badge>
                      )}

                      <Switch
                        aria-label={t("AutomationRules.active", { name: rule.name })}
                        checked={rule.enabled}
                        disabled={pending}
                        onCheckedChange={(enabled) => toggle(rule, enabled)}
                      />
                    </div>
                  </div>

                  {rule.disabledReason && !rule.enabled && (
                    <p className="text-xs text-warning-soft-foreground">
                      {t(`AutomationRules.disabledReason.${rule.disabledReason}`)}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {rule.lastRunAt
                        ? t("AutomationRules.lastRun", { time: intlStore.formatRelativeTime(new Date(rule.lastRunAt)) })
                        : t("AutomationRules.neverRun")}
                    </span>

                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDraft(ruleToDraft(rule, model, browserTimeZone()))}>
                        <Pencil aria-hidden="true" className="size-4" />

                        {t("AutomationRules.edit")}
                      </Button>

                      <Button size="sm" variant="ghost" onClick={() => setHistory(rule)}>
                        <History aria-hidden="true" className="size-4" />

                        {t("AutomationRules.history.open")}
                      </Button>

                      <Button
                        aria-label={t("Common.actions.delete")}
                        size="icon"
                        variant="ghostDestructive"
                        onClick={() => remove(rule)}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  </div>
                </AppCardBody>
              </AppCard>
            </li>
          ))}
        </ul>
      )}

      <AutomationBuilder
        draft={draft}
        model={model}
        onClose={() => setDraft(null)}
        onSaved={(rule) => {
          replace(rule);
          setDraft(null);
          toast.dismiss();
        }}
      />

      <AutomationRunHistory rule={history} onClose={() => setHistory(null)} />
    </div>
  );
};

export const AutomationsView = serverRenderedClient(AutomationsViewContent);
