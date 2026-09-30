import { describe, expect, it } from "vitest";
import { RecordMutationSchema } from "../record-query.schema";

const typeId = "10000000-0000-4000-8000-000000000001";
const recordId = "10000000-0000-4000-8000-000000000002";
const relationId = "10000000-0000-4000-8000-000000000003";
const ref = { typeId, recordId };

describe("compact record mutation contract", () => {
  it.each([
    { action: "create", typeId, fields: [], identities: [{ provider: "mail", value: "person@example.test" }] },
    { action: "update", ref, expectedVersion: 1, fields: [], identities: [] },
    { action: "delete", ref, expectedVersion: 1 },
    { action: "link", relationId, source: ref, target: ref },
    { action: "unlink", relationId, source: ref, target: ref },
  ])("preserves the $action canonical payload", (input) => {
    expect(RecordMutationSchema.parse(input)).toEqual(input);
  });

  it.each([
    { action: "create", fields: [] },
    { action: "create", typeId },
    { action: "update", ref, fields: [] },
    { action: "delete", ref, expectedVersion: 1, identities: [] },
    { action: "delete", ref, expectedVersion: 1, fields: [] },
    { action: "link", relationId, source: ref },
    { action: "unlink", relationId, source: ref, target: ref, assignedUserIds: [] },
    { action: "create", typeId, fields: [], ref },
  ])("enforces action-specific requirements despite the compact wire schema", (input) => {
    expect(RecordMutationSchema.safeParse(input).success).toBe(false);
  });
});
