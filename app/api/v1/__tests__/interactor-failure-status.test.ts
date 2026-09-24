import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

const interactors = vi.hoisted(() => ({
  searchDeals: vi.fn(),
  searchUsers: vi.fn(),
  deleteWebhook: vi.fn(),
  getContact: vi.fn(),
  createContact: vi.fn(),
  invite: vi.fn(),
  searchPeople: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getGetDealsApiInteractor: () => ({ invoke: interactors.searchDeals }),
  getGetUsersApiInteractor: () => ({ invoke: interactors.searchUsers }),
  getDeleteWebhookInteractor: () => ({ invoke: interactors.deleteWebhook }),
  getGetContactByIdInteractor: () => ({ invoke: interactors.getContact }),
  getCreateContactInteractor: () => ({ invoke: interactors.createContact }),
  getCreateRelationRequestInteractor: () => ({ invoke: interactors.invite }),
  getLinkedinSearchSalesPeopleInteractor: () => ({ invoke: interactors.searchPeople }),
}));

import { POST as searchDeals } from "../deals/search/route";
import { POST as searchUsers } from "../users/search/route";
import { DELETE as deleteWebhook } from "../webhooks/[id]/route";
import { GET as getContact } from "../contacts/[id]/route";
import { POST as createContact } from "../contacts/route";
import { POST as invite } from "../messaging/social-relations/invite/route";
import { POST as searchPeople } from "../messaging/sales-navigator/search/people/route";

const ID = "00000000-0000-4000-8000-000000000001";

function request(path: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost:4105/api/v1/${path}`, {
    method,
    headers: { "content-type": "application/json", "x-api-key": "test-transport-only" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: ID }) };

const cases = [
  {
    kind: "validation",
    status: 400,
    code: CustomErrorCode.assigneeRequired,
    spy: interactors.searchDeals,
    invoke: () => searchDeals(request("deals/search", "POST", {})),
  },
  {
    kind: "authentication",
    status: 401,
    code: CustomErrorCode.notAuthenticated,
    spy: interactors.searchUsers,
    invoke: () => searchUsers(request("users/search", "POST", {})),
  },
  {
    kind: "authorization",
    status: 403,
    code: CustomErrorCode.permissionDenied,
    spy: interactors.deleteWebhook,
    invoke: () => deleteWebhook(request(`webhooks/${ID}`, "DELETE"), params),
  },
  {
    kind: "not_found",
    status: 404,
    code: CustomErrorCode.contactNotFound,
    spy: interactors.getContact,
    invoke: () => getContact(request(`contacts/${ID}`, "GET"), params),
  },
  {
    kind: "conflict",
    status: 409,
    code: CustomErrorCode.channelAlreadyLinked,
    spy: interactors.createContact,
    invoke: () => createContact(request("contacts", "POST", { firstName: "Ada" })),
  },
  {
    kind: "unavailable",
    status: 422,
    code: CustomErrorCode.unipileServiceUnavailable,
    spy: interactors.invite,
    invoke: () => invite(request("messaging/social-relations/invite", "POST", { connectedAccountId: ID })),
  },
  {
    kind: "rate_limit",
    status: 429,
    code: CustomErrorCode.unipileRateLimit,
    spy: interactors.searchPeople,
    invoke: () => searchPeople(request("messaging/sales-navigator/search/people", "POST", { connectedAccountId: ID })),
  },
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("v1 REST interactor failure status", () => {
  it.each(cases)("returns a $kind failure as HTTP $status", async ({ status, code, spy, invoke }) => {
    const error = createZodError(`Failure ${code}`, ["id"], { error: code });
    spy.mockResolvedValue({ ok: false, error });

    const response = await invoke();

    expect(response.status).toBe(status);
    expect(await response.json()).toBe(z.prettifyError(error));
    expect(spy).toHaveBeenCalledOnce();
  });
});
