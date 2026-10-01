import type { SerializedInteractorFailure } from "@/core/validation/validation.utils";

import { SerializedInteractorFailureSchema } from "@/core/validation/validation.utils";
import { AGENT_TOOL_RESULT_TRUNCATED_MARK, agentToolResultText } from "./agent-budget-policy";

type FailureResult = { ok: false; result: string; failure?: SerializedInteractorFailure };

export function boundedAgentToolFailure(
  input: { result: string; failure: SerializedInteractorFailure },
  maxChars: number,
): FailureResult {
  const limit = Number.isFinite(maxChars) ? Math.max(1, Math.floor(maxChars)) : 1;
  const original = SerializedInteractorFailureSchema.parse(input.failure);
  const metadataLimit = Math.min(1_024, Math.max(0, limit - 128));
  let failure = original;
  if (JSON.stringify(failure).length > metadataLimit) {
    const unique = new Map<string, SerializedInteractorFailure["issues"][number]>();
    for (const issue of original.issues) {
      const key = issue.customCode ? `custom:${issue.customCode}` : `code:${issue.code}`;
      if (!unique.has(key)) unique.set(key, issue);
    }
    const issues: SerializedInteractorFailure["issues"] = [];
    const prioritized = [...unique.values()].sort(
      (a, b) => Number(Boolean(b.customCode)) - Number(Boolean(a.customCode)),
    );
    for (const issue of prioritized) {
      const projected = {
        code: issue.code.length <= 64 ? issue.code : "custom",
        path: issue.path,
        message: "",
        ...(issue.customCode ? { customCode: issue.customCode } : {}),
      };
      if (JSON.stringify({ kind: original.kind, issues: [...issues, projected] }).length > metadataLimit)
        projected.path = [];
      if (JSON.stringify({ kind: original.kind, issues: [...issues, projected] }).length <= metadataLimit)
        issues.push(projected);
    }
    if (!issues.length) return { ok: false, result: agentToolResultText(input.result, limit) };
    failure = SerializedInteractorFailureSchema.parse({ kind: original.kind, issues });
  }
  const response: FailureResult = { ok: false, result: input.result, failure };
  if (JSON.stringify(response).length <= limit) return response;
  let notice = `\n${AGENT_TOOL_RESULT_TRUNCATED_MARK} remaining validation details omitted.]`;
  if (JSON.stringify({ ...response, result: notice }).length > limit) notice = "";
  const points = Array.from(input.result.slice(0, limit));
  if (points.join("").length === input.result.length) points.pop();
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const result = points.slice(0, middle).join("") + notice;
    if (JSON.stringify({ ...response, result }).length <= limit) low = middle;
    else high = middle - 1;
  }
  response.result = points.slice(0, low).join("") + notice;
  return response;
}
