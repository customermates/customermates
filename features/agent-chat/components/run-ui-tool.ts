import type { AgentUiControlStore } from "./ui-control.store";

import { findAgentTargetElement, listAgentTargets } from "../ui-targets";
import {
  HighlightInputSchema,
  NavigateInputSchema,
  ScrollToInputSchema,
  StartTourInputSchema,
  type UiToolName,
} from "../ui-tools";

export type RunUiToolContext = {
  ui: AgentUiControlStore;
  navigate: (route: string) => void;
};

/**
 * Executes a client UI tool call in the browser and returns a short result the
 * agent reads back. The chat panel is non-modal, so highlights and tours run
 * alongside it without closing it.
 */
export function runUiToolClient(name: UiToolName, input: unknown, ctx: RunUiToolContext): string {
  switch (name) {
    case "list_ui_targets": {
      const targets = listAgentTargets();
      return targets.length > 0
        ? JSON.stringify(targets)
        : "No highlightable UI targets are registered on the current page.";
    }

    case "navigate": {
      const { route } = NavigateInputSchema.parse(input);
      ctx.navigate(route);
      return `Navigated to ${route}.`;
    }

    case "scroll_to": {
      const { targetId } = ScrollToInputSchema.parse(input);
      return ctx.ui.scrollTo(targetId)
        ? `Scrolled ${targetId} into view.`
        : `Target "${targetId}" is not on the current page — use list_ui_targets or navigate first.`;
    }

    case "highlight_element": {
      const { targetId, message } = HighlightInputSchema.parse(input);
      if (!findAgentTargetElement(targetId))
        return `Target "${targetId}" is not on the current page — use list_ui_targets or navigate first.`;

      ctx.ui.highlight(targetId, message);
      return `Highlighted ${targetId}.`;
    }

    case "start_tour": {
      const { steps } = StartTourInputSchema.parse(input);
      const present = steps.filter((step) => findAgentTargetElement(step.targetId));
      if (present.length === 0)
        return "None of the tour's targets are on the current page — navigate there first or use list_ui_targets.";

      ctx.ui.startTour(present);
      return `Started a ${present.length}-step guided tour.`;
    }

    default:
      return `Unknown UI tool: ${name as string}`;
  }
}
