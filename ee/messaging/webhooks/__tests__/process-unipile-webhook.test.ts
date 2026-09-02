import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => ({ ...createMockDiModule(() => mockUser) }));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/node", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { z } from "zod";
import * as Sentry from "@sentry/node";

import { ProcessUnipileWebhookInteractor } from "../process-unipile-webhook.interactor";
import { UnmappableWebhookPayloadError } from "@/core/errors/app-errors";
import { UnipileRequestError } from "../../messaging.service";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";

function build(row: unknown, handlers: Record<string, { invoke: ReturnType<typeof vi.fn> }> = {}) {
  const events = {
    findWebhookEventByIdOrThrowUnscoped: vi.fn().mockResolvedValue(row),
    markWebhookEventProcessedUnscoped: vi.fn().mockResolvedValue(undefined),
    markWebhookEventFailedUnscoped: vi.fn().mockResolvedValue(undefined),
  };
  const interactor = new ProcessUnipileWebhookInteractor(events as any, handlers as any);

  return { interactor, events };
}

function row(payload: unknown, extra: Record<string, unknown> = {}) {
  return { id: EVENT_ID, processed: false, payload, ...extra };
}

const invoke = (interactor: ProcessUnipileWebhookInteractor) => interactor.invoke({ id: EVENT_ID });

beforeEach(() => vi.clearAllMocks());

describe("ProcessUnipileWebhookInteractor classification", () => {
  it("marks processed and clears nothing else when the handler succeeds", async () => {
    const handler = { invoke: vi.fn().mockResolvedValue(undefined) };
    const { interactor, events } = build(row({ type: "message.new", account_id: "acc_1", payload: {} }), {
      "message.new": handler,
    });

    await invoke(interactor);

    expect(handler.invoke).toHaveBeenCalledOnce();
    expect(events.markWebhookEventProcessedUnscoped).toHaveBeenCalledWith(EVENT_ID);
    expect(events.markWebhookEventFailedUnscoped).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("retires a disconnected-account rejection without reporting it", async () => {
    const disconnected = new UnipileRequestError(
      401,
      "provider/invalid_authorization",
      '{"object":"Error","status":401,"type":"provider/invalid_authorization","title":"Invalid authorization","detail":"Account is disconnected.","req_id":"req-8gb"}',
    );
    const handler = { invoke: vi.fn().mockRejectedValue(disconnected) };
    const { interactor, events } = build(row({ type: "email.folder.update", account_id: "acc_1", payload: {} }), {
      "email.folder.update": handler,
    });

    await invoke(interactor);

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(events.markWebhookEventFailedUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ id: EVENT_ID, terminal: true }),
    );
    expect(events.markWebhookEventProcessedUnscoped).not.toHaveBeenCalled();
  });

  it("retries a transient provider rejection without reporting it", async () => {
    const unprocessable = new UnipileRequestError(
      422,
      "provider/unprocessable_entity",
      '{"object":"Error","status":422,"type":"provider/unprocessable_entity","title":"Unprocessable entity","detail":"LIST completed","req_id":"req-48tf"}',
    );
    const handler = { invoke: vi.fn().mockRejectedValue(unprocessable) };
    const { interactor, events } = build(row({ type: "email.delete", account_id: "acc_1", payload: {} }), {
      "email.delete": handler,
    });

    await invoke(interactor);

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(events.markWebhookEventFailedUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ id: EVENT_ID, terminal: false }),
    );
    expect(events.markWebhookEventProcessedUnscoped).not.toHaveBeenCalled();
  });

  it("retries a Unipile timeout without reporting it", async () => {
    const timeout = new UnipileRequestError(0, null, "{}");
    const handler = { invoke: vi.fn().mockRejectedValue(timeout) };
    const { interactor, events } = build(row({ type: "email.folder.create", account_id: "acc_1", payload: {} }), {
      "email.folder.create": handler,
    });

    await invoke(interactor);

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(events.markWebhookEventFailedUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ id: EVENT_ID, terminal: false }),
    );
  });

  it("still reports an unrelated Unipile rejection", async () => {
    const serverError = new UnipileRequestError(500, "api/unknown", '{"detail":"boom"}');
    const handler = { invoke: vi.fn().mockRejectedValue(serverError) };
    const { interactor } = build(row({ type: "email.folder.update", account_id: "acc_1", payload: {} }), {
      "email.folder.update": handler,
    });

    await invoke(interactor);

    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  it("marks a transient handler error non-terminal, captures it once, and does not rethrow", async () => {
    const handler = { invoke: vi.fn().mockRejectedValue(new Error("db down")) };
    const { interactor, events } = build(row({ type: "message.new", account_id: "acc_1", payload: {} }), {
      "message.new": handler,
    });

    await invoke(interactor);

    expect(events.markWebhookEventFailedUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ id: EVENT_ID, error: "db down", terminal: false }),
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { webhookEventId: EVENT_ID, eventType: "message.new" },
    });
  });

  it("marks a handler ZodError terminal, captures it, and does not rethrow", async () => {
    const handler = { invoke: vi.fn().mockRejectedValue(new z.ZodError([])) };
    const { interactor, events } = build(row({ type: "message.new", account_id: "acc_1", payload: {} }), {
      "message.new": handler,
    });

    await invoke(interactor);

    expect(events.markWebhookEventFailedUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ id: EVENT_ID, terminal: true }),
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(z.ZodError), {
      tags: { webhookEventId: EVENT_ID, eventType: "message.new" },
    });
  });

  it("marks an unmappable payload terminal with its id and no Sentry", async () => {
    const handler = { invoke: vi.fn().mockRejectedValue(new UnmappableWebhookPayloadError("m-1")) };
    const { interactor, events } = build(row({ type: "message.new", account_id: "acc_1", payload: {} }), {
      "message.new": handler,
    });

    await invoke(interactor);

    expect(events.markWebhookEventFailedUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ id: EVENT_ID, terminal: true, unipileMessageId: "m-1" }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("classifies a foreign-copy unmappable brand the same way", async () => {
    const brand = Symbol.for("customermates.unmappableWebhookPayload");
    const foreign = { [brand]: true, message: "unmappable", unipileMessageId: "m-2" };
    const handler = { invoke: vi.fn().mockRejectedValue(foreign) };
    const { interactor, events } = build(row({ type: "message.new", account_id: "acc_1", payload: {} }), {
      "message.new": handler,
    });

    await invoke(interactor);

    expect(events.markWebhookEventFailedUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ id: EVENT_ID, terminal: true, unipileMessageId: "m-2" }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("marks an ignored event type processed via its noop handler", async () => {
    const { interactor, events } = build(row({ type: "message.receipt.read", account_id: "acc_1", payload: {} }), {
      "message.receipt.read": { invoke: vi.fn().mockResolvedValue(undefined) },
    });

    await invoke(interactor);

    expect(events.markWebhookEventProcessedUnscoped).toHaveBeenCalledWith(EVENT_ID);
    expect(events.markWebhookEventFailedUnscoped).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("captures an unknown event type and marks it terminal", async () => {
    const { interactor, events } = build(row({ type: "something.else", account_id: "acc_1", payload: {} }));

    await invoke(interactor);

    expect(Sentry.captureMessage).toHaveBeenCalledOnce();
    expect(events.markWebhookEventFailedUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ id: EVENT_ID, error: "Unhandled event type: something.else", terminal: true }),
    );
  });

  it("captures an envelope parse failure and marks it terminal", async () => {
    const { interactor, events } = build(row({ no: "type" }, { eventType: null }));

    await invoke(interactor);

    expect(Sentry.captureException).toHaveBeenCalledOnce();
    expect(events.markWebhookEventFailedUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ id: EVENT_ID, terminal: true }),
    );
  });

  it("does nothing when the row is already processed", async () => {
    const handler = { invoke: vi.fn() };
    const { interactor, events } = build(
      row({ type: "message.new", account_id: "acc_1", payload: {} }, { processed: true }),
      {
        "message.new": handler,
      },
    );

    await invoke(interactor);

    expect(handler.invoke).not.toHaveBeenCalled();
    expect(events.markWebhookEventProcessedUnscoped).not.toHaveBeenCalled();
    expect(events.markWebhookEventFailedUnscoped).not.toHaveBeenCalled();
  });
});
