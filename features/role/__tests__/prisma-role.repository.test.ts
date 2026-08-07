import { describe, expect, it } from "vitest";

import { mapRoleWithAssignments } from "../prisma-role.repository";

describe("mapRoleWithAssignments", () => {
  it.each([
    { count: 0, expected: false },
    { count: 1, expected: true },
  ])("maps $count assigned users to $expected", ({ count, expected }) => {
    expect(
      mapRoleWithAssignments({
        id: "20000000-0000-4000-8000-000000000001",
        _count: { users: count },
      }),
    ).toEqual({
      id: "20000000-0000-4000-8000-000000000001",
      hasUsersAssigned: expected,
    });
  });
});
