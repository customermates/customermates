"use client";

import type { AutomationCanvasStep } from "@/components/automations/canvas/automation-canvas-types";
import type { AutomationBuilderStore } from "./automation-builder.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AutomationReplaySummary } from "@/components/automations/canvas/automation-replay-summary";
import { AutomationStepPanel } from "@/components/automations/canvas/automation-step-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl, SegmentedControlPanel } from "@/components/ui/segmented-control";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { AUTOMATION_RULE_NAME_MAX_CHARS } from "@/features/automation-rules/automation-rule.schema";
import { IntlLink } from "@/i18n/navigation";

import { effectDetailText, runErrorText, runReasonText } from "./automation-run-texts";
import { AutomationRuleStepEditor } from "./automation-rule-step-editor";
import { AutomationRunsPane } from "./automation-runs-pane";

const REPLAY_VARIANT = {
  applied: "success",
  failed: "destructive",
  skipped: "secondary",
  queued: "info",
  running: "info",
} as const;

export const AutomationRulePanel = observer(function AutomationRulePanel({
  store,
  steps,
  replayMatched,
}: {
  store: AutomationBuilderStore;
  steps: readonly AutomationCanvasStep[];
  replayMatched: boolean;
}) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { form, replay } = store;
  const readOnly = store.isReadOnly;
  const selected = steps.find((step) => step.id === store.expanded) ?? null;

  if (selected) {
    return (
      <AutomationStepPanel readOnly={readOnly} step={selected} onClose={() => store.select(null)}>
        <AutomationRuleStepEditor stepId={selected.id} store={store} />
      </AutomationStepPanel>
    );
  }

  if (replay) {
    const failedEffect = replay.effects.find((effect) => effect.status === "failed");
    const failure = replay.error
      ? runErrorText(t, replay.error)
      : failedEffect?.detail
        ? effectDetailText(t, failedEffect.detail)
        : replay.reason
          ? runReasonText(t, replay.reason)
          : null;
    return (
      <AutomationReplaySummary
        failure={replay.status === "failed" ? failure : null}
        note={
          [replay.status === "failed" ? null : failure, replayMatched ? null : t("Automations.canvas.replay.changed")]
            .filter(Boolean)
            .join(" ") || null
        }
        status={{ label: t(`AutomationRules.status.${replay.status}`), variant: REPLAY_VARIANT[replay.status] }}
        steps={steps}
        when={intlStore.formatRelativeTime(new Date(replay.createdAt))}
      >
        {replay.typeId && replay.recordId && (
          <IntlLink className="text-sm underline" href={`/records/${replay.typeId}/${replay.recordId}`}>
            {t("AutomationRules.history.record")}
          </IntlLink>
        )}
      </AutomationReplaySummary>
    );
  }

  return (
    <SegmentedControl
      className="flex min-w-0 flex-col gap-3 p-4"
      idPrefix="automation-pane"
      items={[
        { value: "runs", label: t("Automations.builder.runsTab") },
        { value: "settings", label: t("Automations.canvas.settingsTab") },
      ]}
      label={t("Automations.builder.panesLabel")}
      value={store.pane}
      onValueChange={store.setPane}
    >
      <SegmentedControlPanel className="mt-0" value="runs">
        <AutomationRunsPane name={form.name} ruleId={form.id} onShowRun={store.showRun} />
      </SegmentedControlPanel>

      <SegmentedControlPanel className="mt-0" value="settings">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor="automation-name">
            {t("AutomationRules.builder.name")}
          </Label>

          <Input
            aria-invalid={store.isFlagged("name") || undefined}
            id="automation-name"
            maxLength={AUTOMATION_RULE_NAME_MAX_CHARS}
            placeholder={t("AutomationRules.builder.namePlaceholder")}
            readOnly={readOnly}
            value={form.name}
            onChange={(event) => store.setName(event.target.value)}
          />
        </div>
      </SegmentedControlPanel>
    </SegmentedControl>
  );
});
