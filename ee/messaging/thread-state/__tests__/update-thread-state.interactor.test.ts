import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { ForbiddenError } from "@/core/errors/app-errors";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

let mockUser = createMockUserWithPermissions([{ resource: Resource.inboxMessages, action: Action.update }]);

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";
import { UpdateThreadStateInteractor } from "../update-thread-state.interactor";
import type { UpdateThreadInteractor } from "../update-thread.interactor";

const THREAD_ID = "00000000-0000-4000-8000-000000000001";

const updateThread = { invoke: vi.fn() };
const interactor = () => new UpdateThreadStateInteractor(updateThread as unknown as UpdateThreadInteractor);

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = createMockUserWithPermissions([{ resource: Resource.inboxMessages, action: Action.update }]);
  updateThread.invoke.mockResolvedValue({ ok: true, data: null });
});

describe("UpdateThreadStateInteractor", () => {
  it("sets only the state through the update-thread interactor and returns it", async () => {
    const result = await interactor().invoke({ threadId: THREAD_ID, state: "closed" });

    expect(result).toEqual({ ok: true, data: { threadId: THREAD_ID, state: "closed" } });
    expect(updateThread.invoke).toHaveBeenCalledExactlyOnceWith({ threadId: THREAD_ID, state: "closed" });
  });

  it.each([
    ["sharing the conversation", { threadId: THREAD_ID, state: "open", sharedToCrm: true }],
    ["a missing state", { threadId: THREAD_ID }],
    ["an unknown state", { threadId: THREAD_ID, state: "archived" }],
    ["a thread id that is not a UUID", { threadId: "thread-1", state: "open" }],
  ])("rejects %s without touching the conversation", async (_case, input) => {
    const result = await interactor().invoke(input as never);

    expect(result.ok).toBe(false);
    expect(updateThread.invoke).not.toHaveBeenCalled();
  });

  it("passes on a conversation the caller cannot see as threadNotFound", async () => {
    const error = createZodError("Thread not found", ["threadId"], { error: CustomErrorCode.threadNotFound });
    updateThread.invoke.mockResolvedValue({ ok: false, error });

    expect(await interactor().invoke({ threadId: THREAD_ID, state: "spam" })).toEqual({ ok: false, error });
  });

  it("denies a caller without Inbox messages Edit before anything runs", async () => {
    mockUser = createMockUserWithPermissions([{ resource: Resource.inboxMessages, action: Action.readAll }]);

    await expect(interactor().invoke({ threadId: THREAD_ID, state: "closed" })).rejects.toBeInstanceOf(ForbiddenError);
    expect(updateThread.invoke).not.toHaveBeenCalled();
  });
});
