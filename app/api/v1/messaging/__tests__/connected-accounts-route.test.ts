import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AuthError, ForbiddenError } from "@/core/errors/app-errors";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/core/di", () => ({ getGetMyConnectedAccountsApiInteractor: () => ({ invoke }) }));

import { GET } from "../connected-accounts/route";

beforeEach(() => vi.resetAllMocks());

describe("connected accounts REST adapter", () => {
  it("forwards the public interactor output without parsing a second DTO", async () => {
    const data = [{ id: "public-interactor-output" }];
    invoke.mockResolvedValue({ ok: true, data });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(data);
    expect(invoke).toHaveBeenCalledExactlyOnceWith();
  });

  it("maps the interactor validation failure without a second invocation", async () => {
    invoke.mockResolvedValue({
      ok: false,
      error: new z.ZodError([{ code: "custom", path: [], message: "Invalid request" }]),
    });
    const response = await GET();
    expect(response.status).toBe(400);
    expect(await response.json()).toContain("Invalid request");
    expect(invoke).toHaveBeenCalledOnce();
  });

  it.each([
    [new AuthError(), 401],
    [new ForbiddenError(), 403],
  ])("maps access errors %s to %s", async (error, status) => {
    invoke.mockRejectedValue(error);
    const response = await GET();
    expect(response.status).toBe(status);
    expect(invoke).toHaveBeenCalledOnce();
  });
});
