import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const testEnv = vi.hoisted(() => ({
  NODE_ENV: "test",
  BASE_URL: "http://localhost:4000",
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
  WEBHOOK_ALLOW_PRIVATE_DESTINATIONS: false,
  WEBHOOK_BLOCK_PRIVATE_DESTINATIONS: false,
}));

vi.mock("@/env", () => ({ env: testEnv }));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { UpsertWebhookInteractor } from "../upsert-webhook.interactor";
import { ValidateWebhookIdsInteractor } from "@/core/validation/validators/validate-webhook-ids.interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { getWebhookRepo } from "@/core/di";
import { APP_LOCALES } from "@/i18n/locale-registry";

const WEBHOOK_ID = "00000000-0000-4000-8000-000000000001";

function makeWebhookDto(overrides: Record<string, unknown> = {}) {
  return {
    id: WEBHOOK_ID,
    url: "https://example.com/webhook",
    description: null,
    events: ["contact.created"],
    secret: null,
    headers: null,
    bodyTemplate: null,
    enabled: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

type Issue = { path: (string | number)[]; params?: { error?: string } };

describe("webhook destination validation on save", () => {
  let repo: {
    upsertWebhookOrThrow: ReturnType<typeof vi.fn>;
    getWebhookByIdOrThrow: ReturnType<typeof vi.fn>;
    getWebhookById: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    testEnv.APP_MODE = "cloud";
    testEnv.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS = false;
    testEnv.WEBHOOK_BLOCK_PRIVATE_DESTINATIONS = false;
    repo = {
      upsertWebhookOrThrow: vi.fn().mockResolvedValue(makeWebhookDto()),
      getWebhookByIdOrThrow: vi.fn().mockResolvedValue(makeWebhookDto()),
      getWebhookById: vi.fn().mockResolvedValue(makeWebhookDto()),
    };
  });

  function invoke(input: Record<string, unknown>) {
    const interactor = new UpsertWebhookInteractor(
      repo as never,
      { publish: vi.fn().mockResolvedValue(undefined) } as never,
      new ValidateWebhookIdsInteractor(getWebhookRepo()),
    );
    return interactor.invoke(input as never) as Promise<{ ok: boolean; error?: { issues: Issue[] } }>;
  }

  function destinationIssues(result: { error?: { issues: Issue[] } }) {
    return (result.error?.issues ?? []).filter(
      (issue) => issue.params?.error === CustomErrorCode.webhookDestinationNotAllowed,
    );
  }

  it.each([
    "http://localhost:3000/hook",
    "http://127.0.0.1/hook",
    "http://2130706433/hook",
    "http://0x7f.1/hook",
    "http://[::ffff:127.0.0.1]/hook",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "https://10.0.0.5/hook",
    "https://nas.local/hook",
  ])("rejects %s on create in cloud mode", async (url) => {
    const result = await invoke({ url, events: ["contact.created"] });

    expect(result.ok).toBe(false);
    expect(destinationIssues(result)).toEqual([
      expect.objectContaining({
        path: ["url"],
        params: expect.objectContaining({ error: "webhookDestinationNotAllowed" }),
      }),
    ]);
    expect(repo.upsertWebhookOrThrow).not.toHaveBeenCalled();
  });

  it("rejects a private URL on update", async () => {
    const result = await invoke({ id: WEBHOOK_ID, url: "http://192.168.0.10/hook" });

    expect(result.ok).toBe(false);
    expect(destinationIssues(result)).toHaveLength(1);
    expect(repo.upsertWebhookOrThrow).not.toHaveBeenCalled();
  });

  it("accepts a public URL in cloud mode", async () => {
    const result = await invoke({ url: "https://hooks.example.com/hook", events: ["contact.created"] });

    expect(result.ok).toBe(true);
    expect(repo.upsertWebhookOrThrow).toHaveBeenCalled();
  });

  it("accepts a private URL when WEBHOOK_ALLOW_PRIVATE_DESTINATIONS is set", async () => {
    testEnv.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS = true;

    const result = await invoke({ url: "http://127.0.0.1:9000/hook", events: ["contact.created"] });

    expect(result.ok).toBe(true);
  });

  it("accepts an internal service URL in self-hosted mode by default", async () => {
    testEnv.APP_MODE = "self-hosted";

    const result = await invoke({ url: "http://localhost:5678/webhook", events: ["contact.created"] });

    expect(result.ok).toBe(true);
  });

  it("rejects a private URL in self-hosted mode when WEBHOOK_BLOCK_PRIVATE_DESTINATIONS is set", async () => {
    testEnv.APP_MODE = "self-hosted";
    testEnv.WEBHOOK_BLOCK_PRIVATE_DESTINATIONS = true;

    const result = await invoke({ url: "http://10.1.2.3/webhook", events: ["contact.created"] });

    expect(result.ok).toBe(false);
    expect(destinationIssues(result)).toHaveLength(1);
  });

  it("refuses credentialed headers over loopback http where private destinations are not allowed", async () => {
    testEnv.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS = false;

    const result = await invoke({
      url: "http://localhost:3000/hook",
      events: ["contact.created"],
      headers: { Authorization: "Bearer x" },
    });

    expect(result.ok).toBe(false);
    expect(
      (result.error?.issues ?? []).some((issue) => issue.params?.error === CustomErrorCode.webhookHeadersRequireHttps),
    ).toBe(true);
  });

  it.each(APP_LOCALES)("explains the rejection in %s without naming the address", (locale) => {
    const messages = JSON.parse(
      readFileSync(new URL(`../../../i18n/locales/${locale}.json`, import.meta.url), "utf8"),
    ) as { Common: { errors: Record<string, string> } };
    const message = messages.Common.errors.webhookDestinationNotAllowed;

    expect(message).toMatch(/\S/u);
    expect(message).not.toMatch(/\d|localhost|resolv/iu);
  });
});
