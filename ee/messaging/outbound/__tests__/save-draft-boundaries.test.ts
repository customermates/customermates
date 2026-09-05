import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

let mockUser = createMockUser();
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { ForbiddenError } from "@/core/errors/app-errors";
import { SaveDraftInteractor } from "../save-draft.interactor";
import { SaveNewThreadDraftInteractor } from "../save-new-thread-draft.interactor";
import { SaveReplyDraftInteractor } from "../save-reply-draft.interactor";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const THREAD_ID = "00000000-0000-4000-8000-000000000002";
const newDraft = { connectedAccountId: ACCOUNT_ID, recipients: ["recipient@example.com"], body: "**Draft**" };
const replyDraft = { subject: "Re: Subject", body: "**Reply**", cc: ["copy@example.com"], bcc: ["blind@example.com"] };

function harness() {
  const core = new SaveDraftInteractor(
    {
      findThreadByIdOrThrow: vi.fn(),
      findOrCreateDraftThread: vi.fn(),
      findSelfAttendeeForThread: vi.fn(),
      upsertThreadDraftOrThrow: vi.fn(),
    },
    { findUsableAccountByIdOrThrow: vi.fn() },
    mockEntitlementService(),
  );
  const outcome = {
    ok: false as const,
    error: new z.ZodError([{ code: "custom", path: [], message: "Core outcome" }]),
  };
  const invoke = vi.spyOn(core, "invoke").mockResolvedValue(outcome);
  return { invoke, outcome, create: new SaveNewThreadDraftInteractor(core), reply: new SaveReplyDraftInteractor(core) };
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockUser = createMockUser();
});

describe("draft interactor entry boundaries", () => {
  it("delegates a valid new draft once and preserves the core outcome", async () => {
    const { create, invoke, outcome } = harness();
    expect(await create.invoke(newDraft)).toBe(outcome);
    expect(invoke).toHaveBeenCalledExactlyOnceWith(newDraft);
  });

  it("binds a valid reply to the path-owned thread and preserves all authored fields", async () => {
    const { reply, invoke, outcome } = harness();
    expect(await reply.invoke({ threadId: THREAD_ID, draft: replyDraft })).toBe(outcome);
    expect(invoke).toHaveBeenCalledExactlyOnceWith({ ...replyDraft, threadId: THREAD_ID });
  });

  it.each([
    null,
    [],
    "invalid",
    {},
    { ...newDraft, connectedAccountId: "invalid" },
    { ...newDraft, recipients: [] },
    { connectedAccountId: ACCOUNT_ID, body: "Draft" },
    { recipients: ["recipient@example.com"], body: "Draft" },
    { ...newDraft, threadId: THREAD_ID },
    { ...newDraft, unexpected: true },
  ])("rejects an invalid new-draft payload before the core operation: %j", async (input) => {
    const { create, invoke } = harness();
    const result = await Reflect.apply(create.invoke.bind(create), undefined, [input]);
    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(z.ZodError);
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    { ...replyDraft, threadId: THREAD_ID },
    { ...replyDraft, connectedAccountId: ACCOUNT_ID },
    { ...replyDraft, recipients: ["other@example.com"] },
    { ...replyDraft, unexpected: true },
    null,
    [],
    "invalid",
    {},
  ])("rejects invalid reply content and target overrides: %j", async (draft) => {
    const { reply, invoke } = harness();
    const result = await Reflect.apply(reply.invoke.bind(reply), undefined, [{ threadId: THREAD_ID, draft }]);
    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(z.ZodError);
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    { threadId: "invalid", draft: replyDraft },
    { draft: replyDraft },
    { threadId: THREAD_ID, draft: replyDraft, unexpected: true },
    null,
  ])("validates the reply envelope at the interactor boundary: %j", async (input) => {
    const { reply, invoke } = harness();
    const result = await Reflect.apply(reply.invoke.bind(reply), undefined, [input]);
    expect(result.ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("enforces create permission before either draft operation", async () => {
    mockUser = createMockUserWithPermissions([]);
    const { create, reply, invoke } = harness();
    await expect(create.invoke(newDraft)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reply.invoke({ threadId: THREAD_ID, draft: replyDraft })).rejects.toBeInstanceOf(ForbiddenError);
    expect(invoke).not.toHaveBeenCalled();
  });
});
