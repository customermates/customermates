import { describe, expect, it } from "vitest";

import { composeRoutinePrompt } from "@/ee/routines/routine-prompt";

describe("routine prompt composition", () => {
  it("sends a scheduled routine's instructions unchanged", () => {
    expect(composeRoutinePrompt("Summarise yesterday", { routineName: "Digest" })).toBe("Summarise yesterday");
  });

  it("prefixes an event trigger with the event and entity", () => {
    expect(
      composeRoutinePrompt("Check the deal", {
        routineName: "Deal watch",
        triggerEvent: "deal.updated",
        triggerEntityId: "deal-1",
      }),
    ).toBe('<routine_trigger event="deal.updated" entityId="deal-1" />\nCheck the deal');
  });

  it("omits the entity when the event carries none", () => {
    expect(composeRoutinePrompt("Look", { routineName: "R", triggerEvent: "contact.created" })).toBe(
      '<routine_trigger event="contact.created" />\nLook',
    );
  });
});
