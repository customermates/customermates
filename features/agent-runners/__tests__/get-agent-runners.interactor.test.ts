import type { TenantUser } from "@/features/user/user.schema";
import type { UserSummary } from "@/features/user/find-user-summaries.repo";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const COLLEAGUE_ID = "33333333-3333-4333-8333-333333333399";

const session = vi.hoisted(() => ({ user: null as unknown }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => session.user as TenantUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { GetAgentRunnersInteractor } from "../get-agent-runners.interactor";

import { COMPANY_ID, OWNER_ID } from "./agent-runner-fixtures";
import { FakeAgentRunnerRepo } from "./fake-agent-runner-repo";

const NOW = new Date("2026-11-17T09:00:00.000Z");
const OWN_RUNNER = "00000000-0000-4000-8000-000000000001";
const COLLEAGUE_RUNNER = "00000000-0000-4000-8000-000000000002";

const PEOPLE: UserSummary[] = [
  { id: OWNER_ID, firstName: "Ada", lastName: "Owner", avatarUrl: null },
  { id: COLLEAGUE_ID, firstName: "Cem", lastName: "Colleague", avatarUrl: null },
];

function users(people: UserSummary[] = PEOPLE) {
  return {
    findUserSummaries: vi.fn((ids: string[]) =>
      Promise.resolve(new Map(people.filter((person) => ids.includes(person.id)).map((person) => [person.id, person]))),
    ),
  };
}

function repo() {
  const runners = new FakeAgentRunnerRepo();
  runners.addRunner({ id: OWN_RUNNER, name: "Mine", createdById: OWNER_ID });
  runners.addRunner({ id: COLLEAGUE_RUNNER, name: "Theirs", createdById: COLLEAGUE_ID });
  return runners;
}

function member(id: string): TenantUser {
  const base = createMockUserWithPermissions([{ resource: Resource.api, action: Action.readAll }]);
  return { ...base, id, companyId: COMPANY_ID };
}

beforeEach(() => vi.clearAllMocks());

describe("GetAgentRunnersInteractor: runners are personal", () => {
  it("lists only the member's own runners for a member who is not an admin", async () => {
    session.user = member(OWNER_ID);
    const names = users();

    const result = await new GetAgentRunnersInteractor(repo(), names, () => NOW).invoke();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.runners.map((runner) => runner.id)).toEqual([OWN_RUNNER]);
    expect(result.data.runners[0]?.createdByName).toBe("Ada Owner");
    expect(names.findUserSummaries).toHaveBeenCalledWith([OWNER_ID]);
  });

  it("lists nothing for a member who has no runner, whatever colleagues have", async () => {
    session.user = member("33333333-3333-4333-8333-333333333300");

    const result = await new GetAgentRunnersInteractor(repo(), users(), () => NOW).invoke();

    expect(result.ok && result.data.runners).toEqual([]);
  });

  it("lists every runner with the name of the member who added it for an admin", async () => {
    session.user = createMockUser({ id: OWNER_ID, companyId: COMPANY_ID });

    const result = await new GetAgentRunnersInteractor(repo(), users(), () => NOW).invoke();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.runners.map((runner) => [runner.name, runner.createdByName])).toEqual([
      ["Mine", "Ada Owner"],
      ["Theirs", "Cem Colleague"],
    ]);
  });

  it("leaves the name empty when the member who added a runner is no longer known", async () => {
    session.user = createMockUser({ id: OWNER_ID, companyId: COMPANY_ID });

    const result = await new GetAgentRunnersInteractor(repo(), users(PEOPLE.slice(0, 1)), () => NOW).invoke();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.runners.map((runner) => runner.createdByName)).toEqual(["Ada Owner", null]);
  });
});
