import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import messages from "@/i18n/locales/en.json";

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
  getTranslations: (namespace?: string) =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace: namespace as never })),
}));

await import("@/core/di");
await import("@/features/mcp-tools/tool-registry");
const { createRestRouteWorkspace, postAs, restRoute } = await import("@/tests/helpers/rest-route-workspace");
const { executeMcpTool } = await import("@/features/mcp-tools/mcp-tool");
const { manageRoutinesTool } = await import("@/features/mcp-tools/routine.mcp-tools");
const { getGetRoutineRunsInteractor } = await import("@/core/di");
const { PrismaRoutineRepo } = await import("../prisma-routine.repository");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const runsRoute = await restRoute("/v1/routines/runs");

type Workspace = Awaited<ReturnType<typeof createRestRouteWorkspace>>;

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];
const RUN_COUNT = 27;

const invalidCursor = {
  kind: "validation",
  issues: [
    {
      code: "custom",
      path: ["cursor"],
      message: messages.Common.errors.routineRunCursorInvalid,
      customCode: "routineRunCursorInvalid",
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

async function workspaceWithRoutine() {
  const w = await createRestRouteWorkspace();
  cleanups.push(w.cleanup);
  const routineId = randomUUID();
  const base = Date.parse("2026-09-01T08:00:00.000Z");
  await runWithoutTenant(async () => {
    await prisma.routine.create({
      data: {
        id: routineId,
        companyId: w.companyId,
        ownerUserId: w.admin.id,
        name: "Weekly review",
        prompt: "Summarise.",
        triggerKind: "schedule",
      },
    });
    await prisma.routineRun.createMany({
      data: Array.from({ length: RUN_COUNT }, (_, index) => ({
        id: randomUUID(),
        companyId: w.companyId,
        routineId,
        executedByUserId: w.admin.id,
        executedByName: "Admin",
        status: "succeeded" as const,
        triggerKind: "schedule" as const,
        summary: `Run ${index}`,
        scheduledFor: new Date(base + index * 60_000),
        createdAt: new Date(base + index * 60_000),
      })),
    });
  });
  return { w, routineId };
}

async function runsAsMcp(w: Workspace, input: unknown) {
  return w.as(w.admin, () =>
    executeMcpTool(manageRoutinesTool as never, [manageRoutinesTool.inputSchema.parse(input)]),
  );
}

describeDatabase("routine run history cursor", () => {
  it("answers a malformed cursor on a readable routine with a structured validation failure", async () => {
    const { w, routineId } = await workspaceWithRoutine();
    const paging = vi.spyOn(PrismaRoutineRepo.prototype, "getRoutineRuns");

    expect(await postAs(w, w.admin, runsRoute, { id: routineId, cursor: "bad" })).toEqual({
      status: 400,
      body: { error: invalidCursor },
    });

    const mcp = await runsAsMcp(w, { action: "runs", id: routineId, cursor: "bad" });
    expect(mcp).toEqual({ ok: false, result: expect.any(String), failure: invalidCursor });
    if (mcp.ok) throw new Error("The tool unexpectedly succeeded");
    expect(mcp.result).toContain(messages.Common.errors.routineRunCursorInvalid);

    expect(paging).not.toHaveBeenCalled();
  });

  it("keeps not found ahead of the cursor for an unknown or foreign routine", async () => {
    const { w } = await workspaceWithRoutine();
    const { routineId: foreignRoutineId } = await workspaceWithRoutine();
    const paging = vi.spyOn(PrismaRoutineRepo.prototype, "getRoutineRuns");

    for (const id of [randomUUID(), foreignRoutineId]) {
      const response = await postAs(w, w.admin, runsRoute, { id, cursor: "bad" });
      expect(response.status).toBe(404);
      expect(response.body.error.kind).toBe("not_found");
    }

    expect(paging).not.toHaveBeenCalled();
  });

  it("pages through the history with the returned cursor and treats an empty cursor as the first page", async () => {
    const { w, routineId } = await workspaceWithRoutine();

    const first = await postAs(w, w.admin, runsRoute, { id: routineId });
    expect(first.status).toBe(200);
    expect(first.body.runs).toHaveLength(25);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    expect(first.body.runs[0].summary).toBe(`Run ${RUN_COUNT - 1}`);

    const empty = await postAs(w, w.admin, runsRoute, { id: routineId, cursor: "" });
    expect(empty).toEqual(first);

    const second = await postAs(w, w.admin, runsRoute, { id: routineId, cursor: first.body.nextCursor });
    expect(second.status).toBe(200);
    expect(second.body.runs.map((run: { summary: string }) => run.summary)).toEqual(["Run 1", "Run 0"]);
    expect(second.body.nextCursor).toBeNull();

    const mcp = await runsAsMcp(w, { action: "runs", id: routineId, cursor: first.body.nextCursor });
    expect(mcp.ok).toBe(true);
  });

  it("lets an unexpected paging failure escape instead of reporting it as a bad cursor", async () => {
    const { w, routineId } = await workspaceWithRoutine();
    const outage = new Error("connection reset");
    vi.spyOn(PrismaRoutineRepo.prototype, "getRoutineRuns").mockRejectedValue(outage);

    await expect(w.as(w.admin, () => getGetRoutineRunsInteractor().invoke({ id: routineId }))).rejects.toBe(outage);
  });
});
