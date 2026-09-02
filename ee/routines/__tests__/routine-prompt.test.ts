import { describe, expect, it } from "vitest";

import { composeRoutinePrompt, stripRoutineTriggerBlock } from "@/ee/routines/routine-prompt";

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

describe("routine trigger block stripping", () => {
  it.each([
    ["an event with an entity", { routineName: "R", triggerEvent: "deal.updated", triggerEntityId: "abc-123" }],
    ["an event without an entity", { routineName: "R", triggerEvent: "contact.created", triggerEntityId: null }],
  ])("round-trips back to the author's instructions for %s", (_label, context) => {
    const prompt = "Read the record and reply with one sentence.";

    expect(stripRoutineTriggerBlock(composeRoutinePrompt(prompt, context))).toBe(prompt);
  });

  it("leaves an ordinary message alone", () => {
    expect(stripRoutineTriggerBlock("How many contacts do we have?")).toBe("How many contacts do we have?");
  });

  it("only strips a leading block, so a quoted one in a question survives", () => {
    const asked = 'What does <routine_trigger event="deal.updated" /> mean?';

    expect(stripRoutineTriggerBlock(asked)).toBe(asked);
  });

  it("keeps instructions that themselves start with a tag-like line", () => {
    const prompt = "<b>Bold</b> start\nthen more";

    expect(stripRoutineTriggerBlock(prompt)).toBe(prompt);
  });
});
