import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const spies = vi.hoisted(() => ({
  upsert: vi.fn(),
  getAll: vi.fn(),
  getByEntityType: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => {
    const translate = (key: string) => key;
    translate.raw = (key: string) => key;
    return Promise.resolve(translate);
  },
}));
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getUpsertCustomColumnInteractor: () => ({ invoke: spies.upsert }),
  getGetCustomColumnsInteractor: () => ({ invoke: spies.getAll }),
  getGetCustomColumnsByEntityTypeInteractor: () => ({
    invoke: spies.getByEntityType,
  }),
  getDeleteCustomColumnInteractor: () => ({ invoke: spies.remove }),
}));

import { manageCustomColumnsTool } from "../custom-column.mcp-tools";
import { mcpToolResultText } from "../mcp-tool";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const existingOptionValue = "00000000-0000-4000-8000-000000000009";
const existingColumnId = "00000000-0000-4000-8000-000000000123";

function upsertParams(options: Record<string, unknown>[]) {
  return {
    action: "upsert" as const,
    intent: "create" as const,
    entityType: "deal" as const,
    type: "singleSelect" as const,
    label: "Install Stage",
    options: { options },
  };
}

describe("manage_custom_columns option defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spies.upsert.mockResolvedValue({
      ok: true,
      data: { id: "column-1", label: "Install Stage" },
    });
  });

  it("creates a select field from labels alone", async () => {
    const result = await manageCustomColumnsTool.execute(
      upsertParams([{ label: "Survey" }, { label: "Quoted" }, { label: "Scheduled" }, { label: "Installed" }]) as never,
    );

    expect(spies.upsert).toHaveBeenCalledTimes(1);
    const sent = spies.upsert.mock.calls[0][0];
    expect(sent.options.options).toHaveLength(4);
    expect(sent.options.options.map((option: { label: string }) => option.label)).toEqual([
      "Survey",
      "Quoted",
      "Scheduled",
      "Installed",
    ]);
    expect(sent.options.options.map((option: { index: number }) => option.index)).toEqual([0, 1, 2, 3]);
    expect(sent.options.options.map((option: { isDefault: boolean }) => option.isDefault)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    for (const option of sent.options.options) {
      expect(option.value).toMatch(UUID);
      expect(option.color).toBe("secondary");
    }
    expect(new Set(sent.options.options.map((option: { value: string }) => option.value)).size).toBe(4);
    expect(String(result)).toContain("created successfully");
  });

  it("accepts the preferred flat selectOptions shape and a null id for an explicit create", async () => {
    const params = {
      action: "upsert" as const,
      intent: "create" as const,
      id: null,
      entityType: "contact" as const,
      type: "singleSelect" as const,
      label: "AI maturity CUS125-E2E-3F186FBA-8D41C2",
      selectOptions: [
        {
          label: "Exploring",
          value: "9e7a5c21-4d88-4f6a-9b32-71c0e5d4a8f3",
          color: "info" as const,
          isDefault: false,
          index: 0,
        },
        {
          label: "Piloting",
          value: "2c4f8b73-a159-47de-b6c1-5e90d2a7f844",
          color: "warning" as const,
          isDefault: false,
          index: 1,
        },
        {
          label: "Scaling",
          value: "d1b6e902-7c35-4a8f-8d74-3f29c6b105ee",
          color: "success" as const,
          isDefault: false,
          index: 2,
        },
      ],
    };

    const parsed = manageCustomColumnsTool.inputSchema.parse(params);
    const result = await manageCustomColumnsTool.execute(parsed);

    expect(String(result)).toContain("created successfully");
    expect(spies.upsert).toHaveBeenCalledWith({
      entityType: "contact",
      type: "singleSelect",
      label: "AI maturity CUS125-E2E-3F186FBA-8D41C2",
      options: { options: params.selectOptions },
    });
  });

  it("completes defaults for preferred selectOptions just like the legacy shape", async () => {
    await manageCustomColumnsTool.execute({
      action: "upsert",
      intent: "create",
      entityType: "deal",
      type: "singleSelect",
      label: "Preferred stage",
      selectOptions: [{ label: "Survey" }, { label: "Won" }],
    });

    const sent = spies.upsert.mock.calls[0][0];
    expect(sent.options.options.map((option: { label: string }) => option.label)).toEqual(["Survey", "Won"]);
    expect(sent.options.options.map((option: { isDefault: boolean }) => option.isDefault)).toEqual([true, false]);
    for (const option of sent.options.options) {
      expect(option.value).toMatch(UUID);
      expect(option.color).toBe("secondary");
    }
  });

  it("rejects ambiguous duplicate select option shapes without writing", async () => {
    const result = await manageCustomColumnsTool.execute({
      ...upsertParams([{ label: "Legacy" }]),
      selectOptions: [{ label: "Preferred" }],
    } as never);

    expect(mcpToolResultText(result)).toContain("but not both");
    expect(result).toMatchObject({
      failure: { kind: "validation", issues: [{ path: ["selectOptions"] }] },
    });
    expect(spies.upsert).not.toHaveBeenCalled();
  });

  it.each([
    { action: "upsert", intent: "update", id: null, entityType: "deal", type: "plain", label: "Roof note" },
    { action: "delete", id: null },
  ])("does not normalize a null id outside explicit create", async (params) => {
    const result = await manageCustomColumnsTool.execute(params as never);

    expect(mcpToolResultText(result)).toContain("Validation error:");
    expect(result).toMatchObject({ failure: { kind: "validation", issues: [{ path: ["id"] }] } });
    expect(spies.upsert).not.toHaveBeenCalled();
    expect(spies.remove).not.toHaveBeenCalled();
  });

  it.each([
    [{ selectOptions: [{ label: "Wrong shape" }] }, ["selectOptions"]],
    [{ options: { options: [{ label: "Wrong legacy shape" }] } }, ["options", "options"]],
  ])("rejects select choices for a non-select column", async (config, path) => {
    const result = await manageCustomColumnsTool.execute({
      action: "upsert",
      intent: "create",
      entityType: "deal",
      type: "plain",
      label: "Roof note",
      ...config,
    } as never);

    expect(mcpToolResultText(result)).toContain("only when type=singleSelect");
    expect(result).toMatchObject({ failure: { kind: "validation", issues: [{ path }] } });
    expect(spies.upsert).not.toHaveBeenCalled();
  });

  it("preserves an existing option value so its stored records survive an edit", async () => {
    await manageCustomColumnsTool.execute(
      upsertParams([
        {
          label: "Survey",
          value: existingOptionValue,
          color: "success",
          isDefault: true,
          index: 3,
        },
        { label: "Quoted" },
      ]) as never,
    );

    const sent = spies.upsert.mock.calls[0][0];
    expect(sent.options.options[0]).toEqual({
      value: existingOptionValue,
      label: "Survey",
      color: "success",
      isDefault: true,
      index: 3,
    });
    expect(sent.options.options[1].value).toMatch(UUID);
    expect(sent.options.options[1].value).not.toBe(existingOptionValue);
  });

  it("writes nothing when the model invents an id for a column that does not exist", async () => {
    spies.getAll.mockResolvedValue({ data: [] });

    const result = await manageCustomColumnsTool.execute({
      action: "upsert",
      intent: "update",
      id: existingColumnId,
      entityType: "deal",
      type: "plain",
      label: "Roof note",
    } as never);

    expect(mcpToolResultText(result)).toContain("Validation error:");
    expect(result).toMatchObject({
      failure: {
        kind: "not_found",
        issues: [{ customCode: "customColumnNotFound" }],
      },
    });
    expect(spies.upsert).not.toHaveBeenCalled();
  });

  it("updates only when intent=update, an existing id and its unchanged label are present", async () => {
    spies.getAll.mockResolvedValue({
      data: [
        {
          id: existingColumnId,
          label: "Roof note",
          type: "plain",
          entityType: "deal",
        },
      ],
    });

    const result = await manageCustomColumnsTool.execute({
      action: "upsert",
      intent: "update",
      id: existingColumnId,
      entityType: "deal",
      type: "plain",
      label: "Roof note",
    } as never);

    expect(spies.upsert).toHaveBeenCalledWith({
      id: existingColumnId,
      entityType: "deal",
      type: "plain",
      label: "Roof note",
    });
    expect(String(result)).toContain("updated successfully");
  });

  it("refuses to repurpose an existing column by changing its label", async () => {
    spies.getAll.mockResolvedValue({
      data: [
        {
          id: existingColumnId,
          label: "Type",
          type: "plain",
          entityType: "organization",
        },
      ],
    });

    const result = await manageCustomColumnsTool.execute({
      action: "upsert",
      intent: "update",
      id: existingColumnId,
      entityType: "organization",
      type: "plain",
      label: "AI maturity",
    } as never);

    expect(mcpToolResultText(result)).toContain('Refusing to rename the existing custom column "Type"');
    expect(result).toMatchObject({
      failure: { kind: "validation", issues: [{ path: ["label"] }] },
    });
    expect(spies.upsert).not.toHaveBeenCalled();
  });

  it("refuses to update a same-named column through the wrong entity type", async () => {
    spies.getAll.mockResolvedValue({
      data: [{ id: existingColumnId, label: "Status", type: "plain", entityType: "organization" }],
    });

    const result = await manageCustomColumnsTool.execute({
      action: "upsert",
      intent: "update",
      id: existingColumnId,
      entityType: "contact",
      type: "plain",
      label: "Status",
    } as never);

    expect(mcpToolResultText(result)).toContain("Refusing to update a custom column on organization as contact");
    expect(result).toMatchObject({ failure: { kind: "validation", issues: [{ path: ["entityType"] }] } });
    expect(spies.upsert).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "create intent with an id",
      params: { intent: "create", id: existingColumnId },
      path: "id",
    },
    {
      name: "update intent without an id",
      params: { intent: "update" },
      path: "id",
    },
    {
      name: "an id without explicit update intent",
      params: { id: existingColumnId },
      path: "intent",
    },
    {
      name: "an unknown mutation intent",
      params: { intent: "replace" },
      path: "intent",
    },
  ])("rejects $name without reading or mutating columns", async ({ params, path }) => {
    const result = await manageCustomColumnsTool.execute({
      action: "upsert",
      entityType: "deal",
      type: "plain",
      label: "AI maturity",
      ...params,
    } as never);

    expect(mcpToolResultText(result)).toContain("Validation error:");
    expect(result).toMatchObject({
      failure: { kind: "validation", issues: [{ path: [path] }] },
    });
    expect(spies.getAll).not.toHaveBeenCalled();
    expect(spies.upsert).not.toHaveBeenCalled();
  });

  it("keeps a stage weight the caller passed through", async () => {
    await manageCustomColumnsTool.execute(
      upsertParams([{ label: "Survey", value: existingOptionValue, weight: 40 }, { label: "Won" }]) as never,
    );

    const sent = spies.upsert.mock.calls[0][0];
    expect(sent.options.options[0]).toMatchObject({
      value: existingOptionValue,
      weight: 40,
    });
    expect(sent.options.options[1].weight).toBeUndefined();
  });

  it("leaves non-select columns untouched", async () => {
    await manageCustomColumnsTool.execute({
      action: "upsert",
      intent: "create",
      entityType: "deal",
      type: "plain",
      label: "Roof note",
    } as never);

    expect(spies.upsert).toHaveBeenCalledWith({
      entityType: "deal",
      type: "plain",
      label: "Roof note",
    });
  });
});
