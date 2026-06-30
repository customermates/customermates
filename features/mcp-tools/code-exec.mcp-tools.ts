import { z } from "zod";

import { runUserCode } from "@/features/code-exec/run-code.service";

const RunCodeSchema = z.object({
  language: z
    .enum(["python", "javascript"])
    .describe("Language to run: python (pandas/numpy available) or javascript."),
  code: z
    .string()
    .min(1)
    .max(50_000)
    .describe(
      "The program to run in an isolated, read-only sandbox. A `crm` client is available to fetch the user's data " +
        "(read-only): crm.list(entity, {filters,searchTerm,page,pageSize}), crm.count(entity,{filters}), " +
        "crm.search(searchTerm,{entities,limitPerEntity}), crm.get(entity,id), crm.configuration(entity). " +
        "entity is one of contact|organization|deal|service|task. Print results or assign to `result`. " +
        "No network, no filesystem, no package installs, no writes.",
    ),
  timeoutMs: z.number().int().min(1_000).max(30_000).optional().describe("Optional wall-clock limit (max 30s)."),
});

export const runCodeTool = {
  name: "run_code",
  description:
    "Run sandboxed Python or JavaScript to analyze the user's CRM data (aggregations, pivots, stats, ad-hoc reports). " +
    "READ-ONLY and isolated: the code reaches data only through a read-only `crm` client, has no network/filesystem/package access, " +
    "and cannot modify records (use the typed create/update/delete tools for changes). " +
    "Returns JSON { status, stdout, result, error, files, durationMs }. Requires the user's approval on every run.",
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: false },
  inputSchema: RunCodeSchema,
  execute: async ({ language, code, timeoutMs }: z.infer<typeof RunCodeSchema>) => {
    const report = await runUserCode({ language, code, timeoutMs });
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
