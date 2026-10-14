import { describe, expect, it, vi } from "vitest";

import { verifyAgentRecordUpdate } from "../agent-write-verification";

const ref = {
  typeId: "00000000-0000-4000-8000-000000000001",
  recordId: "00000000-0000-4000-8000-000000000002",
};
const stageId = "00000000-0000-4000-8000-000000000003";
const input = {
  mutation: {
    action: "update",
    ref,
    fields: [{ fieldId: stageId, value: { kind: "select", value: "proposal" } }],
  },
};
const result = { result: { status: "completed", refs: [ref] } };

describe("agent record write verification", () => {
  it("refuses a success claim when the saved stage is still the old choice", async () => {
    const read = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        fields: [
          {
            fieldId: stageId,
            result: { state: "value", value: { kind: "select", value: "won" } },
          },
        ],
      },
    });
    await expect(verifyAgentRecordUpdate(input, result, read)).resolves.toContain("did not match");
    expect(read).toHaveBeenCalledWith(ref);
  });

  it("accepts the update only after the requested choice is visible", async () => {
    const read = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        fields: [
          {
            fieldId: stageId,
            result: {
              state: "value",
              value: { kind: "select", value: "proposal" },
            },
          },
        ],
      },
    });
    await expect(verifyAgentRecordUpdate(input, result, read)).resolves.toBeNull();
  });

  it("refuses a completed result that contains no requested target", async () => {
    const read = vi.fn();
    await expect(
      verifyAgentRecordUpdate(input, { result: { status: "completed", refs: [] } }, read),
    ).resolves.toContain("absent");
    expect(read).not.toHaveBeenCalled();
  });
});
