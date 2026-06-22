import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const { threadFindIds } = vi.hoisted(() => ({ threadFindIds: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getMessagingRepo: () => ({ findThreadIds: threadFindIds }),
}));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { UpdateThreadInteractor } from "../update-thread.interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";

const THREAD_ID = "00000000-0000-4000-8000-000000000001";

describe("UpdateThreadInteractor", () => {
  let repo: any;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = {
      setThreadState: vi.fn().mockResolvedValue(undefined),
      setThreadSharedToCrm: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("updates a thread that exists", async () => {
    threadFindIds.mockResolvedValue(new Set([THREAD_ID]));

    const result: any = await new UpdateThreadInteractor(repo).invoke({ threadId: THREAD_ID, sharedToCrm: true });

    expect(result.ok).toBe(true);
    expect(repo.setThreadSharedToCrm).toHaveBeenCalledWith({ threadId: THREAD_ID, shared: true });
  });

  it("rejects a missing thread with threadNotFound instead of silently succeeding", async () => {
    threadFindIds.mockResolvedValue(new Set<string>());

    const result: any = await new UpdateThreadInteractor(repo).invoke({ threadId: THREAD_ID, sharedToCrm: true });

    expect(result.ok).toBe(false);
    expect(result.error.issues.some((issue: any) => issue.params?.error === CustomErrorCode.threadNotFound)).toBe(true);
    expect(repo.setThreadSharedToCrm).not.toHaveBeenCalled();
  });
});
