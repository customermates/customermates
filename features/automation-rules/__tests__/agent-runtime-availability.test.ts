import { describe, expect, it } from "vitest";

import { AgentRuntimeAvailabilitySchema, noAgentRuntimes } from "../agent-runtime-availability";
import { AGENT_RUNTIMES } from "../automation-rule.schema";

describe("agent runtime availability", () => {
  it("lists every runtime as not configured until a source says otherwise", () => {
    const availability = noAgentRuntimes();

    expect(Object.keys(availability).sort()).toEqual([...AGENT_RUNTIMES].sort());
    for (const runtime of AGENT_RUNTIMES)
      expect(availability[runtime]).toEqual({ available: false, reason: "notConfigured", models: [], runners: [] });

    expect(AgentRuntimeAvailabilitySchema.parse(availability)).toEqual(availability);
  });
});
