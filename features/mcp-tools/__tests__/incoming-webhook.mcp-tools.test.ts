import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";

import messages from "@/i18n/locales/en.json";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const spies = vi.hoisted(() => ({ manage: vi.fn() }));

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "Common.errors") =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace })),
}));
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getManageIncomingWebhookInteractor: () => ({ invoke: spies.manage }),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";
import {
  HOOK_ID,
  NAME_FIELD,
  PAYLOAD,
  TYPE_ID,
  createMapping,
} from "@/features/incoming-webhook/__tests__/incoming-webhook-fixtures";
import { MCP_TOOL_GROUPS, ALL_MCP_TOOLS } from "../tool-registry";
import { manageIncomingWebhooksTool } from "../incoming-webhook.mcp-tools";
import { VALIDATION_ERROR_PREFIX } from "../utils";

function run(params: Record<string, unknown>) {
  const parsed = manageIncomingWebhooksTool.inputSchema.parse(params);
  return manageIncomingWebhooksTool.execute(parsed);
}

const textOf = (result: Awaited<ReturnType<typeof run>>) => (typeof result === "string" ? result : result.text);

function structured(result: Awaited<ReturnType<typeof run>>) {
  if (typeof result === "string" || !("structuredContent" in result)) throw new Error("expected a structured result");
  return result.structuredContent;
}

const webhook = {
  id: HOOK_ID,
  typeId: TYPE_ID,
  name: "Website signups",
  enabled: true,
  url: "https://app.example.com/api/hooks/token",
  hasSigningSecret: false,
  signatureHeader: "x-signature",
  mapping: createMapping(),
  samplePayload: PAYLOAD,
  lastReceivedAt: null,
  createdAt: "2026-11-13T10:00:00.000Z",
  updatedAt: "2026-11-13T10:00:00.000Z",
};

describe("manage_incoming_webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is registered in the webhooks toolset", () => {
    expect(ALL_MCP_TOOLS.map((tool) => tool.name)).toContain("manage_incoming_webhooks");
    expect(MCP_TOOL_GROUPS.webhooks).toContain(manageIncomingWebhooksTool);
  });

  it("passes only the keys of the action to the interactor", async () => {
    spies.manage.mockResolvedValue({ ok: true, data: { items: [webhook] } });

    const result = await run({ action: "list", typeId: TYPE_ID, name: "ignored", limit: 5, rotateUrl: true });

    expect(spies.manage).toHaveBeenCalledWith({ action: "list", typeId: TYPE_ID });
    expect(manageIncomingWebhooksTool.outputSchema.safeParse(structured(result)).success).toBe(true);
    expect(structured(result)).toMatchObject({ items: [{ id: HOOK_ID }] });
  });

  it("gets, creates and updates an endpoint and returns its secret url", async () => {
    spies.manage.mockResolvedValue({ ok: true, data: { webhook } });

    const created = await run({
      action: "create",
      typeId: TYPE_ID,
      name: "Website signups",
      mapping: createMapping({ mode: "upsert", matchFieldId: NAME_FIELD }),
      signingSecret: "shared-secret",
    });
    expect(spies.manage).toHaveBeenLastCalledWith({
      action: "create",
      typeId: TYPE_ID,
      name: "Website signups",
      mapping: createMapping({ mode: "upsert", matchFieldId: NAME_FIELD }),
      signingSecret: "shared-secret",
    });
    expect(structured(created)).toMatchObject({ webhook: { id: HOOK_ID, url: webhook.url } });
    expect(JSON.stringify(structured(created))).not.toContain("shared-secret");

    await run({ action: "update", id: HOOK_ID, rotateUrl: true, signingSecret: null });
    expect(spies.manage).toHaveBeenLastCalledWith({
      action: "update",
      id: HOOK_ID,
      rotateUrl: true,
      signingSecret: null,
    });

    await run({ action: "get", id: HOOK_ID });
    expect(spies.manage).toHaveBeenLastCalledWith({ action: "get", id: HOOK_ID });
  });

  it("tests with a body, reads the delivery log and deletes", async () => {
    spies.manage.mockResolvedValue({
      ok: true,
      data: { preview: { ok: true, outcome: "create", existingRecordId: null, values: [] } },
    });
    const tested = await run({ action: "test", id: HOOK_ID, payload: PAYLOAD });
    expect(spies.manage).toHaveBeenLastCalledWith({ action: "test", id: HOOK_ID, payload: PAYLOAD });
    expect(structured(tested)).toMatchObject({ preview: { ok: true, outcome: "create" } });

    spies.manage.mockResolvedValue({ ok: true, data: { deliveries: [{ id: HOOK_ID, outcome: "created" }] } });
    await run({ action: "deliveries", id: HOOK_ID, limit: 10 });
    expect(spies.manage).toHaveBeenLastCalledWith({ action: "deliveries", id: HOOK_ID, limit: 10 });

    spies.manage.mockResolvedValue({ ok: true, data: { deleted: true } });
    expect(structured(await run({ action: "delete", id: HOOK_ID }))).toEqual({ deleted: true });
    expect(spies.manage).toHaveBeenLastCalledWith({ action: "delete", id: HOOK_ID });
  });

  it("returns the fields a mapping may fill", async () => {
    spies.manage.mockResolvedValue({
      ok: true,
      data: { typeLabel: "Leads", fields: [{ fieldId: NAME_FIELD, label: "Name" }] },
    });

    const result = await run({ action: "fields", typeId: TYPE_ID });

    expect(spies.manage).toHaveBeenCalledWith({ action: "fields", typeId: TYPE_ID });
    expect(structured(result)).toMatchObject({ fields: [{ fieldId: NAME_FIELD }] });
  });

  it("names the missing keys and does not call the interactor", async () => {
    for (const params of [
      { action: "get" },
      { action: "delete" },
      { action: "test" },
      { action: "deliveries" },
      { action: "fields" },
      { action: "create", name: "x" },
      { action: "update", name: "x" },
    ])
      expect(textOf(await run(params))).toContain(VALIDATION_ERROR_PREFIX);

    expect(spies.manage).not.toHaveBeenCalled();
  });

  it("rejects a mapping with an unusable JSON path before running anything", () => {
    const parse = (path: string) =>
      manageIncomingWebhooksTool.inputSchema.safeParse({
        action: "create",
        typeId: TYPE_ID,
        name: "x",
        mapping: createMapping({ fields: [{ path, fieldId: NAME_FIELD }] }),
      }).success;

    expect(parse("data.name")).toBe(true);
    expect(parse("data name")).toBe(false);
    expect(parse("")).toBe(false);
  });

  it("returns a plan refusal as a tool failure", async () => {
    spies.manage.mockResolvedValue({
      ok: false,
      error: createZodError("Webhooks are not included in your plan.", [], {
        error: CustomErrorCode.planWebhooksNotIncluded,
        kind: "conflict",
      }),
    });

    const result = await run({
      action: "create",
      typeId: TYPE_ID,
      name: "Website signups",
      mapping: createMapping(),
    });

    expect(textOf(result)).toContain("not included");
    expect(typeof result === "string" || "structuredContent" in result).toBe(false);
  });

  it("documents the keys of every action in its description", () => {
    const description = manageIncomingWebhooksTool.inputSchema.shape.action.description ?? "";

    for (const action of ["list", "get", "fields", "create", "update", "delete", "test", "deliveries"])
      expect(description).toMatch(new RegExp(`${action}: [a-zA-Z, ]+`, "u"));
  });
});
