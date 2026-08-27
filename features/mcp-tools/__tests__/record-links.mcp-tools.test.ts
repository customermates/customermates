import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const spies = vi.hoisted(() => ({
  modifyRelation: vi.fn(),
  deleteManyContacts: vi.fn(),
  deleteManyOrganizations: vi.fn(),
  deleteManyDeals: vi.fn(),
  deleteManyServices: vi.fn(),
  deleteManyTasks: vi.fn(),
  updateManyContacts: vi.fn(),
  updateManyOrganizations: vi.fn(),
  updateManyDeals: vi.fn(),
  updateManyServices: vi.fn(),
  updateManyTasks: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getModifyEntityRelationInteractor: () => ({ invoke: spies.modifyRelation }),
  getDeleteManyContactsInteractor: () => ({ invoke: spies.deleteManyContacts }),
  getDeleteManyOrganizationsInteractor: () => ({ invoke: spies.deleteManyOrganizations }),
  getDeleteManyDealsInteractor: () => ({ invoke: spies.deleteManyDeals }),
  getDeleteManyServicesInteractor: () => ({ invoke: spies.deleteManyServices }),
  getDeleteManyTasksInteractor: () => ({ invoke: spies.deleteManyTasks }),
  getUpdateManyContactsInteractor: () => ({ invoke: spies.updateManyContacts }),
  getUpdateManyOrganizationsInteractor: () => ({ invoke: spies.updateManyOrganizations }),
  getUpdateManyDealsInteractor: () => ({ invoke: spies.updateManyDeals }),
  getUpdateManyServicesInteractor: () => ({ invoke: spies.updateManyServices }),
  getUpdateManyTasksInteractor: () => ({ invoke: spies.updateManyTasks }),
}));

import { manageRecordLinksTool } from "../entity-generic.mcp-tools";
import { mcpToolResultText } from "../mcp-tool";

const sourceId = "00000000-0000-4000-8000-000000000001";
const orgOne = "00000000-0000-4000-8000-000000000002";
const orgTwo = "00000000-0000-4000-8000-000000000003";

const otherSpies = () =>
  Object.entries(spies)
    .filter(([name]) => name !== "modifyRelation")
    .map(([, spy]) => spy);

function execute(args: unknown) {
  return manageRecordLinksTool.execute(manageRecordLinksTool.inputSchema.parse(args));
}

describe("manage_record_links", () => {
  beforeEach(() => {
    for (const spy of Object.values(spies)) spy.mockReset();
  });

  it("adds links through exactly one interactor call with the exact arguments", async () => {
    spies.modifyRelation.mockResolvedValue({ ok: true, data: { requested: 2, before: 1, after: 3 } });

    const result = await execute({
      action: "add",
      entity: "contact",
      sourceId,
      relation: "organizations",
      ids: [orgOne, orgTwo],
    });

    expect(spies.modifyRelation).toHaveBeenCalledTimes(1);
    expect(spies.modifyRelation).toHaveBeenCalledWith({
      entity: "contact",
      sourceId,
      relation: "organizations",
      mode: "add",
      ids: [orgOne, orgTwo],
    });
    expect(mcpToolResultText(result)).toBe(`Linked 2 organizations to contact ${sourceId} (was 1, now 3)`);
    for (const spy of otherSpies()) expect(spy).not.toHaveBeenCalled();
  });

  it("removes links through the same single seam and never touches a delete interactor", async () => {
    spies.modifyRelation.mockResolvedValue({ ok: true, data: { requested: 1, before: 3, after: 2 } });

    const result = await execute({
      action: "remove",
      entity: "contact",
      sourceId,
      relation: "organizations",
      ids: [orgOne],
    });

    expect(spies.modifyRelation).toHaveBeenCalledTimes(1);
    expect(spies.modifyRelation).toHaveBeenCalledWith({
      entity: "contact",
      sourceId,
      relation: "organizations",
      mode: "remove",
      ids: [orgOne],
    });
    expect(mcpToolResultText(result)).toBe(`Unlinked 1 organizations from contact ${sourceId} (was 3, now 2)`);
    for (const spy of otherSpies()) expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    [{ action: "merge", entity: "contact", sourceId, relation: "organizations", ids: [orgOne] }],
    [{ action: "add", entity: "contact", sourceId, relation: "organizations", ids: [] }],
    [{ action: "add", entity: "contact", sourceId, relation: "organizations", ids: ["not-a-uuid"] }],
    [{ action: "add", entity: "contact", sourceId, relation: "everything", ids: [orgOne] }],
  ])("rejects invalid input %j before any interactor runs", (args) => {
    expect(() => manageRecordLinksTool.inputSchema.parse(args)).toThrow();
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });

  it("returns the interactor's validation error as a validation message and touches nothing else", async () => {
    const parsed = manageRecordLinksTool.inputSchema.safeParse({ action: "merge" });
    spies.modifyRelation.mockResolvedValue({
      ok: false,
      error: parsed.success ? undefined : parsed.error,
    });

    const result = await execute({
      action: "add",
      entity: "contact",
      sourceId,
      relation: "deals",
      ids: [orgOne],
    });

    expect(mcpToolResultText(result)).toContain("Validation error:");
    expect(result).toMatchObject({ failure: { kind: "validation" } });
    for (const spy of otherSpies()) expect(spy).not.toHaveBeenCalled();
  });
});
