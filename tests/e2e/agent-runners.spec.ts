import { createHash, randomUUID } from "node:crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { appPath } from "./app-paths";
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
  await expect(page.getByRole("heading", { name: messages.title, level: 2 })).toBeVisible();
  await expect(page.getByText(messages.description, { exact: true })).toBeVisible();

  await clickHydrated(page.locator("#agent-runners-add"));
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(messages.addTitle);
  await dialog.locator("#agent-runner-name").fill("Office laptop");
  await dialog.locator("#agent-runner-save").click();

  await expect(dialog.getByText(messages.tokenCreated, { exact: true })).toBeVisible();
  const token = await dialog.locator("#agent-runner-token").getAttribute("data-value");
  expect(token).toMatch(/^cmr_[A-Za-z0-9_-]{43}$/u);
  await expect(dialog.locator("#agent-runner-npx")).toHaveAttribute(
    "data-value",
    new RegExp(`^npx customermates-runner --token ${token} --url https?://`, "u"),
  );
  await expect(dialog.locator("#agent-runner-docker")).toHaveAttribute(
    "data-value",
    new RegExp(`CUSTOMERMATES_RUNNER_TOKEN=${token} `, "u"),
  );

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

  await page.reload();
  const online = page.locator("[data-agent-runner]", { hasText: "Office laptop" });
  await expect(online).toHaveAttribute("data-status", "online");
  await expect(online).toContainText(messages.status.online);
  await expect(online).toContainText("e2e-host");
  await expect(online).toContainText(`${messages.clientNames.claude} 2.1.318`);

  await online.getByRole("button", { name: messages.revoke, exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(messages.revokeTitle);
  await expect(confirm).toContainText("Office laptop");
  await confirm.locator("#confirm-delete").click();

  const revoked = page.locator("[data-agent-runner]", { hasText: "Office laptop" });
  await expect(revoked).toHaveAttribute("data-status", "revoked");
  await expect(revoked.getByRole("button", { name: messages.revoke, exact: true })).toHaveCount(0);
  const afterRevoke = await request.post("/api/v1/runner/heartbeat", { headers, data: { clients: [] } });
  expect(afterRevoke.status()).toBe(401);
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
  await expect(page.locator("[data-agent-runner]", { hasText: "Browser runner" })).toHaveAttribute(
    "data-status",
    "online",
  );
  await expect(page.getByText("Bergmann runner", { exact: true })).toHaveCount(0);

  await page.goto(appPath(second.slug, "/settings/agents"));
  await expect(page.locator("[data-agent-runner]", { hasText: "Bergmann runner" })).toHaveAttribute(
    "data-status",
    "neverSeen",
  );
  await expect(page.getByText("Browser runner", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
