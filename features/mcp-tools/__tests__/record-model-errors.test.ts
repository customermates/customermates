import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";
import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutate: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => ({
  getQueryRecordsInteractor: () => ({ invoke: mocks.query }),
  getMutateRecordInteractor: () => ({ invoke: mocks.mutate }),
  getGetRecordInteractor: () => ({ invoke: mocks.read }),
}));

const { queryRecordsV2Tool, mutateRecordV2Tool } = await import("../record-model.mcp-tools");

describe("record MCP error guidance", () => {
  it("names the invalid filter and its accepted value shape", async () => {
    const fieldId = randomUUID();
    mocks.query.mockResolvedValueOnce({
      ok: false,
      error: createZodError("Review the highlighted record values.", ["filters", 1], {
        error: CustomErrorCode.recordValueInvalid,
      }),
    });
    const input = queryRecordsV2Tool.inputSchema.parse({
      typeId: randomUUID(),
      filters: [
        { fieldId: randomUUID(), operator: "empty", value: null },
        {
          fieldId,
          operator: "in",
          value: null,
          values: [{ kind: "selectList", value: [randomUUID()] }],
        },
      ],
    });
    const result = await queryRecordsV2Tool.execute(input);
    expect(result).toMatchObject({
      text: expect.stringContaining(`filters[1] on ${fieldId} with in is invalid`),
    });
    expect(result).toMatchObject({
      text: expect.stringContaining("values: an array of typed scalars"),
    });
  });

  it("names an unknown requested field and the accepted fields shape", async () => {
    const fieldId = randomUUID();
    mocks.query.mockResolvedValueOnce({
      ok: false,
      error: createZodError(
        `Field ${fieldId} is unknown or not yet published for this list. Pass fields as an array of live field IDs from the current record model.`,
        ["fields"],
        { error: CustomErrorCode.recordQueryFieldUnknown },
      ),
    });
    const input = queryRecordsV2Tool.inputSchema.parse({
      typeId: randomUUID(),
      fields: [fieldId],
    });
    const result = await queryRecordsV2Tool.execute(input);
    expect(result).toMatchObject({ text: expect.stringContaining(fieldId) });
    expect(result).toMatchObject({
      text: expect.stringContaining("fields as an array"),
    });
  });

  it("re-reads the current version for a mutation conflict", async () => {
    const ref = { typeId: randomUUID(), recordId: randomUUID() };
    mocks.mutate.mockResolvedValueOnce({
      ok: false,
      error: createZodError("This record changed. Refresh before saving again.", [], {
        error: CustomErrorCode.recordVersionChanged,
        kind: "conflict",
      }),
    });
    mocks.read.mockResolvedValueOnce({ ok: true, data: { version: 4 } });
    const input = mutateRecordV2Tool.inputSchema.parse({
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
      mutation: { action: "update", ref, expectedVersion: 1, fields: [] },
    });
    const result = await mutateRecordV2Tool.execute(input);
    expect(result).toMatchObject({
      text: expect.stringContaining("Read the record again and retry"),
    });
    expect(result).toMatchObject({
      text: expect.stringContaining('"expectedVersion":4'),
    });
    expect(mocks.read).toHaveBeenCalledWith(ref);
  });

  it("describes the rich text write format", () => {
    expect(mutateRecordV2Tool.description).toContain("documentJson");
    expect(mutateRecordV2Tool.description).toContain("Markdown is returned on read");
  });
});
