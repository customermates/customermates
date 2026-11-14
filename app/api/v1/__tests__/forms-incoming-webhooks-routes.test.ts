import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

const interactors = vi.hoisted(() => ({
  listForms: vi.fn(),
  getForm: vi.fn(),
  formEditor: vi.fn(),
  upsertForm: vi.fn(),
  disableForm: vi.fn(),
  manageWebhooks: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getListPublicFormsInteractor: () => ({ invoke: interactors.listForms }),
  getGetPublicFormInteractor: () => ({ invoke: interactors.getForm }),
  getGetPublicFormEditorInteractor: () => ({ invoke: interactors.formEditor }),
  getUpsertPublicFormInteractor: () => ({ invoke: interactors.upsertForm }),
  getDisablePublicFormInteractor: () => ({ invoke: interactors.disableForm }),
  getManageIncomingWebhookInteractor: () => ({ invoke: interactors.manageWebhooks }),
}));

import { POST as listForms } from "../forms/list/route";
import { POST as readForm } from "../forms/read/route";
import { POST as formFields } from "../forms/fields/route";
import { POST as saveForm } from "../forms/save/route";
import { POST as disableForm } from "../forms/disable/route";
import { POST as createWebhook } from "../incoming-webhooks/create/route";
import { POST as deleteWebhook } from "../incoming-webhooks/delete/route";
import { POST as webhookDeliveries } from "../incoming-webhooks/deliveries/route";
import { POST as webhookFields } from "../incoming-webhooks/fields/route";
import { POST as listWebhooks } from "../incoming-webhooks/list/route";
import { POST as readWebhook } from "../incoming-webhooks/read/route";
import { POST as testWebhook } from "../incoming-webhooks/test/route";
import { POST as updateWebhook } from "../incoming-webhooks/update/route";

const ID = "00000000-0000-4000-8000-000000000001";

function request(body: unknown) {
  return new NextRequest("http://localhost:4105/api/v1/test", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": "test-transport-only" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("form REST routes", () => {
  it.each([
    ["list", listForms, "listForms", { typeId: ID }],
    ["read", readForm, "getForm", { id: ID }],
    ["fields", formFields, "formEditor", { typeId: ID }],
    ["save", saveForm, "upsertForm", { typeId: ID, name: "Contact form", config: { title: "Hi" } }],
    ["disable", disableForm, "disableForm", { id: ID }],
  ] as const)("passes the %s body to its interactor and returns the result", async (_name, route, key, body) => {
    interactors[key].mockResolvedValue({ ok: true, data: { handled: true } });

    const response = await route(request(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ handled: true });
    expect(interactors[key]).toHaveBeenCalledExactlyOnceWith(body);
  });

  it("returns a missing form as 404 with the structured body", async () => {
    interactors.getForm.mockResolvedValue({
      ok: false,
      error: createZodError("Missing", ["id"], { error: CustomErrorCode.publicFormNotFound, kind: "not_found" }),
    });

    const response = await readForm(request({ id: ID }));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { issues: [{ path: ["id"], customCode: CustomErrorCode.publicFormNotFound }] },
    });
  });

  it.each([
    ["list", listForms],
    ["read", readForm],
    ["fields", formFields],
    ["save", saveForm],
    ["disable", disableForm],
  ] as const)("rejects a malformed %s body before any interactor runs", async (_name, route) => {
    const response = await route(request("{"));

    expect(response.status).toBe(400);
    for (const key of ["listForms", "getForm", "formEditor", "upsertForm", "disableForm"] as const)
      expect(interactors[key]).not.toHaveBeenCalled();
  });
});

describe("incoming webhook REST routes", () => {
  it.each([
    ["list", listWebhooks, "list", { typeId: ID }],
    ["read", readWebhook, "get", { id: ID }],
    ["fields", webhookFields, "fields", { typeId: ID }],
    ["create", createWebhook, "create", { typeId: ID, name: "Signups", mapping: { mode: "create", fields: [] } }],
    ["update", updateWebhook, "update", { id: ID, rotateUrl: true }],
    ["delete", deleteWebhook, "delete", { id: ID }],
    ["test", testWebhook, "test", { id: ID, payload: { a: 1 } }],
    ["deliveries", webhookDeliveries, "deliveries", { id: ID, limit: 5 }],
  ] as const)("runs manage_incoming_webhooks with action %s", async (_name, route, action, body) => {
    interactors.manageWebhooks.mockResolvedValue({ ok: true, data: { action } });

    const response = await route(request(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ action });
    expect(interactors.manageWebhooks).toHaveBeenCalledExactlyOnceWith({ ...body, action });
  });

  it("does not let the body choose another action", async () => {
    interactors.manageWebhooks.mockResolvedValue({ ok: true, data: {} });

    await deleteWebhook(request({ id: ID, action: "create" }));

    expect(interactors.manageWebhooks).toHaveBeenCalledExactlyOnceWith({ id: ID, action: "delete" });
  });

  it("returns a plan refusal as 409 and a missing endpoint as 404", async () => {
    interactors.manageWebhooks.mockResolvedValueOnce({
      ok: false,
      error: createZodError("Not in your plan", [], {
        error: CustomErrorCode.planWebhooksNotIncluded,
        kind: "conflict",
      }),
    });
    interactors.manageWebhooks.mockResolvedValueOnce({
      ok: false,
      error: createZodError("Missing", ["id"], {
        error: CustomErrorCode.incomingWebhookNotFound,
        kind: "not_found",
      }),
    });

    const refused = await createWebhook(request({ typeId: ID, name: "x", mapping: {} }));
    const missing = await readWebhook(request({ id: ID }));

    expect(refused.status).toBe(409);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { issues: [{ customCode: CustomErrorCode.incomingWebhookNotFound }] },
    });
  });

  it.each([
    ["list", listWebhooks],
    ["read", readWebhook],
    ["create", createWebhook],
    ["update", updateWebhook],
    ["delete", deleteWebhook],
    ["test", testWebhook],
    ["deliveries", webhookDeliveries],
    ["fields", webhookFields],
  ] as const)("rejects a malformed %s body before the interactor runs", async (_name, route) => {
    const response = await route(request("{"));

    expect(response.status).toBe(400);
    expect(interactors.manageWebhooks).not.toHaveBeenCalled();
  });
});
