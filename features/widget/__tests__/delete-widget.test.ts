import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const { widgetFindIds } = vi.hoisted(() => ({ widgetFindIds: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getWidgetRepo: () => ({ findIds: widgetFindIds }),
}));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { DeleteWidgetInteractor } from "../delete-widget.interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";

const WIDGET_ID = "00000000-0000-4000-8000-000000000001";

describe("DeleteWidgetInteractor", () => {
  let repo: any;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = { deleteWidget: vi.fn().mockResolvedValue(undefined) };
  });

  it("deletes a widget that exists", async () => {
    widgetFindIds.mockResolvedValue(new Set([WIDGET_ID]));

    const result: any = await new DeleteWidgetInteractor(repo).invoke({ id: WIDGET_ID });

    expect(result.ok).toBe(true);
    expect(repo.deleteWidget).toHaveBeenCalledWith(WIDGET_ID);
  });

  it("rejects a missing widget with widgetNotFound instead of silently succeeding", async () => {
    widgetFindIds.mockResolvedValue(new Set<string>());

    const result: any = await new DeleteWidgetInteractor(repo).invoke({ id: WIDGET_ID });

    expect(result.ok).toBe(false);
    expect(result.error.issues.some((issue: any) => issue.params?.error === CustomErrorCode.widgetNotFound)).toBe(true);
    expect(repo.deleteWidget).not.toHaveBeenCalled();
  });
});
