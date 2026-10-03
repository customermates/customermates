import { describe, expect, it } from "vitest";

import {
  SerializedInteractorFailureSchema,
  type SerializedInteractorFailure,
} from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { AGENT_TOOL_RESULT_TRUNCATED_MARK } from "../agent-budget-policy";
import { boundedAgentToolFailure } from "../agent-tool-failure";

const shortFailure: SerializedInteractorFailure = {
  kind: "authorization",
  issues: [
    {
      code: "custom",
      path: ["account", 2],
      message: "Localized access denied.",
      customCode: CustomErrorCode.userInactive,
    },
  ],
};

describe("bounded hosted tool failure metadata", () => {
  it("preserves exact short kinds, paths, messages and custom codes", () => {
    const input = { result: "Localized access denied.", failure: shortFailure };
    expect(boundedAgentToolFailure(input, 512)).toEqual({ ok: false, ...input });
  });

  it("keeps distinct validated custom codes through dense repeated issues and JSON replay", () => {
    const customCodes = [CustomErrorCode.wikiSourceCoverageRequired, CustomErrorCode.wikiSourcePlanIncomplete];
    const input = {
      result: "Localized validation detail. ".repeat(2_000),
      failure: {
        kind: "validation" as const,
        issues: Array.from({ length: 100 }, (_, index) => ({
          code: "custom",
          path: ["topics", index],
          message: "x".repeat(1_000),
          customCode: customCodes[index % 2],
        })),
      },
    };
    const snapshot = JSON.stringify(input);
    const output = boundedAgentToolFailure(input, 512);
    expect(output.failure?.issues.map(({ customCode }) => customCode)).toEqual(customCodes);
    expect(output.result).toContain(AGENT_TOOL_RESULT_TRUNCATED_MARK);
    expect(JSON.stringify(output).length).toBeLessThanOrEqual(512);
    expect(SerializedInteractorFailureSchema.safeParse(JSON.parse(JSON.stringify(output)).failure).success).toBe(true);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it.each(['"\\\n'.repeat(2_000), "\u0000\t".repeat(2_000), "🌍".repeat(2_000)])(
    "reserves escaped JSON metadata and text inside the original bound",
    (result) => {
      const output = boundedAgentToolFailure({ result, failure: shortFailure }, 512);
      expect(JSON.stringify(output).length).toBeLessThanOrEqual(512);
      expect(output.result).toContain(AGENT_TOOL_RESULT_TRUNCATED_MARK);
      expect(output.failure).toEqual(shortFailure);
    },
  );

  it.each([0, 1, 8, 16, 32, 64])(
    "uses the existing text-only behavior when limit %s cannot contain canonical metadata",
    (limit) => {
      const output = boundedAgentToolFailure({ result: "x".repeat(1_000), failure: shortFailure }, limit);
      expect(output.failure).toBeUndefined();
      expect(output.result.length).toBeLessThanOrEqual(Math.max(1, limit));
    },
  );

  it("keeps the established dense-failure size and truncation checks", () => {
    const output = boundedAgentToolFailure(
      {
        result: "x".repeat(20_000),
        failure: {
          kind: "validation",
          issues: Array.from({ length: 100 }, (_, index) => ({
            code: "custom",
            path: ["rows", index],
            message: "x".repeat(1_000),
          })),
        },
      },
      512,
    );
    expect(output.result.length).toBeLessThanOrEqual(512);
    expect(output.result).toContain(AGENT_TOOL_RESULT_TRUNCATED_MARK);
    expect(JSON.stringify(output).length).toBeLessThan(600);
    expect(SerializedInteractorFailureSchema.safeParse(output.failure).success).toBe(true);
  });
});
