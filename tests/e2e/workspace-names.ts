let sequence = 0;

export function uniqueWorkspaceName(base: string): string {
  const run = (process.env.CRM_E2E_RUN_ID ?? "local").slice(-6);
  const worker = process.env.TEST_WORKER_INDEX ?? "0";
  sequence += 1;

  return `${base} ${run}-${worker}-${sequence}`;
}
