import { describe, it, expect, vi, beforeEach } from "vitest";
import z from "zod";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { UpsertWebhookInteractor, UpsertWebhookSchema } from "../upsert-webhook.interactor";
import { DeleteWebhookInteractor } from "../delete-webhook.interactor";
import { DomainEvent } from "@/features/event/domain-events";
import { ValidateWebhookIdsInteractor } from "@/core/validation/validators/validate-webhook-ids.interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { getWebhookRepo } from "@/core/di";

const WEBHOOK_ID = "00000000-0000-4000-8000-000000000001";

describe("UpsertWebhookSchema", () => {
  it.each([
    [
      {},
      [
        { error: CustomErrorCode.invalidUrl, path: ["url"] },
        { error: CustomErrorCode.webhookEventsRequired, path: ["events"] },
      ],
    ],
    [{ url: "https://example.com/webhook" }, [{ error: CustomErrorCode.webhookEventsRequired, path: ["events"] }]],
    [{ events: ["contact.created"] }, [{ error: CustomErrorCode.invalidUrl, path: ["url"] }]],
    [
      { url: "https://example.com/webhook", events: [] },
      [{ error: CustomErrorCode.webhookEventsRequired, path: ["events"] }],
    ],
    [
      { url: "", events: [] },
      [
        { error: undefined, path: ["url"] },
        { error: CustomErrorCode.webhookEventsRequired, path: ["events"] },
      ],
    ],
  ])("uses field-specific coded errors for an incomplete create payload", (input, expectedIssues) => {
    const result = UpsertWebhookSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.map((issue) => ({
          error: issue.code === "custom" ? issue.params?.error : undefined,
          path: issue.path,
        })),
      ).toEqual(expectedIssues);
    }
  });

  it("accepts a complete create payload", () => {
    expect(
      UpsertWebhookSchema.safeParse({ url: "https://example.com/webhook", events: ["contact.created"] }).success,
    ).toBe(true);
  });

  it("preserves the event minimum in generated schemas", () => {
    const schema = z.toJSONSchema(UpsertWebhookSchema) as {
      properties?: { events?: { minItems?: number } };
    };

    expect(schema.properties?.events?.minItems).toBe(1);
  });
});

function makeWebhookDto(overrides: Record<string, unknown> = {}) {
  return {
    id: WEBHOOK_ID,
    url: "https://example.com/webhook",
    description: null,
    events: ["contact.created"],
    secret: null,
    enabled: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

describe("UpsertWebhookInteractor (create)", () => {
  let mockRepo: any;
  let mockEventService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      upsertWebhookOrThrow: vi.fn().mockResolvedValue(makeWebhookDto()),
      getWebhookByIdOrThrow: vi.fn().mockResolvedValue(makeWebhookDto()),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new UpsertWebhookInteractor(mockRepo, mockEventService, new ValidateWebhookIdsInteractor(getWebhookRepo()));
  }

  it("publishes WEBHOOK_CREATED event when no id is provided", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      url: "https://example.com/webhook",
      events: ["contact.created"],
      enabled: true,
    });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.WEBHOOK_CREATED,
      expect.objectContaining({
        entityId: WEBHOOK_ID,
        payload: expect.objectContaining({ id: WEBHOOK_ID }),
      }),
    );
  });

  it("returns { ok: true, data: webhook }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      url: "https://example.com/webhook",
      events: ["contact.created"],
      enabled: true,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({ id: WEBHOOK_ID }));
  });
});

describe("UpsertWebhookInteractor (update)", () => {
  let mockRepo: any;
  let mockEventService: any;

  const previousWebhook = makeWebhookDto();
  const updatedWebhook = makeWebhookDto({ url: "https://example.com/webhook-v2", updatedAt: new Date("2025-02-01") });

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      upsertWebhookOrThrow: vi.fn().mockResolvedValue(updatedWebhook),
      getWebhookByIdOrThrow: vi.fn().mockResolvedValue(previousWebhook),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new UpsertWebhookInteractor(mockRepo, mockEventService, new ValidateWebhookIdsInteractor(getWebhookRepo()));
  }

  it("publishes WEBHOOK_UPDATED event when id is provided", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      id: WEBHOOK_ID,
      url: "https://example.com/webhook-v2",
      events: ["contact.created"],
      enabled: true,
    });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.WEBHOOK_UPDATED,
      expect.objectContaining({
        entityId: WEBHOOK_ID,
        payload: expect.objectContaining({
          webhook: expect.objectContaining({ id: WEBHOOK_ID }),
          changes: expect.any(Object),
        }),
      }),
    );
  });
});

describe("DeleteWebhookInteractor", () => {
  let mockRepo: any;
  let mockEventService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      deleteWebhookOrThrow: vi.fn().mockResolvedValue(makeWebhookDto()),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new DeleteWebhookInteractor(mockRepo, mockEventService, new ValidateWebhookIdsInteractor(getWebhookRepo()));
  }

  it("publishes WEBHOOK_DELETED event", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ id: WEBHOOK_ID });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.WEBHOOK_DELETED,
      expect.objectContaining({
        entityId: WEBHOOK_ID,
        payload: expect.objectContaining({ id: WEBHOOK_ID }),
      }),
    );
  });

  it("returns { ok: true, data: id }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ id: WEBHOOK_ID });

    expect(result.ok).toBe(true);
    expect(result.data).toBe(WEBHOOK_ID);
  });
});

describe("webhook targets stay strict about relative values", () => {
  it.each([["/evil"], ["//attacker.example/hook"], ["/"]])(
    "rejects the relative target %j on the url field instead of resolving it to another host",
    (url) => {
      const result = UpsertWebhookSchema.safeParse({ url, events: ["contact.created"] });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues.map((issue) => issue.path)).toEqual([["url"]]);
    },
  );

  it("still accepts a bare host and normalises it to https", () => {
    const result = UpsertWebhookSchema.safeParse({ url: "receiver.example/hook", events: ["contact.created"] });

    expect(result).toMatchObject({ success: true, data: { url: "https://receiver.example/hook" } });
  });
});
