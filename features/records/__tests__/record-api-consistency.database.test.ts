import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { Client } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";

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
const { configureRecordModelV2Tool, mutateRecordV2Tool, readRecordV2Tool } = await import(
  "@/features/mcp-tools/record-model.mcp-tools"
);
const { getRestoreTrashInteractor } = await import("@/core/di");
const recordActions = await import("@/app/[locale]/(protected)/records/actions");
const mutateRoute = await restRoute("/v1/records/mutate");
const previewRoute = await restRoute("/v1/model/preview");
const applyRoute = await restRoute("/v1/model/apply");
const readModelRoute = await restRoute("/v1/model/read");
const exportRoute = await restRoute("/v1/records/export");
const importRoute = await restRoute("/v1/records/import");
const readRoute = await restRoute("/v1/records/read");
const queryRoute = await restRoute("/v1/records/query");
const searchRoute = await restRoute("/v1/records/search");
const activitiesRoute = await restRoute("/v1/records/activities");

type Workspace = Awaited<ReturnType<typeof createRestRouteWorkspace>>;

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

async function workspace() {
  const created = await createRestRouteWorkspace();
  cleanups.push(created.cleanup);
  return created;
}

async function createDeal(w: Workspace, fields: Array<{ fieldId: string; value: unknown }>) {
  return {
    expectedRevision: await w.revision(),
    idempotencyKey: randomUUID(),
    mutation: { action: "create", typeId: w.id("deal"), fields },
  };
}

async function holdingCompanyLock<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  const holder = new Client({ connectionString: process.env.DATABASE_URL });
  await holder.connect();
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [companyId]);
    return await fn();
  } finally {
    await holder.query("ROLLBACK");
    await holder.end();
  }
}

describeDatabase("record API consistency against PostgreSQL", () => {
  it("keeps a retained price private through Trash and restore on every read channel", async () => {
    const w = await workspace();
    await w.grant("deal", ["readAll"]);
    await w.grant("lineItem", ["readAll"]);
    const create = async (type: string, fields: Array<{ fieldId: string; value: unknown }>, links: unknown[] = []) => {
      const result = await postAs(w, w.admin, mutateRoute, {
        expectedRevision: await w.revision(),
        idempotencyKey: randomUUID(),
        mutation: { action: "create", typeId: w.id(type), fields, links },
      });
      expect(result.status).toBe(200);
      const ref = (result.body.refs as Array<{ typeId: string; recordId: string }>).find(
        (ref) => ref.typeId === w.id(type),
      );
      if (!ref) throw new Error("Created record missing");
      return ref;
    };
    const source = await create("service", [
      {
        fieldId: w.id("service.name"),
        value: { kind: "text", value: "Private source" },
      },
      {
        fieldId: w.id("service.amount"),
        value: { kind: "decimal", value: "1000", currency: "EUR" },
      },
    ]);
    const replacement = await create("service", [
      {
        fieldId: w.id("service.name"),
        value: { kind: "text", value: "Replacement" },
      },
      {
        fieldId: w.id("service.amount"),
        value: { kind: "decimal", value: "800", currency: "EUR" },
      },
    ]);
    const deal = await w.create("deal", "deal.name", "Visible deal");
    const line = await create(
      "lineItem",
      [
        {
          fieldId: w.id("lineItem.name"),
          value: { kind: "text", value: "Visible line" },
        },
        {
          fieldId: w.id("lineItem.pricingMode"),
          value: { kind: "select", value: "saved" },
        },
      ],
      [
        {
          relationId: w.id("lineItem.service"),
          direction: "outgoing",
          record: source,
        },
        {
          relationId: w.id("lineItem.deal"),
          direction: "outgoing",
          record: deal,
        },
      ],
    );
    const before = await postAs(w, w.admin, readRoute, line);
    const relinked = await postAs(w, w.admin, mutateRoute, {
      expectedRevision: await w.revision(),
      idempotencyKey: randomUUID(),
      mutation: {
        action: "update",
        ref: line,
        expectedVersion: before.body.version,
        fields: [],
        linkChanges: [
          {
            action: "unlink",
            relationId: w.id("lineItem.service"),
            direction: "outgoing",
            record: source,
          },
          {
            action: "link",
            relationId: w.id("lineItem.service"),
            direction: "outgoing",
            record: replacement,
          },
        ],
      },
    });
    expect(relinked.status).toBe(200);
    const check = async () => {
      const fieldIds = ["lineItem.savedPrice", "lineItem.effectivePrice", "lineItem.amount"].map(w.id);
      const fieldResults = (body: { fields: Array<{ fieldId: string; result: unknown }> }) =>
        fieldIds.map((fieldId) => body.fields.find((field) => field.fieldId === fieldId)?.result);
      const ui = await w.as(w.member, () => recordActions.getRecordAction(line));
      expect(ui).toMatchObject({ ok: true });
      if (!ui.ok) throw new Error("UI read failed");
      expect(fieldResults(ui.data)).toEqual(fieldIds.map(() => ({ state: "restricted" })));
      const rest = await postAs(w, w.member, readRoute, line);
      expect(rest.status).toBe(200);
      expect(fieldResults(rest.body)).toEqual(fieldIds.map(() => ({ state: "restricted" })));
      const tool = await w.as(w.member, () => executeMcpTool(readRecordV2Tool as never, [line]));
      expect(tool).toMatchObject({ ok: true });
      expect(JSON.stringify(tool)).not.toContain('"value":"1000"');
      const filtered = await postAs(w, w.member, queryRoute, {
        typeId: line.typeId,
        filters: [
          {
            fieldId: w.id("lineItem.savedPrice"),
            operator: "eq",
            value: { kind: "decimal", value: "1000", currency: "EUR" },
          },
        ],
      });
      expect(filtered.body).toMatchObject({ total: 0, records: [] });
      const search = await postAs(w, w.member, searchRoute, {
        searchTerm: "Visible line",
        typeIds: [line.typeId],
      });
      expect(search.status).toBe(200);
      expect(JSON.stringify(search.body)).not.toContain('"value":"1000"');
      const activity = await postAs(w, w.member, activitiesRoute, {
        scope: { records: [line], typeIds: [] },
      });
      expect(activity.status).toBe(200);
      expect(JSON.stringify(activity.body)).not.toContain('"value":"1000"');
    };
    await check();
    const deleted = await w.remove(source);
    await check();
    expect(deleted.trashBatchId).toEqual(expect.any(String));
    if (!deleted.trashBatchId) throw new Error("Trash batch missing");
    const trashBatchId = deleted.trashBatchId;
    expect(await w.as(w.admin, () => getRestoreTrashInteractor().invoke({ batchId: trashBatchId }))).toMatchObject({
      ok: true,
    });
    await check();
  }, 180_000);

  it("refuses a valid import quickly while the workspace is busy and accepts its retry", async () => {
    const w = await workspace();
    await w.create("deal", "deal.name", "Export source");
    const exported = await postAs(w, w.admin, exportRoute, {
      typeId: w.id("deal"),
      filters: [],
      relationships: [],
      sort: [],
    });
    expect(exported.status).toBe(200);
    const ref = { ...exported.body.records[0].ref, recordId: randomUUID() };
    const input = {
      document: {
        ...exported.body,
        records: exported.body.records.map((row: { ref: unknown }) => ({
          ...row,
          ref,
        })),
      },
      mode: "create",
      idempotencyKey: randomUUID(),
    };
    await holdingCompanyLock(w.companyId, async () => {
      const startedAt = Date.now();
      expect(await postAs(w, w.admin, importRoute, input)).toMatchObject({
        status: 429,
        body: { error: { kind: "rate_limit" } },
      });
      expect(Date.now() - startedAt).toBeLessThan(15_000);
    });
    expect(await postAs(w, w.admin, importRoute, input)).toMatchObject({
      status: 200,
      body: { created: 1 },
    });
    expect(await postAs(w, w.admin, importRoute, input)).toMatchObject({
      status: 200,
      body: { created: 1 },
    });
  }, 120_000);

  it("rejects unsupported list names in preview and apply at the same field", async () => {
    const w = await workspace();
    const change = {
      expectedRevision: await w.revision(),
      idempotencyKey: randomUUID(),
      operations: [
        {
          operation: "createType",
          reference: "$invalid",
          label: "Invalid\u0000name",
          pluralLabel: "Invalid names",
          description: "",
          icon: "list",
          embedded: false,
          accessPresetId: null,
        },
      ],
    };
    for (const route of [previewRoute, applyRoute]) {
      const response = await postAs(w, w.admin, route, change);
      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        kind: "validation",
        issues: [expect.objectContaining({ path: ["operations", 0, "label"] })],
      });
    }
    expect(await w.revision()).toBe(change.expectedRevision);
  }, 120_000);

  it("answers a write that waits on a busy workspace with a structured rate limit on every channel", async () => {
    const w = await workspace();
    const create = () => createDeal(w, [{ fieldId: w.id("deal.name"), value: { kind: "text", value: "Busy" } }]);
    const busy = { kind: "rate_limit", issues: [{ code: "custom", path: [], message: expect.any(String) }] };

    await holdingCompanyLock(w.companyId, async () => {
      const startedAt = Date.now();
      expect(await postAs(w, w.admin, mutateRoute, await create())).toEqual({ status: 429, body: { error: busy } });
      expect(Date.now() - startedAt).toBeLessThan(15_000);

      const input = mutateRecordV2Tool.inputSchema.parse(await create());
      const tool = await w.as(w.admin, () => executeMcpTool(mutateRecordV2Tool as never, [input]));
      expect(tool).toMatchObject({ ok: false, failure: { kind: "rate_limit" } });

      const action = await w.as(w.admin, async () => recordActions.mutateRecordAction((await create()) as never));
      expect(action).toMatchObject({
        ok: false,
        failure: {
          kind: "rate_limit",
          retryable: true,
          issues: [{ path: [], customCode: "serviceBusy", message: messages.Common.errors.serviceBusy }],
        },
      });
    });

    expect((await postAs(w, w.admin, mutateRoute, await create())).status).toBe(200);
  }, 120_000);

  it("reports malformed formatted text at the field that carries it", async () => {
    const w = await workspace();
    const create = () =>
      createDeal(w, [
        { fieldId: w.id("deal.name"), value: { kind: "text", value: "Notes" } },
        {
          fieldId: w.id("deal.notes"),
          value: { kind: "richText", documentJson: JSON.stringify({ type: "script", content: [] }) },
        },
      ]);
    const invalid = {
      kind: "validation",
      issues: [
        {
          code: "custom",
          path: ["mutation", "fields", 1, "value"],
          message: messages.Common.errors.notesInvalidFormat,
          customCode: "notesInvalidFormat",
        },
      ],
    };

    expect(await postAs(w, w.admin, mutateRoute, await create())).toEqual({ status: 400, body: { error: invalid } });
    const input = mutateRecordV2Tool.inputSchema.parse(await create());
    expect(await w.as(w.admin, () => executeMcpTool(mutateRecordV2Tool as never, [input]))).toMatchObject({
      ok: false,
      failure: invalid,
    });
    expect(await w.as(w.admin, async () => recordActions.mutateRecordAction((await create()) as never))).toMatchObject({
      ok: false,
      failure: invalid,
    });
  }, 120_000);

  it("refuses a sub-list of a sub-list in preview and apply over REST and MCP", async () => {
    const w = await workspace();
    const creation = {
      expectedRevision: await w.revision(),
      idempotencyKey: randomUUID(),
      operations: [
        {
          operation: "createType",
          reference: "$parts",
          label: "Part",
          pluralLabel: "Parts",
          description: "",
          icon: "list",
          embedded: true,
          accessPresetId: null,
        },
        {
          operation: "putRelationship",
          relationship: {
            id: "$partLine",
            sourceTypeId: "$parts",
            targetTypeId: w.id("lineItem"),
            sourceLabel: "Line item",
            targetLabel: "Parts",
            sourceCardinality: "one",
            targetCardinality: "many",
            onSourceDelete: "unlink",
            onTargetDelete: "cascade",
            messagesOnSource: false,
            messagesOnTarget: false,
          },
        },
      ],
    };
    const preview = await postAs(w, w.admin, previewRoute, creation);
    expect(preview.status).toBe(200);
    const reference = (name: string) =>
      (preview.body.references as Array<{ reference: string; id: string }>).find((item) => item.reference === name)?.id;
    expect((await postAs(w, w.admin, applyRoute, creation)).status).toBe(200);
    const partsId = reference("$parts");
    const relationId = reference("$partLine");
    const model = await postAs(w, w.admin, readModelRoute, {});
    const parts = (model.body.types as Array<{ id: string }>).find((type) => type.id === partsId);
    if (!parts || !relationId) throw new Error("The sub-list fixture was not created");

    const nest = async () => ({
      expectedRevision: await w.revision(),
      idempotencyKey: randomUUID(),
      operations: [{ operation: "putType", type: { ...parts, parentRelationshipId: relationId } }],
    });
    const nested = await postAs(w, w.admin, previewRoute, await nest());
    expect(nested.status).toBe(200);
    expect(nested.body.valid).toBe(false);
    expect(nested.body.issues).toContainEqual({ code: "nested_sublist", typeId: partsId });

    const refused = {
      kind: "validation",
      issues: [
        {
          code: "custom",
          path: [],
          message: messages.Common.errors.recordSublistNested,
          customCode: "recordSublistNested",
        },
      ],
    };
    expect(await postAs(w, w.admin, applyRoute, await nest())).toEqual({ status: 400, body: { error: refused } });
    const input = configureRecordModelV2Tool.inputSchema.parse({ action: "apply", change: await nest() });
    expect(await w.as(w.admin, () => executeMcpTool(configureRecordModelV2Tool as never, [input]))).toMatchObject({
      ok: false,
      failure: refused,
    });
  }, 120_000);
});
