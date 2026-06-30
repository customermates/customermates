import type { ToolSet } from "ai";

import { tool } from "ai";
import { z } from "zod";

/**
 * Client-executed UI tools (declared schema-only, no server `execute`): the model
 * call is streamed to the browser, the chat drawer runs the action (highlight /
 * tour / navigate) and returns the result via addToolResult. Safe tier only —
 * navigate/scroll/highlight/tour have no real-world side effects.
 */
export const UI_TOOL_NAMES = ["list_ui_targets", "navigate", "scroll_to", "highlight_element", "start_tour"] as const;
export type UiToolName = (typeof UI_TOOL_NAMES)[number];

export function isUiTool(name: string): name is UiToolName {
  return (UI_TOOL_NAMES as readonly string[]).includes(name);
}

export const TourStepSchema = z.object({
  targetId: z.string().min(1).describe("A target id from list_ui_targets"),
  title: z.string().min(1).describe("Short step heading"),
  body: z.string().min(1).describe("1-2 sentence explanation of this component"),
});
export type TourStep = z.infer<typeof TourStepSchema>;

export const NavigateInputSchema = z.object({ route: z.string().min(1).describe("App path, e.g. /contacts") });
export const ScrollToInputSchema = z.object({ targetId: z.string().min(1) });
export const HighlightInputSchema = z.object({
  targetId: z.string().min(1),
  message: z.string().optional().describe("Short note shown in the spotlight tooltip"),
});
export const StartTourInputSchema = z.object({ steps: z.array(TourStepSchema).min(1).max(12) });

export const uiTools: ToolSet = {
  list_ui_targets: tool({
    description:
      "List the UI components on the current page the assistant can point at. Returns { id, description, route } " +
      "for each. Call this first to get valid targetIds before highlight_element or start_tour.",
    inputSchema: z.object({}),
  }),
  navigate: tool({
    description:
      "Navigate the user to an app route (e.g. a target's route) — use before highlighting components that live on " +
      "another page.",
    inputSchema: NavigateInputSchema,
  }),
  scroll_to: tool({
    description: "Scroll a UI target smoothly into view.",
    inputSchema: ScrollToInputSchema,
  }),
  highlight_element: tool({
    description: "Spotlight a single UI target, with an optional short message in the tooltip.",
    inputSchema: HighlightInputSchema,
  }),
  start_tour: tool({
    description:
      "Run a step-by-step guided tour that spotlights UI targets in order; the user advances with Next/Done. " +
      "Use targetIds from list_ui_targets, and call navigate first if the targets are on another page.",
    inputSchema: StartTourInputSchema,
  }),
};
