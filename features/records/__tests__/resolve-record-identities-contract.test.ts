import { describe, expect, it } from "vitest";

import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";
import { MutateRecordSchema } from "../record-query.schema";
import {
  ResolveRecordIdentitiesResultSchema,
  ResolveRecordIdentitiesSchema,
} from "../resolve-record-identities.interactor";

const typeId = "00000000-0000-4000-8000-000000000101";
const recordId = (index: number) => `00000000-0000-4000-8000-${String(200 + index).padStart(12, "0")}`;
const reference = (index: number, version: number) => ({
  ref: { typeId, recordId: recordId(index) },
  typeLabel: "Contact",
  typePluralLabel: "Contacts",
  title: `Contact ${index}`,
  avatarUrl: null,
  canEdit: true,
  version,
});

describe("identifier lookup to updateMany handoff", () => {
  it("documents versions and the schema revision in the REST contract", () => {
    const operation = generateOpenApiSpec().paths?.["/v1/records/identities/resolve"]?.post;
    const response = JSON.stringify(operation?.responses?.["200"]);
    const request = JSON.stringify(operation?.requestBody);
    expect(response).toContain('"schemaRevision"');
    expect(response).toContain('"version"');
    expect(response).toContain("deduplicate by typeId and recordId");
    expect(request).toContain('"maxItems":1000');
  });

  it("builds deduplicated updateMany targets from one lookup within the 1,000 and 100 limits", () => {
    expect(
      ResolveRecordIdentitiesSchema.safeParse({
        identifiers: Array.from({ length: 1000 }, (_, index) => ({ provider: "mail", value: `${index}@x.test` })),
      }).success,
    ).toBe(true);
    expect(
      ResolveRecordIdentitiesSchema.safeParse({
        identifiers: Array.from({ length: 1001 }, (_, index) => ({ provider: "mail", value: `${index}@x.test` })),
      }).success,
    ).toBe(false);
    const lookup = ResolveRecordIdentitiesResultSchema.parse({
      schemaRevision: 5,
      matches: [
        { provider: "mail", value: "a@x.test", records: [reference(0, 2)] },
        { provider: "linkedin", value: "a-profile", records: [reference(0, 2)] },
        { provider: "mail", value: "shared@x.test", records: [reference(1, 1), reference(2, 3)] },
        ...Array.from({ length: 100 }, (_, index) => ({
          provider: "mail" as const,
          value: `${index + 3}@x.test`,
          records: [reference(index + 3, 1)],
        })),
      ],
    });
    const targets = [
      ...new Map(
        lookup.matches
          .filter((match) => match.records.length === 1)
          .flatMap((match) => match.records)
          .map((record) => [record.ref.recordId, { ref: record.ref, expectedVersion: record.version }]),
      ).values(),
    ];
    expect(targets).toHaveLength(101);
    const mutation = (selection: typeof targets) =>
      MutateRecordSchema.safeParse({
        expectedRevision: lookup.schemaRevision,
        idempotencyKey: "identifier-batch-0001",
        mutation: {
          action: "updateMany",
          targets: selection,
          fields: [{ fieldId: "00000000-0000-4000-8000-000000000102", value: { kind: "text", value: "x" } }],
        },
      });
    expect(mutation(targets.slice(0, 100)).success).toBe(true);
    expect(mutation(targets).success).toBe(false);
    expect(mutation([targets[0], targets[0]]).success).toBe(false);
  });
});
