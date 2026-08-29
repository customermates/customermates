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

  it("fails closed when the flags are absent or blank", async () => {
    const env = await loadEnv({
      HOSTED_AI_OPERATOR_CONTROLS_ENABLED: " ",
      OPERATOR_CONSOLE_ENABLED: undefined,
    });

    expect(env.OPERATOR_CONSOLE_ENABLED).toBe(false);
    expect(env.HOSTED_AI_OPERATOR_CONTROLS_ENABLED).toBe(false);
  });

  it("accepts only explicit lowercase booleans", async () => {
    const env = await loadEnv({
      HOSTED_AI_OPERATOR_CONTROLS_ENABLED: "false",
      OPERATOR_CONSOLE_ENABLED: "true",
    });

    expect(env.OPERATOR_CONSOLE_ENABLED).toBe(true);
    expect(env.HOSTED_AI_OPERATOR_CONTROLS_ENABLED).toBe(false);
  });

  it.each(["1", "TRUE", "yes", "enabled"])("rejects the ambiguous value %s", async (value) => {
    await expect(loadEnv({ OPERATOR_CONSOLE_ENABLED: value })).rejects.toThrow(
      'OPERATOR_CONSOLE_ENABLED must be configured as "true" or "false"',
    );
  });
});
