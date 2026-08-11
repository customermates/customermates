import { describe, expect, it } from "vitest";

import { EntityDrawerLoadGate } from "../entity-drawer-load-gate";

describe("EntityDrawerLoadGate", () => {
  it("rejects an older retry after a newer entity has completed", () => {
    const gate = new EntityDrawerLoadGate();
    const retryA = gate.begin("contact:A");
    const loadB = gate.begin("contact:B");

    expect(gate.isCurrent(loadB, "contact:B")).toBe(true);
    expect(gate.isCurrent(retryA, "contact:A")).toBe(false);
  });

  it("rejects a pending attempt after the drawer closes", () => {
    const gate = new EntityDrawerLoadGate();
    const attempt = gate.begin("contact:A");

    gate.cancel();

    expect(gate.isCurrent(attempt, "contact:A")).toBe(false);
  });
});
