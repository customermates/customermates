import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/constants/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { UpsertWebhookInteractor } from "../upsert-webhook.interactor";
import { DeleteWebhookInteractor } from "../delete-webhook.interactor";
import { DomainEvent } from "@/features/event/domain-events";

const WEBHOOK_ID = "00000000-0000-4000-8000-000000000001";

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
    return new UpsertWebhookInteractor(mockRepo, mockEventService);
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
    return new UpsertWebhookInteractor(mockRepo, mockEventService);
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
    return new DeleteWebhookInteractor(mockRepo, mockEventService);
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
