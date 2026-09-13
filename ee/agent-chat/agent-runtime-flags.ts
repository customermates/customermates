export const AGENT_RUNTIME_KNOBS = ["toolsetRouting", "promptV2", "resultDigest", "cachingAuto"] as const;

export type AgentRuntimeKnob = (typeof AGENT_RUNTIME_KNOBS)[number];

export type AgentRuntimeFlags = Record<AgentRuntimeKnob, boolean>;

export const AGENT_RUNTIME_VARIANTS = ["current", "v2"] as const;

export type AgentRuntimeVariant = (typeof AGENT_RUNTIME_VARIANTS)[number];

export const DEFAULT_AGENT_RUNTIME_VARIANT: AgentRuntimeVariant = "v2";

export function agentRuntimeFlagsForVariant(variant: AgentRuntimeVariant): AgentRuntimeFlags {
  const enabled = variant === "v2";
  return { toolsetRouting: enabled, promptV2: enabled, resultDigest: enabled, cachingAuto: enabled };
}

export function resolveAgentRuntimeFlags(environment: Record<string, string | undefined>): AgentRuntimeFlags {
  const requested = environment.AGENT_RUNTIME_VARIANT ?? DEFAULT_AGENT_RUNTIME_VARIANT;
  if (!(AGENT_RUNTIME_VARIANTS as readonly string[]).includes(requested))
    throw new Error(`AGENT_RUNTIME_VARIANT must be one of ${AGENT_RUNTIME_VARIANTS.join(", ")}.`);
  const flags = agentRuntimeFlagsForVariant(requested as AgentRuntimeVariant);
  const disabled = (environment.AGENT_RUNTIME_DISABLE ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const knob of disabled) {
    if (!(AGENT_RUNTIME_KNOBS as readonly string[]).includes(knob))
      throw new Error(`AGENT_RUNTIME_DISABLE names an unknown runtime knob "${knob}".`);
    flags[knob as AgentRuntimeKnob] = false;
  }
  return flags;
}

export function agentRuntimeFlags(): AgentRuntimeFlags {
  return resolveAgentRuntimeFlags(typeof process === "undefined" ? {} : process.env);
}

export function agentRuntimeFlagsOrDefault(flags: Partial<AgentRuntimeFlags> | undefined): AgentRuntimeFlags {
  return { ...agentRuntimeFlagsForVariant(DEFAULT_AGENT_RUNTIME_VARIANT), ...(flags ?? {}) };
}
