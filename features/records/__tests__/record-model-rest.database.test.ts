import { randomUUID } from "node:crypto";

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
const { DiscoveredRecordTypesSchema } = await import("../discover-record-types.interactor");
const { RecordModelViewSchema } = await import("../record-model.schema");
const discover = await restRoute("/v1/model/discover");
const read = await restRoute("/v1/model/read");

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

describeDatabase("record model REST routes on PostgreSQL", () => {
  it("discovers types by name in pages and reads the full model of selected types", async () => {
    const w = await workspace();
    const discovered = await postAs(w, w.admin, discover, {});
    expect(discovered.status).toBe(200);
    const all = DiscoveredRecordTypesSchema.parse(discovered.body);
    expect(all.types.map(({ id }) => id)).toEqual(
      expect.arrayContaining(["contact", "organization", "deal", "service", "task"].map(w.id)),
    );
    expect(all.types.some(({ embedded }) => embedded)).toBe(false);
    expect(all.total).toBe(all.types.length);

    const paged = DiscoveredRecordTypesSchema.parse(
      (await postAs(w, w.admin, discover, { pageSize: 2, page: 2 })).body,
    );
    expect(paged).toMatchObject({ total: all.total, types: all.types.slice(2, 4) });
    const searched = DiscoveredRecordTypesSchema.parse((await postAs(w, w.admin, discover, { search: "deal" })).body);
    expect(searched.types.map(({ id }) => id)).toContain(w.id("deal"));
    expect(searched.total).toBeLessThan(all.total);
    expect((await postAs(w, w.admin, discover, { pageSize: 101 })).status).toBe(400);

    const model = RecordModelViewSchema.parse((await postAs(w, w.admin, read, { typeIds: [w.id("deal")] })).body);
    expect(model.revision).toBe(all.schemaRevision);
    expect(model.types.map(({ id }) => id)).toEqual([w.id("deal")]);
    expect(model.fields.every((field) => field.typeId === w.id("deal"))).toBe(true);
    expect(model.fields.map(({ id }) => id)).toContain(w.id("deal.name"));
  }, 180_000);

  it("shows a restricted role only the types it was granted", async () => {
    const w = await workspace();
    const denied = DiscoveredRecordTypesSchema.parse((await postAs(w, w.member, discover, {})).body);
    expect(denied).toMatchObject({ total: 0, types: [], canManageSchema: false });
    expect(RecordModelViewSchema.parse((await postAs(w, w.member, read, {})).body).types).toEqual([]);

    await w.grant("deal", ["readOwn"]);
    const granted = DiscoveredRecordTypesSchema.parse((await postAs(w, w.member, discover, {})).body);
    expect(granted.types).toEqual([
      expect.objectContaining({ id: w.id("deal"), permittedActions: ["readOwn"], recordCount: 0 }),
    ]);
    const model = RecordModelViewSchema.parse((await postAs(w, w.member, read, {})).body);
    expect(model.types.map(({ id }) => id)).toContain(w.id("deal"));
    expect(model.types.filter(({ id }) => id !== w.id("deal")).every(({ embedded }) => embedded)).toBe(true);
    expect(model.types.map(({ id }) => id)).not.toContain(w.id("contact"));
  }, 180_000);

  it("never reveals another workspace's types", async () => {
    const w = await workspace();
    const other = await workspace();
    const foreign = [w.id("deal"), w.id("contact")];

    const discovered = DiscoveredRecordTypesSchema.parse(
      (await postAs(other, other.admin, discover, { typeIds: foreign })).body,
    );
    expect(discovered).toMatchObject({ total: 0, types: [] });
    expect(await postAs(other, other.admin, read, { typeIds: foreign })).toMatchObject({
      status: 404,
      body: { error: { kind: "not_found", issues: [{ path: ["typeIds", 0], customCode: "recordTypeNotFound" }] } },
    });
    expect(await postAs(other, other.admin, read, { typeIds: [other.id("deal"), randomUUID()] })).toMatchObject({
      status: 404,
      body: { error: { kind: "not_found", issues: [{ path: ["typeIds", 1], customCode: "recordTypeNotFound" }] } },
    });
  }, 180_000);
});
