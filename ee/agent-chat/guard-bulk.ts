import type { ClassifierResult, ClassifierSpec, ClassifierState } from "./classifier";
import type { AmbiguousTarget } from "./agent-ambiguous-target";

import { agentContextFromProviderText } from "./agent-context";

export const GUARD_BULK_MESSAGE_CHARS = 2_000;
export const GUARD_BULK_PREVIOUS_CHARS = 1_000;
export const GUARD_BULK_TIMEOUT_MS = 800;

export function guardBulkSpec(): ClassifierSpec {
  return {
    id: "guard-bulk",
    questions: [
      {
        id: "covers_every_candidate",
        type: "boolean",
        instruction:
          "`latest_user_message` mentions `phrase`, and every record in `candidates` (records of type `entity`) matches that phrase. Does the user ask for the same change to every one of these records?",
        criteria: {
          true: "The user clearly means all of these records.",
          false:
            "The user means one particular record, names or excludes some of them, selects them by a rule that may leave some out, or it is unclear.",
        },
      },
    ],
  };
}

export function guardBulkState(args: {
  latestUserMessage: string;
  previousAssistantMessage?: string | null;
  target: AmbiguousTarget;
}): ClassifierState {
  const latest = agentContextFromProviderText(args.latestUserMessage).body.trim().slice(0, GUARD_BULK_MESSAGE_CHARS);
  const previous = args.previousAssistantMessage?.trim().slice(0, GUARD_BULK_PREVIOUS_CHARS) ?? "";
  return {
    latest_user_message: latest,
    ...(previous ? { previous_assistant_message: previous } : {}),
    entity: args.target.entity,
    phrase: args.target.phrase,
    candidates: args.target.candidates.map((candidate) => candidate.name),
  };
}

export function guardBulkProbability(result: ClassifierResult | null): number | null {
  const answer = result?.answers.covers_every_candidate;
  return answer?.type === "boolean" ? answer.probability : null;
}
