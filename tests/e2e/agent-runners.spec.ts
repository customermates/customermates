import { createHash, randomUUID } from "node:crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { openAgentRuntime } from "./agents-page";
import { appPath } from "./app-paths";
import { runItemAction } from "./item-actions";
import { addBrowserWorkspace } from "./workspace";
import { clickHydrated, e2eAppMode } from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

const messages = englishMessages.Runners;

test("an administrator adds a runner, sees its token once, connects it and revokes it", async ({
  page,
  database,
  workspace,
  request,
}) => {
  const errors = collectPageErrors(page);
  await page.goto(appPath(workspace.slug, "/settings/agents"));
  await openAgentRuntime(page, "runner");
  await expect(page.getByRole("heading", { name: messages.computersTitle, level: 2 })).toBeVisible();
  await expect(page.getByText(messages.description, { exact: true })).toBeVisible();

  await clickHydrated(page.locator("#agent-runners-add"));
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(messages.addTitle);
  await dialog.locator("#agent-runner-name").fill("Office laptop");
  await dialog.locator("#agent-runner-save").click();

  await expect(dialog.getByText(messages.tokenCreated, { exact: true })).toBeVisible();
  const token = await dialog.locator("#agent-runner-token").getAttribute("data-value");
  expect(token).toMatch(/^cmr_[A-Za-z0-9_-]{43}$/u);
  // The token travels in the environment, never as an argument other users of the machine could read.
  await expect(dialog.locator("#agent-runner-npx")).toHaveAttribute(
    "data-value",
    new RegExp(`^CUSTOMERMATES_RUNNER_TOKEN=${token} npx customermates-runner --url https?://`, "u"),
  );
  await expect(dialog.locator("#agent-runner-npx")).not.toHaveAttribute("data-value", /--token/u);
  await expect(dialog.locator("#agent-runner-docker")).toHaveAttribute(
    "data-value",
    new RegExp(`CUSTOMERMATES_RUNNER_TOKEN=${token} `, "u"),
  );
  await expect(dialog.locator("#agent-runner-docker")).toHaveAttribute("data-value", /\.claude\.json:/u);

  const stored = await database.query<{ tokenHash: string; companyId: string }>(
    'SELECT "tokenHash", "companyId" FROM "AgentRunner" WHERE name=$1',
    ["Office laptop"],
  );
  expect(stored.rows).toEqual([
    { tokenHash: createHash("sha256").update(String(token)).digest("hex"), companyId: workspace.companyId },
  ]);

  await page.keyboard.press("Escape");
  const card = page.locator("[data-agent-runner]", { hasText: "Office laptop" });
  await expect(card).toHaveAttribute("data-status", "neverSeen");
  await expect(card).toContainText(messages.status.neverSeen);
  await expect(page.getByText(String(token))).toHaveCount(0);

  const headers = { authorization: `Bearer ${token}` };
  const heartbeat = await request.post("/api/v1/runner/heartbeat", {
    headers,
    data: { machine: "e2e-host", clients: [{ name: "claude", version: "2.1.318" }] },
  });
  expect(heartbeat.status()).toBe(200);
  expect(await heartbeat.json()).toMatchObject({ ok: true, onlineWithinSeconds: 120 });
  const claim = await request.post("/api/v1/runner/jobs/claim", { headers, data: { waitSeconds: 0 } });
  expect(claim.status()).toBe(204);
  const refused = await request.post("/api/v1/runner/heartbeat", {
    headers: { authorization: `Bearer cmr_${"x".repeat(43)}` },
    data: { clients: [] },
  });
  expect(refused.status()).toBe(401);

  // No reload: the card reloads the runners by itself every 30 seconds while the page is visible.
  const online = page.locator("[data-agent-runner]", { hasText: "Office laptop" });
  await expect(online).toHaveAttribute("data-status", "online", { timeout: 45_000 });
  await expect(online).toContainText(messages.status.online);
  await expect(online).toContainText("e2e-host");
  await expect(online).toContainText(`${messages.clientNames.claude} 2.1.318`);

  await runItemAction(page, online.locator("[data-item-actions-trigger]"), messages.revoke);
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(messages.revokeTitle);
  await expect(confirm).toContainText("Office laptop");
  await confirm.locator("#confirm-delete").click();

  const revoked = page.locator("[data-agent-runner]", { hasText: "Office laptop" });
  await expect(revoked).toHaveAttribute("data-status", "revoked");
  // A revoked runner has nothing left to do, so its row offers no menu.
  await expect(revoked.locator("[data-item-actions-trigger]")).toHaveCount(0);
  const afterRevoke = await request.post("/api/v1/runner/heartbeat", { headers, data: { clients: [] } });
  expect(afterRevoke.status()).toBe(401);
  expect(errors).toEqual([]);
});

test("a runner takes its member's job only after confirming it, and revoking it cancels what waits for it", async ({
  page,
  database,
  workspace,
  request,
}) => {
  const errors = collectPageErrors(page);
  const token = `cmr_${randomUUID().replaceAll("-", "")}${"a".repeat(11)}`;
  const runnerId = randomUUID();
  await database.query(
    'INSERT INTO "AgentRunner" (id,"companyId",name,"tokenHash","createdById","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
    [runnerId, workspace.companyId, "Job runner", createHash("sha256").update(token).digest("hex"), workspace.userId],
  );
  const insertJob = (id: string, pinnedRunnerId: string | null) =>
    database.query(
      'INSERT INTO "AgentJob" (id,"companyId",runtime,status,"sourceKind","ownerUserId",prompt,"pinnedRunnerId","updatedAt") VALUES ($1,$2,\'runner\',\'queued\',\'test\',$3,$4,$5,NOW())',
      [id, workspace.companyId, workspace.userId, "Summarise the open deals", pinnedRunnerId],
    );
  const jobOf = async (id: string) =>
    (
      await database.query<{ status: string; error: string | null; result: unknown; costMicrocents: string | null }>(
        'SELECT status, error, result, "costMicrocents" FROM "AgentJob" WHERE id=$1',
        [id],
      )
    ).rows[0];
  const headers = { authorization: `Bearer ${token}` };
  const jobId = randomUUID();
  await insertJob(jobId, null);

  const claim = await request.post("/api/v1/runner/jobs/claim", { headers, data: { waitSeconds: 0 } });
  expect(claim.status()).toBe(200);
  const claimed = (await claim.json()) as { job: { id: string; attempt: number }; mcp: { url: string; token: string } };
  expect(claimed.job).toMatchObject({ id: jobId, attempt: 1 });
  expect((await jobOf(jobId)).status).toBe("claimed");

  // The key of the job does nothing until the runner has confirmed the job.
  const rpc = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  const mcpHeaders = { "x-api-key": claimed.mcp.token, accept: "application/json, text/event-stream" };
  const early = await request.post(claimed.mcp.url, { headers: mcpHeaders, data: rpc });
  expect(early.status()).toBe(401);

  const stale = await request.post(`/api/v1/runner/jobs/${jobId}/start`, { headers, data: { attempt: 2 } });
  expect(stale.status()).toBe(409);
  const start = await request.post(`/api/v1/runner/jobs/${jobId}/start`, { headers, data: { attempt: 1 } });
  expect(start.status()).toBe(200);
  const { timeoutInSeconds } = (await start.json()) as { timeoutInSeconds: number };
  // The runner gets 20 seconds less than the ten minutes the server keeps the job open.
  expect(timeoutInSeconds).toBeGreaterThan(570);
  expect(timeoutInSeconds).toBeLessThanOrEqual(580);
  expect((await jobOf(jobId)).status).toBe("running");
  const live = await request.post(claimed.mcp.url, { headers: mcpHeaders, data: rpc });
  expect(live.status()).toBe(200);
  // The same key is refused everywhere but the MCP address of the workspace.
  const rest = await request.get("/api/v1/webhooks", { headers: { "x-api-key": claimed.mcp.token } });
  expect(rest.status()).toBe(401);
  const session = await request.get("/api/auth/get-session", { headers: { "x-api-key": claimed.mcp.token } });
  expect(session.status()).toBe(403);

  const at = new Date().toISOString();
  const events = await request.post(`/api/v1/runner/jobs/${jobId}/events`, {
    headers,
    data: { attempt: 1, events: [{ type: "message", at, role: "assistant", text: "Three deals are open." }] },
  });
  expect(events.status()).toBe(200);
  const raw = await request.post(`/api/v1/runner/jobs/${jobId}/events`, {
    headers,
    data: { attempt: 1, events: [{ type: "assistant", message: { content: [] } }] },
  });
  expect(raw.status()).toBe(400);

  const result = await request.post(`/api/v1/runner/jobs/${jobId}/result`, {
    headers,
    data: { attempt: 1, status: "succeeded", summary: "Three deals are open.", inputTokens: 12, outputTokens: 5 },
  });
  expect(result.status()).toBe(200);
  expect(await jobOf(jobId)).toMatchObject({
    status: "succeeded",
    error: null,
    result: { text: "Three deals are open.", reason: "stop", toolCalls: 0 },
    costMicrocents: null,
  });
  const afterEnd = await request.post(claimed.mcp.url, { headers: mcpHeaders, data: rpc });
  expect(afterEnd.status()).toBe(401);
  const late = await request.post(`/api/v1/runner/jobs/${jobId}/result`, {
    headers,
    data: { attempt: 1, status: "failed", error: "late" },
  });
  expect(late.status()).toBe(409);

  const waitingId = randomUUID();
  await insertJob(waitingId, runnerId);
  await page.goto(appPath(workspace.slug, "/settings/agents"));
  await openAgentRuntime(page, "runner");
  const card = page.locator("[data-agent-runner]", { hasText: "Job runner" });
  await runItemAction(page, card.locator("[data-item-actions-trigger]"), messages.revoke);
  await page.getByRole("alertdialog").locator("#confirm-delete").click();
  await expect(card).toHaveAttribute("data-status", "revoked");
  expect(await jobOf(waitingId)).toMatchObject({ status: "cancelled", error: "runnerRevoked" });
  const afterRevoke = await request.post("/api/v1/runner/jobs/claim", { headers, data: { waitSeconds: 0 } });
  expect(afterRevoke.status()).toBe(401);
  expect(errors).toEqual([]);
});

test("the agent runs card names the automation a run belongs to", async ({ page, database, workspace }) => {
  const errors = collectPageErrors(page);
  const ruleId = randomUUID();
  const runId = randomUUID();
  const jobId = randomUUID();
  await database.query(
    `INSERT INTO "AutomationRule" (id,"companyId","ownerUserId",name,enabled,"triggerKind",trigger,effects,"updatedAt")
     VALUES ($1,$2,$3,$4,true,'recordUpdated'::"AutomationTriggerKind",'{}'::jsonb,'[]'::jsonb,NOW())`,
    [ruleId, workspace.companyId, workspace.userId, "Follow up on offers"],
  );
  await database.query(
    `INSERT INTO "AutomationRuleRun" (id,"companyId","ruleId","occurrenceKey","triggerKind","scheduledFor","updatedAt")
     VALUES ($1,$2,$3,$4,'recordUpdated'::"AutomationTriggerKind",NOW(),NOW())`,
    [runId, workspace.companyId, ruleId, `event:${runId}`],
  );
  // A job of an automation carries the id of the run that enqueued it; the rule is found through that run.
  await database.query(
    `INSERT INTO "AgentJob" (id,"companyId",runtime,status,"sourceKind","sourceId","ownerUserId",prompt,"finishedAt","updatedAt")
     VALUES ($1,$2,'runner','succeeded','automation',$3,$4,$5,NOW(),NOW())`,
    [jobId, workspace.companyId, runId, workspace.userId, "Summarise the open deals"],
  );

  await page.goto(appPath(workspace.slug, "/settings/agents"));
  const run = page.locator(`#agent-runs [data-agent-run="${jobId}"]`);
  await expect(run).toHaveAttribute("data-status", "succeeded");
  await expect(run.locator(`[data-agent-run-rule="${ruleId}"]`)).toHaveText("Follow up on offers");
  expect(errors).toEqual([]);
});

test("the page lists only the runners of its own workspace", async ({ page, database, workspace }) => {
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  const insertRunner = (companyId: string, userId: string, name: string, seen: boolean) =>
    database.query(
      'INSERT INTO "AgentRunner" (id,"companyId",name,"tokenHash","createdById","lastSeenAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',
      [randomUUID(), companyId, name, randomUUID().replaceAll("-", ""), userId, seen ? new Date() : null],
    );
  await insertRunner(workspace.companyId, workspace.userId, "Browser runner", true);
  await insertRunner(second.companyId, second.userId, "Bergmann runner", false);

  await page.goto(appPath(workspace.slug, "/settings/agents"));
  await openAgentRuntime(page, "runner");
  await expect(page.locator("[data-agent-runner]", { hasText: "Browser runner" })).toHaveAttribute(
    "data-status",
    "online",
  );
  await expect(page.getByText("Bergmann runner", { exact: true })).toHaveCount(0);

  await page.goto(appPath(second.slug, "/settings/agents"));
  await openAgentRuntime(page, "runner");
  await expect(page.locator("[data-agent-runner]", { hasText: "Bergmann runner" })).toHaveAttribute(
    "data-status",
    "neverSeen",
  );
  await expect(page.getByText("Browser runner", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
