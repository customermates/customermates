import type { SetupAnswers } from "./setup-answers.schema";

import { SETUP_PREFILL_CONFIDENCE, setupPart } from "./setup-interview";

export function mergeWebsitePrefill(
  answers: SetupAnswers,
  draft: SetupAnswers,
  threshold: number = SETUP_PREFILL_CONFIDENCE,
): SetupAnswers {
  const merged: SetupAnswers = { ...answers };
  for (const [id, answer] of Object.entries(draft)) {
    if (!answer || answer.source !== "website" || answer.confidence < threshold) continue;
    if (setupPart(id)?.prefill === "no") continue;
    if (merged[id]?.source === "user") continue;
    merged[id] = answer;
  }
  return merged;
}

export function touchAnswer(
  answers: SetupAnswers,
  id: keyof SetupAnswers,
  value: NonNullable<SetupAnswers[keyof SetupAnswers]>["value"],
): SetupAnswers {
  return { ...answers, [id]: { source: "user", confidence: 1, value } };
}
