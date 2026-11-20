import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { Action, Resource } from "@/generated/prisma";
import { MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockEnv = vi.hoisted(() => ({
  NODE_ENV: "test" as const,
  APP_MODE: "cloud" as const,
  BASE_URL: "http://localhost:4000",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  BETTER_AUTH_SECRET: "a-long-test-only-authentication-secret",
  SECRET_BOX_KEY: undefined as string | undefined,
}));

const mockUser = createMockUser({
  id: "00000000-0000-4000-8000-000000000010",
  companyId: "00000000-0000-4000-8000-000000000011",
});

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import { runWithTenant } from "@/core/decorators/tenant-context";
import { openSecret, sealSecret, SecretBoxError } from "@/core/security/secret-box";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { AgentOwnKeyPlan } from "../agent-own-key-plan";
import { agentProviderKeyBinding } from "../agent-provider-key-binding";
import { agentStepProvider, chooseAgentProviderModel } from "../agent-provider-models";
import { DeleteAgentProviderKeyInteractor } from "../delete-agent-provider-key.interactor";
import { FetchAgentProviderKeyValidator } from "../fetch-agent-provider-key-validator";
import { GetAgentProviderKeysInteractor } from "../get-agent-provider-keys.interactor";
import { SaveAgentProviderKeyInteractor } from "../save-agent-provider-key.interactor";
import { TestAgentProviderKeyInteractor } from "../test-agent-provider-key.interactor";
import { FakeAgentProviderKeyRepo } from "./fake-agent-provider-key-repo";

const NOW = new Date("2026-11-17T09:00:00.000Z");
const PLAIN_KEY = "sk-ant-api03-EXAMPLEKEY-0001";

function plan(plan: "free" | "starter" | null) {
  return new AgentOwnKeyPlan({ plan: () => Promise.resolve({ plan }) });
}

function issueOf(result: {
  ok: boolean;
  error?: { issues: Array<{ path: PropertyKey[]; params?: Record<string, unknown> }> };
}) {
  const issue = result.error?.issues[0];
  return { path: issue?.path, error: issue?.params?.error };
}

describe("saving a provider key", () => {
  let repo: FakeAgentProviderKeyRepo;
  let check: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    repo = new FakeAgentProviderKeyRepo();
    check = vi.fn().mockResolvedValue("valid");
  });

  const save = (input: unknown, allowed: ReturnType<typeof plan> = plan("starter"), user = mockUser) =>
    runWithTenant(user, () =>
      new SaveAgentProviderKeyInteractor(repo, { check } as never, allowed, () => NOW).invoke(input as never),
    );

  it("checks the key with the provider, seals it and answers with the last four characters only", async () => {
    const result = await save({ provider: "anthropic", label: "Production", apiKey: PLAIN_KEY });

    expect(check).toHaveBeenCalledWith("anthropic", PLAIN_KEY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      provider: "anthropic",
      label: "Production",
      last4: "0001",
      defaultModel: null,
      validatedAt: NOW.toISOString(),
      lastUsedAt: null,
    });
    expect(JSON.stringify(result.data)).not.toContain(PLAIN_KEY);

    const [stored] = [...repo.rows.values()];
    expect(stored.keyCiphertext).not.toContain(PLAIN_KEY);
    expect(stored.keyCiphertext.startsWith("v2.")).toBe(true);
    expect(openSecret(stored.keyCiphertext, agentProviderKeyBinding(mockUser.companyId, "anthropic"))).toBe(PLAIN_KEY);
  });

  it("binds the sealed key to its workspace and provider, so a copied row cannot be opened elsewhere", async () => {
    await save({ provider: "anthropic", label: "Production", apiKey: PLAIN_KEY });
    const [stored] = [...repo.rows.values()];

    expect(() =>
      openSecret(stored.keyCiphertext, agentProviderKeyBinding("00000000-0000-4000-8000-000000000099", "anthropic")),
    ).toThrow(SecretBoxError);
    expect(() => openSecret(stored.keyCiphertext, agentProviderKeyBinding(mockUser.companyId, "openai"))).toThrow(
      SecretBoxError,
    );
  });

  it("replaces the key of a provider instead of keeping two", async () => {
    await save({ provider: "openai", label: "First", apiKey: "sk-first-key-1111" });
    await save({ provider: "openai", label: "Second", apiKey: "sk-second-key-2222", defaultModel: "gpt-5" });

    expect(repo.rows.size).toBe(1);
    expect([...repo.rows.values()][0]).toMatchObject({ label: "Second", keyLast4: "2222", defaultModel: "gpt-5" });
  });

  it("refuses a key the provider rejects and stores nothing", async () => {
    check.mockResolvedValue("invalid");
    const result = await save({ provider: "google", label: "Test", apiKey: "AIza-not-a-real-key" });

    expect(result.ok).toBe(false);
    expect(issueOf(result as never)).toEqual({ path: ["apiKey"], error: CustomErrorCode.agentProviderKeyInvalid });
    expect(repo.rows.size).toBe(0);
  });

  it("refuses with a retry hint when the provider cannot be reached", async () => {
    check.mockResolvedValue("unreachable");
    const result = await save({ provider: "anthropic", label: "Test", apiKey: PLAIN_KEY });

    expect(result.ok).toBe(false);
    expect(issueOf(result as never)).toEqual({ path: ["apiKey"], error: CustomErrorCode.agentProviderKeyUnreachable });
    expect(repo.rows.size).toBe(0);
  });

  it("refuses a default model the provider list does not contain", async () => {
    const result = await save({ provider: "anthropic", label: "Test", apiKey: PLAIN_KEY, defaultModel: "gpt-5" });

    expect(result.ok).toBe(false);
    expect(issueOf(result as never)).toEqual({
      path: ["defaultModel"],
      error: CustomErrorCode.agentProviderModelInvalid,
    });
    expect(check).not.toHaveBeenCalled();
  });

  it("is a paid-plan feature: Free is refused before the provider is called", async () => {
    const result = await save({ provider: "anthropic", label: "Test", apiKey: PLAIN_KEY }, plan("free"));

    expect(result.ok).toBe(false);
    expect(issueOf(result as never).error).toBe(CustomErrorCode.agentOwnKeyPlanRequired);
    expect(check).not.toHaveBeenCalled();
    expect(repo.rows.size).toBe(0);
  });

  it("is open on an install without a plan, because the key is the customer's own", async () => {
    const result = await save({ provider: "openai", label: "Self-hosted", apiKey: "sk-self-hosted-3333" }, plan(null));
    expect(result.ok).toBe(true);
  });

  it("needs the permission to change workspace settings", async () => {
    const reader = createMockUserWithPermissions([{ resource: Resource.company, action: Action.readOwn }]);
    await expect(
      save({ provider: "anthropic", label: "Test", apiKey: PLAIN_KEY }, plan("starter"), reader),
    ).rejects.toThrow(/Access denied/);
  });

  it("rejects keys with whitespace, a blank label and unknown providers", async () => {
    for (const input of [
      { provider: "anthropic", label: "Test", apiKey: "sk with space 1234" },
      { provider: "anthropic", label: "  ", apiKey: PLAIN_KEY },
      { provider: "mistral", label: "Test", apiKey: PLAIN_KEY },
      { provider: "anthropic", label: "Test", apiKey: PLAIN_KEY, extra: true },
    ])
      expect((await save(input)).ok).toBe(false);
    expect(check).not.toHaveBeenCalled();
  });
});

describe("listing and removing provider keys", () => {
  it("never returns the key and lists the oldest first", async () => {
    const repo = new FakeAgentProviderKeyRepo();
    const validator = { check: vi.fn().mockResolvedValue("valid") };
    const saver = new SaveAgentProviderKeyInteractor(repo, validator as never, plan("starter"), () => NOW);
    await runWithTenant(mockUser, () =>
      saver.invoke({ provider: "anthropic", label: "A", apiKey: PLAIN_KEY } as never),
    );

    const result = await runWithTenant(mockUser, () => new GetAgentProviderKeysInteractor(repo).invoke());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.keys).toHaveLength(1);
    expect(Object.keys(result.data.keys[0]).sort()).toEqual([
      "createdAt",
      "defaultModel",
      "id",
      "label",
      "last4",
      "lastUsedAt",
      "provider",
      "validatedAt",
    ]);
  });

  it("removes a key by id and reports an unknown id as not found", async () => {
    const repo = new FakeAgentProviderKeyRepo();
    const saved = await repo.upsert({
      provider: "google",
      label: "G",
      keyCiphertext: "v1.a.b.c",
      keyLast4: "9999",
      defaultModel: null,
      validatedAt: NOW,
    });
    const remove = (id: string) =>
      runWithTenant(mockUser, () => new DeleteAgentProviderKeyInteractor(repo).invoke({ id } as never));

    const removed = await remove(saved.id);
    expect(removed).toEqual({ ok: true, data: { id: saved.id } });
    expect(repo.rows.size).toBe(0);

    const again = await remove(saved.id);
    expect(again.ok).toBe(false);
    expect(issueOf(again as never).error).toBe(CustomErrorCode.agentProviderKeyNotFound);
  });
});

describe("testing a saved provider key", () => {
  async function saved() {
    const repo = new FakeAgentProviderKeyRepo();
    const stored = await repo.upsert({
      provider: "openai",
      label: "OpenAI",
      keyCiphertext: sealSecret("sk-openai-stored-4321", agentProviderKeyBinding(mockUser.companyId, "openai")),
      keyLast4: "4321",
      defaultModel: null,
      validatedAt: new Date("2026-11-01T00:00:00.000Z"),
    });
    return { repo, stored };
  }

  const test = (repo: FakeAgentProviderKeyRepo, check: unknown, id: string) =>
    runWithTenant(mockUser, () =>
      new TestAgentProviderKeyInteractor(repo, { check } as never, () => NOW).invoke({ id } as never),
    );

  it("opens the stored key, asks the provider again and stamps the new validation time", async () => {
    const { repo, stored } = await saved();
    const check = vi.fn().mockResolvedValue("valid");

    const result = await test(repo, check, stored.id);

    expect(check).toHaveBeenCalledWith("openai", "sk-openai-stored-4321");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ id: stored.id, last4: "4321", validatedAt: NOW.toISOString() });
    expect(JSON.stringify(result.data)).not.toContain("sk-openai-stored");
  });

  it("keeps the old validation time when the provider rejects the key or cannot be reached", async () => {
    const { repo, stored } = await saved();

    const rejected = await test(repo, vi.fn().mockResolvedValue("invalid"), stored.id);
    expect(issueOf(rejected as never)).toEqual({ path: ["id"], error: CustomErrorCode.agentProviderKeyInvalid });
    const offline = await test(repo, vi.fn().mockResolvedValue("unreachable"), stored.id);
    expect(issueOf(offline as never)).toEqual({ path: ["id"], error: CustomErrorCode.agentProviderKeyUnreachable });
    expect((await repo.findSealed(stored.id))?.validatedAt).toEqual(new Date("2026-11-01T00:00:00.000Z"));
  });

  it("reports an unknown key", async () => {
    const { repo } = await saved();
    const check = vi.fn();

    const missing = await test(repo, check, "00000000-0000-4000-8000-0000000000fe");
    expect(issueOf(missing as never).error).toBe(CustomErrorCode.agentProviderKeyNotFound);
    expect(check).not.toHaveBeenCalled();
  });

  it("says a key sealed with another server secret must be saved again, instead of calling it invalid", async () => {
    const { repo, stored } = await saved();
    const check = vi.fn();

    mockEnv.BETTER_AUTH_SECRET = "a-rotated-test-only-authentication-secret";
    try {
      const rotated = await test(repo, check, stored.id);
      expect(issueOf(rotated as never)).toEqual({ path: ["id"], error: CustomErrorCode.agentProviderKeyUnreadable });
    } finally {
      mockEnv.BETTER_AUTH_SECRET = "a-long-test-only-authentication-secret";
    }

    const row = await repo.findSealed(stored.id);
    if (!row) throw new Error("The key is missing");
    repo.rows.set(row.id, { ...row, keyCiphertext: "v1.garbage.garbage.garbage" });
    const garbled = await test(repo, check, stored.id);
    expect(issueOf(garbled as never).error).toBe(CustomErrorCode.agentProviderKeyUnreadable);
    expect(check).not.toHaveBeenCalled();
    expect((await repo.findSealed(stored.id))?.validatedAt).toEqual(new Date("2026-11-01T00:00:00.000Z"));
  });

  it("still tests a key saved before SECRET_BOX_KEY was configured", async () => {
    const { repo, stored } = await saved();
    const check = vi.fn().mockResolvedValue("valid");

    mockEnv.SECRET_BOX_KEY = Buffer.alloc(32, 3).toString("base64");
    try {
      const result = await test(repo, check, stored.id);
      expect(result.ok).toBe(true);
      expect(check).toHaveBeenCalledWith("openai", "sk-openai-stored-4321");
    } finally {
      mockEnv.SECRET_BOX_KEY = undefined;
    }
  });
});

describe("a key the provider does not let list its models", () => {
  it("is neither accepted nor rejected by the check", async () => {
    const doFetch = vi.fn().mockResolvedValue({ status: 403, ok: false });
    const validator = new FetchAgentProviderKeyValidator(doFetch);

    expect(await validator.check("openai", "sk-restricted-key-7777")).toBe("unverified");
    expect(await validator.check("anthropic", "sk-ant-restricted-7777")).toBe("unverified");
  });

  it("is saved without a check date instead of being refused", async () => {
    const repo = new FakeAgentProviderKeyRepo();
    const check = vi.fn().mockResolvedValue("unverified");

    const result = await runWithTenant(mockUser, () =>
      new SaveAgentProviderKeyInteractor(repo, { check } as never, plan("starter"), () => NOW).invoke({
        provider: "openai",
        label: "Restricted",
        apiKey: "sk-restricted-key-7777",
      } as never),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ provider: "openai", last4: "7777", validatedAt: null });
    const [stored] = [...repo.rows.values()];
    expect(stored.validatedAt).toBeNull();
    expect(openSecret(stored.keyCiphertext, agentProviderKeyBinding(mockUser.companyId, "openai"))).toBe(
      "sk-restricted-key-7777",
    );
  });

  it("says on Test that it cannot be checked here and keeps the earlier check date", async () => {
    const repo = new FakeAgentProviderKeyRepo();
    const stored = await repo.upsert({
      provider: "openai",
      label: "OpenAI",
      keyCiphertext: sealSecret("sk-openai-stored-4321", agentProviderKeyBinding(mockUser.companyId, "openai")),
      keyLast4: "4321",
      defaultModel: null,
      validatedAt: null,
    });

    const result = await runWithTenant(mockUser, () =>
      new TestAgentProviderKeyInteractor(
        repo,
        { check: vi.fn().mockResolvedValue("unverified") } as never,
        () => NOW,
      ).invoke({ id: stored.id } as never),
    );

    expect(issueOf(result as never)).toEqual({ path: ["id"], error: CustomErrorCode.agentProviderKeyUnverified });
    expect((await repo.findSealed(stored.id))?.validatedAt).toBeNull();
  });
});

describe("choosing the provider and model of an agent step", () => {
  it("takes the provider of the step's model and refuses a model no list or no key offers", () => {
    expect(agentStepProvider(["anthropic", "openai"], "gpt-5")).toEqual({ ok: true, provider: "openai" });
    expect(agentStepProvider(["anthropic"], "gpt-5")).toEqual({ ok: false, reason: "noKey" });
    expect(agentStepProvider(["anthropic", "openai"], "mystery-1")).toEqual({ ok: false, reason: "modelUnavailable" });
    expect(agentStepProvider([], "mystery-1")).toEqual({ ok: false, reason: "modelUnavailable" });
  });

  it("runs a step without a model only when the workspace has exactly one key, so deleting a key never moves it", () => {
    expect(agentStepProvider(["google"], null)).toEqual({ ok: true, provider: "google" });
    expect(agentStepProvider([], null)).toEqual({ ok: false, reason: "noKey" });
    expect(agentStepProvider(["anthropic", "openai"], null)).toEqual({ ok: false, reason: "modelRequired" });
    expect(agentStepProvider(["openai", "anthropic"], undefined)).toEqual({ ok: false, reason: "modelRequired" });
  });

  it("uses the step's model, then the key's default while it is still offered, then the provider's default", () => {
    expect(chooseAgentProviderModel("openai", "gpt-5", "gpt-4.1")).toEqual({ modelId: "gpt-5", retiredDefault: null });
    expect(chooseAgentProviderModel("openai", null, "gpt-4.1")).toEqual({ modelId: "gpt-4.1", retiredDefault: null });
    expect(chooseAgentProviderModel("openai", null, null)).toEqual({ modelId: "gpt-5-mini", retiredDefault: null });
    expect(chooseAgentProviderModel("openai", null, "gpt-4-turbo")).toEqual({
      modelId: "gpt-5-mini",
      retiredDefault: "gpt-4-turbo",
    });
    expect(chooseAgentProviderModel("anthropic", null, "gpt-5")).toEqual({
      modelId: "claude-sonnet-5-5",
      retiredDefault: "gpt-5",
    });
  });
});

describe("the provider key check", () => {
  const call = (status: number | Error, provider: "anthropic" | "openai" | "google" = "anthropic") => {
    const doFetch = vi
      .fn()
      .mockImplementation(() =>
        status instanceof Error
          ? Promise.reject(status)
          : Promise.resolve({ status, ok: status >= 200 && status < 300 }),
      );
    return { doFetch, result: new FetchAgentProviderKeyValidator(doFetch).check(provider, "secret-key-value") };
  };

  it("asks each provider for its model list with the key in a header, never in the address", async () => {
    const anthropic = call(200, "anthropic");
    const openai = call(200, "openai");
    const google = call(200, "google");

    expect(await Promise.all([anthropic.result, openai.result, google.result])).toEqual(["valid", "valid", "valid"]);
    expect(anthropic.doFetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models?limit=1",
      expect.objectContaining({
        method: "GET",
        redirect: "error",
        headers: { "x-api-key": "secret-key-value", "anthropic-version": "2023-06-01" },
      }),
    );
    expect(openai.doFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({ headers: { authorization: "Bearer secret-key-value" } }),
    );
    expect(google.doFetch).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
      expect.objectContaining({ headers: { "x-goog-api-key": "secret-key-value" } }),
    );
    for (const { doFetch } of [anthropic, openai, google])
      expect(String(doFetch.mock.calls[0][0])).not.toContain("secret");
  });

  it("separates a rejected key from a provider that could not be reached", async () => {
    expect(await call(401).result).toBe("invalid");
    expect(await call(401, "openai").result).toBe("invalid");
    expect(await call(400, "google").result).toBe("invalid");
    expect(await call(429).result).toBe("unreachable");
    expect(await call(503).result).toBe("unreachable");
    expect(await call(new Error("socket hang up")).result).toBe("unreachable");
  });
});
