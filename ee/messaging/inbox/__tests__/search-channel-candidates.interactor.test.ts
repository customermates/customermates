import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureStatus } from "@/core/validation/validation.utils";

import { SearchChannelCandidatesInteractor } from "../search-channel-candidates.interactor";

const repo = { searchChannelCandidates: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  repo.searchChannelCandidates.mockResolvedValue([]);
});

describe("SearchChannelCandidatesInteractor", () => {
  it("answers a NUL character in the query with a 400 validation failure instead of querying Postgres", async () => {
    const result = await new SearchChannelCandidatesInteractor(repo, mockEntitlementService()).invoke({
      query: "ab\u0000",
    });

    if (result.ok) throw new Error("the query was accepted");
    expect(result.error.issues.map((issue) => (issue.code === "custom" ? issue.params?.error : undefined))).toEqual([
      CustomErrorCode.mustNotContainNullChars,
    ]);
    expect(interactorFailureStatus(result.error)).toBe(400);
    expect(repo.searchChannelCandidates).not.toHaveBeenCalled();
  });

  it("still searches an ordinary query", async () => {
    const result = await new SearchChannelCandidatesInteractor(repo, mockEntitlementService()).invoke({
      query: " ada ",
    });

    expect(result).toEqual({ ok: true, data: [] });
    expect(repo.searchChannelCandidates).toHaveBeenCalledWith("ada");
  });
});
