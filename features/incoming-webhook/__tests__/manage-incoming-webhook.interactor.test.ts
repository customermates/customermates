import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
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
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { Action, Resource } from "@/generated/prisma";
import { IncomingWebhookEngine } from "../incoming-webhook-engine";
import { ManageIncomingWebhookInteractor } from "../manage-incoming-webhook.interactor";
import type { IncomingWebhookResult } from "../incoming-webhook.schema";
import {
  HOOK_ID,
  NAME_FIELD,
  PAYLOAD,
  SECRET,
  TYPE_ID,
  USER_ID,
  createMapping,
  createModel,
} from "./incoming-webhook-fixtures";

const now = new Date("2026-11-13T10:00:00.000Z");
const settings = { baseUrl: "https://app.example.com", authSecret: SECRET };
const RECORD_ID = "00000000-0000-4000-8000-0000000000aa";

function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: HOOK_ID,
    typeId: TYPE_ID,
    name: "Website signups",
    createdById: USER_ID,
    enabled: true,
    tokenVersion: 1,
    signingSecret: null,
    signatureHeader: "x-signature",
    mapping: createMapping(),
    samplePayload: PAYLOAD,
    lastReceivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function repo(existing: ReturnType<typeof stored> | null = stored()) {
  return {
    findWebhook: vi.fn(() => Promise.resolve(existing)),
    listWebhooks: vi.fn(() => Promise.resolve(existing ? [existing] : [])),
    createWebhook: vi.fn((data: Record<string, unknown>) => Promise.resolve(stored(data))),
    updateWebhook: vi.fn((_id: string, patch: Record<string, unknown>) =>
      Promise.resolve(
        stored({
          ...existing,
          ...patch,
          tokenVersion: patch.rotateToken ? (existing?.tokenVersion ?? 1) + 1 : existing?.tokenVersion,
        }),
      ),
    ),
    deleteWebhook: vi.fn(() => Promise.resolve(existing !== null)),
    listDeliveries: vi.fn(() =>
      Promise.resolve([
        {
          id: "00000000-0000-4000-8000-0000000000d1",
          outcome: "created",
          statusCode: 201,
          message: null,
          recordId: RECORD_ID,
          payloadBytes: 42,
          payload: PAYLOAD,
          createdAt: now,
        },
        {
          id: "00000000-0000-4000-8000-0000000000d2",
          outcome: "something-new",
          statusCode: 500,
          message: "boom",
          recordId: null,
          payloadBytes: 0,
          payload: null,
          createdAt: now,
        },
      ]),
    ),
  };
}

function engine(options: { existing?: boolean } = {}) {
  const records = {
    getModel: vi.fn(() => Promise.resolve(createModel())),
    getIdentityOwnersCompanyWide: vi.fn(() => Promise.resolve([])),
    getRecordCompanyWide: vi.fn(() => Promise.resolve({ version: 1 })),
  };
  const query = {
    invoke: vi.fn(() =>
      Promise.resolve({
        ok: true,
        data: {
          records: options.existing ? [{ ref: { typeId: TYPE_ID, recordId: RECORD_ID }, version: 3 }] : [],
          total: 0,
          page: 1,
          pageSize: 1,
          schemaRevision: 1,
        },
      }),
    ),
  };
  return new IncomingWebhookEngine(records as never, query as never, { invoke: vi.fn() } as never);
}

const records = (model = createModel()) => ({ getModel: vi.fn(() => Promise.resolve(model)) });
const policy = (allowed = true) => ({
  load: () => Promise.resolve({ actor: { id: USER_ID }, allowed: () => allowed, canReadType: () => allowed }),
});

function interactor(
  hookRepo = repo(),
  options: {
    allowed?: boolean;
    model?: ReturnType<typeof createModel>;
    refusal?: Record<string, unknown> | null;
    existing?: boolean;
  } = {},
) {
  return new ManageIncomingWebhookInteractor(
    hookRepo as never,
    records(options.model) as never,
    policy(options.allowed) as never,
    engine({ existing: options.existing }),
    { admitWebhooks: vi.fn(() => Promise.resolve(options.refusal ?? null)) } as never,
    settings,
  );
}

const errorCode = (result: { ok: boolean; error?: { issues: ReadonlyArray<unknown> } }) =>
  (result.error?.issues[0] as { params?: { error?: string } } | undefined)?.params?.error;

type Outcome = Awaited<ReturnType<ManageIncomingWebhookInteractor["invoke"]>>;

function dataOf(result: Outcome): Required<IncomingWebhookResult> {
  if (!result.ok) throw new Error(`expected success, got ${JSON.stringify(result.error)}`);
  return result.data as Required<IncomingWebhookResult>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = createMockUserWithPermissions([
    { resource: Resource.api, action: Action.readAll },
    { resource: Resource.api, action: Action.create },
    { resource: Resource.api, action: Action.update },
    { resource: Resource.api, action: Action.delete },
  ]);
});

describe("ManageIncomingWebhookInteractor", () => {
  describe("list and get", () => {
    it("lists the endpoints with their secret url and without the signing secret", async () => {
      const result = await interactor(repo(stored({ signingSecret: "shared-secret" }))).invoke({ action: "list" });

      const data = dataOf(result);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].url).toMatch(/^https:\/\/app\.example\.com\/api\/hooks\/[0-9a-f]{64}$/u);
      expect(data.items[0].hasSigningSecret).toBe(true);
      expect(JSON.stringify(data)).not.toContain("shared-secret");
    });

    it("filters the list by list type", async () => {
      const hookRepo = repo();

      await interactor(hookRepo).invoke({ action: "list", typeId: TYPE_ID });

      expect(hookRepo.listWebhooks).toHaveBeenCalledWith(TYPE_ID);
    });

    it("skips an endpoint whose stored mapping is no longer valid", async () => {
      const result = await interactor(repo(stored({ mapping: { broken: true } }))).invoke({ action: "list" });

      expect(dataOf(result).items).toEqual([]);
    });

    it("gets one endpoint or says it does not exist", async () => {
      const found = await interactor().invoke({ action: "get", id: HOOK_ID });
      const missing = await interactor(repo(null)).invoke({ action: "get", id: HOOK_ID });

      expect(dataOf(found).webhook.id).toBe(HOOK_ID);
      expect(missing.ok).toBe(false);
      expect(errorCode(missing)).toBe(CustomErrorCode.incomingWebhookNotFound);
    });
  });

  describe("fields", () => {
    it("lists the fields a mapping may fill", async () => {
      const result = await interactor().invoke({ action: "fields", typeId: TYPE_ID });

      expect(dataOf(result).fields.map((field) => field.fieldId)).toContain(NAME_FIELD);
    });

    it("refuses a list that is archived, unknown or unreadable", async () => {
      const unknown = await interactor(repo(), { model: createModel({ types: [] }) }).invoke({
        action: "fields",
        typeId: TYPE_ID,
      });
      const hidden = await interactor(repo(), { allowed: false }).invoke({ action: "fields", typeId: TYPE_ID });

      expect(errorCode(unknown)).toBe(CustomErrorCode.recordTypeNotFound);
      expect(errorCode(hidden)).toBe(CustomErrorCode.recordTypeNotFound);
    });
  });

  describe("create", () => {
    const input = { action: "create" as const, typeId: TYPE_ID, name: "Website signups", mapping: createMapping() };

    it("creates an endpoint that is on, with the default signature header", async () => {
      const hookRepo = repo(null);

      const result = await interactor(hookRepo).invoke(input);

      expect(result.ok).toBe(true);
      expect(hookRepo.createWebhook).toHaveBeenCalledWith({
        typeId: TYPE_ID,
        name: "Website signups",
        enabled: true,
        signingSecret: null,
        signatureHeader: "x-signature",
        mapping: createMapping(),
        samplePayload: null,
      });
      expect(dataOf(result).webhook.url).toContain("/api/hooks/");
    });

    it("stores a signing secret and a sample payload", async () => {
      const hookRepo = repo(null);

      await interactor(hookRepo).invoke({
        ...input,
        signingSecret: "shared-secret",
        signatureHeader: "x-hub-signature-256",
        samplePayload: PAYLOAD,
      });

      expect(hookRepo.createWebhook).toHaveBeenCalledWith(
        expect.objectContaining({
          signingSecret: "shared-secret",
          signatureHeader: "x-hub-signature-256",
          samplePayload: PAYLOAD,
        }),
      );
    });

    it("answers a plan without webhooks with the plan refusal", async () => {
      const hookRepo = repo(null);

      const result = await interactor(hookRepo, { refusal: { plan: "free" } }).invoke(input);

      expect(result.ok).toBe(false);
      expect(errorCode(result)).toBe(CustomErrorCode.planWebhooksNotIncluded);
      expect(hookRepo.createWebhook).not.toHaveBeenCalled();
    });

    it("refuses a missing list, a list the member may not write and a field outside the list", async () => {
      const noList = await interactor(repo(null), { model: createModel({ types: [] }) }).invoke(input);
      const denied = await interactor(repo(null), { allowed: false }).invoke(input);
      const badField = await interactor(repo(null)).invoke({
        ...input,
        mapping: createMapping({ fields: [{ path: "x", fieldId: "00000000-0000-4000-8000-00000000ffff" }] }),
      });

      expect(errorCode(noList)).toBe(CustomErrorCode.recordTypeNotFound);
      expect(errorCode(denied)).toBe(CustomErrorCode.permissionDenied);
      expect(errorCode(badField)).toBe(CustomErrorCode.incomingWebhookMappingInvalid);
      expect(badField.ok === false && badField.error.issues[0].path).toEqual(["mapping", "fields", "0", "fieldId"]);
    });

    it("refuses a member without the create permission on the API resource", async () => {
      mockUser = createMockUserWithPermissions([{ resource: Resource.api, action: Action.readAll }]);

      const result = await interactor(repo(null)).invoke(input);

      expect(errorCode(result)).toBe(CustomErrorCode.permissionDenied);
    });
  });

  describe("update", () => {
    it("changes only what was sent", async () => {
      const hookRepo = repo();

      const result = await interactor(hookRepo).invoke({
        action: "update",
        id: HOOK_ID,
        name: "Renamed",
        enabled: false,
      });

      expect(result.ok).toBe(true);
      expect(hookRepo.updateWebhook).toHaveBeenCalledWith(HOOK_ID, { name: "Renamed", enabled: false });
    });

    it("clears the signing secret when it is sent as null", async () => {
      const hookRepo = repo();

      await interactor(hookRepo).invoke({ action: "update", id: HOOK_ID, signingSecret: null });

      expect(hookRepo.updateWebhook).toHaveBeenCalledWith(HOOK_ID, { signingSecret: null });
    });

    it("rotates the url so the old one stops working", async () => {
      const hookRepo = repo();
      const before = await interactor(hookRepo).invoke({ action: "get", id: HOOK_ID });

      const result = await interactor(hookRepo).invoke({ action: "update", id: HOOK_ID, rotateUrl: true });

      expect(hookRepo.updateWebhook).toHaveBeenCalledWith(HOOK_ID, { rotateToken: true });
      expect(dataOf(result).webhook.url).not.toBe(dataOf(before).webhook.url);
    });

    it("validates a new mapping against the list of the endpoint", async () => {
      const hookRepo = repo();

      const result = await interactor(hookRepo).invoke({
        action: "update",
        id: HOOK_ID,
        mapping: createMapping({ fields: [{ path: "x", fieldId: "00000000-0000-4000-8000-00000000ffff" }] }),
      });

      expect(errorCode(result)).toBe(CustomErrorCode.incomingWebhookMappingInvalid);
      expect(hookRepo.updateWebhook).not.toHaveBeenCalled();
    });

    it("says when the endpoint does not exist and needs the update permission", async () => {
      const missing = await interactor(repo(null)).invoke({ action: "update", id: HOOK_ID, name: "x" });
      mockUser = createMockUserWithPermissions([{ resource: Resource.api, action: Action.readAll }]);
      const denied = await interactor().invoke({ action: "update", id: HOOK_ID, name: "x" });

      expect(errorCode(missing)).toBe(CustomErrorCode.incomingWebhookNotFound);
      expect(errorCode(denied)).toBe(CustomErrorCode.permissionDenied);
    });
  });

  describe("delete", () => {
    it("deletes an endpoint", async () => {
      const hookRepo = repo();

      const result = await interactor(hookRepo).invoke({ action: "delete", id: HOOK_ID });

      expect(result).toEqual({ ok: true, data: { deleted: true } });
      expect(hookRepo.deleteWebhook).toHaveBeenCalledWith(HOOK_ID);
    });

    it("says when it is gone and needs the delete permission", async () => {
      const missing = await interactor(repo(null)).invoke({ action: "delete", id: HOOK_ID });
      mockUser = createMockUserWithPermissions([{ resource: Resource.api, action: Action.readAll }]);
      const denied = await interactor().invoke({ action: "delete", id: HOOK_ID });

      expect(errorCode(missing)).toBe(CustomErrorCode.incomingWebhookNotFound);
      expect(errorCode(denied)).toBe(CustomErrorCode.permissionDenied);
    });
  });

  describe("test", () => {
    it("previews a create from the stored sample without writing", async () => {
      const result = await interactor().invoke({ action: "test", id: HOOK_ID });

      expect(result.ok).toBe(true);
      if (!result.ok || !("preview" in result.data)) return;
      const { preview } = dataOf(result);
      expect(preview).toMatchObject({ ok: true, outcome: "create", existingRecordId: null });
      expect(preview.values.map((value) => value.error)).toEqual([null, null, null, null]);
    });

    it("previews an update of the record an upsert would match", async () => {
      const hookRepo = repo(stored({ mapping: createMapping({ mode: "upsert", matchFieldId: NAME_FIELD }) }));

      const result = await interactor(hookRepo, { existing: true }).invoke({ action: "test", id: HOOK_ID });

      expect(dataOf(result).preview).toMatchObject({
        ok: true,
        outcome: "update",
        existingRecordId: RECORD_ID,
      });
    });

    it("reports the paths that do not fit when the sample is invalid", async () => {
      const result = await interactor().invoke({
        action: "test",
        id: HOOK_ID,
        payload: { data: { name: "", size: "many" } },
      });

      expect(dataOf(result).preview).toMatchObject({
        ok: false,
        outcome: null,
        values: expect.arrayContaining([
          expect.objectContaining({ path: "data.name", error: "required" }),
          expect.objectContaining({ path: "data.size", error: "invalid" }),
        ]),
      });
    });

    it("says when the endpoint does not exist", async () => {
      const result = await interactor(repo(null)).invoke({ action: "test", id: HOOK_ID });

      expect(errorCode(result)).toBe(CustomErrorCode.incomingWebhookNotFound);
    });
  });

  describe("deliveries", () => {
    it("lists the log, newest first as stored, and maps an unknown outcome to failed", async () => {
      const hookRepo = repo();

      const result = await interactor(hookRepo).invoke({ action: "deliveries", id: HOOK_ID, limit: 10 });

      expect(hookRepo.listDeliveries).toHaveBeenCalledWith(HOOK_ID, 10);
      const { deliveries } = dataOf(result);
      expect(deliveries.map((delivery) => delivery.outcome)).toEqual(["created", "failed"]);
      expect(deliveries[0]).toMatchObject({ recordId: RECORD_ID, createdAt: now.toISOString() });
    });

    it("defaults to 25 entries and says when the endpoint does not exist", async () => {
      const hookRepo = repo();
      await interactor(hookRepo).invoke({ action: "deliveries", id: HOOK_ID });
      const missing = await interactor(repo(null)).invoke({ action: "deliveries", id: HOOK_ID });

      expect(hookRepo.listDeliveries).toHaveBeenCalledWith(HOOK_ID, 25);
      expect(errorCode(missing)).toBe(CustomErrorCode.incomingWebhookNotFound);
    });
  });
});
