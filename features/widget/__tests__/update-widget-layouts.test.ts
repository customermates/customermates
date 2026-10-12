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
  expectedVersions: { [FIRST]: 1, [SECOND]: 4 },
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
    expect(UpdateWidgetLayoutsSchema.safeParse({ layouts, expectedVersions: valid.expectedVersions }).success).toBe(
      false,
    );
  });

  it("requires the version of every widget it moves", () => {
    expect(UpdateWidgetLayoutsSchema.safeParse({ layouts: valid.layouts }).success).toBe(false);
    expect(
      UpdateWidgetLayoutsSchema.safeParse({ layouts: valid.layouts, expectedVersions: { [FIRST]: 1 } }).success,
    ).toBe(false);
  });

  const repository = (versions: Record<string, number>) => ({
    findLayoutTargets: vi
      .fn()
      .mockResolvedValue(
        Object.entries(versions).map(([id, version]) => ({ id, kind: "chart", layout: null, version, viewId: null })),
      ),
    listLayoutPlacements: vi.fn().mockResolvedValue([]),
    saveWidgetLayouts: vi.fn().mockResolvedValue([]),
  });

  it("returns a validation failure without writing", async () => {
    const repo = repository(valid.expectedVersions);
    const interactor = new UpdateWidgetLayoutsInteractor(repo);

    const result = await runWithTenant(createMockUser(), () =>
      interactor.invoke({ ...valid, layouts: { ...valid.layouts, lg: [{ i: FIRST, x: 8, y: 0, w: 6, h: 3 }] } }),
    );

    expect(!result.ok && interactorFailureKind(result.error)).toBe("validation");
    expect(repo.saveWidgetLayouts).not.toHaveBeenCalled();
  });

  it("refuses a stale widget version as a conflict without writing", async () => {
    const repo = repository({ [FIRST]: 2, [SECOND]: 4 });
    const result = await runWithTenant(createMockUser(), () => new UpdateWidgetLayoutsInteractor(repo).invoke(valid));

    expect(!result.ok && interactorFailureKind(result.error)).toBe("conflict");
    expect(repo.saveWidgetLayouts).not.toHaveBeenCalled();
  });

  it("saves a valid batch with the versions it read", async () => {
    const saved = [{ id: FIRST, version: 2, layout: { lg: valid.layouts.lg[0] } }];
    const repo = repository(valid.expectedVersions);
    repo.saveWidgetLayouts.mockResolvedValue(saved);

    const result = await runWithTenant(createMockUser(), () => new UpdateWidgetLayoutsInteractor(repo).invoke(valid));

    expect(result).toEqual({ ok: true, data: saved });
    expect(repo.saveWidgetLayouts).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ id: FIRST, expectedVersion: 1 }),
      expect.objectContaining({ id: SECOND, expectedVersion: 4 }),
    ]);
  });
});
