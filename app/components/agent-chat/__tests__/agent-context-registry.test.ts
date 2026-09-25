import type { AgentContextAttachment } from "@/ee/agent-chat/agent-context";

import { autorun } from "mobx";
import { describe, expect, it } from "vitest";

import { AgentContextRegistry } from "../agent-context-registry";

function record(label: string, recordId: string): AgentContextAttachment {
  return {
    reference: { kind: "record", entityType: "contact", recordId },
    label,
  };
}

describe("AgentContextRegistry", () => {
  it("only returns registrations for the active pathname", () => {
    const registry = new AgentContextRegistry();
    registry.register("/en/contacts", () => [{ context: record("Ada", "10000000-0000-4000-8000-000000000001") }]);
    registry.register("/en/organizations", () => [{ context: record("Acme", "10000000-0000-4000-8000-000000000002") }]);

    expect(registry.candidates("/en/contacts?view=__all__").map((candidate) => candidate.context.label)).toEqual([
      "Ada",
    ]);
    expect(registry.candidates("/en/organizations/").map((candidate) => candidate.context.label)).toEqual(["Acme"]);
  });

  it("lets a later registration refine a duplicate and removes it on cleanup", () => {
    const registry = new AgentContextRegistry();
    const context = record("Ada", "10000000-0000-4000-8000-000000000001");
    registry.register("/en/contacts", () => [{ context, starter: "First" }]);
    const unregister = registry.register("/en/contacts", () => [
      {
        context: { ...context, label: "Ada Lovelace" },
        pageRoute: "/en/contacts?view=one",
        starter: "Second",
      },
    ]);

    expect(registry.candidates("/en/contacts")).toEqual([
      {
        context: { ...context, label: "Ada Lovelace" },
        pageRoute: "/en/contacts?view=one",
        starter: "Second",
      },
    ]);

    unregister();
    expect(registry.candidates("/en/contacts")).toEqual([{ context, starter: "First" }]);
    unregister();
    expect(registry.candidates("/en/contacts")).toEqual([{ context, starter: "First" }]);
  });

  it("notifies observers when route candidates register and unregister", () => {
    const registry = new AgentContextRegistry();
    const snapshots: string[][] = [];
    const dispose = autorun(() => {
      snapshots.push(registry.candidates("/en/contacts").map((candidate) => candidate.context.label));
    });

    const unregister = registry.register("/en/contacts", () => [
      { context: record("Ada", "10000000-0000-4000-8000-000000000001") },
    ]);
    unregister();
    dispose();

    expect(snapshots).toEqual([[], ["Ada"], []]);
  });
});
