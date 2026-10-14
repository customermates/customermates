import { describe, expect, it } from "vitest";
import { recordSearchHit } from "@/tests/helpers/record-search";
import { dedupeRecordSearchResults } from "../agent-context-picker-results";
import type { AgentContextCandidate } from "../agent-context-registry";

describe("agent context record search results", () => {
  it("deduplicates by both type and record IDs, preferring the on-page context", () => {
    const first = recordSearchHit("type-1", "record-1", "Project one");
    const second = recordSearchHit("type-2", "record-1", "Same ID in another type");
    const third = recordSearchHit("type-1", "record-2", "Project two");
    const context: AgentContextCandidate = {
      context: { reference: { kind: "record", ...first.ref }, label: "Renamed project" },
      pageRoute: "/en/records/type-1/record-1",
    };
    expect(dedupeRecordSearchResults([first, second, second, third], [context])).toEqual([second, third]);
  });
});
