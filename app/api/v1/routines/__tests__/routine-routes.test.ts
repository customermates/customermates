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
  upsert: vi.fn(),
  pause: vi.fn(),
  run: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getGetRoutinesApiInteractor: () => ({ invoke: interactors.list }),
  getGetRoutineByIdInteractor: () => ({ invoke: interactors.read }),
  getGetRoutineRunsInteractor: () => ({ invoke: interactors.runs }),
  getUpsertRoutineInteractor: () => ({ invoke: interactors.upsert }),
  getPauseRoutineInteractor: () => ({ invoke: interactors.pause }),
  getRunRoutineNowInteractor: () => ({ invoke: interactors.run }),
  getDeleteRoutineInteractor: () => ({ invoke: interactors.remove }),
}));

import { POST as list } from "../list/route";
import { POST as read } from "../read/route";
import { POST as runs } from "../runs/route";
import { POST as create } from "../create/route";
import { POST as update } from "../update/route";
import { POST as pause } from "../pause/route";
import { POST as resume } from "../resume/route";
import { POST as run } from "../run/route";
import { POST as remove } from "../delete/route";

const ID = "00000000-0000-4000-8000-000000000001";

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost:4105/api/v1/routines/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": "test-transport-only" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("routine REST routes", () => {
  it.each([
    ["list", list, interactors.list, { searchTerm: "deal", pagination: { page: 1, pageSize: 25 } }, 200],
    ["read", read, interactors.read, { id: ID }, 200],
    ["runs", runs, interactors.runs, { id: ID, cursor: null }, 200],
    ["pause", pause, interactors.pause, { id: ID }, 200],
    ["run", run, interactors.run, { id: ID }, 202],
    ["delete", remove, interactors.remove, { id: ID }, 200],
  ] as const)("passes the %s body to its interactor unchanged", async (path, handler, spy, body, status) => {
    spy.mockResolvedValue({ ok: true, data: { done: path } });

    const response = await handler(request(path, body));

    expect(spy).toHaveBeenCalledExactlyOnceWith(body);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ done: path });
  });

  it("creates a new routine even when the body names an existing id", async () => {
    interactors.upsert.mockResolvedValue({ ok: true, data: { id: ID } });
    const body = { id: ID, name: "Brief", prompt: "Do it", triggerKind: "schedule", cronExpression: "0 8 * * 1-5" };

    const response = await create(request("create", body));

    expect(interactors.upsert).toHaveBeenCalledExactlyOnceWith({ ...body, id: undefined });
    expect(response.status).toBe(201);
  });

  it("never lets update create a routine when the id is missing", async () => {
    interactors.upsert.mockResolvedValue({ ok: true, data: { id: ID } });

    await update(request("update", { name: "Renamed" }));
    await update(request("update", { id: ID, enabled: false }));

    expect(interactors.upsert.mock.calls).toEqual([[{ name: "Renamed", id: null }], [{ id: ID, enabled: false }]]);
  });

  it("resumes through the upsert interactor with enabled true only", async () => {
    interactors.upsert.mockResolvedValue({ ok: true, data: { id: ID, enabled: true } });

    const response = await resume(request("resume", { id: ID, name: "ignored", enabled: false }));

    expect(interactors.upsert).toHaveBeenCalledExactlyOnceWith({ id: ID, enabled: true });
    expect(response.status).toBe(200);
  });

  it("returns interactor failures and thrown access errors as structured bodies", async () => {
    interactors.pause.mockResolvedValue({
      ok: false,
      error: createZodError("Admins only", [], { error: CustomErrorCode.routineAdminRequired, kind: "authorization" }),
    });
    interactors.read.mockRejectedValue(new ForbiddenError("Access denied"));

    const denied = await pause(request("pause", { id: ID }));
    const forbidden = await read(request("read", { id: ID }));

    expect(denied.status).toBe(403);
    expect(StructuredErrorResponseSchema.parse(await denied.json()).error.issues[0]?.customCode).toBe(
      CustomErrorCode.routineAdminRequired,
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
