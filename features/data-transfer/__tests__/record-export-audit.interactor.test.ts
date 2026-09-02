import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "self-hosted" | "demo",
}));
let mockUser = createMockUser({ id: "user-1", companyId: "company-1" });

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { Action, EntityType, Resource } from "@/generated/prisma";
import { DomainEvent } from "@/features/event/domain-events";
import { RecordExportAuditInteractor, type RecordExportAuditData } from "../export/record-export-audit.interactor";
import type { EventService } from "@/features/event/event.service";
import type { UserService } from "@/features/user/user.service";

const publish = vi.fn().mockResolvedValue(undefined);

function build(granted: Array<{ resource: Resource; action: Action }>) {
  const holds = (resource: Resource, action: Action) =>
    granted.some((p) => p.resource === resource && p.action === action);

  const hasPermission = vi.fn((resource: Resource, action: Action) => Promise.resolve(holds(resource, action)));
  const hasPermissionOrThrow = vi.fn((resource: Resource, action: Action) =>
    holds(resource, action) ? Promise.resolve() : Promise.reject(new Error("permission denied")),
  );

  const interactor = new RecordExportAuditInteractor(
    { hasPermission, hasPermissionOrThrow } as unknown as UserService,
    {
      publish,
    } as unknown as EventService,
  );

  return { interactor, hasPermission, hasPermissionOrThrow };
}

const data: RecordExportAuditData = {
  entityType: EntityType.contact,
  rowCount: 42,
  truncated: false,
  scope: "view",
};

describe("RecordExportAuditInteractor", () => {
  beforeEach(() => {
    publish.mockClear();
    mockUser = createMockUser({ id: "user-1", companyId: "company-1" });
  });

  it("records one export against the company for a readAll caller", async () => {
    const { interactor } = build([{ resource: Resource.contacts, action: Action.readAll }]);

    const result = await interactor.invoke(data);

    expect(result.ok).toBe(true);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(DomainEvent.RECORDS_EXPORTED, {
      entityId: "company-1",
      payload: data,
    });
  });

  it("accepts a readOwn caller, who exports a narrower set but still exports", async () => {
    const { interactor } = build([{ resource: Resource.contacts, action: Action.readOwn }]);

    await expect(interactor.invoke(data)).resolves.toMatchObject({ ok: true });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("refuses a caller holding neither read permission, and records nothing", async () => {
    const { interactor } = build([{ resource: Resource.contacts, action: Action.update }]);

    await expect(interactor.invoke(data)).rejects.toThrow();
    expect(publish).not.toHaveBeenCalled();
  });

  it("checks the resource belonging to the exported entity type, not a fixed one", async () => {
    const { interactor, hasPermission, hasPermissionOrThrow } = build([
      { resource: Resource.deals, action: Action.readAll },
    ]);

    await interactor.invoke({ ...data, entityType: EntityType.deal });

    expect(hasPermission).toHaveBeenCalledWith(Resource.deals, Action.readOwn);
    expect(hasPermissionOrThrow).toHaveBeenCalledWith(Resource.deals, Action.readAll);
    expect(hasPermissionOrThrow).not.toHaveBeenCalledWith(Resource.contacts, Action.readAll);
  });

  it("carries the delivered row count and truncation, never the filters that produced them", async () => {
    const { interactor } = build([{ resource: Resource.contacts, action: Action.readAll }]);

    await interactor.invoke({ ...data, rowCount: 50000, truncated: true, scope: "selection" });

    const [, published] = publish.mock.calls[0];
    expect(published.payload).toEqual({
      entityType: EntityType.contact,
      rowCount: 50000,
      truncated: true,
      scope: "selection",
    });
    expect(Object.keys(published.payload)).not.toContain("filters");
    expect(Object.keys(published.payload)).not.toContain("searchTerm");
    expect(Object.keys(published.payload)).not.toContain("selectedIds");
  });
});
