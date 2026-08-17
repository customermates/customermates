import { z } from "zod";

import type { Data } from "@/core/validation/validation.utils";

import { sanitizeAgentVisibleText } from "./agent-output-safety";
import { findAgentUiTarget, UiTargetIdSchema } from "./ui-targets";

export const AGENT_TOUR_MIN_STEPS = 2;
export const AGENT_TOUR_MAX_STEPS = 20;
export const AGENT_TOUR_NOTE_MAX_CHARS = 400;

export const AgentTourStepSchema = z.object({
  targetId: UiTargetIdSchema,
  note: z.string().trim().min(1).max(AGENT_TOUR_NOTE_MAX_CHARS),
});

export const AgentTourSchema = z.object({
  steps: z.array(AgentTourStepSchema).min(AGENT_TOUR_MIN_STEPS).max(AGENT_TOUR_MAX_STEPS),
});

export type AgentTourStepData = Data<typeof AgentTourStepSchema>;

export type AgentGuidedTourStep = {
  targetId: string;
  route: string | null;
  note: string;
};

export function agentGuidedTour(steps: readonly AgentTourStepData[]): AgentGuidedTourStep[] {
  return steps.flatMap((step) => {
    const target = findAgentUiTarget(step.targetId);
    const note = sanitizeAgentVisibleText(step.note).trim();
    if (!target || !note) return [];

    return [
      {
        targetId: step.targetId,
        route: target.route.startsWith("/") ? target.route : null,
        note,
      },
    ];
  });
}
