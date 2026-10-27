import type { SetupAnswers } from "../setup-answers.schema";

import { describe, expect, it } from "vitest";

import { closestSetupSolution, setupStepSuggestion } from "../setup-solution-match";

function answers(workWith: string | null, tracked: string[], teamSize?: string): SetupAnswers {
  return {
    ...(workWith
      ? {
          workWith: {
            source: "user",
            confidence: 1,
            value: { format: "singleChoice", value: workWith },
          },
        }
      : {}),
    purpose: {
      source: "user",
      confidence: 1,
      value: { format: "multipleChoice", values: tracked, custom: [] },
    },
    ...(teamSize
      ? {
          teamSize: {
            source: "user",
            confidence: 1,
            value: { format: "singleChoice", value: teamSize },
          },
        }
      : {}),
  };
}

describe("closest setup solution", () => {
  it.each([
    [answers("customers", ["deals"]), "sales-pipeline"],
    [answers("customers", ["deals"], "solo"), "smb"],
    [answers("customers", ["orders"]), "smb"],
    [answers("customers", ["chats", "deals"]), "whatsapp-crm"],
    [answers("clients", ["chats"]), "linkedin-crm"],
    [answers("clients", ["contracts"]), "client-management"],
    [answers("clients", ["deals", "projects"]), "agencies"],
    [answers("clients", ["deals"]), "consultants"],
    [answers("clients", ["projects"], "solo"), "freelancers"],
    [answers("customers", ["investors", "deals"]), "startups"],
    [answers("ownWork", ["hiring"]), null],
    [answers(null, ["finances"]), null],
  ])("picks the closest demo workspace", (given, expected) => {
    expect(closestSetupSolution(given)).toBe(expected);
  });
});

describe("setup step suggestion", () => {
  it("suggests the steps of the first tracked work that moves through steps", () => {
    expect(setupStepSuggestion(answers("customers", ["chats", "projects", "deals"]))).toBe("deals");
    expect(setupStepSuggestion(answers("clients", ["deals"]))).toBe("dealsClients");
    expect(setupStepSuggestion(answers("ownWork", ["finances", "hiring"]))).toBe("hiring");
    expect(setupStepSuggestion(answers("ownWork", ["chats", "finances"]))).toBeNull();
  });
});
