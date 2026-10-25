import type { SolutionId } from "@/core/solutions/solution-catalog";
import type { SetupAnswers } from "./setup-answers.schema";

import { SETUP_STEP_FLOWS } from "./setup-interview";

export const SETUP_STEP_SUGGESTIONS = [...SETUP_STEP_FLOWS, "dealsClients"] as const;
export type SetupStepSuggestion = (typeof SETUP_STEP_SUGGESTIONS)[number];

function choice(answers: SetupAnswers, part: string): string | null {
  const value = answers[part]?.value;
  return value?.format === "singleChoice" ? value.value : null;
}

function tracked(answers: SetupAnswers): string[] {
  const value = answers.purpose?.value;
  return value?.format === "multipleChoice" ? value.values : [];
}

export function setupStepSuggestion(answers: SetupAnswers): SetupStepSuggestion | null {
  const chosen = tracked(answers);
  const flow = SETUP_STEP_FLOWS.find((candidate) => chosen.includes(candidate));
  if (!flow) return null;
  return flow === "deals" && choice(answers, "workWith") === "clients" ? "dealsClients" : flow;
}

export function closestSetupSolution(answers: SetupAnswers): SolutionId | null {
  const workWith = choice(answers, "workWith");
  const chosen = new Set(tracked(answers));
  const solo = choice(answers, "teamSize") === "solo";
  if (chosen.has("investors")) return "startups";
  if (workWith === "ownWork") return null;
  if (chosen.has("chats")) return workWith === "clients" ? "linkedin-crm" : "whatsapp-crm";
  if (chosen.has("contracts")) return "client-management";
  if (workWith === "clients") {
    if (solo) return "freelancers";
    return chosen.has("projects") ? "agencies" : "consultants";
  }
  if (workWith === "customers") return chosen.has("deals") && !solo ? "sales-pipeline" : "smb";
  return null;
}
