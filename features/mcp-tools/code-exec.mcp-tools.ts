import { z } from "zod";

import { runUserCode } from "@/features/code-exec/run-code.service";

const RunCodeSchema = z.object({
  language: z
    .enum(["python", "javascript", "bash"])
    .describe("Language to run: python (pandas/numpy), javascript, or bash."),
  mode: z
    .enum(["DATA", "NET"])
    .optional()
    .describe(
      "Egress mode (default DATA). DATA: the read-only `crm` client is available, NO internet. " +
        "NET: allowlisted internet (package installs / approved APIs) but NO CRM data access. " +
        "They are mutually exclusive — pick DATA to read the user's data, NET only when you need the internet.",
    ),
  code: z
    .string()
    .min(1)
    .max(50_000)
    .describe(
      "The program to run in an isolated sandbox with a writable working directory. In DATA mode a `crm` client " +
        "fetches the user's data (read-only): crm.list(entity, {filters,searchTerm,page,pageSize}), crm.count(entity,{filters}), " +
        "crm.search(searchTerm,{entities,limitPerEntity}), crm.get(entity,id), crm.configuration(entity); " +
        "entity is one of contact|organization|deal|service|task. Print results or assign to `result`. " +
        "Files written are ephemeral (cleared after the run); cannot modify CRM records.",
    ),
  timeoutMs: z.number().int().min(1_000).max(30_000).optional().describe("Optional wall-clock limit (max 30s)."),
});

export const runCodeTool = {
  name: "run_code",
  description:
    "Run sandboxed Python, JavaScript, or bash to analyze the user's CRM data (aggregations, pivots, stats, ad-hoc reports) " +
    "or do scripting in an isolated VM. Two mutually-exclusive egress modes: DATA (default — read-only `crm` client, no internet) " +
    "and NET (allowlisted internet for installs/approved APIs, no CRM data). Cannot modify records (use the typed create/update/delete tools). " +
    "Returns JSON { status, stdout, result, error, files, durationMs }. Requires the user's approval on every run.",
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: false },
  inputSchema: RunCodeSchema,
  execute: async ({ language, code, mode, timeoutMs }: z.infer<typeof RunCodeSchema>) => {
    const report = await runUserCode({ language, code, mode, timeoutMs });
    return JSON.stringify({
      status: report.status,
      stdout: report.stdout,
      result: report.result ?? null,
      error: report.error ?? null,
      files: report.files,
      durationMs: report.durationMs,
      truncated: report.truncated ?? false,
    });
  },
};
