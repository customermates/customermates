import { describe, expect, it } from "vitest";

import type { AgentContextCandidate } from "../agent-context-registry";

import { EntityType } from "@/generated/prisma";
import { dedupeRecordSearchResults } from "../agent-context-picker-results";

describe("agent context record search results", () => {
  it("keeps the on-page record as the canonical quick action and removes repeated remote records", () => {
    const currentRecord: AgentContextCandidate = {
      context: {
        reference: {
          kind: "record",
          entityType: EntityType.contact,
          recordId: "10000000-0000-4000-8000-000000000001",
        },
        label: "Contact: Ada Lovelace",
      },
      pageRoute: "/en/contacts/contact-1",
    };
    const results = [
      {
        id: "10000000-0000-4000-8000-000000000001",
        name: "Ada Lovelace",
        pictureUrl: null,
        type: EntityType.contact,
      },
      {
        id: "10000000-0000-4000-8000-000000000002",
        name: "Analytical Engines",
        pictureUrl: null,
        type: EntityType.organization,
      },
      {
        id: "10000000-0000-4000-8000-000000000002",
        name: "Analytical Engines",
        pictureUrl: null,
        type: EntityType.organization,
      },
      {
        id: "10000000-0000-4000-8000-000000000003",
        name: "Review proposal",
        pictureUrl: null,
        type: EntityType.task,
      },
    ];

    expect(dedupeRecordSearchResults(results, [currentRecord])).toEqual([results[1], results[3]]);
  });
});
