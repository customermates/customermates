import { beforeEach, describe, expect, it, vi } from "vitest";
import { Status } from "@/generated/prisma";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { ListWorkspaceLeavesInteractor } from "../list-workspace-leaves.interactor";

const EMAIL = "ben@example.com";

function row(companyId: string, status: Status, isAdmin = false) {
  return {
    id: `member-${companyId}`,
    companyId,
    status,
    role: status === Status.pendingAuthorization ? null : { name: isAdmin ? "Admin" : "Sales", isSystemRole: isAdmin },
  };
}

describe("ListWorkspaceLeavesInteractor", () => {
  let rows: ReturnType<typeof row>[];
  let activeAdmins: Record<string, string[]>;
  let operatorStrandedIn: string[];
  const authService = { getInteractiveSession: vi.fn() };
  const memberships = {
    listWorkspaceMembershipsUnscoped: vi.fn(() => Promise.resolve(rows)),
    listActiveAdminIdsUnscoped: vi.fn((companyId: string) => Promise.resolve(activeAdmins[companyId] ?? [])),
    strandsLastPlatformOperatorUnscoped: vi.fn((ending: { id: string; companyId: string }) =>
      Promise.resolve(operatorStrandedIn.includes(ending.companyId)),
    ),
  };

  function list() {
    return new ListWorkspaceLeavesInteractor(authService as never, memberships as never).invoke();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    rows = [];
    activeAdmins = {};
    operatorStrandedIn = [];
    authService.getInteractiveSession.mockResolvedValue({ user: { id: "login-1", email: EMAIL } });
  });

  it("answers for every workspace the person is active in, each by the rules of that workspace", async () => {
    rows = [
      row("member", Status.active),
      row("only-admin", Status.active, true),
      row("second-admin", Status.active, true),
      row("operator", Status.active),
    ];
    activeAdmins = {
      member: [],
      "only-admin": ["member-only-admin"],
      "second-admin": ["member-second-admin", "someone-else"],
    };
    operatorStrandedIn = ["operator"];

    await expect(list()).resolves.toEqual({
      ok: true,
      data: [
        { companyId: "member", refusal: null },
        { companyId: "only-admin", refusal: "lastAdmin" },
        { companyId: "second-admin", refusal: null },
        { companyId: "operator", refusal: "platformOperator" },
      ],
    });
    expect(memberships.listWorkspaceMembershipsUnscoped).toHaveBeenCalledExactlyOnceWith(EMAIL);
    expect(memberships.strandsLastPlatformOperatorUnscoped).toHaveBeenCalledWith({
      id: "member-operator",
      companyId: "operator",
    });
    expect(memberships.listActiveAdminIdsUnscoped).not.toHaveBeenCalledWith("member");
  });

  it("leaves out workspaces in which the membership is inactive or waiting for approval", async () => {
    rows = [
      row("active", Status.active),
      row("inactive", Status.inactive, true),
      row("pending", Status.pendingAuthorization),
    ];

    await expect(list()).resolves.toEqual({ ok: true, data: [{ companyId: "active", refusal: null }] });
    expect(memberships.strandsLastPlatformOperatorUnscoped).toHaveBeenCalledTimes(1);
  });

  it("lists nothing without an interactive session", async () => {
    authService.getInteractiveSession.mockResolvedValue(null);

    await expect(list()).resolves.toEqual({ ok: true, data: [] });
    expect(memberships.listWorkspaceMembershipsUnscoped).not.toHaveBeenCalled();
  });
});
