import type { AutomationRunMark } from "@/components/automations/canvas/automation-canvas-types";
import type { AutomationRuleRunDto } from "@/features/automation-rules/automation-rule.schema";
import type { AutomationDraft } from "./automation-draft";

import { effectKindOf } from "./automation-canvas-steps";

export type RuleRunReplay = {
  marks: Record<string, AutomationRunMark>;
  matched: boolean;
};

const OUTCOME_MARK: Record<AutomationRuleRunDto["effects"][number]["status"], AutomationRunMark> = {
  applied: "ok",
  failed: "failed",
  skipped: "skipped",
};

export function ruleRunReplay(run: AutomationRuleRunDto, draft: AutomationDraft): RuleRunReplay {
  const marks: Record<string, AutomationRunMark> = { trigger: "ok" };
  if (run.status === "queued" || run.status === "running") return { marks, matched: true };

  const markAll = (prefix: "condition" | "effect", count: number, mark: AutomationRunMark) => {
    for (let index = 0; index < count; index += 1) marks[`${prefix}-${index}`] = mark;
  };

  if (run.effects.length === 0) {
    markAll("condition", draft.conditions.length, "skipped");
    markAll("effect", draft.effects.length, "skipped");
    return { marks, matched: true };
  }

  markAll("condition", draft.conditions.length, "ok");
  let matched = run.effects.length <= draft.effects.length;
  draft.effects.forEach((effect, index) => {
    const outcome = run.effects[index];
    if (!outcome) {
      if (run.status === "failed") marks[`effect-${index}`] = "skipped";
      return;
    }
    if (outcome.kind !== effectKindOf(effect)) {
      matched = false;
      return;
    }
    marks[`effect-${index}`] = OUTCOME_MARK[outcome.status];
  });
  return { marks, matched };
}
