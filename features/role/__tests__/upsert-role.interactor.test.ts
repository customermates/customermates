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
  permissions: [
    { resource: "users", actions: ["readOwn"] },
    { resource: "company", actions: [] },
    { resource: "dataModel", actions: [] },
    { resource: "api", actions: [] },
    { resource: "inboxMessages", actions: [] },
    { resource: "wiki", actions: ["readAll"] },
    { resource: "auditLog", actions: [] },
    { resource: "routines", actions: [] },
  ],
};
const withPermission = (resource: string, actions: string[]) => ({
  ...input,
  permissions: [...input.permissions.filter((grant) => grant.resource !== resource), { resource, actions }],
});

describe("role mutation contract", () => {
  it("accepts arbitrary type IDs and exact actions", () => {
    expect(UpsertRoleSchema.parse(input).recordGrants).toEqual(input.recordGrants);
  });
  it("requires the revision and idempotency key", () => {
    expect(UpsertRoleSchema.safeParse({ ...input, expectedRevision: undefined }).success).toBe(false);
    expect(UpsertRoleSchema.safeParse({ ...input, idempotencyKey: undefined }).success).toBe(false);
  });
  it("rejects retired entity-name permissions", () => {
    expect(UpsertRoleSchema.safeParse(withPermission("contacts", ["create", "readAll"])).success).toBe(false);
  });
  it("carries the Knowledge Base permission group with read none or all", () => {
    expect(UpsertRoleSchema.parse(input).permissions.find((grant) => grant.resource === "wiki")?.actions).toEqual([
      "readAll",
    ]);
    expect(UpsertRoleSchema.safeParse(withPermission("wiki", ["create", "readOwn"])).success).toBe(false);
  });
  it.each([
    ["api", ["create", "update", "delete", "readAll"], true],
    ["api", ["readOwn"], false],
    ["users", ["create", "update", "delete", "readOwn"], true],
    ["company", ["update"], true],
    ["company", ["create"], false],
    ["company", ["delete"], false],
    ["company", ["readAll"], false],
    ["dataModel", ["update"], true],
    ["dataModel", ["delete"], false],
    ["auditLog", ["readAll"], true],
    ["auditLog", ["update"], false],
    ["inboxMessages", ["create", "update", "delete", "readAll"], true],
    ["inboxMessages", ["readOwn"], false],
    ["routines", ["create", "update", "delete", "readOwn"], true],
  ])("accepts only the applicable actions for %s %j", (resource, actions, valid) => {
    expect(UpsertRoleSchema.safeParse(withPermission(resource, actions)).success).toBe(valid);
  });
  it("rejects a resource listed twice", () => {
    expect(
      UpsertRoleSchema.safeParse({ ...input, permissions: [...input.permissions, input.permissions[0]] }).success,
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
