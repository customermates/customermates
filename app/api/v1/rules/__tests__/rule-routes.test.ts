import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StructuredErrorResponseSchema } from "@/core/api/structured-interactor-handler";
import { ForbiddenError } from "@/core/errors/app-errors";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

const interactors = vi.hoisted(() => ({
  list: vi.fn(),
  read: vi.fn(),
  runs: vi.fn(),
  preview: vi.fn(),
  upsert: vi.fn(),
  enabled: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getGetAutomationRulesInteractor: () => ({ invoke: interactors.list }),
  getGetAutomationRuleInteractor: () => ({ invoke: interactors.read }),
  getGetAutomationRuleRunsInteractor: () => ({ invoke: interactors.runs }),
  getPreviewAutomationRuleInteractor: () => ({ invoke: interactors.preview }),
  getUpsertAutomationRuleInteractor: () => ({ invoke: interactors.upsert }),
  getSetAutomationRuleEnabledInteractor: () => ({ invoke: interactors.enabled }),
  getDeleteAutomationRuleInteractor: () => ({ invoke: interactors.remove }),
}));

import { POST as list } from "../list/route";
import { POST as read } from "../read/route";
import { POST as runs } from "../runs/route";
import { POST as preview } from "../preview/route";
import { POST as create } from "../create/route";
import { POST as update } from "../update/route";
import { POST as enable } from "../enable/route";
import { POST as disable } from "../disable/route";
import { POST as remove } from "../delete/route";

const ID = "00000000-0000-4000-8000-000000000001";

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost:4105/api/v1/rules/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": "test-transport-only" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("automation rule REST routes", () => {
  it.each([
    ["list", list, interactors.list, { owner: "mine", page: 2, pageSize: 25 }, 200],
    ["read", read, interactors.read, { id: ID }, 200],
    ["runs", runs, interactors.runs, { id: ID, cursor: null }, 200],
    ["preview", preview, interactors.preview, { id: ID }, 200],
    ["delete", remove, interactors.remove, { id: ID }, 200],
  ] as const)("passes the %s body to its interactor unchanged", async (path, handler, spy, body, status) => {
    spy.mockResolvedValue({ ok: true, data: { done: path } });

    const response = await handler(request(path, body));

    expect(spy).toHaveBeenCalledExactlyOnceWith(body);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ done: path });
  });

  it("creates a new rule even when the body names an existing id", async () => {
    interactors.upsert.mockResolvedValue({ ok: true, data: { id: ID } });
    const body = { id: ID, name: "Follow up", trigger: { kind: "messageReceived" }, effects: [] };

    const response = await create(request("create", body));

    expect(interactors.upsert).toHaveBeenCalledExactlyOnceWith({ ...body, id: undefined });
    expect(response.status).toBe(201);
  });

  it("updates through the upsert interactor with the body as sent", async () => {
    interactors.upsert.mockResolvedValue({ ok: true, data: { id: ID } });

    const response = await update(request("update", { id: ID, name: "Renamed" }));

    expect(interactors.upsert).toHaveBeenCalledExactlyOnceWith({ id: ID, name: "Renamed" });
    expect(response.status).toBe(200);
  });

  it("switches a rule on and off through one interactor, whatever the body says about enabled", async () => {
    interactors.enabled.mockResolvedValue({ ok: true, data: { id: ID } });

    await enable(request("enable", { id: ID, enabled: false }));
    await disable(request("disable", { id: ID, enabled: true }));

    expect(interactors.enabled.mock.calls).toEqual([
      [{ id: ID, enabled: true }],
      [{ id: ID, enabled: false }],
    ]);
  });

  it("returns interactor failures and thrown access errors as structured bodies", async () => {
    interactors.enabled.mockResolvedValue({
      ok: false,
      error: createZodError("Owner only", [], {
        error: CustomErrorCode.automationRuleEditNotOwner,
        kind: "authorization",
      }),
    });
    interactors.read.mockRejectedValue(new ForbiddenError("Access denied"));

    const denied = await enable(request("enable", { id: ID }));
    const forbidden = await read(request("read", { id: ID }));

    expect(denied.status).toBe(403);
    expect(StructuredErrorResponseSchema.parse(await denied.json()).error.issues[0]?.customCode).toBe(
      CustomErrorCode.automationRuleEditNotOwner,
    );
    expect(forbidden.status).toBe(403);
    expect(StructuredErrorResponseSchema.parse(await forbidden.json()).error.kind).toBe("authorization");
  });

  it("rejects a malformed JSON body before any interactor runs", async () => {
    const response = await create(request("create", "{"));

    expect(response.status).toBe(400);
    expect(StructuredErrorResponseSchema.parse(await response.json()).error.issues[0]?.customCode).toBe(
      CustomErrorCode.invalidJsonBody,
    );
    expect(interactors.upsert).not.toHaveBeenCalled();
  });
});
