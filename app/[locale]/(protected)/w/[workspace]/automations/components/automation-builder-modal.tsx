"use client";

import type { AutomationRecipe } from "@/features/automation-rules/recipes";
import type { AutomationBuilderStore } from "./automation-builder.store";

import { Sparkles } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppModal } from "@/components/modal/app-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl, SegmentedControlPanel } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { AUTOMATION_RULE_NAME_MAX_CHARS } from "@/features/automation-rules/automation-rule.schema";

import { AutomationCardChain } from "./automation-card-chain";
import { dismissAutomationError, showAutomationError } from "./automation-error-toast";
import { AutomationPreviewPane } from "./automation-preview-pane";
import { AutomationRunsPane } from "./automation-runs-pane";
import { AutomationStartScreen } from "./automation-start-screen";

type Props = {
  store: AutomationBuilderStore;
  onRoutineRecipe: (recipe: AutomationRecipe, text: { title: string; prompt: string }) => void;
};

export const AutomationBuilderModal = observer(function AutomationBuilderModal({ store, onRoutineRecipe }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { form } = store;
  const starting = store.screen === "start";

  const save = async () => {
    dismissAutomationError();
    const outcome = await store.save();
    if (outcome === "incomplete") showAutomationError(t("AutomationRules.builder.incomplete"));
    if (outcome === "saved") toast.success(t("Common.notifications.updated"));
  };

  const disabledReason = store.rule?.disabledReason;

  return (
    <AppModal
      description={form.name.trim() || undefined}
      size="5xl"
      store={store}
      title={store.isExisting ? t("AutomationRules.builder.titleEdit") : t("AutomationRules.builder.titleNew")}
    >
      <AppCard>
        <AppCardBody className="gap-6">
          {starting ? (
            <AutomationStartScreen store={store} onRoutineRecipe={onRoutineRecipe} />
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex min-w-48 flex-1 flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground" htmlFor="automation-name">
                    {t("AutomationRules.builder.name")}
                  </Label>

                  <Input
                    aria-invalid={store.isFlagged("name") || undefined}
                    id="automation-name"
                    maxLength={AUTOMATION_RULE_NAME_MAX_CHARS}
                    placeholder={t("AutomationRules.builder.namePlaceholder")}
                    value={form.name}
                    onChange={(event) => store.setName(event.target.value)}
                  />
                </div>

                <div className="flex items-center gap-2 pb-2">
                  <Switch checked={form.enabled} id="automation-active" onCheckedChange={store.setEnabled} />

                  <Label htmlFor="automation-active">
                    {form.enabled ? t("Automations.builder.active") : t("Automations.builder.paused")}
                  </Label>
                </div>
              </div>

              {store.rule && (
                <p className="text-xs text-muted-foreground">
                  {store.rule.lastRunAt
                    ? t("AutomationRules.lastRun", {
                        time: intlStore.formatRelativeTime(new Date(store.rule.lastRunAt)),
                      })
                    : t("AutomationRules.neverRun")}
                </p>
              )}

              {!form.enabled && disabledReason && (
                <p className="text-xs text-warning-soft-foreground" data-automation-paused-reason={disabledReason}>
                  {t(`AutomationRules.disabledReason.${disabledReason}`)}
                </p>
              )}

              {store.composedByMate && (
                <p className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm" role="status">
                  <Sparkles aria-hidden="true" className="size-4 shrink-0" />

                  {t("Automations.builder.composedNotice")}
                </p>
              )}

              <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
                <div className="min-w-0">
                  <AutomationCardChain store={store} />
                </div>

                <SegmentedControl
                  className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3"
                  idPrefix="automation-pane"
                  items={[
                    { value: "preview", label: t("Automations.builder.previewTab") },
                    { value: "runs", label: t("Automations.builder.runsTab") },
                  ]}
                  label={t("Automations.builder.panesLabel")}
                  value={store.pane}
                  onValueChange={store.setPane}
                >
                  <SegmentedControlPanel className="mt-0" value="preview">
                    <AutomationPreviewPane store={store} />
                  </SegmentedControlPanel>

                  <SegmentedControlPanel className="mt-0" value="runs">
                    <AutomationRunsPane name={form.name} ruleId={form.id} />
                  </SegmentedControlPanel>
                </SegmentedControl>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" onClick={store.close}>
                  {t("Common.actions.cancel")}
                </Button>

                <Button
                  data-automation-save=""
                  disabled={store.isLoading}
                  type="button"
                  onClick={() => runUserAction(save)}
                >
                  {!store.isExisting && form.enabled ? t("Automations.builder.switchOn") : t("Common.actions.save")}
                </Button>
              </div>
            </>
          )}
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
