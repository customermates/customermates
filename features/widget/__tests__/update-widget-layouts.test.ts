import { describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { interactorFailureKind } from "@/core/validation/validation.utils";
import { MOCK_ENV_MODULE, MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { UpdateWidgetLayoutsInteractor, UpdateWidgetLayoutsSchema } from "../update-widget-layouts.interactor";

const FIRST = "00000000-0000-4000-8000-000000000001";
const SECOND = "00000000-0000-4000-8000-000000000002";

const valid = {
  layouts: {
    xs: [{ i: FIRST, x: 0, y: 0, w: 2, h: 3 }],
    sm: [{ i: FIRST, x: 0, y: 0, w: 4, h: 3 }],
    md: [{ i: FIRST, x: 4, y: 0, w: 4, h: 3 }],
    lg: [
      { i: FIRST, x: 6, y: 0, w: 6, h: 3 },
      { i: SECOND, x: 0, y: 3, w: 12, h: 2 },
    ],
  },
};

describe("widget layout batch contract", () => {
  it("accepts every breakpoint in its own column count", () => {
    expect(UpdateWidgetLayoutsSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["a placement wider than its breakpoint", { ...valid.layouts, md: [{ i: FIRST, x: 4, y: 0, w: 6, h: 3 }] }],
    ["a column past the grid", { ...valid.layouts, xs: [{ i: FIRST, x: 2, y: 0, w: 1, h: 3 }] }],
    ["a fractional row", { ...valid.layouts, lg: [{ i: FIRST, x: 0, y: 0.5, w: 6, h: 3 }] }],
    ["a missing row", { ...valid.layouts, lg: [{ i: FIRST, x: 0, w: 6, h: 3 }] }],
    ["an empty size", { ...valid.layouts, lg: [{ i: FIRST, x: 0, y: 0, w: 0, h: 3 }] }],
    ["a widget reference that is not an id", { ...valid.layouts, lg: [{ i: "widget", x: 0, y: 0, w: 6, h: 3 }] }],
    ["an unknown placement key", { ...valid.layouts, lg: [{ i: FIRST, x: 0, y: 0, w: 6, h: 3, static: true }] }],
    ["a missing breakpoint", { xs: [], sm: [], md: [] }],
  ])("rejects %s", (_, layouts) => {
    expect(UpdateWidgetLayoutsSchema.safeParse({ layouts }).success).toBe(false);
  });

  it("returns a validation failure without writing", async () => {
    const repo = { updateWidgetLayouts: vi.fn() };
    const interactor = new UpdateWidgetLayoutsInteractor(repo);

    const result = await runWithTenant(createMockUser(), () =>
      interactor.invoke({ layouts: { ...valid.layouts, lg: [{ i: FIRST, x: 8, y: 0, w: 6, h: 3 }] } }),
    );

    expect(!result.ok && interactorFailureKind(result.error)).toBe("validation");
    expect(repo.updateWidgetLayouts).not.toHaveBeenCalled();
  });

  it("saves a valid batch through the repository", async () => {
    const saved = [{ id: FIRST, version: 2, layout: { lg: valid.layouts.lg[0] } }];
    const repo = { updateWidgetLayouts: vi.fn().mockResolvedValue(saved) };
    const interactor = new UpdateWidgetLayoutsInteractor(repo);

    const result = await runWithTenant(createMockUser(), () => interactor.invoke(valid));

    expect(result).toEqual({ ok: true, data: saved });
    expect(repo.updateWidgetLayouts).toHaveBeenCalledExactlyOnceWith(valid);
  });
});
