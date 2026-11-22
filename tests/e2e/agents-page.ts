import type { Page } from "@playwright/test";

import { expect } from "./fixtures";
import { clickHydrated } from "./workspace-switching";

export type AgentRuntime = "mate" | "ownKey" | "runner";

export function agentRuntimeCard(page: Page, runtime: AgentRuntime) {
  return page.locator(`#agent-runtimes [data-agent-runtime="${runtime}"]`);
}

/** The Agents page shows the details of one runtime at a time; this selects its card. */
export async function openAgentRuntime(page: Page, runtime: AgentRuntime) {
  await clickHydrated(agentRuntimeCard(page, runtime));
  await expect(page.locator(`[data-agent-runtime-details="${runtime}"]`)).toBeVisible();
}
