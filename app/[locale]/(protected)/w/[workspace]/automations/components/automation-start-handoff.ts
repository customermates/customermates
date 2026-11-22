import type { AutomationBuilderContext } from "./automation-builder.store";
import type { AutomationDraft } from "./automation-draft";

import { blankAgentEffect, emptyChainDraft } from "./automation-draft";

export function agentPromptOf(draft: AutomationDraft): string | undefined {
  for (const effect of draft.effects) if (effect.kind === "agent" && effect.prompt.trim()) return effect.prompt;

  return undefined;
}

export function draftWithAgentStep(
  context: AutomationBuilderContext,
  seed: { name: string; prompt: string },
): AutomationDraft {
  const draft = emptyChainDraft(context.model, { timezone: context.timezone });
  return {
    ...draft,
    name: seed.name,
    effects: [{ ...blankAgentEffect(), prompt: seed.prompt }],
  };
}
