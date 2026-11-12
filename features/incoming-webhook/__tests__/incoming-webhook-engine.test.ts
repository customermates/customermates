import { describe, expect, it, vi } from "vitest";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { IncomingWebhookEngine } from "../incoming-webhook-engine";
import { CONTACT_FIELD, NAME_FIELD, PAYLOAD, TYPE_ID, createMapping, createModel } from "./incoming-webhook-fixtures";

const EXISTING = "00000000-0000-4000-8000-0000000000ab";
const CREATED = "00000000-0000-4000-8000-0000000000aa";

const completed = (recordId: string) => ({
  ok: true,
  data: { status: "completed", refs: [{ typeId: TYPE_ID, recordId }], schemaRevision: 3 },
});
const failure = (code: string) => ({
  ok: false,
  error: { issues: [{ code: "custom", path: [], params: { error: code } }] },
});

function engine(
  options: {
    types?: Parameters<typeof createModel>[0];
    match?: { ref: { typeId: string; recordId: string }; version: number } | null;
    identityOwner?: boolean;
    results?: unknown[];
  } = {},
) {
  const getModel = vi
    .fn()
    .mockResolvedValueOnce(createModel(options.types))
    .mockResolvedValue({ ...createModel(options.types), revision: 99 });
  const records = {
    getModel,
    getIdentityOwnersCompanyWide: vi.fn(() =>
      Promise.resolve(
        options.identityOwner
          ? [{ ref: { typeId: TYPE_ID, recordId: EXISTING }, channelClass: "email", value: "x", identityId: "i" }]
          : [],
      ),
    ),
    getRecordCompanyWide: vi.fn(() => Promise.resolve({ version: 8 })),
  };
  const query = {
    invoke: vi.fn(() =>
      Promise.resolve({
        ok: true,
        data: { records: options.match ? [options.match] : [], total: 0, page: 1, pageSize: 1, schemaRevision: 1 },
      }),
    ),
  };
  const results = [...(options.results ?? [completed(CREATED)])];
  const writer = { invoke: vi.fn(() => Promise.resolve(results.length > 1 ? results.shift() : results[0])) };
  return {
    engine: new IncomingWebhookEngine(records as never, query as never, writer as never),
    records,
    query,
    writer,
  };
}

const upsertByName = createMapping({ mode: "upsert", matchFieldId: NAME_FIELD });
const upsertByEmail = createMapping({
  mode: "upsert",
  matchFieldId: CONTACT_FIELD,
  fields: [
    { path: "email", fieldId: CONTACT_FIELD },
    { path: "name", fieldId: NAME_FIELD },
  ],
});

describe("IncomingWebhookEngine.plan", () => {
  it("plans a create for a mapping without match", async () => {
    const { engine: subject, query } = engine();

    const plan = await subject.plan({ typeId: TYPE_ID, mapping: createMapping() }, PAYLOAD);

    expect(plan).toMatchObject({ ok: true, operation: "create", existing: null });
    expect(query.invoke).not.toHaveBeenCalled();
  });

  it("reports an archived or missing list as unavailable", async () => {
    const { engine: subject } = engine({ types: { types: [] } });

    expect(await subject.plan({ typeId: TYPE_ID, mapping: createMapping() }, PAYLOAD)).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("returns the values with their errors for a body that does not fit", async () => {
    const { engine: subject } = engine();

    const plan = await subject.plan({ typeId: TYPE_ID, mapping: createMapping() }, { data: {} });

    expect(plan).toMatchObject({ ok: false, reason: "invalid" });
    expect(
      plan.ok === false && plan.reason === "invalid" && plan.values.some((value) => value.error === "required"),
    ).toBe(true);
  });

  it("finds the existing record of a plain match field by a filter on that field", async () => {
    const match = { ref: { typeId: TYPE_ID, recordId: EXISTING }, version: 5 };
    const { engine: subject, query } = engine({ match });

    const plan = await subject.plan({ typeId: TYPE_ID, mapping: upsertByName }, PAYLOAD);

    expect(plan).toMatchObject({ ok: true, operation: "update", existing: match });
    expect(query.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        typeId: TYPE_ID,
        filters: [{ fieldId: NAME_FIELD, operator: "eq", value: { kind: "text", value: "Ada Lovelace" } }],
        pageSize: 1,
      }),
    );
  });

  it("plans a create when an upsert finds nothing", async () => {
    const { engine: subject } = engine({ match: null });

    expect(await subject.plan({ typeId: TYPE_ID, mapping: upsertByName }, PAYLOAD)).toMatchObject({
      ok: true,
      operation: "create",
      existing: null,
    });
  });

  it("finds a person by the normalised email identity and reads its version", async () => {
    const { engine: subject, records, query } = engine({ identityOwner: true });

    const plan = await subject.plan(
      { typeId: TYPE_ID, mapping: upsertByEmail },
      { email: "ADA@Example.com", name: "Ada" },
    );

    expect(plan).toMatchObject({
      ok: true,
      operation: "update",
      existing: { ref: { typeId: TYPE_ID, recordId: EXISTING }, version: 8 },
    });
    expect(records.getIdentityOwnersCompanyWide).toHaveBeenCalled();
    expect(query.invoke).not.toHaveBeenCalled();
  });
});

describe("IncomingWebhookEngine.apply", () => {
  async function planned(subject: IncomingWebhookEngine, mapping = createMapping(), payload: unknown = PAYLOAD) {
    const plan = await subject.plan({ typeId: TYPE_ID, mapping }, payload);
    if (!plan.ok) throw new Error("expected a plan");
    return plan;
  }

  it("creates with the mapped fields and the identities of channel fields", async () => {
    const { engine: subject, writer } = engine();
    const plan = await planned(subject, createMapping({ mode: "create", fields: upsertByEmail.fields }), {
      email: "Ada@Example.com",
      name: "Ada",
    });

    const applied = await subject.apply(plan, "webhook:key");

    expect(applied).toEqual({ ok: true, operation: "create", recordId: CREATED });
    expect(writer.invoke).toHaveBeenCalledWith({
      expectedRevision: expect.any(Number),
      idempotencyKey: "webhook:key",
      mutation: {
        action: "create",
        typeId: TYPE_ID,
        fields: [{ fieldId: NAME_FIELD, value: { kind: "text", value: "Ada" } }],
        identities: [{ provider: "mail", value: "ada@example.com" }],
      },
    });
  });

  it("updates the matched record with its version and keeps its id", async () => {
    const match = { ref: { typeId: TYPE_ID, recordId: EXISTING }, version: 5 };
    const { engine: subject, writer } = engine({ match, results: [completed(EXISTING)] });
    const plan = await planned(subject, upsertByName);

    const applied = await subject.apply(plan, "webhook:key");

    expect(applied).toEqual({ ok: true, operation: "update", recordId: EXISTING });
    expect(writer.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: expect.objectContaining({ action: "update", ref: match.ref, expectedVersion: 5 }),
      }),
    );
  });

  it("retries once with the current model revision when the model changed in between", async () => {
    const { engine: subject, writer } = engine({
      results: [failure(CustomErrorCode.recordSchemaChanged), completed(CREATED)],
    });
    const plan = await planned(subject);

    const applied = await subject.apply(plan, "webhook:key");

    expect(applied).toEqual({ ok: true, operation: "create", recordId: CREATED });
    expect(writer.invoke).toHaveBeenCalledTimes(2);
    expect(
      writer.invoke.mock.calls.map((call) => (call as unknown as [{ expectedRevision: number }])[0].expectedRevision),
    ).toEqual([createModel().revision, 99]);
    expect(
      writer.invoke.mock.calls.every(
        (call) => (call as unknown as [{ idempotencyKey: string }])[0].idempotencyKey === "webhook:key",
      ),
    ).toBe(true);
  });

  it("does not retry a second time", async () => {
    const { engine: subject, writer } = engine({ results: [failure(CustomErrorCode.recordSchemaChanged)] });
    const plan = await planned(subject);

    const applied = await subject.apply(plan, "webhook:key");

    expect(applied).toEqual({ ok: false, reason: "failed", message: CustomErrorCode.recordSchemaChanged });
    expect(writer.invoke).toHaveBeenCalledTimes(2);
  });

  it.each([
    [CustomErrorCode.recordIdempotencyConflict, "conflict"],
    [CustomErrorCode.recordVersionChanged, "conflict"],
    [CustomErrorCode.recordValueInvalid, "invalid"],
    [CustomErrorCode.recordValueRequired, "invalid"],
    [CustomErrorCode.recordWritePaused, "failed"],
  ])("classifies %s as %s", async (code, reason) => {
    const { engine: subject } = engine({ results: [failure(code)] });
    const plan = await planned(subject);

    expect(await subject.apply(plan, "webhook:key")).toEqual({ ok: false, reason, message: code });
  });

  it("reports an unclassified failure as failed", async () => {
    const { engine: subject } = engine({
      results: [{ ok: false, error: { issues: [{ code: "invalid_type", path: [] }] } }],
    });
    const plan = await planned(subject);

    expect(await subject.apply(plan, "webhook:key")).toEqual({ ok: false, reason: "failed", message: "failed" });
  });
});
