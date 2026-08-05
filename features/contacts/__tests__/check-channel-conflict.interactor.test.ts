import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

let mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  getLocale: () => Promise.resolve("en"),
}));

import { CheckChannelConflictInteractor } from "../upsert/check-channel-conflict.interactor";
import { Action, Resource } from "@/generated/prisma";
import { ForbiddenError } from "@/core/errors/app-errors";

const SELF = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  mockUser = createMockUser();
});

function makeInteractor(ownerId: string | undefined) {
  const owners = {
    findIdentifierOwnersCompanyWide: vi.fn().mockResolvedValue({ get: () => ownerId }),
  };
  return new CheckChannelConflictInteractor(owners as never);
}

describe("CheckChannelConflictInteractor", () => {
  const input = { provider: "telegram", value: "alice", contactId: SELF };

  it("returns ok:false at path value when the channel belongs to another contact", async () => {
    const result = await makeInteractor(OTHER).invoke(input as never);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error.issues[0]?.path).toEqual(["value"]);
  });

  it("returns ok:true when no contact owns the channel", async () => {
    const result = await makeInteractor(undefined).invoke(input as never);
    expect(result).toMatchObject({ ok: true, data: true });
  });

  it("returns ok:true when the channel is already owned by the same contact", async () => {
    const result = await makeInteractor(SELF).invoke(input as never);
    expect(result).toMatchObject({ ok: true, data: true });
  });

  it("treats every owner as a conflict for a draft contact that has no id yet", async () => {
    const result = await makeInteractor(OTHER).invoke({ provider: "telegram", value: "alice" } as never);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error.issues[0]?.path).toEqual(["value"]);
  });

  it("returns ok:true for a draft contact when no owner exists", async () => {
    const result = await makeInteractor(undefined).invoke({ provider: "telegram", value: "alice" } as never);
    expect(result).toMatchObject({ ok: true, data: true });
  });
});

describe("CheckChannelConflictInteractor permissions", () => {
  const input = { provider: "telegram", value: "alice" };

  it("allows a user who may create contacts but not update them", async () => {
    mockUser = createMockUserWithPermissions([{ resource: Resource.contacts, action: Action.create }]);
    const result = await makeInteractor(undefined).invoke(input as never);
    expect(result).toMatchObject({ ok: true, data: true });
  });

  it("allows a user who may update contacts but not create them", async () => {
    mockUser = createMockUserWithPermissions([{ resource: Resource.contacts, action: Action.update }]);
    const result = await makeInteractor(undefined).invoke(input as never);
    expect(result).toMatchObject({ ok: true, data: true });
  });

  it("rejects a user with neither create nor update on contacts", async () => {
    mockUser = createMockUserWithPermissions([{ resource: Resource.contacts, action: Action.readAll }]);
    await expect(makeInteractor(undefined).invoke(input as never)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
