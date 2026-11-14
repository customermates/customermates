import { describe, expect, it, vi } from "vitest";

import type { RecordMutation } from "@/features/records/record-query.schema";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordAutomationPort } from "../record-automation.port";

const MUTATION = { action: "delete", targets: [] } as unknown as RecordMutation;

function port(
  failure: {
    code: string;
    message: string;
    params?: Record<string, unknown>;
  } | null,
) {
  const refused = { ok: false, error: { issues: [failure] } };
  const completed = { ok: true, data: { status: "completed", refs: [] } };
  const mutations = { invoke: vi.fn().mockResolvedValue(failure ? refused : completed) };
  const models = { invoke: vi.fn().mockResolvedValue({ ok: true, data: { revision: 4 } }) };
  return new RecordAutomationPort(models as never, { invoke: vi.fn() } as never, mutations as never);
}

describe("record automation port", () => {
  it("marks a write refused for a changed record version so the rule can read it again", async () => {
    const result = await port({
      code: "custom",
      message: "This record changed.",
      params: { error: CustomErrorCode.recordVersionChanged },
    }).mutate({ idempotencyKey: "rule:run:0", mutation: MUTATION });
    expect(result).toEqual({ ok: false, message: "This record changed.", versionChanged: true });
  });

  it("does not mark any other refusal as a changed version", async () => {
    const result = await port({
      code: "custom",
      message: "Not allowed.",
      params: { error: CustomErrorCode.recordProtected },
    }).mutate({ idempotencyKey: "rule:run:0", mutation: MUTATION });
    expect(result).toEqual({ ok: false, message: "Not allowed.", versionChanged: false });
  });

  it("returns the refs of a completed write", async () => {
    const result = await port(null).mutate({ idempotencyKey: "rule:run:0", mutation: MUTATION });
    expect(result).toEqual({ ok: true, refs: [] });
  });
});
