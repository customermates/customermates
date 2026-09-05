import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntityType } from "@/generated/prisma";

import { createZodError } from "@/core/validation/validation.utils";
import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { CommitImportChunkInteractor } from "../commit-import-chunk.interactor";
import { DryRunImportChunkInteractor } from "../dry-run-import-chunk.interactor";

function dependencies() {
  return {
    contacts: { invoke: vi.fn() },
    organizations: { invoke: vi.fn() },
    deals: { invoke: vi.fn() },
    services: { invoke: vi.fn() },
    tasks: { invoke: vi.fn() },
  };
}

const create = dependencies();
const update = dependencies();
const dry = dependencies();
const cases = [
  [EntityType.contact, "contacts"],
  [EntityType.organization, "organizations"],
  [EntityType.deal, "deals"],
  [EntityType.service, "services"],
  [EntityType.task, "tasks"],
] as const;

function commit() {
  return new CommitImportChunkInteractor(
    create.contacts as never,
    update.contacts as never,
    create.organizations as never,
    update.organizations as never,
    create.deals as never,
    update.deals as never,
    create.services as never,
    update.services as never,
    create.tasks as never,
    update.tasks as never,
  );
}

function dryRun() {
  return new DryRunImportChunkInteractor(
    dry.contacts as never,
    dry.organizations as never,
    dry.deals as never,
    dry.services as never,
    dry.tasks as never,
  );
}

describe("import chunk interactors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const dependency of [...Object.values(create), ...Object.values(update)])
      dependency.invoke.mockResolvedValue({ ok: true, data: [{ id: "record-1" }] });
    for (const dependency of Object.values(dry)) dependency.invoke.mockResolvedValue({ ok: true, data: null });
  });

  it.each(cases)("routes create %s using its existing collection key", async (entityType, key) => {
    const rows = [{ name: "Synthetic record" }];
    await expect(commit().invoke({ entityType, mode: "create", rows })).resolves.toEqual({
      ok: true,
      data: [{ id: "record-1" }],
    });
    expect(create[key].invoke).toHaveBeenCalledExactlyOnceWith({ [key]: rows });
    for (const dependency of Object.values(update)) expect(dependency.invoke).not.toHaveBeenCalled();
    for (const [other, dependency] of Object.entries(create))
      if (other !== key) expect(dependency.invoke).not.toHaveBeenCalled();
  });

  it.each(cases)("routes update %s using its existing collection key", async (entityType, key) => {
    const rows = [{ id: "record-1", name: "Changed record" }];
    await commit().invoke({ entityType, mode: "update", rows });
    expect(update[key].invoke).toHaveBeenCalledExactlyOnceWith({ [key]: rows });
    for (const dependency of Object.values(create)) expect(dependency.invoke).not.toHaveBeenCalled();
    for (const [other, dependency] of Object.entries(update))
      if (other !== key) expect(dependency.invoke).not.toHaveBeenCalled();
  });

  it.each(cases)("routes dry-run %s without committing", async (entityType, key) => {
    const rows = [{ name: "Synthetic record" }];
    await expect(dryRun().invoke({ entityType, mode: "update", rows })).resolves.toEqual({ ok: true, data: null });
    expect(dry[key].invoke).toHaveBeenCalledExactlyOnceWith({ mode: "update", rows });
    for (const dependency of [...Object.values(create), ...Object.values(update)])
      expect(dependency.invoke).not.toHaveBeenCalled();
    for (const [other, dependency] of Object.entries(dry))
      if (other !== key) expect(dependency.invoke).not.toHaveBeenCalled();
  });

  it.each([
    { entityType: "companies", mode: "create", rows: [{}] },
    { entityType: EntityType.contact, mode: "replace", rows: [{}] },
    { entityType: EntityType.contact, mode: "create", rows: [] },
    { entityType: EntityType.contact, mode: "create", rows: Array.from({ length: 101 }, () => ({})) },
  ])("returns structured validation for invalid input %#", async (input) => {
    const committed = await commit().invoke(input as never);
    const checked = await dryRun().invoke(input as never);
    expect(committed.ok).toBe(false);
    expect(checked.ok).toBe(false);
    for (const dependency of [...Object.values(create), ...Object.values(update), ...Object.values(dry)])
      expect(dependency.invoke).not.toHaveBeenCalled();
  });

  it("preserves row-specific commit failures", async () => {
    const failure = { ok: false, error: createZodError("Invalid row", ["contacts", 0, "firstName"]) };
    create.contacts.invoke.mockResolvedValue(failure);
    await expect(commit().invoke({ entityType: EntityType.contact, mode: "create", rows: [{}] })).resolves.toEqual(
      failure,
    );
  });

  it("preserves row-specific dry-run failures", async () => {
    const failure = { ok: false, error: createZodError("Invalid row", ["tasks", 0, "name"]) };
    dry.tasks.invoke.mockResolvedValue(failure);
    await expect(dryRun().invoke({ entityType: EntityType.task, mode: "create", rows: [{}] })).resolves.toEqual(
      failure,
    );
  });
});
