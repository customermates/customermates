import { MESSAGING_TOOL_GUIDANCE } from "./tool-guidance/messaging";
import { RECORD_DATA_TOOL_GUIDANCE } from "./tool-guidance/record-data";
import { RECORDS_TOOL_GUIDANCE } from "./tool-guidance/records";
import { SOCIAL_TOOL_GUIDANCE } from "./tool-guidance/social";
import { WORKSPACE_TOOL_GUIDANCE } from "./tool-guidance/workspace";

export const TOOL_GUIDANCE: Readonly<Record<string, string>> = {
  ...RECORDS_TOOL_GUIDANCE,
  ...RECORD_DATA_TOOL_GUIDANCE,
  ...MESSAGING_TOOL_GUIDANCE,
  ...SOCIAL_TOOL_GUIDANCE,
  ...WORKSPACE_TOOL_GUIDANCE,
};

export function buildToolGuidance(toolNames: Iterable<string>): string {
  const lines = [...new Set(toolNames)]
    .filter((name) => TOOL_GUIDANCE[name])
    .map((name) => `${name}: ${TOOL_GUIDANCE[name]}`);
  return lines.length ? `Tool guidance.\n${lines.join("\n")}` : "";
}
