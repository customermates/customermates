"use client";

import type { AutomationBuilderStore } from "./automation-builder.store";

import { observer } from "mobx-react-lite";

import { AutomationStartSwitch } from "@/components/automations/automation-start-switch";

import { AutomationConditionFields } from "./automation-condition-fields";
import { AutomationEffectFields } from "./automation-effect-fields";
import { AutomationPreviewPane } from "./automation-preview-pane";
import { AutomationTriggerEditor } from "./automation-trigger-editor";

export const AutomationRuleStepEditor = observer(function AutomationRuleStepEditor({
  store,
  stepId,
}: {
  store: AutomationBuilderStore;
  stepId: string;
}) {
  const { form, model, context } = store;
  if (!model || !context) return null;

  if (stepId === "trigger") {
    return (
      <>
        <AutomationStartSwitch
          disabled={{ schedule: !store.canSwitchToSchedule }}
          value="event"
          onChange={store.switchToSchedule}
        />

        <AutomationTriggerEditor
          flagged={store.isFlagged}
          model={model}
          trigger={form.trigger}
          unavailable={store.unavailableAt("trigger")}
          onChange={store.patchTrigger}
        />

        <div className="rounded-lg border bg-muted/30 p-3">
          <AutomationPreviewPane store={store} />
        </div>
      </>
    );
  }

  const [kind, position] = stepId.split("-");
  const index = Number(position);

  if (kind === "condition") {
    const condition = form.conditions[index];
    if (!condition) return null;
    return (
      <AutomationConditionFields
        condition={condition}
        flagged={store.isFlagged(`conditions.${index}`)}
        model={model}
        typeId={form.trigger.typeId}
        unavailable={store.unavailableAt(`conditions.${index}`)}
        onChange={(patch) => store.patchCondition(index, patch)}
      />
    );
  }

  const effect = form.effects[index];
  if (kind !== "effect" || !effect) return null;
  return (
    <AutomationEffectFields
      canOpenAgentSettings={store.canOpenAgentSettings}
      effect={effect}
      flagged={store.isFlagged(`effects.${index}`)}
      model={model}
      ownRule={store.isOwner}
      runtimes={context.runtimes}
      trigger={form.trigger}
      unavailable={store.unavailableAt(`effects.${index}`)}
      webhooks={context.webhooks}
      onChange={(next) => store.setEffect(index, next)}
    />
  );
});
