import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { runWithTenant } from "@/core/decorators/tenant-context";
import { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { DomainEvent } from "@/features/event/domain-events";
import { IncomingWebhookEngine } from "../incoming-webhook-engine";
import { incomingWebhookSignature } from "../incoming-webhook-signature";
import { incomingWebhookToken } from "../incoming-webhook-token";
import { INCOMING_WEBHOOK_LIMITS } from "../incoming-webhook.schema";
import { ReceiveIncomingWebhookInteractor } from "../receive-incoming-webhook.interactor";
import {
  COMPANY_ID,
  CONTACT_FIELD,
  HOOK_ID,
  NAME_FIELD,
  PAYLOAD,
  SECRET,
  TYPE_ID,
  USER_ID,
  createMapping,
  createModel,
} from "./incoming-webhook-fixtures";

const RECORD_ID = "00000000-0000-4000-8000-0000000000aa";
const EXISTING_ID = "00000000-0000-4000-8000-0000000000ab";
const creator = createMockUser({ id: USER_ID, companyId: COMPANY_ID });
const now = new Date("2026-11-13T10:00:00.000Z");
const token = incomingWebhookToken(HOOK_ID, 1, SECRET);

const completed = (recordId: string) => ({
  ok: true,
  data: { status: "completed", refs: [{ typeId: TYPE_ID, recordId }], schemaRevision: 3 },
});
const failure = (code: string) => ({
  ok: false,
  error: { issues: [{ code: "custom", path: [], params: { error: code } }] },
});

type Setup = {
  webhook?: Record<string, unknown>;
  company?: Record<string, unknown>;
  planAllows?: boolean;
  creatorActive?: boolean;
  burst?: number;
  queryMatch?: { ref: { typeId: string; recordId: string }; version: number } | null;
  identityOwner?: { ref: { typeId: string; recordId: string } } | null;
};

function setup(options: Setup = {}) {
  const webhook = {
    id: HOOK_ID,
    companyId: COMPANY_ID,
    typeId: TYPE_ID,
    name: "Website signups",
    createdById: USER_ID,
    enabled: true,
    tokenVersion: 1,
    signingSecret: null,
    signatureHeader: "x-signature",
    mapping: createMapping(),
    samplePayload: null,
    lastReceivedAt: null,
    createdAt: now,
    updatedAt: now,
    company: { deletingAt: null, ...options.company },
    ...options.webhook,
  };
  const via: unknown[] = [];
  const tenant = {
    run: (_id: string, attribution: unknown, read: () => Promise<unknown>, unavailable: () => Promise<unknown>) => {
      via.push(attribution);
      return options.creatorActive === false ? unavailable() : runWithTenant(creator, read);
    },
  };
  const repo = { recordDelivery: vi.fn(() => Promise.resolve({ id: "delivery-1" })) };
  const records = {
    getModel: vi.fn(() => Promise.resolve(createModel())),
    getIdentityOwnersCompanyWide: vi.fn(() =>
      Promise.resolve(
        options.identityOwner ? [{ ...options.identityOwner, channelClass: "email", value: "x", identityId: "i" }] : [],
      ),
    ),
    getRecordCompanyWide: vi.fn(() => Promise.resolve({ version: 4 })),
  };
  const query = {
    invoke: vi.fn(() =>
      Promise.resolve({
        ok: true,
        data: {
          records: options.queryMatch ? [options.queryMatch] : [],
          total: 0,
          page: 1,
          pageSize: 1,
          schemaRevision: 3,
        },
      }),
    ),
  };
  const writes: Array<{ idempotencyKey: string; expectedRevision: number; mutation: Record<string, unknown> }> = [];
  const writer = {
    invoke: vi.fn((input: { idempotencyKey: string; expectedRevision: number; mutation: Record<string, unknown> }) => {
      writes.push(input);
      return Promise.resolve(completed(RECORD_ID));
    }),
  };
  const events = { publish: vi.fn(() => Promise.resolve()) };
  const plans = { deliversWebhooks: vi.fn(() => Promise.resolve(options.planAllows ?? true)) };
  const limiters = {
    webhook: new TokenBucketRateLimiter(options.burst ?? 1_000, 60_000),
    visitor: new TokenBucketRateLimiter(1_000, 60_000),
  };
  const engine = new IncomingWebhookEngine(records as never, query as never, writer as never);
  const interactor = new ReceiveIncomingWebhookInteractor(
    { findWebhookUnscoped: vi.fn((id: string) => Promise.resolve(id === HOOK_ID ? webhook : null)) },
    repo as never,
    tenant as never,
    engine,
    events as never,
    plans as never,
    limiters,
    { authSecret: SECRET },
  );
  return { interactor, repo, records, query, writer, writes, events, plans, via };
}

function request(body: unknown, headers: Record<string, string> = {}, overrides: Record<string, unknown> = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    token,
    body: text,
    header: (name: string) => headers[name.toLowerCase()] ?? null,
    visitor: "visitor-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReceiveIncomingWebhookInteractor", () => {
  it("creates a record as the endpoint's member, logs the delivery and emits webhook.received", async () => {
    const { interactor, writes, repo, events, via } = setup();

    const result = await interactor.invoke(request(PAYLOAD));

    expect(result).toEqual({ status: 201, body: { ok: true, outcome: "created", recordId: RECORD_ID } });
    expect(writes[0].mutation).toMatchObject({ action: "create", typeId: TYPE_ID });
    expect(writes[0].idempotencyKey).toMatch(/^webhook:/u);
    expect(via).toEqual([{ kind: "incomingWebhook", name: "Website signups" }]);
    expect(repo.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookId: HOOK_ID,
        outcome: "created",
        statusCode: 201,
        recordId: RECORD_ID,
        payload: PAYLOAD,
      }),
      INCOMING_WEBHOOK_LIMITS.retentionDays,
    );
    expect(events.publish).toHaveBeenCalledWith(
      DomainEvent.WEBHOOK_RECEIVED,
      {
        entityId: "delivery-1",
        payload: {
          webhookId: HOOK_ID,
          webhookName: "Website signups",
          typeId: TYPE_ID,
          deliveryId: "delivery-1",
          outcome: "created",
          recordId: RECORD_ID,
        },
      },
      { systemCompanyId: COMPANY_ID },
    );
  });

  it("uses the sender's Idempotency-Key so a retried request cannot create twice", async () => {
    const { interactor, writes } = setup();

    await interactor.invoke(request(PAYLOAD, { "idempotency-key": "order-4711-attempt" }));

    expect(writes[0].idempotencyKey).toBe(`webhook:${HOOK_ID}:order-4711-attempt`);
  });

  it("ignores an Idempotency-Key that is too short to be one", async () => {
    const { interactor, writes } = setup();

    await interactor.invoke(request(PAYLOAD, { "idempotency-key": "1" }));

    expect(writes[0].idempotencyKey).toMatch(/^webhook:[0-9a-f-]{36}$/u);
  });

  describe("signature", () => {
    const signed = { webhook: { signingSecret: "shared-secret", signatureHeader: "x-hub-signature-256" } };

    it("refuses a request without a valid signature and logs it without the body", async () => {
      const { interactor, repo, writer } = setup(signed);

      const missing = await interactor.invoke(request(PAYLOAD));
      const wrong = await interactor.invoke(request(PAYLOAD, { "x-hub-signature-256": "sha256=" + "0".repeat(64) }));

      expect(missing).toEqual({ status: 401, body: { ok: false, error: "signature" } });
      expect(wrong.status).toBe(401);
      expect(writer.invoke).not.toHaveBeenCalled();
      expect(repo.recordDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "rejected_signature", statusCode: 401, payload: null }),
        expect.any(Number),
      );
    });

    it("accepts the hex HMAC-SHA256 of the raw body in the configured header", async () => {
      const { interactor } = setup(signed);
      const body = JSON.stringify(PAYLOAD);

      const result = await interactor.invoke(
        request(body, { "x-hub-signature-256": `sha256=${incomingWebhookSignature("shared-secret", body)}` }),
      );

      expect(result.status).toBe(201);
    });
  });

  it.each([
    ["a body that is not JSON", "not json"],
    ["a JSON array", "[1,2]"],
    ["a JSON scalar", "42"],
  ])("refuses %s", async (_name, body) => {
    const { interactor, repo, writer } = setup();

    expect(await interactor.invoke(request(body))).toEqual({
      status: 400,
      body: { ok: false, error: "payload_invalid" },
    });
    expect(writer.invoke).not.toHaveBeenCalled();
    expect(repo.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "rejected_payload", statusCode: 400 }),
      expect.any(Number),
    );
  });

  it("refuses a body over the size limit and does not store it", async () => {
    const { interactor, repo } = setup();
    const big = JSON.stringify({ data: { name: "x".repeat(INCOMING_WEBHOOK_LIMITS.maxBodyBytes) } });

    expect(await interactor.invoke(request(big))).toEqual({
      status: 413,
      body: { ok: false, error: "payload_too_large" },
    });
    expect(repo.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "rejected_limit", statusCode: 413, payload: null }),
      expect.any(Number),
    );
  });

  it("stores no body in the log above its size limit", async () => {
    const { interactor, repo } = setup();
    const large = { data: { ...PAYLOAD.data, unmapped: "n".repeat(INCOMING_WEBHOOK_LIMITS.storedPayloadBytes) } };

    const result = await interactor.invoke(request(large));

    expect(result.status).toBe(201);
    expect(repo.recordDelivery).toHaveBeenCalledWith(expect.objectContaining({ payload: null }), expect.any(Number));
  });

  it("refuses a workspace whose plan has no webhooks", async () => {
    const { interactor, writer, repo } = setup({ planAllows: false });

    expect(await interactor.invoke(request(PAYLOAD))).toEqual({ status: 403, body: { ok: false, error: "plan" } });
    expect(writer.invoke).not.toHaveBeenCalled();
    expect(repo.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "rejected_plan" }),
      expect.any(Number),
    );
  });

  it.each([
    ["an unknown endpoint", { token: incomingWebhookToken("00000000-0000-4000-8000-0000000000ff", 1, SECRET) }, {}],
    ["a malformed token", { token: "nope" }, {}],
    ["a rotated url", { token: incomingWebhookToken(HOOK_ID, 1, SECRET) }, { webhook: { tokenVersion: 2 } }],
    ["a token signed with another secret", { token: incomingWebhookToken(HOOK_ID, 1, "other") }, {}],
    ["an endpoint that is turned off", {}, { webhook: { enabled: false } }],
    ["a workspace being deleted", {}, { company: { deletingAt: now } }],
    ["a creator who left", {}, { creatorActive: false }],
  ])("answers 404 for %s and logs nothing", async (_name, overrides, options) => {
    const { interactor, repo, writer } = setup(options as Setup);

    expect(await interactor.invoke(request(PAYLOAD, {}, overrides))).toEqual({
      status: 404,
      body: { ok: false, error: "not_found" },
    });
    expect(repo.recordDelivery).not.toHaveBeenCalled();
    expect(writer.invoke).not.toHaveBeenCalled();
  });

  it("limits the requests per endpoint and says when to retry", async () => {
    const { interactor } = setup({ burst: 2 });

    const statuses = [];
    for (let attempt = 0; attempt < 3; attempt += 1) statuses.push((await interactor.invoke(request(PAYLOAD))).status);

    expect(statuses).toEqual([201, 201, 429]);
    const limited = await interactor.invoke(request(PAYLOAD));
    expect(limited).toMatchObject({
      status: 429,
      body: { error: "rate_limited" },
      retryAfterSeconds: expect.any(Number),
    });
  });

  it("lists the paths that failed when the body does not fit the mapping", async () => {
    const { interactor, repo } = setup();

    const result = await interactor.invoke(request({ data: { name: "", size: "many" } }));

    expect(result).toEqual({ status: 422, body: { ok: false, error: "payload_invalid" } });
    expect(repo.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "rejected_payload",
        statusCode: 422,
        message: "data.name:required, data.size:invalid",
      }),
      expect.any(Number),
    );
  });

  describe("upsert", () => {
    it("updates the record found by the match field", async () => {
      const { interactor, writes, events } = setup({
        webhook: { mapping: createMapping({ mode: "upsert", matchFieldId: NAME_FIELD }) },
        queryMatch: { ref: { typeId: TYPE_ID, recordId: EXISTING_ID }, version: 6 },
      });

      const result = await interactor.invoke(request(PAYLOAD));

      expect(result).toEqual({ status: 200, body: { ok: true, outcome: "updated", recordId: EXISTING_ID } });
      expect(writes[0].mutation).toMatchObject({
        action: "update",
        ref: { typeId: TYPE_ID, recordId: EXISTING_ID },
        expectedVersion: 6,
      });
      expect(events.publish).toHaveBeenCalledWith(
        DomainEvent.WEBHOOK_RECEIVED,
        expect.objectContaining({ payload: expect.objectContaining({ outcome: "updated", recordId: EXISTING_ID }) }),
        expect.anything(),
      );
    });

    it("creates a record when nothing matches", async () => {
      const { interactor, writes, query } = setup({
        webhook: { mapping: createMapping({ mode: "upsert", matchFieldId: NAME_FIELD }) },
        queryMatch: null,
      });

      const result = await interactor.invoke(request(PAYLOAD));

      expect(result.status).toBe(201);
      expect(writes[0].mutation).toMatchObject({ action: "create" });
      expect(query.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          typeId: TYPE_ID,
          filters: [{ fieldId: NAME_FIELD, operator: "eq", value: { kind: "text", value: "Ada Lovelace" } }],
        }),
      );
    });

    it("matches a person by the email identity", async () => {
      const { interactor, writes, records } = setup({
        webhook: {
          mapping: createMapping({
            mode: "upsert",
            matchFieldId: CONTACT_FIELD,
            fields: [
              { path: "email", fieldId: CONTACT_FIELD },
              { path: "name", fieldId: NAME_FIELD },
            ],
          }),
        },
        identityOwner: { ref: { typeId: TYPE_ID, recordId: EXISTING_ID } },
      });

      const result = await interactor.invoke(request({ email: "Ada@Example.com", name: "Ada" }));

      expect(result).toMatchObject({ status: 200, body: { outcome: "updated", recordId: EXISTING_ID } });
      expect(records.getRecordCompanyWide).toHaveBeenCalledWith({ typeId: TYPE_ID, recordId: EXISTING_ID });
      expect(writes[0].mutation).toMatchObject({ action: "update", expectedVersion: 4 });
      expect(writes[0].mutation).not.toHaveProperty("identities");
    });
  });

  describe("record engine failures", () => {
    it.each([
      [CustomErrorCode.recordIdempotencyConflict, 409, "conflict", "rejected_payload"],
      [CustomErrorCode.recordVersionChanged, 409, "conflict", "rejected_payload"],
      [CustomErrorCode.recordValueInvalid, 422, "payload_invalid", "rejected_payload"],
      [CustomErrorCode.recordWritePaused, 500, "failed", "failed"],
    ])("maps %s to HTTP %s", async (code, status, error, outcome) => {
      const { interactor, writer, repo, events } = setup();
      writer.invoke.mockResolvedValueOnce(failure(code) as never);

      expect(await interactor.invoke(request(PAYLOAD))).toEqual({ status, body: { ok: false, error } });
      expect(repo.recordDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ outcome, statusCode: status, message: code }),
        expect.any(Number),
      );
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  it("answers 404 and logs a failure when the list of the endpoint is gone", async () => {
    const { interactor, records, repo } = setup();
    records.getModel.mockResolvedValueOnce(createModel({ types: [] }));

    expect(await interactor.invoke(request(PAYLOAD))).toEqual({ status: 404, body: { ok: false, error: "list" } });
    expect(repo.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed", statusCode: 404 }),
      expect.any(Number),
    );
  });

  it("does not fail the request when the event cannot be published", async () => {
    const { interactor, events } = setup();
    events.publish.mockRejectedValueOnce(new Error("event log down") as never);

    expect((await interactor.invoke(request(PAYLOAD))).status).toBe(201);
  });
});
