import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const { webhookFindMany, webhookFindFirst } = vi.hoisted(() => ({
  webhookFindMany: vi.fn(),
  webhookFindFirst: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => ({
  ...MOCK_PRISMA_DB_MODULE,
  prisma: {
    ...MOCK_PRISMA_DB_MODULE.prisma,
    webhook: { findMany: webhookFindMany, findFirst: webhookFindFirst },
  },
}));

import { PrismaWebhookRepo } from "../prisma-webhook.repository";
import { WEBHOOK_MASKED_VALUE } from "../webhook.schema";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { Action, Resource } from "@/generated/prisma";

const WEBHOOK_ID = "00000000-0000-4000-8000-000000000001";

function webhookRow(overrides: Record<string, unknown> = {}) {
  return {
    id: WEBHOOK_ID,
    url: "https://example.com/webhook",
    description: null,
    events: ["contact.created"],
    secret: "signing-secret",
    headers: { Authorization: "Bearer token", "X-Trace": "trace-value" },
    bodyTemplate: null,
    enabled: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const reader = createMockUserWithPermissions([{ resource: Resource.api, action: Action.readAll }]);
const manager = createMockUserWithPermissions([
  { resource: Resource.api, action: Action.readAll },
  { resource: Resource.api, action: Action.create },
  { resource: Resource.api, action: Action.update },
  { resource: Resource.api, action: Action.delete },
]);

describe("PrismaWebhookRepo secret visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    webhookFindFirst.mockResolvedValue(webhookRow());
    webhookFindMany.mockResolvedValue([webhookRow()]);
  });

  it("masks the secret and header values for a role without Manage", async () => {
    const webhook = await runWithTenant(reader, () => new PrismaWebhookRepo().getWebhookById(WEBHOOK_ID));

    expect(webhook?.secret).toBe(WEBHOOK_MASKED_VALUE);
    expect(webhook?.headers).toEqual({ Authorization: WEBHOOK_MASKED_VALUE, "X-Trace": WEBHOOK_MASKED_VALUE });
  });

  it("masks the secret and header values in the list for a role without Manage", async () => {
    const [webhook] = await runWithTenant(reader, () => new PrismaWebhookRepo().getItems({}));

    expect(webhook.secret).toBe(WEBHOOK_MASKED_VALUE);
    expect(webhook.headers).toEqual({ Authorization: WEBHOOK_MASKED_VALUE, "X-Trace": WEBHOOK_MASKED_VALUE });
  });

  it("keeps an absent secret and absent headers absent for a role without Manage", async () => {
    webhookFindFirst.mockResolvedValue(webhookRow({ secret: null, headers: null }));

    const webhook = await runWithTenant(reader, () => new PrismaWebhookRepo().getWebhookById(WEBHOOK_ID));

    expect(webhook?.secret).toBeNull();
    expect(webhook?.headers).toBeNull();
  });

  it.each([
    ["a role with Manage", manager],
    ["the system role", mockUser],
  ])("returns the full secret and header values to %s", async (_label, user) => {
    const webhook = await runWithTenant(user, () => new PrismaWebhookRepo().getWebhookById(WEBHOOK_ID));

    expect(webhook?.secret).toBe("signing-secret");
    expect(webhook?.headers).toEqual({ Authorization: "Bearer token", "X-Trace": "trace-value" });
  });
});
