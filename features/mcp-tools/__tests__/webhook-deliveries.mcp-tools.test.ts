import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const spies = vi.hoisted(() => ({ all: vi.fn(), byWebhook: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getGetWebhookDeliveriesApiInteractor: () => ({ invoke: spies.all }),
  getGetWebhookDeliveriesByWebhookInteractor: () => ({ invoke: spies.byWebhook }),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

import { executeMcpTool, mcpToolResultText } from "../mcp-tool";
import { UNTRUSTED_RECORD_TEXT_OPEN } from "../untrusted-record-content";
import { manageWebhooksTool } from "../webhook.mcp-tools";

const WEBHOOK_ID = "00000000-0000-4000-8000-000000000001";
const delivery = {
  id: "00000000-0000-4000-8000-000000000002",
  url: "https://hooks.example.com/a",
  event: "record.updated",
  requestBody: {
    data: { fields: [{ value: { state: "value", value: { kind: "richText", documentJson: '{"type":"doc"}' } } }] },
  },
  nextAttemptAt: null,
  statusCode: 200,
  responseMessage: null,
  success: true,
  status: "delivered",
  deliveredAt: new Date(0),
  createdAt: new Date(0),
};
const page = { ok: true, data: { items: [delivery], pagination: { page: 1, pageSize: 25, totalPages: 1, total: 1 } } };
const run = (args: Record<string, unknown>) =>
  executeMcpTool(manageWebhooksTool, [manageWebhooksTool.inputSchema.parse(args)]);

beforeEach(() => {
  vi.resetAllMocks();
  spies.all.mockResolvedValue(page);
  spies.byWebhook.mockResolvedValue(page);
});

describe("manage_webhooks list_deliveries", () => {
  it("scopes deliveries to the webhook id through the same interactor as REST", async () => {
    await run({ action: "list_deliveries", id: WEBHOOK_ID, searchTerm: "record" });

    expect(spies.byWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ webhookId: WEBHOOK_ID, searchTerm: "record", pagination: { page: 1, pageSize: 25 } }),
    );
    expect(spies.all).not.toHaveBeenCalled();
  });

  it("spans the workspace without an id", async () => {
    await run({ action: "list_deliveries" });

    expect(spies.all).toHaveBeenCalledOnce();
    expect(spies.byWebhook).not.toHaveBeenCalled();
  });

  it("wraps Formatted text in delivered bodies in the untrusted-content markers", async () => {
    const text = mcpToolResultText(
      await manageWebhooksTool.execute(
        manageWebhooksTool.inputSchema.parse({ action: "list_deliveries", id: WEBHOOK_ID }),
      ),
    );

    expect(text).toContain(UNTRUSTED_RECORD_TEXT_OPEN);
    expect(text).not.toContain("documentJson");
  });

  it("reports an unknown webhook as webhookNotFound", async () => {
    spies.byWebhook.mockResolvedValue({
      ok: false,
      error: createZodError("Webhook not found", ["webhookId"], {
        error: CustomErrorCode.webhookNotFound,
        kind: "not_found",
      }),
    });

    const result = await run({ action: "list_deliveries", id: WEBHOOK_ID });

    expect(JSON.stringify(result)).toContain("webhookNotFound");
  });
});
