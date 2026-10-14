import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { createRestRouteWorkspace } = await import("@/tests/helpers/rest-route-workspace");
const { assertPublishedResponse } = await import("@/tests/helpers/openapi-validator");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { POST: setState } = await import("../threads/[id]/state/route");
const { POST: moveThread } = await import("../threads/[id]/move/route");
const { POST: createConnectLink } = await import("../connected-accounts/connect-link/route");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

type Workspace = Awaited<ReturnType<typeof createRestRouteWorkspace>>;
type Handler = (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>;

async function inboxWorkspace() {
  const w = await createRestRouteWorkspace();
  cleanups.push(w.cleanup);
  const threadId = await runWithoutTenant(async () => {
    await prisma.subscription.create({ data: { companyId: w.companyId, status: "active", plan: "pro" } });
    const account = await prisma.connectedAccount.create({
      data: {
        companyId: w.companyId,
        userId: w.admin.id,
        provider: "mail",
        unipileAccountId: `triage-${randomUUID()}`,
        status: "ok",
      },
    });
    const thread = await prisma.messagingThread.create({
      data: {
        companyId: w.companyId,
        connectedAccountId: account.id,
        provider: "mail",
        unipileThreadId: `triage-${randomUUID()}`,
      },
    });
    return thread.id;
  });
  return { ...w, threadId };
}

async function post(
  w: Workspace,
  user: Workspace["admin"],
  handler: Handler,
  specPath: string,
  body: unknown,
  id = "",
) {
  const response = await w.as(user, () =>
    handler(
      new NextRequest(`http://127.0.0.1:4000/api${specPath.replace("{id}", id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) },
    ),
  );
  const result = { status: response.status, body: (await response.json()) as Record<string, unknown> };
  assertPublishedResponse(specPath, "post", result.status, result.body);
  return result;
}

function thread(threadId: string) {
  return runWithoutTenant(() =>
    prisma.messagingThread.findUniqueOrThrow({
      where: { id: threadId },
      select: { state: true, sharedToCrm: true },
    }),
  );
}

const STATE = "/v1/messaging/threads/{id}/state";
const MOVE = "/v1/messaging/threads/{id}/move";
const CONNECT = "/v1/messaging/connected-accounts/connect-link";

describeDatabase("inbox triage and connect link REST routes on PostgreSQL", () => {
  it("sets a conversation's state and never its sharing", async () => {
    const w = await inboxWorkspace();

    const closed = await post(w, w.admin, setState, STATE, { state: "closed" }, w.threadId);
    expect(closed).toEqual({ status: 200, body: { threadId: w.threadId, state: "closed" } });
    expect(await thread(w.threadId)).toEqual({ state: "closed", sharedToCrm: false });

    const shared = await post(w, w.admin, setState, STATE, { state: "open", sharedToCrm: true }, w.threadId);
    expect(shared).toMatchObject({ status: 400, body: { error: { kind: "validation" } } });
    expect(await thread(w.threadId)).toEqual({ state: "closed", sharedToCrm: false });
  }, 180_000);

  it("checks the folder before it reaches the provider", async () => {
    const w = await inboxWorkspace();

    const moved = await post(w, w.admin, moveThread, MOVE, { folderId: "archive" }, w.threadId);
    expect(moved).toMatchObject({
      status: 404,
      body: { error: { kind: "not_found", issues: [expect.objectContaining({ customCode: "emailFolderNotFound" })] } },
    });
  }, 180_000);

  it("never changes or moves another workspace's conversation", async () => {
    const w = await inboxWorkspace();
    const other = await inboxWorkspace();

    const foreignState = await post(other, other.admin, setState, STATE, { state: "spam" }, w.threadId);
    expect(foreignState).toMatchObject({ status: 404, body: { error: { kind: "not_found" } } });
    expect(await thread(w.threadId)).toEqual({ state: "unread", sharedToCrm: false });

    const foreignMove = await post(other, other.admin, moveThread, MOVE, { folderId: "archive" }, w.threadId);
    expect(foreignMove).toMatchObject({ status: 404, body: { error: { kind: "not_found" } } });
  }, 180_000);

  it("refuses members without inbox permissions", async () => {
    const w = await inboxWorkspace();

    const state = await post(w, w.member, setState, STATE, { state: "closed" }, w.threadId);
    expect(state).toMatchObject({ status: 403, body: { error: { kind: "authorization" } } });
    expect(await thread(w.threadId)).toEqual({ state: "unread", sharedToCrm: false });

    const move = await post(w, w.member, moveThread, MOVE, { folderId: "archive" }, w.threadId);
    expect(move).toMatchObject({ status: 403, body: { error: { kind: "authorization" } } });

    const link = await post(w, w.member, (request) => createConnectLink(request), CONNECT, { channel: "google" });
    expect(link).toMatchObject({ status: 403, body: { error: { kind: "authorization" } } });
  }, 180_000);
});
