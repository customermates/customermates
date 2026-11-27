import { AsyncLocalStorage } from "node:async_hooks";

export type McpWorkspaceSelection = { companyId: string; slug: string };

const selectedWorkspace = new AsyncLocalStorage<McpWorkspaceSelection>();

export function runInMcpWorkspace<T>(selection: McpWorkspaceSelection, fn: () => T): T {
  return selectedWorkspace.run(selection, fn);
}

export function currentMcpWorkspace(): McpWorkspaceSelection | null {
  return selectedWorkspace.getStore() ?? null;
}
