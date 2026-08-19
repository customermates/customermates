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
  getGetCustomColumnsByEntityTypeInteractor: () => ({ invoke: spies.getByEntityType }),
  getDeleteCustomColumnInteractor: () => ({ invoke: spies.remove }),
}));

import { manageCustomColumnsTool } from "../custom-column.mcp-tools";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const existingOptionValue = "00000000-0000-4000-8000-000000000009";

function upsertParams(options: Record<string, unknown>[]) {
  return {
    action: "upsert" as const,
    entityType: "deal" as const,
    type: "singleSelect" as const,
    label: "Install Stage",
    options: { options },
  };
}

describe("manage_custom_columns option defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spies.upsert.mockResolvedValue({ ok: true, data: { id: "column-1", label: "Install Stage" } });
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

  it("preserves an existing option value so its stored records survive an edit", async () => {
    await manageCustomColumnsTool.execute(
      upsertParams([
        { label: "Survey", value: existingOptionValue, color: "success", isDefault: true, index: 3 },
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
      id: "00000000-0000-4000-8000-000000000123",
      entityType: "deal",
      type: "plain",
      label: "Roof note",
    } as never);

    expect(String(result)).toContain("Validation error:");
    expect(spies.upsert).not.toHaveBeenCalled();
  });

  it("keeps a stage weight the caller passed through", async () => {
    await manageCustomColumnsTool.execute(
      upsertParams([{ label: "Survey", value: existingOptionValue, weight: 40 }, { label: "Won" }]) as never,
    );

    const sent = spies.upsert.mock.calls[0][0];
    expect(sent.options.options[0]).toMatchObject({ value: existingOptionValue, weight: 40 });
    expect(sent.options.options[1].weight).toBeUndefined();
  });

  it("leaves non-select columns untouched", async () => {
    await manageCustomColumnsTool.execute({
      action: "upsert",
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
