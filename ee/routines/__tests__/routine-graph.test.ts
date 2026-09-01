import { describe, expect, it } from "vitest";

import { detectRoutineLoops, type RoutineGraphNode } from "@/ee/routines/routine-graph";

function node(overrides: Partial<RoutineGraphNode> & { id: string }): RoutineGraphNode {
  return { name: overrides.id, triggerEvents: [], writes: [], ...overrides };
}

describe("routine loop detection", () => {
  it("finds a routine that writes what it listens to", () => {
    const loops = detectRoutineLoops([
      node({ id: "a", triggerEvents: ["organization.updated"], writes: ["organizations"] }),
    ]);

    expect(loops).toEqual([{ kind: "selfLoop", routineId: "a", event: "organization.updated" }]);
  });

  it("leaves a routine that writes a different record type alone", () => {
    const loops = detectRoutineLoops([node({ id: "a", triggerEvents: ["deal.updated"], writes: ["tasks"] })]);

    expect(loops).toEqual([]);
  });

  it("finds two routines that trigger each other", () => {
    const loops = detectRoutineLoops([
      node({ id: "a", triggerEvents: ["deal.updated"], writes: ["contacts"] }),
      node({ id: "b", triggerEvents: ["contact.updated"], writes: ["deals"] }),
    ]);

    expect(loops).toHaveLength(1);
    expect(loops[0]).toMatchObject({ kind: "mutualLoop" });
  });

  it("reports a mutual loop once rather than from both ends", () => {
    const loops = detectRoutineLoops([
      node({ id: "a", triggerEvents: ["deal.updated"], writes: ["contacts"] }),
      node({ id: "b", triggerEvents: ["contact.updated"], writes: ["deals"] }),
    ]);

    expect(loops.filter((loop) => loop.kind === "mutualLoop")).toHaveLength(1);
  });

  it("does not treat a one-way chain as a loop", () => {
    const loops = detectRoutineLoops([
      node({ id: "a", triggerEvents: ["deal.updated"], writes: ["contacts"] }),
      node({ id: "b", triggerEvents: ["contact.updated"], writes: ["tasks"] }),
    ]);

    expect(loops).toEqual([]);
  });

  it("ignores a routine with no predicted writes", () => {
    expect(detectRoutineLoops([node({ id: "a", triggerEvents: ["contact.updated"], writes: [] })])).toEqual([]);
  });

  it("reports both a self loop and a mutual loop when both exist", () => {
    const loops = detectRoutineLoops([
      node({ id: "a", triggerEvents: ["contact.updated"], writes: ["contacts", "deals"] }),
      node({ id: "b", triggerEvents: ["deal.updated"], writes: ["contacts"] }),
    ]);

    expect(loops.map((loop) => loop.kind).sort()).toEqual(["mutualLoop", "selfLoop"]);
  });
});
