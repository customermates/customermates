import { describe, expect, it } from "vitest";

import {
  BENCHMARK_STRUCTURED_CONTENT_MAX_CHARS,
  BENCHMARK_TOOL_OUTPUT_MAX_CHARS,
  benchmarkToolOutputPart,
  recordsBenchmarkToolOutputs,
} from "../benchmark-tool-output";

describe("benchmark tool output recording", () => {
  it("records only on a local benchmark server outside a deployment", () => {
    expect(recordsBenchmarkToolOutputs({})).toBe(false);
    expect(recordsBenchmarkToolOutputs({ LOCAL_AGENT_BENCHMARK: "1" })).toBe(false);
    expect(recordsBenchmarkToolOutputs({ LOCAL_AGENT_BENCHMARK: "true" })).toBe(true);
    expect(recordsBenchmarkToolOutputs({ LOCAL_AGENT_BENCHMARK: "true", VERCEL_ENV: "preview" })).toBe(false);
  });

  it("keeps the result text the model saw and the ok flag", () => {
    expect(
      benchmarkToolOutputPart({
        toolCallId: "call-1",
        toolName: "list_records",
        output: { ok: true, result: "total: 42" },
      }),
    ).toEqual({
      type: "benchmark-tool-output",
      toolCallId: "call-1",
      toolName: "list_records",
      threw: false,
      ok: true,
      text: "total: 42",
      textChars: 9,
      truncated: false,
    });
  });

  it("unwraps a provider tool-result wrapper and serializes non-text outputs", () => {
    const part = benchmarkToolOutputPart({
      toolCallId: "call-2",
      toolName: "navigate",
      output: { type: "json", value: { navigated: "/deals" } },
    });
    expect(part.text).toBe('{"navigated":"/deals"}');
    expect(part.ok).toBeNull();
  });

  it("bounds the text and flags the truncation", () => {
    const long = "x".repeat(BENCHMARK_TOOL_OUTPUT_MAX_CHARS + 500);
    const part = benchmarkToolOutputPart({ toolCallId: "call-3", toolName: "get_records", output: long });
    expect(part.text).toHaveLength(BENCHMARK_TOOL_OUTPUT_MAX_CHARS);
    expect(part.textChars).toBe(BENCHMARK_TOOL_OUTPUT_MAX_CHARS + 500);
    expect(part.truncated).toBe(true);
  });

  it("keeps structured content only while it is small", () => {
    const small = benchmarkToolOutputPart({
      toolCallId: "call-4",
      toolName: "analyze_records",
      output: { ok: true, result: "median 5", structuredContent: { median: 5 } },
    });
    expect(small.structuredContent).toEqual({ median: 5 });
    const large = benchmarkToolOutputPart({
      toolCallId: "call-5",
      toolName: "analyze_records",
      output: {
        ok: true,
        result: "rows",
        structuredContent: { rows: "y".repeat(BENCHMARK_STRUCTURED_CONTENT_MAX_CHARS) },
      },
    });
    expect(large).not.toHaveProperty("structuredContent");
  });

  it("records a thrown call without output", () => {
    expect(benchmarkToolOutputPart({ toolCallId: "call-6", toolName: "get_records", threw: true })).toMatchObject({
      threw: true,
      text: "",
      ok: null,
    });
  });
});
