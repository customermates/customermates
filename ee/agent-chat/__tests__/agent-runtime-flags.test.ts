import { describe, expect, it } from "vitest";

import {
  AGENT_RUNTIME_KNOBS,
  agentRuntimeFlagsForVariant,
  agentRuntimeFlagsOrDefault,
  resolveAgentRuntimeFlags,
} from "../agent-runtime-flags";

describe("agent runtime flags", () => {
  it("defaults to the v2 runtime with every knob on", () => {
    expect(resolveAgentRuntimeFlags({})).toEqual(agentRuntimeFlagsForVariant("v2"));
    for (const knob of AGENT_RUNTIME_KNOBS) expect(resolveAgentRuntimeFlags({})[knob]).toBe(true);
  });

  it("turns every knob off for the current variant", () => {
    for (const knob of AGENT_RUNTIME_KNOBS)
      expect(resolveAgentRuntimeFlags({ AGENT_RUNTIME_VARIANT: "current" })[knob]).toBe(false);
  });

  it("disables single knobs for ablations", () => {
    const flags = resolveAgentRuntimeFlags({ AGENT_RUNTIME_DISABLE: "resultDigest, cachingAuto" });
    expect(flags).toMatchObject({ toolsetRouting: true, promptV2: true, resultDigest: false, cachingAuto: false });
  });

  it("refuses unknown variants and knobs", () => {
    expect(() => resolveAgentRuntimeFlags({ AGENT_RUNTIME_VARIANT: "v3" })).toThrow(/AGENT_RUNTIME_VARIANT/);
    expect(() => resolveAgentRuntimeFlags({ AGENT_RUNTIME_DISABLE: "turbo" })).toThrow(/unknown runtime knob/);
  });

  it("fills a partial payload with the default variant", () => {
    expect(agentRuntimeFlagsOrDefault(undefined)).toEqual(agentRuntimeFlagsForVariant("v2"));
    expect(agentRuntimeFlagsOrDefault({ toolsetRouting: false })).toMatchObject({
      toolsetRouting: false,
      promptV2: true,
    });
  });
});
