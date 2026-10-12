import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StructuredErrorResponseSchema } from "@/core/api/structured-interactor-handler";
import { AuthError } from "@/core/errors/app-errors";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

const interactors = vi.hoisted(() => ({
  listWiki: vi.fn(),
  searchWiki: vi.fn(),
  readWiki: vi.fn(),
  createWiki: vi.fn(),
  updateWiki: vi.fn(),
  moveWiki: vi.fn(),
  deleteWiki: vi.fn(),
  invite: vi.fn(),
  updateMember: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: () => {
    const translate = (key: string) => key;
    return Promise.resolve(Object.assign(translate, { raw: translate }));
  },
}));

vi.mock("@/core/di", () => ({
  getGetWikiPagesInteractor: () => ({ invoke: interactors.listWiki }),
  getSearchWikiKnowledgeInteractor: () => ({ invoke: interactors.searchWiki }),
  getGetWikiPageInteractor: () => ({ invoke: interactors.readWiki }),
  getCreateWikiPagesInteractor: () => ({ invoke: interactors.createWiki }),
  getUpdateWikiPageInteractor: () => ({ invoke: interactors.updateWiki }),
  getMoveWikiPageInteractor: () => ({ invoke: interactors.moveWiki }),
  getDeleteWikiPageInteractor: () => ({ invoke: interactors.deleteWiki }),
  getInviteUsersByEmailInteractor: () => ({ invoke: interactors.invite }),
  getAdminUpdateUserDetailsInteractor: () => ({ invoke: interactors.updateMember }),
  getGetUserDetailsInteractor: () => ({ invoke: interactors.getProfile }),
  getUpdateUserDetailsInteractor: () => ({ invoke: interactors.updateProfile }),
}));

import { POST as listWiki } from "../wiki/list/route";
import { POST as searchWiki } from "../wiki/search/route";
import { POST as readWiki } from "../wiki/read/route";
import { POST as createWiki } from "../wiki/create/route";
import { POST as updateWiki } from "../wiki/update/route";
import { POST as moveWiki } from "../wiki/move/route";
import { POST as deleteWiki } from "../wiki/delete/route";
import { POST as inviteMembers } from "../members/invite/route";
import { POST as updateMember } from "../members/update/route";
import { GET as getProfile, PATCH as updateProfile } from "../users/me/route";

const ID = "00000000-0000-4000-8000-000000000001";

function request(path: string, body: unknown, method = "POST") {
  return new NextRequest(`http://localhost:4105/api/v1/${path}`, {
    method,
    headers: { "content-type": "application/json", "x-api-key": "test-transport-only" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const routes = [
  { path: "wiki/list", handler: listWiki, spy: interactors.listWiki, body: { page: 1 } },
  { path: "wiki/search", handler: searchWiki, spy: interactors.searchWiki, body: { query: "escalation" } },
  { path: "wiki/read", handler: readWiki, spy: interactors.readWiki, body: { id: ID } },
  {
    path: "wiki/create",
    handler: createWiki,
    spy: interactors.createWiki,
    body: { pages: [{ title: "Voice", markdown: "Plain words." }] },
  },
  { path: "wiki/update", handler: updateWiki, spy: interactors.updateWiki, body: { id: ID, title: "Voice" } },
  {
    path: "wiki/move",
    handler: moveWiki,
    spy: interactors.moveWiki,
    body: { id: ID, targetId: ID, placement: "after" },
  },
  { path: "wiki/delete", handler: deleteWiki, spy: interactors.deleteWiki, body: { id: ID } },
  { path: "members/invite", handler: inviteMembers, spy: interactors.invite, body: { emails: ["a@example.test"] } },
  {
    path: "members/update",
    handler: updateMember,
    spy: interactors.updateMember,
    body: { email: "a@example.test", status: "inactive" },
  },
  {
    path: "users/me",
    handler: (input: NextRequest) => updateProfile(input),
    spy: interactors.updateProfile,
    body: { theme: "dark" },
    method: "PATCH",
  },
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("Knowledge Base, member and profile REST routes", () => {
  it.each(routes)("$path passes the body to its interactor unchanged and returns its data", async (route) => {
    route.spy.mockResolvedValue({ ok: true, data: { echoed: true } });

    const response = await route.handler(request(route.path, route.body, route.method));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ echoed: true });
    expect(route.spy).toHaveBeenCalledExactlyOnceWith(route.body);
  });

  it.each(routes)("$path returns an interactor failure as a structured error", async (route) => {
    route.spy.mockResolvedValue({
      ok: false,
      error: createZodError("Denied", [], { error: CustomErrorCode.permissionDenied, kind: "authorization" }),
    });

    const response = await route.handler(request(route.path, route.body, route.method));

    expect(response.status).toBe(403);
    expect(StructuredErrorResponseSchema.parse(await response.json())).toMatchObject({
      error: { kind: "authorization", issues: [{ customCode: CustomErrorCode.permissionDenied }] },
    });
  });

  it.each(routes)("$path rejects malformed JSON before calling its interactor", async (route) => {
    const response = await route.handler(request(route.path, "{", route.method));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { kind: "validation", issues: [{ customCode: CustomErrorCode.invalidJsonBody }] },
    });
    expect(route.spy).not.toHaveBeenCalled();
  });

  it.each(routes)("$path answers a thrown authentication error with 401", async (route) => {
    route.spy.mockRejectedValue(new AuthError());

    const response = await route.handler(request(route.path, route.body, route.method));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { kind: "authentication" } });
  });

  it("answers a missing Knowledge Base page with 404", async () => {
    interactors.readWiki.mockResolvedValue({ ok: true, data: null });

    const response = await readWiki(request("wiki/read", { id: ID }));

    expect(response.status).toBe(404);
    expect(StructuredErrorResponseSchema.parse(await response.json())).toEqual({
      error: {
        kind: "not_found",
        issues: [
          { code: "custom", path: ["id"], message: CustomErrorCode.wikiPageNotFound, customCode: "wikiPageNotFound" },
        ],
      },
    });
  });

  it("reads the caller's profile with structured authentication failures", async () => {
    interactors.getProfile.mockResolvedValue({ ok: true, data: { id: ID } });
    const read = await getProfile();
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ id: ID });

    interactors.getProfile.mockRejectedValue(new AuthError());
    const denied = await getProfile();
    expect(denied.status).toBe(401);
    expect(StructuredErrorResponseSchema.parse(await denied.json()).error.kind).toBe("authentication");
  });
});
