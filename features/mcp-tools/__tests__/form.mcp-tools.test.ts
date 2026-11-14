import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";

import messages from "@/i18n/locales/en.json";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const spies = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  editor: vi.fn(),
  upsert: vi.fn(),
  disable: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "Common.errors") =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace })),
}));
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getListPublicFormsInteractor: () => ({ invoke: spies.list }),
  getGetPublicFormInteractor: () => ({ invoke: spies.get }),
  getGetPublicFormEditorInteractor: () => ({ invoke: spies.editor }),
  getUpsertPublicFormInteractor: () => ({ invoke: spies.upsert }),
  getDisablePublicFormInteractor: () => ({ invoke: spies.disable }),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";
import { createConfig } from "@/features/public-form/__tests__/public-form-fixtures";
import { MCP_TOOL_GROUPS, ALL_MCP_TOOLS } from "../tool-registry";
import { manageFormsTool } from "../form.mcp-tools";
import { VALIDATION_ERROR_PREFIX } from "../utils";

const FORM = "00000000-0000-4000-8000-0000000000f1";
const TYPE = "00000000-0000-4000-8000-0000000000a1";

function run(params: Record<string, unknown>) {
  const parsed = manageFormsTool.inputSchema.parse(params);
  return manageFormsTool.execute(parsed);
}

const textOf = (result: Awaited<ReturnType<typeof run>>) => (typeof result === "string" ? result : result.text);

function structured(result: Awaited<ReturnType<typeof run>>) {
  if (typeof result === "string" || !("structuredContent" in result)) throw new Error("expected a structured result");
  return result.structuredContent;
}

const form = {
  id: FORM,
  typeId: TYPE,
  name: "Contact form",
  enabled: true,
  url: "https://app.example.com/f/token",
  embedSnippet: '<iframe src="https://app.example.com/f/token?embed=1"></iframe>',
  config: createConfig(),
};

describe("manage_forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is registered in the views toolset", () => {
    expect(ALL_MCP_TOOLS.map((tool) => tool.name)).toContain("manage_forms");
    expect(MCP_TOOL_GROUPS.views).toContain(manageFormsTool);
  });

  it("lists forms, optionally of one list", async () => {
    spies.list.mockResolvedValue({ ok: true, data: { items: [form] } });

    const result = await run({ action: "list", typeId: TYPE });

    expect(spies.list).toHaveBeenCalledWith({ typeId: TYPE });
    expect(manageFormsTool.outputSchema.safeParse(structured(result)).success).toBe(true);
    expect(structured(result)).toMatchObject({ items: [{ id: FORM }] });
  });

  it("gets a form with its link and embed snippet", async () => {
    spies.get.mockResolvedValue({ ok: true, data: form });

    const result = await run({ action: "get", id: FORM });

    expect(spies.get).toHaveBeenCalledWith({ id: FORM });
    expect(structured(result)).toMatchObject({ id: FORM, url: form.url, embedSnippet: form.embedSnippet });
    expect(manageFormsTool.outputSchema.safeParse(structured(result)).success).toBe(true);
  });

  it("returns the fields a form can use", async () => {
    spies.editor.mockResolvedValue({
      ok: true,
      data: { typeLabel: "Leads", fields: [{ fieldId: TYPE, label: "Name" }], peopleLists: [] },
    });

    const result = await run({ action: "fields", typeId: TYPE });

    expect(spies.editor).toHaveBeenCalledWith({ typeId: TYPE });
    expect(structured(result)).toMatchObject({ typeLabel: "Leads", fields: [{ fieldId: TYPE }] });
  });

  it("creates a form from typeId, name and config", async () => {
    spies.upsert.mockResolvedValue({ ok: true, data: form });

    const result = await run({ action: "create", typeId: TYPE, name: "Contact form", config: createConfig() });

    expect(spies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ typeId: TYPE, name: "Contact form", config: createConfig() }),
    );
    expect(structured(result)).toMatchObject({ id: FORM });
  });

  it("updates by id and passes only what was given", async () => {
    spies.upsert.mockResolvedValue({ ok: true, data: { ...form, enabled: false } });

    const result = await run({ action: "update", id: FORM, enabled: false });

    expect(spies.upsert).toHaveBeenCalledWith({ id: FORM, enabled: false });
    expect(structured(result)).toMatchObject({ enabled: false });
  });

  it("disables a form", async () => {
    spies.disable.mockResolvedValue({ ok: true, data: { ...form, enabled: false } });

    const result = await run({ action: "disable", id: FORM });

    expect(spies.disable).toHaveBeenCalledWith({ id: FORM });
    expect(structured(result)).toMatchObject({ enabled: false });
  });

  it("names the missing keys and does not call the interactor", async () => {
    for (const params of [
      { action: "get" },
      { action: "disable" },
      { action: "fields" },
      { action: "create", name: "x" },
      { action: "update", name: "x" },
    ])
      expect(textOf(await run(params))).toContain(VALIDATION_ERROR_PREFIX);

    expect(spies.get).not.toHaveBeenCalled();
    expect(spies.disable).not.toHaveBeenCalled();
    expect(spies.editor).not.toHaveBeenCalled();
    expect(spies.upsert).not.toHaveBeenCalled();
  });

  it("returns the interactor's refusal as a tool failure", async () => {
    spies.upsert.mockResolvedValue({
      ok: false,
      error: createZodError("This list already has a form.", ["typeId"], {
        error: CustomErrorCode.publicFormExists,
        kind: "conflict",
      }),
    });

    const result = await run({ action: "create", typeId: TYPE, name: "Second", config: createConfig() });

    expect(textOf(result)).toContain("already has a form");
    expect(typeof result === "string" || "structuredContent" in result).toBe(false);
  });

  it("documents the keys of every action in its description", () => {
    const description = manageFormsTool.inputSchema.shape.action.description ?? "";

    for (const action of ["list", "get", "fields", "create", "update", "disable"])
      expect(description).toMatch(new RegExp(`${action}: [a-zA-Z, ]+`, "u"));
  });
});
