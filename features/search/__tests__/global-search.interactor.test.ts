import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as EntityListExecutorsModule from "../entity-list-executors";

import { Action, EntityType, Resource } from "@/generated/prisma";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";

const harness = vi.hoisted(() => ({
  contact: vi.fn(),
  organization: vi.fn(),
  deal: vi.fn(),
  service: vi.fn(),
  task: vi.fn(),
}));

vi.mock("../entity-list-executors", async (importOriginal) => ({
  ...(await importOriginal<typeof EntityListExecutorsModule>()),
  entityListExecutors: harness,
}));

import { GlobalSearchInteractor } from "../global-search.interactor";

beforeEach(() => {
  vi.clearAllMocks();
  for (const execute of Object.values(harness)) execute.mockResolvedValue({ ok: true, data: { items: [] } });
});

describe("GlobalSearchInteractor permissions and result limits", () => {
  it("queries only entity types the current custom role may read", async () => {
    harness.contact.mockResolvedValue({
      ok: true,
      data: {
        items: Array.from({ length: 9 }, (_, index) => ({
          id: `contact-${index + 1}`,
          firstName: index === 0 ? "Julian" : `Contact ${index + 1}`,
          lastName: index === 0 ? "Wagner" : "",
          avatarUrl: null,
        })),
      },
    });
    const user = createMockUserWithPermissions([{ resource: Resource.contacts, action: Action.readOwn }]);

    const result = await runWithTenant(user, () =>
      new GlobalSearchInteractor().invoke({ searchTerm: "Julian", limitPerEntity: 8 }),
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.results).toHaveLength(8);
    expect(result.ok && result.data.results[0]).toEqual({
      id: "contact-1",
      name: "Julian Wagner",
      pictureUrl: null,
      type: EntityType.contact,
    });
    expect(harness.contact).toHaveBeenCalledWith({
      searchTerm: "Julian",
      pagination: { page: 1, pageSize: 10 },
    });
    expect(harness.organization).not.toHaveBeenCalled();
    expect(harness.deal).not.toHaveBeenCalled();
    expect(harness.service).not.toHaveBeenCalled();
    expect(harness.task).not.toHaveBeenCalled();
  });

  it("queries every canonical record type for a system role and preserves task type metadata", async () => {
    harness.task.mockResolvedValue({
      ok: true,
      data: {
        items: [{ id: "task-1", name: "", type: "userPendingAuthorization" }],
      },
    });

    const result = await runWithTenant(createMockUser(), () =>
      new GlobalSearchInteractor().invoke({ searchTerm: "pending" }),
    );

    expect(Object.values(harness).every((execute) => execute.mock.calls.length === 1)).toBe(true);
    expect(result).toEqual({
      ok: true,
      data: {
        results: [
          {
            id: "task-1",
            name: "userPendingAuthorization",
            pictureUrl: null,
            taskType: "userPendingAuthorization",
            type: EntityType.task,
          },
        ],
      },
    });
    expect(harness.task).toHaveBeenCalledWith({
      searchTerm: "pending",
      pagination: { page: 1, pageSize: 100 },
    });
  });
});
