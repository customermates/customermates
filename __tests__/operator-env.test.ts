import { afterEach, describe, expect, it, vi } from "vitest";

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  vi.stubEnv("APP_MODE", "cloud");
  vi.stubEnv("BASE_URL", "http://localhost:4000");

  for (const [name, value] of Object.entries(overrides)) vi.stubEnv(name, value);

  return (await import("@/env")).env;
}

describe("operator environment flags", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("fails closed when the switch is absent or blank", async () => {
    const env = await loadEnv({ HOSTED_AI_OPERATOR_CONTROLS_ENABLED: " " });

    expect(env.HOSTED_AI_OPERATOR_CONTROLS_ENABLED).toBe(false);
  });

  it("accepts only explicit lowercase booleans", async () => {
    const enabled = await loadEnv({ HOSTED_AI_OPERATOR_CONTROLS_ENABLED: "true" });
    expect(enabled.HOSTED_AI_OPERATOR_CONTROLS_ENABLED).toBe(true);

    const disabled = await loadEnv({ HOSTED_AI_OPERATOR_CONTROLS_ENABLED: "false" });
    expect(disabled.HOSTED_AI_OPERATOR_CONTROLS_ENABLED).toBe(false);
  });

  it.each(["1", "TRUE", "yes", "enabled"])("rejects the ambiguous value %s", async (value) => {
    await expect(loadEnv({ HOSTED_AI_OPERATOR_CONTROLS_ENABLED: value })).rejects.toThrow(
      'HOSTED_AI_OPERATOR_CONTROLS_ENABLED must be configured as "true" or "false"',
    );
  });
});
