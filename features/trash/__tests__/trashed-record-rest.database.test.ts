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

const { createRestRouteWorkspace, postAs, restRoute } = await import("@/tests/helpers/rest-route-workspace");
const { TrashedRecordSchema } = await import("../trash.schema");
const { readTrashTool } = await import("@/features/mcp-tools/trash.mcp-tools");
const { executeMcpTool } = await import("@/features/mcp-tools/mcp-tool");
const read = await restRoute("/v1/trash/read");

type Workspace = Awaited<ReturnType<typeof createRestRouteWorkspace>>;

function readOverMcp(w: Workspace, user: Workspace["admin"], ref: { typeId: string; recordId: string }) {
  return w.as(user, () => executeMcpTool(readTrashTool, [readTrashTool.inputSchema.parse({ action: "read", ...ref })]));
}

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

async function workspace() {
  const created = await createRestRouteWorkspace();
  cleanups.push(created.cleanup);
  return created;
}

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

describeDatabase("trashed record REST route on PostgreSQL", () => {
  it("reads a deleted record's values read only and answers 404 for a live record", async () => {
    const w = await workspace();
    const deal = await w.create("deal", "deal.name", "Archived pipeline");
    const live = await w.create("deal", "deal.name", "Still open");
    await w.remove(deal);

    const result = await postAs(w, w.admin, read, deal);
    expect(result.status).toBe(200);
    const trashed = TrashedRecordSchema.parse(result.body);
    expect(trashed.record?.ref).toEqual(deal);
    expect(trashed.record?.fields.find((field) => field.fieldId === w.id("deal.name"))?.result).toMatchObject({
      state: "value",
      value: { kind: "text", value: "Archived pipeline" },
    });
    expect(trashed.permittedActions).toEqual([]);
    expect(trashed.trash).toMatchObject({ canRestore: true, daysLeft: 30, deletedBy: { id: w.admin.id } });

    const missing = await postAs(w, w.admin, read, live);
    expect(missing).toMatchObject({ status: 404, body: { error: { kind: "not_found" } } });
    expect((await postAs(w, w.admin, read, { typeId: deal.typeId })).status).toBe(400);
  }, 180_000);

  it("applies the Trash visibility rule of the role", async () => {
    const w = await workspace();
    const theirs = await w.create("deal", "deal.name", "Admin deal");
    await w.remove(theirs);

    const ungranted = await postAs(w, w.member, read, theirs);
    expect(ungranted).toMatchObject({ status: 404, body: { error: { kind: "not_found" } } });

    await w.grant("deal", ["readOwn", "create", "delete"]);
    expect((await postAs(w, w.member, read, theirs)).status).toBe(404);
    const mine = await w.create("deal", "deal.name", "Member deal", w.member);
    await w.remove(mine, w.member);
    const own = await postAs(w, w.member, read, mine);
    expect(own.status).toBe(200);
    expect(TrashedRecordSchema.parse(own.body).record?.ref).toEqual(mine);
  }, 180_000);

  it("never reads another workspace's Trash", async () => {
    const w = await workspace();
    const other = await workspace();
    const deal = await w.create("deal", "deal.name", "Foreign");
    await w.remove(deal);

    const result = await postAs(other, other.admin, read, deal);
    expect(result).toMatchObject({ status: 404, body: { error: { kind: "not_found" } } });
  }, 180_000);

  it("opens the same trashed record read only over MCP read_trash and applies the same visibility", async () => {
    const w = await workspace();
    const other = await workspace();
    const deal = await w.create("deal", "deal.name", "Archived over MCP");
    await w.remove(deal);

    const opened = await readOverMcp(w, w.admin, deal);
    if (!opened.ok) throw new Error(opened.result);
    expect(readTrashTool.outputSchema.safeParse(opened.structuredContent).error).toBeUndefined();
    expect(opened.structuredContent).toMatchObject({
      typeId: deal.typeId,
      record: { ref: deal },
      trash: { canRestore: true, daysLeft: 30, deletedBy: { id: w.admin.id } },
    });
    const fields = (opened.structuredContent?.record as { fields: Array<{ fieldId: string; result: unknown }> }).fields;
    expect(fields.find((field) => field.fieldId === w.id("deal.name"))?.result).toMatchObject({
      state: "value",
      value: { kind: "text", value: "Archived over MCP" },
    });

    const ungranted = await readOverMcp(w, w.member, deal);
    expect(ungranted).toMatchObject({ ok: false, failure: { kind: "not_found" } });

    const foreign = await readOverMcp(other, other.admin, deal);
    expect(foreign).toMatchObject({ ok: false, failure: { kind: "not_found" } });
    expect(JSON.stringify(foreign)).not.toContain("Archived over MCP");
  }, 180_000);
});
