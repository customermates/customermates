import { describeAgentTool } from "@/ee/agent-chat/agent-activity";
import { describe, expect, it } from "vitest";
import { UpsertRoleSchema } from "../role-management.schema";
import { requiresApproval } from "@/ee/agent-chat/gated-tools";
import { internalToolIdentity } from "@/ee/agent-chat/tool-identity";

const input = {
  name: "Sales",
  description: "Pipeline access",
  expectedRevision: 2,
  idempotencyKey: "role-request-1",
  recordGrants: [{ typeId: "20000000-0000-4000-8000-000000000001", actions: ["create", "readOwn"] }],
  permissions: {
    users: { canManage: "no", readAccess: "own" },
    company: { canManage: "no" },
    dataModel: { canManage: "no" },
    api: { canManage: "no", readAccess: "none" },
    inboxMessages: { canManage: "no", readAccess: "none" },
    auditLog: { readAccess: "none" },
    routines: { canManage: "no", readAccess: "none" },
  },
};

describe("role mutation contract", () => {
  it("accepts arbitrary type IDs and exact actions", () => {
    expect(UpsertRoleSchema.parse(input).recordGrants).toEqual(input.recordGrants);
  });
  it("requires the revision and idempotency key", () => {
    expect(UpsertRoleSchema.safeParse({ ...input, expectedRevision: undefined }).success).toBe(false);
    expect(UpsertRoleSchema.safeParse({ ...input, idempotencyKey: undefined }).success).toBe(false);
  });
  it("rejects retired entity-name permissions", () => {
    expect(
      UpsertRoleSchema.safeParse({
        ...input,
        permissions: { ...input.permissions, contacts: { canManage: "yes", readAccess: "all" } },
      }).success,
    ).toBe(false);
  });
  it("rejects duplicate grants and actions", () => {
    expect(
      UpsertRoleSchema.safeParse({ ...input, recordGrants: [...input.recordGrants, ...input.recordGrants] }).success,
    ).toBe(false);
    expect(
      UpsertRoleSchema.safeParse({
        ...input,
        recordGrants: [{ ...input.recordGrants[0], actions: ["readOwn", "readOwn"] }],
      }).success,
    ).toBe(false);
  });
  it.each([
    ["read", false],
    ["save", true],
    ["delete", true],
    ["unknown", true],
  ])("keeps %s in the existing approval policy", (action, expected) => {
    expect(
      requiresApproval(internalToolIdentity("manage_roles"), { annotations: { destructiveHint: true } }, { action }),
    ).toBe(expected);
  });
});

it.each([
  ["read", "read"],
  ["save", "sensitive"],
  ["delete", "sensitive"],
])("describes the role %s action accurately", (action, risk) => {
  expect(describeAgentTool(internalToolIdentity("manage_roles"), { action }).risk).toBe(risk);
});
