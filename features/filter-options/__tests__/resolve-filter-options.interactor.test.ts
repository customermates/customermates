import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { ResolveFilterOptionsInteractor } from "../resolve-filter-options.interactor";

const FIRST_ID = "10000000-0000-4000-8000-000000000001";
const AFTER_FIRST_PAGE_ID = "10000000-0000-4000-8000-000000000101";

describe("ResolveFilterOptionsInteractor", () => {
  const repo = { resolve: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the exact selected IDs without a list-page query", async () => {
    repo.resolve.mockResolvedValue([
      { key: FIRST_ID, label: "First" },
      { key: AFTER_FIRST_PAGE_ID, label: "After page one" },
    ]);
    const interactor = new ResolveFilterOptionsInteractor(repo);

    const result = await interactor.invoke({ source: "organization", ids: [FIRST_ID, AFTER_FIRST_PAGE_ID] });

    expect(repo.resolve).toHaveBeenCalledWith({
      source: "organization",
      ids: [FIRST_ID, AFTER_FIRST_PAGE_ID],
    });
    expect(result).toEqual({
      ok: true,
      data: [
        { key: FIRST_ID, label: "First" },
        { key: AFTER_FIRST_PAGE_ID, label: "After page one" },
      ],
    });
  });
});
