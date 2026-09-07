import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError, ForbiddenError } from "@/core/errors/app-errors";
import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";

const interactors = vi.hoisted(() => ({
  send: vi.fn(),
  save: vi.fn(),
  discard: vi.fn(),
  isMcpBearerValid: vi.fn(),
}));

vi.mock("@/env", () => ({ env: { BASE_URL: "http://localhost:4105" } }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));
vi.mock("@/core/di", () => ({
  getSendEmailInteractor: () => ({ invoke: interactors.send }),
  getSaveDraftInteractor: () => ({ invoke: interactors.save }),
  getDiscardDraftInteractor: () => ({ invoke: interactors.discard }),
  getAuthService: () => ({ isMcpBearerValid: interactors.isMcpBearerValid }),
}));

import { discardMessageDraftTool, saveMessageDraftTool, sendEmailTool } from "@/features/mcp-tools/messaging.mcp-tools";
import { createMcpRoute } from "../mcp-route-utils";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const THREAD_ID = "00000000-0000-4000-8000-000000000002";
const DRAFT_ID = "00000000-0000-4000-8000-000000000003";
const REVISION = "2026-09-04T10:00:00.001Z";
const BODY = "**Review this** with [a link](https://example.com)";
const URL = "http://localhost:4105/api/v1/mcp?toolsets=messaging";
const unauthenticatedHeaders: Record<string, string>[] = [
  {},
  { cookie: "app.session_token=test-session" },
  { authorization: "Bearer invalid-test-token" },
];
const email = {
  connectedAccountId: ACCOUNT_ID,
  to: [{ identifier: "recipient@example.com" }],
  subject: "Transport test",
  body: BODY,
  bodyFormat: "markdown",
};

type RpcResponse = {
  result?: {
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
    content?: Array<{ type: string; text: string }>;
    _meta?: unknown;
  };
  error?: { code: number; message: string };
};

let handler: ReturnType<typeof createMcpRoute>;

async function rpc(body: Record<string, unknown>, sessionId?: string) {
  const response = await handler(
    new Request(URL, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "x-api-key": "test-transport-only",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
  const text = await response.text();
  const data: RpcResponse | undefined = response.headers.get("content-type")?.includes("application/json")
    ? JSON.parse(text)
    : text
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice(6)) as RpcResponse)
        .at(-1);
  return { response, data };
}

async function call(name: string, args: Record<string, unknown>) {
  const initialized = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "messaging-transport-test", version: "1" },
    },
  });
  expect(initialized.response.status).toBe(200);
  const sessionId = initialized.response.headers.get("mcp-session-id") ?? undefined;
  if (sessionId) await rpc({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId);
  return rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }, sessionId);
}

beforeEach(() => {
  vi.resetAllMocks();
  handler = createMcpRoute({ messaging: [sendEmailTool, saveMessageDraftTool, discardMessageDraftTool] });
  interactors.send.mockResolvedValue({ ok: true, data: { messagingThreadId: THREAD_ID } });
  interactors.save.mockResolvedValue({
    ok: true,
    data: { id: DRAFT_ID, draftRevision: REVISION, messagingThreadId: THREAD_ID },
  });
  interactors.discard.mockResolvedValue({ ok: true, data: { threadId: THREAD_ID } });
});

describe("messaging MCP HTTP transport", () => {
  it("forwards Markdown, recipients, and the exact saved revision without composing the signature in the adapter", async () => {
    const args = {
      ...email,
      cc: ["copy@example.com"],
      bcc: ["blind@example.com"],
      draftMessageId: DRAFT_ID,
      draftRevision: REVISION,
    };
    const { response, data } = await call("send_email", args);

    expect(response.status).toBe(200);
    expect(interactors.send).toHaveBeenCalledExactlyOnceWith(args);
    expect(data?.result?.structuredContent).toEqual({ sent: true, threadId: THREAD_ID });
    expect(data?.result?.isError).not.toBe(true);
  });

  it("maps a reply result to the requested thread even when sent-copy adoption is pending", async () => {
    interactors.send.mockResolvedValue({ ok: true, data: null });
    const args = { ...email, threadId: THREAD_ID };
    const { data } = await call("send_email", args);

    expect(interactors.send).toHaveBeenCalledExactlyOnceWith(args);
    expect(data?.result?.structuredContent).toEqual({ sent: true, threadId: THREAD_ID });
  });

  it("reports a successful unresolved new email without retrying the interactor", async () => {
    interactors.send.mockResolvedValue({ ok: true, data: null });
    const { data } = await call("send_email", email);

    expect(interactors.send).toHaveBeenCalledOnce();
    expect(data?.result?.structuredContent).toEqual({ sent: true, threadId: null });
  });

  it.each([{ draftMessageId: DRAFT_ID }, { draftRevision: REVISION }, { bodyFormat: "rich_text" }])(
    "rejects invalid send contracts before invoking the interactor: %j",
    async (invalid) => {
      const { data } = await call("send_email", { ...email, ...invalid });

      expect(data?.error || data?.result?.isError).toBeTruthy();
      expect(interactors.send).not.toHaveBeenCalled();
    },
  );

  it.each([{ connectedAccountId: ACCOUNT_ID, recipients: ["recipient@example.com"] }, { threadId: THREAD_ID }])(
    "maps draft save/update and returns the opaque revision for %j",
    async (target) => {
      const args = { ...target, body: BODY, subject: "Draft subject", cc: ["copy@example.com"] };
      const { data } = await call("save_message_draft", args);

      expect(interactors.save).toHaveBeenCalledExactlyOnceWith(args);
      expect(interactors.send).not.toHaveBeenCalled();
      expect(data?.result?.structuredContent).toEqual({
        draftMessageId: DRAFT_ID,
        draftRevision: REVISION,
        threadId: THREAD_ID,
      });
    },
  );

  it("returns the latest draft revision after editing without delivering anything", async () => {
    const args = { connectedAccountId: ACCOUNT_ID, recipients: ["recipient@example.com"], body: BODY };
    const saved = await call("save_message_draft", args);
    const nextRevision = "2026-09-04T10:00:01.001Z";
    interactors.save.mockResolvedValue({
      ok: true,
      data: { id: DRAFT_ID, draftRevision: nextRevision, messagingThreadId: THREAD_ID },
    });
    const edited = { ...args, body: "**Edited draft**" };
    const updated = await call("save_message_draft", edited);

    expect(interactors.save).toHaveBeenNthCalledWith(1, args);
    expect(interactors.save).toHaveBeenNthCalledWith(2, edited);
    expect(saved.data?.result?.structuredContent).toMatchObject({ draftMessageId: DRAFT_ID, draftRevision: REVISION });
    expect(updated.data?.result?.structuredContent).toMatchObject({
      draftMessageId: DRAFT_ID,
      draftRevision: nextRevision,
    });
    expect(interactors.send).not.toHaveBeenCalled();
  });

  it.each([THREAD_ID, null])("maps exact-revision discard with result threadId=%s", async (threadId) => {
    interactors.discard.mockResolvedValue({ ok: true, data: { threadId } });
    const args = { messageId: DRAFT_ID, draftRevision: REVISION };
    const { data } = await call("discard_message_draft", args);

    expect(interactors.discard).toHaveBeenCalledExactlyOnceWith(args);
    expect(data?.result?.structuredContent).toEqual({ discarded: Boolean(threadId), threadId });
  });

  it("preserves a stale-revision failure as structured MCP failure, not a successful discard", async () => {
    interactors.discard.mockResolvedValue({
      ok: false,
      error: createZodError("Draft revision no longer exists", ["draftRevision"], {
        error: CustomErrorCode.draftMessageNotFound,
        kind: "not_found",
      }),
    });
    const { data } = await call("discard_message_draft", { messageId: DRAFT_ID, draftRevision: REVISION });

    expect(data?.result).toMatchObject({ isError: true, _meta: { failure: { kind: "not_found" } } });
    expect(data?.result?.structuredContent).toBeUndefined();
    expect(data?.result?.content?.[0].text).toContain("Draft revision no longer exists");
    expect(interactors.discard).toHaveBeenCalledOnce();
  });

  it.each([
    { name: "send_email", args: email, spy: interactors.send },
    { name: "save_message_draft", args: { threadId: THREAD_ID, body: BODY }, spy: interactors.save },
  ])("preserves $name interactor failures without success output or a retry", async ({ name, args, spy }) => {
    spy.mockResolvedValue({
      ok: false,
      error: createZodError("Operation unavailable", [], { error: CustomErrorCode.unipileServiceUnavailable }),
    });
    const { data } = await call(name, args);

    expect(data?.result?.isError).toBe(true);
    expect(data?.result?.structuredContent).toBeUndefined();
    expect(data?.result?.content?.[0].text).toContain("Operation unavailable");
    expect(spy).toHaveBeenCalledOnce();
  });

  it.each([
    [new AuthError(), "authentication"],
    [new ForbiddenError(), "authorization"],
  ])("preserves interactor access failures as MCP failures: %s", async (error, kind) => {
    interactors.send.mockRejectedValue(error);
    const { data } = await call("send_email", email);

    expect(data?.result).toMatchObject({ isError: true, _meta: { failure: { kind } } });
    expect(data?.result?.structuredContent).toBeUndefined();
    expect(interactors.send).toHaveBeenCalledOnce();
  });

  it.each(unauthenticatedHeaders)(
    "rejects missing API authentication before dispatching tools: %j",
    async (headers) => {
      interactors.isMcpBearerValid.mockResolvedValue(false);
      const response = await handler(new Request(URL, { method: "POST", headers: new Headers(headers) }));

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("oauth-protected-resource");
      expect(interactors.send).not.toHaveBeenCalled();
      expect(interactors.save).not.toHaveBeenCalled();
      expect(interactors.discard).not.toHaveBeenCalled();
    },
  );
});
