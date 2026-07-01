import { tool } from "ai";
import { z } from "zod";

import { getUserService } from "@/core/di";
import { runUserCode, startBackgroundRun } from "@/features/code-exec/run-code.service";
import { getRun } from "@/features/code-exec/run-store";

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
        "reads the user's data: crm.list(entity, {filters,searchTerm,page,pageSize}), crm.count(entity,{filters}), " +
        "crm.search(searchTerm,{entities,limitPerEntity}), crm.get(entity,id), crm.configuration(entity); " +
        "entity is one of contact|organization|deal|service|task. crm.run_tool(name, args) invokes a backend tool " +
        "server-side with the user's permissions. The run is READ-ONLY by default (read tools only); to " +
        "create_entities/update_entities/delete_entities/send_email you MUST pass allowWrite:true — those REALLY mutate " +
        "data, so confirm intent and call get_entity_configuration first. " +
        "Write ONE self-contained script that does the WHOLE task in this single call: each call is a fresh sandbox " +
        "(no variables, files, or state carry over), so never split preparation into one call and execution into " +
        "another — read the input, build the data, and act on it in the same script. When a " +
        "backend tool caps items per call (e.g. create/update/delete at 100), LOOP and call crm.run_tool once per batch " +
        "of 100 INSIDE this one script (a run may make up to 200 tool calls / 1000 mutated records); do NOT make a " +
        "separate run_code call per batch. Pass any uploaded files you read in inputFiles. " +
        "Print results or assign to `result`, but keep output small — stdout is capped (~64 KB) and overflow fails the " +
        "run, so summarize (counts/totals/errors) instead of printing every row or dumping large payloads. " +
        "Files written are ephemeral (cleared after the run).",
    ),
  timeoutMs: z.number().int().min(1_000).max(30_000).optional().describe("Optional wall-clock limit (max 30s)."),
  background: z
    .boolean()
    .optional()
    .describe(
      "If true, start the run in the background and return a runId immediately instead of waiting for it to finish. " +
        "Use for slower jobs so you stay responsive; then call check_run with that runId to fetch the result (poll until " +
        "status is no longer 'running'). Default false (run synchronously and return the report).",
    ),
  inputFiles: z
    // Matches the runner's per-run input cap (ART_MAX_FILES); extra names are dropped.
    .array(z.string())
    .max(8)
    .optional()
    .describe(
      "Names of files the user uploaded to this conversation to make available in the working directory " +
        "(read them with open()/fs by the same name). REQUIRED whenever your code reads an uploaded file: a file is " +
        "present ONLY if its name is listed here — otherwise open() raises FileNotFound. If the code opens an uploaded " +
        "file, that exact name must appear in this array in the SAME call. Only names listed in the system prompt's " +
        "uploaded-files section can be selected; omit when you don't need any uploaded file.",
    ),
  allowWrite: z
    .boolean()
    .optional()
    .describe(
      "Default false = READ-ONLY: code may read data and call read-only tools, but crm.run_tool to mutating tools " +
        "(create_entities/update_entities/delete_entities/send_email/…) is refused. Set true ONLY when the user " +
        "asked to change data — it lets this run create/update/DELETE via crm.run_tool. Prefer the typed tools for " +
        "one-off changes; use allowWrite for bulk/computed mutations.",
    ),
});

const RUN_CODE_DESCRIPTION =
  "Run sandboxed Python, JavaScript, or bash to analyze the user's CRM data (aggregations, pivots, stats, ad-hoc reports) " +
  "or do scripting in an isolated VM. Two mutually-exclusive egress modes: DATA (default — read-only `crm` client, no internet) " +
  "and NET (allowlisted internet for installs/approved APIs, no CRM data). In DATA mode crm.run_tool(name, args) invokes " +
  "backend tools server-side with the user's permissions — read-only by default; pass allowWrite:true to permit " +
  "create/update/delete (real mutations). " +
  "Every run is a fresh, throwaway sandbox and needs the user's approval, so do the ENTIRE task in ONE call: write one " +
  "self-contained script that reads its inputs, builds the data, and loops crm.run_tool over batches of 100 — never spread " +
  "a job across several run_code calls. Keep stdout small (it is capped); return a short summary. " +
  "Files the user uploaded can be made available in the working directory via inputFiles (a file is readable ONLY if its " +
  "name is in inputFiles). " +
  "Set background:true for slower jobs to get a runId immediately, then poll check_run(runId). " +
  "Returns JSON { status, stdout, result, error, files, durationMs }.";

function serializeReport(report: Awaited<ReturnType<typeof runUserCode>>): string {
  return JSON.stringify({
    status: report.status,
    stdout: report.stdout,
    result: report.result ?? null,
    error: report.error ?? null,
    files: report.files,
    durationMs: report.durationMs,
    truncated: report.truncated ?? false,
  });
}

/**
 * Run synchronously (return the full report) or, when background is set, start it and
 * return a runId immediately. Shared by the static and request-scoped run_code tools.
 */
async function dispatch(request: Parameters<typeof runUserCode>[0], background?: boolean): Promise<string> {
  if (!background) return serializeReport(await runUserCode(request));
  const started = await startBackgroundRun(request);
  if ("runId" in started) {
    return JSON.stringify({
      status: "running",
      runId: started.runId,
      message:
        "Run started in the background. Call check_run with this runId to fetch the result; " +
        "poll until status is no longer 'running'.",
    });
  }
  return serializeReport(started); // feature-disabled errorReport
}

export const runCodeTool = {
  name: "run_code",
  description: RUN_CODE_DESCRIPTION,
  // `alwaysApprove` marks this as never-pre-authorizable: the approval card showing the
  // exact code is the human check against prompt-injection and must never be downgraded
  // by the "always allow" path. The gate reads this off the annotation (not a name list),
  // so it survives a rename of the tool. See features/agent-chat/tool-gating.ts.
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: true,
    idempotentHint: false,
    alwaysApprove: true,
  },
  inputSchema: RunCodeSchema,
  // The static (registry) tool has no per-conversation upload context, so it never
  // seeds input files; the agent route overrides run_code with buildRunCodeTool().
  execute: async ({ language, code, mode, timeoutMs, background, allowWrite }: z.infer<typeof RunCodeSchema>) => {
    return dispatch({ language, code, mode, timeoutMs, allowWrite }, background);
  },
};

/** An upload the current conversation makes selectable by name in run_code. */
export type AvailableUpload = { id: string; name: string };

/**
 * Build a request-scoped run_code AI-SDK tool that can seed the conversation's
 * uploaded files into the workspace. The model selects files by name; we map those
 * to upload ids here (closure context), because the per-request upload set can't be
 * carried by the static registry tool and AsyncLocalStorage doesn't survive the
 * response stream. needsApproval is hard-true: the approval card showing the exact
 * code is the human check against prompt-injection and must never be downgraded.
 */
export function buildRunCodeTool(availableUploads: AvailableUpload[]) {
  const idByName = new Map(availableUploads.map((u) => [u.name, u.id]));

  return tool({
    description: RUN_CODE_DESCRIPTION,
    inputSchema: RunCodeSchema,
    needsApproval: true,
    execute: async ({
      language,
      code,
      mode,
      timeoutMs,
      inputFiles,
      background,
      allowWrite,
    }: z.infer<typeof RunCodeSchema>) => {
      const seen = new Set<string>();
      const resolved: Array<{ uploadId: string; name: string }> = [];
      for (const name of inputFiles ?? []) {
        const uploadId = idByName.get(name);
        if (!uploadId || seen.has(uploadId)) continue;
        seen.add(uploadId);
        resolved.push({ uploadId, name });
      }
      return dispatch(
        { language, code, mode, timeoutMs, allowWrite, inputFiles: resolved.length ? resolved : undefined },
        background,
      );
    },
  });
}

const CheckRunSchema = z.object({
  runId: z.string().min(1).describe("The runId returned by a background run_code call."),
});

/**
 * Poll a background run_code execution by its runId. Read-only (no approval): it only
 * reads the tenant-scoped run store. Returns the same report shape as run_code once the
 * run is done, or { status: 'running' } while it's still executing.
 */
export const checkRunTool = {
  name: "check_run",
  description:
    "Check the status/result of a BACKGROUND run_code by its runId. Returns { status: 'running'|'ok'|'error'|'timeout', " +
    "stdout, result, error, files, durationMs }. While status is 'running' the run hasn't finished — poll again shortly. " +
    "Read-only; no approval required.",
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  inputSchema: CheckRunSchema,
  execute: async ({ runId }: z.infer<typeof CheckRunSchema>) => {
    const user = await getUserService()
      .getActiveUserOrThrow()
      .catch(() => null);
    if (!user) return JSON.stringify({ status: "error", error: { message: "Not authenticated." } });
    const run = getRun(runId, user.companyId);
    if (!run) return JSON.stringify({ status: "error", error: { message: "Unknown or expired runId." } });
    if (run.status === "running")
      return JSON.stringify({ status: "running", runId, message: "Still running — poll again shortly." });

    if (run.report) return serializeReport(run.report);
    return JSON.stringify({ status: "error", error: { message: run.error ?? "Run failed." } });
  },
};
