import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StructuredErrorResponseSchema } from "@/core/api/structured-interactor-handler";
import { ForbiddenError } from "@/core/errors/app-errors";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

const interactors = vi.hoisted(() => ({
  list: vi.fn(),
  upsert: vi.fn(),
  deliveries: vi.fn(),
  workspaceDeliveries: vi.fn(),
  resend: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getGetWebhooksApiInteractor: () => ({ invoke: interactors.list }),
  getUpsertWebhookInteractor: () => ({ invoke: interactors.upsert }),
  getGetWebhookByIdInteractor: () => ({ invoke: vi.fn() }),
  getDeleteWebhookInteractor: () => ({ invoke: vi.fn() }),
  getGetWebhookDeliveriesByWebhookInteractor: () => ({ invoke: interactors.deliveries }),
  getGetWebhookDeliveriesApiInteractor: () => ({ invoke: interactors.workspaceDeliveries }),
  getResendWebhookDeliveryInteractor: () => ({ invoke: interactors.resend }),
}));

import { GET as listWebhooks } from "../route";
import { PATCH as updateWebhook } from "../[id]/route";
import { GET as listDeliveries } from "../[id]/deliveries/route";
import { GET as listWorkspaceDeliveries } from "../deliveries/route";
import { POST as resendDelivery } from "../[id]/deliveries/[deliveryId]/resend/route";

const ID = "00000000-0000-4000-8000-000000000001";
const DELIVERY_ID = "00000000-0000-4000-8000-000000000002";

function request(path: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost:4105/api/v1/webhooks${path}`, {
    method,
    headers: { "content-type": "application/json", "x-api-key": "test-transport-only" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const webhook = {
  id: ID,
  url: "https://hooks.example.com/a",
  description: null,
  events: ["record.created"],
  secret: "s3cr3t",
  headers: { Authorization: "Bearer hidden" },
  bodyTemplate: null,
  enabled: true,
  createdAt: new Date("2026-10-12T08:00:00.000Z"),
  updatedAt: new Date("2026-10-12T08:00:00.000Z"),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("webhook REST routes", () => {
  it("lists webhooks from query parameters and never returns secrets or header values", async () => {
    interactors.list.mockResolvedValue({
      ok: true,
      data: { items: [webhook], pagination: { page: 2, pageSize: 10, totalPages: 2, total: 11 } },
    });

    const response = await listWebhooks(
      request("?page=2&pageSize=10&searchTerm=hooks&sortField=createdAt&sortDirection=desc", "GET"),
    );

    expect(interactors.list).toHaveBeenCalledExactlyOnceWith({
      searchTerm: "hooks",
      pagination: { page: 2, pageSize: 10 },
      sortDescriptor: { field: "createdAt", direction: "desc" },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toEqual([expect.objectContaining({ id: ID, hasSecret: true, headerNames: ["Authorization"] })]);
    expect(JSON.stringify(body)).not.toContain("s3cr3t");
    expect(JSON.stringify(body)).not.toContain("Bearer hidden");
  });

  it("passes unparsable query values through so the interactor rejects them", async () => {
    interactors.list.mockResolvedValue({
      ok: false,
      error: createZodError("Invalid page", ["pagination", "page"]),
    });

    const response = await listWebhooks(request("?page=first", "GET"));

    expect(interactors.list).toHaveBeenCalledExactlyOnceWith({
      searchTerm: undefined,
      pagination: { page: Number.NaN, pageSize: 25 },
    });
    expect(response.status).toBe(400);
    expect(StructuredErrorResponseSchema.parse(await response.json()).error.kind).toBe("validation");
  });

  it("updates through the upsert interactor with the path id winning over the body", async () => {
    interactors.upsert.mockResolvedValue({ ok: true, data: { ...webhook, enabled: false } });

    const response = await updateWebhook(request(`/${ID}`, "PATCH", { id: DELIVERY_ID, enabled: false }), {
      params: Promise.resolve({ id: ID }),
    });

    expect(interactors.upsert).toHaveBeenCalledExactlyOnceWith({ id: ID, enabled: false });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: ID, enabled: false, hasSecret: true });
  });

  it("returns a missing webhook on update as a structured 404", async () => {
    interactors.upsert.mockResolvedValue({
      ok: false,
      error: createZodError("Webhook not found", ["id"], { error: CustomErrorCode.webhookNotFound }),
    });

    const response = await updateWebhook(request(`/${ID}`, "PATCH", {}), { params: Promise.resolve({ id: ID }) });

    expect(response.status).toBe(404);
    expect(StructuredErrorResponseSchema.parse(await response.json()).error.kind).toBe("not_found");
  });

  it("lists one webhook's deliveries through the webhook-scoped interactor", async () => {
    interactors.deliveries.mockResolvedValue({ ok: true, data: { items: [] } });

    const response = await listDeliveries(request(`/${ID}/deliveries?searchTerm=record`, "GET"), {
      params: Promise.resolve({ id: ID }),
    });

    expect(interactors.deliveries).toHaveBeenCalledExactlyOnceWith({ searchTerm: "record", webhookId: ID });
    expect(response.status).toBe(200);
  });

  it("answers 404 when the webhook is unknown or belongs to another workspace", async () => {
    interactors.deliveries.mockResolvedValue({
      ok: false,
      error: createZodError("Webhook not found", ["webhookId"], { error: CustomErrorCode.webhookNotFound }),
    });

    const response = await listDeliveries(request(`/${ID}/deliveries`, "GET"), {
      params: Promise.resolve({ id: ID }),
    });

    expect(response.status).toBe(404);
    expect(StructuredErrorResponseSchema.parse(await response.json()).error.kind).toBe("not_found");
  });

  it("lists deliveries across all webhooks from query parameters without a webhook filter", async () => {
    const delivery = { id: DELIVERY_ID, url: "https://hooks.example.com/a", event: "record.created" };
    interactors.workspaceDeliveries.mockResolvedValue({
      ok: true,
      data: { items: [delivery], pagination: { page: 1, pageSize: 5, totalPages: 1, total: 1 } },
    });

    const response = await listWorkspaceDeliveries(
      request("/deliveries?pageSize=5&searchTerm=record&sortField=createdAt&sortDirection=desc", "GET"),
    );

    expect(interactors.workspaceDeliveries).toHaveBeenCalledExactlyOnceWith({
      searchTerm: "record",
      pagination: { page: 1, pageSize: 5 },
      sortDescriptor: { field: "createdAt", direction: "desc" },
    });
    expect(interactors.deliveries).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ items: [delivery] });
  });

  it("answers 403 on the workspace deliveries without read all permission on the API", async () => {
    interactors.workspaceDeliveries.mockRejectedValue(new ForbiddenError());

    const response = await listWorkspaceDeliveries(request("/deliveries", "GET"));

    expect(response.status).toBe(403);
    expect(StructuredErrorResponseSchema.parse(await response.json()).error.kind).toBe("authorization");
  });

  it("resends a delivery scoped to its webhook and reports the new delivery", async () => {
    interactors.resend.mockResolvedValue({ ok: true, data: "00000000-0000-4000-8000-000000000003" });

    const response = await resendDelivery(request(`/${ID}/deliveries/${DELIVERY_ID}/resend`, "POST", {}), {
      params: Promise.resolve({ id: ID, deliveryId: DELIVERY_ID }),
    });

    expect(interactors.resend).toHaveBeenCalledExactlyOnceWith({ id: DELIVERY_ID, webhookId: ID });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      resentDeliveryId: DELIVERY_ID,
      deliveryId: "00000000-0000-4000-8000-000000000003",
    });
  });
});
