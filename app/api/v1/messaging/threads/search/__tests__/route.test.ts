import type { NextRequest } from "next/server";
import type { FilterableField, GetQueryParams } from "@/core/base/base-get.schema";
import type { MessagingThread } from "@/ee/messaging/messaging.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const wiring = vi.hoisted(() => ({ api: null as unknown, interactive: null as unknown }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getGetMessagingThreadsApiInteractor: () => wiring.api,
  getGetMessagingThreadsInteractor: () => wiring.interactive,
}));

import { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import {
  GetMessagingThreadsInteractor,
  GetMessagingThreadsRepo,
} from "@/ee/messaging/inbox/get-messaging-threads.interactor";

import { POST } from "../route";

class StubThreadsRepo extends GetMessagingThreadsRepo {
  itemCalls: GetQueryParams[] = [];

  getItems(params: GetQueryParams): Promise<MessagingThread[]> {
    this.itemCalls.push(params);
    return Promise.resolve([]);
  }

  getCount(): Promise<number> {
    return Promise.resolve(0);
  }

  getSortableFields() {
    return [{ field: "lastMessageAt", resolvedFields: ["lastMessageAt"], nullable: true }];
  }

  getSearchableFields() {
    return [];
  }

  getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve([]);
  }

  getCustomColumns() {
    return Promise.resolve([]);
  }

  validateFilters() {
    return [];
  }

  validateSortDescriptor() {
    return undefined;
  }

  sumNumericFields<F extends string>(): Promise<Partial<Record<F, number | null>>> {
    return Promise.resolve({});
  }
}

let repo: StubThreadsRepo;

function threadsInteractor(mode: "interactive" | "api") {
  const precheck = new QueryParamsPrecheckInteractor(
    ...(Array.from({ length: 9 }) as ConstructorParameters<typeof QueryParamsPrecheckInteractor>),
  );
  return new GetMessagingThreadsInteractor(
    repo,
    { loadSurfaceState: vi.fn() } as never,
    mode,
    precheck,
    mockEntitlementService(),
  );
}

function request(payload: unknown): NextRequest {
  return new Request("http://localhost/api/v1/messaging/threads/search", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
  }) as unknown as NextRequest;
}

beforeEach(() => {
  repo = new StubThreadsRepo();
  wiring.api = threadsInteractor("api");
  wiring.interactive = threadsInteractor("interactive");
});

describe("messaging threads search route", () => {
  it("rejects a sort field threads cannot be sorted by, like every sibling search route", async () => {
    const response = await POST(
      request({ sortDescriptor: { field: "subject", direction: "asc" }, pagination: { page: 1, pageSize: 5 } }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toContain("sortDescriptor.field");
    expect(repo.itemCalls).toEqual([]);
  });

  it("still answers a sortable request", async () => {
    const response = await POST(request({ sortDescriptor: { field: "lastMessageAt", direction: "asc" } }));

    expect(response.status).toBe(200);
    expect(repo.itemCalls).toHaveLength(1);
  });

  it("names the rejected field's code in the failure", async () => {
    const result = await threadsInteractor("api").invoke({ sortDescriptor: { field: "subject", direction: "asc" } });

    if (result.ok) throw new Error("the unsortable field was accepted");
    expect(result.error.issues.map((issue) => (issue.code === "custom" ? issue.params?.error : undefined))).toEqual([
      CustomErrorCode.invalidSortField,
    ]);
  });
});
