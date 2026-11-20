import { randomUUID } from "node:crypto";

import {
  notificationUnsubscribeSecret,
  signNotificationUnsubscribe,
} from "../../features/notifications/notification-unsubscribe-token";
import { companyPath, companyUrlPattern } from "./app-paths";
import { collectPageErrors, expect, test } from "./fixtures";
import { secondUser } from "./second-user";
import { openSidebar } from "./sidebar";
import { e2eAppMode } from "./workspace-switching";

type Kind = "dueToday" | "replyReceived" | "ruleAlert";

const DAY_MS = 24 * 60 * 60 * 1000;
// The page text always carries every translation, so the form itself tells whether the confirmation is offered.
const CONFIRMATION_FORM = 'action="/api/notifications/unsubscribe"';

function unsubscribePath(companyId: string, userId: string, kind: Kind, issuedAt = new Date()) {
  const secret = notificationUnsubscribeSecret(process.env.BETTER_AUTH_SECRET);
  if (!secret) throw new Error("A local authentication secret is required");
  const token = signNotificationUnsubscribe(secret, { userId, companyId, kind }, issuedAt);
  return `/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
}

test("Agents and Incoming webhooks open as their own settings pages from the area nav", async ({ page, companyId }) => {
  const errors = collectPageErrors(page);
  await page.goto(companyPath(companyId, "/settings/profile"));
  await page.waitForLoadState("networkidle");

  await test.step("Agents holds the runtimes, provider keys, runners and recent runs", async () => {
    await openSidebar(page);
    await page.locator("#nav-settings-agents").click();
    await expect(page).toHaveURL(companyUrlPattern(companyId, "/settings/agents$"));
    // A fresh workspace has no runner: the card says so instead of ending under its heading.
    await expect(page.locator("[data-agent-runners-card] [data-agent-runners-empty]")).toHaveText(
      "You have no runner yet. Add one to run agent steps with your own CLI.",
    );
    await expect(page.locator('[data-slot="segmented-control-list"]')).toHaveCount(0);
    await openSidebar(page);
    await expect(page.locator("#nav-settings-agents")).toHaveAttribute("data-active", "true");
  });

  await test.step("Incoming webhooks holds its list between Webhooks and the Webhook log", async () => {
    await page.locator("#nav-settings-incoming-webhooks").click();
    await expect(page).toHaveURL(companyUrlPattern(companyId, "/settings/incoming-webhooks$"));
    await expect(page.locator("#incoming-webhooks")).toBeAttached();
    await openSidebar(page);
    await expect(page.locator("#nav-settings-incoming-webhooks")).toHaveAttribute("data-active", "true");
    await expect(page.locator("#nav-settings-webhooks")).toHaveAttribute("data-active", "false");
    await expect(page.locator("#nav-settings-agents")).toHaveAttribute("data-active", "false");
  });

  expect(errors).toEqual([]);
});

test("each settings page keeps its own address and its query", async ({ page, companyId }) => {
  const errors = collectPageErrors(page);
  const pages = ["agents", "api-keys", "webhooks", "webhook-deliveries", "incoming-webhooks"];

  for (const slug of e2eAppMode() === "self-hosted" ? pages : ["channels", ...pages]) {
    await page.goto(companyPath(companyId, `/settings/${slug}`));
    await expect(page, slug).toHaveURL(companyUrlPattern(companyId, `/settings/${slug}$`));
  }

  await page.goto(companyPath(companyId, "/settings/webhook-deliveries?search=hello"));
  await expect(page).toHaveURL(companyUrlPattern(companyId, "/settings/webhook-deliveries\\?"));
  expect(new URL(page.url()).searchParams.get("search")).toBe("hello");
  expect(errors).toEqual([]);
});

test("a turn-off link from a notification email asks first, then switches that kind off without a session", async ({
  page,
  database,
  workspace,
  playwright,
  baseURL,
}) => {
  const errors = collectPageErrors(page);
  const modeOf = async (kind: Kind) =>
    (
      await database.query<{ mode: string }>(
        'SELECT "emailMode" AS mode FROM "NotificationPreference" WHERE "companyId"=$1 AND "userId"=$2 AND kind=$3',
        [workspace.companyId, workspace.userId, kind],
      )
    ).rows[0]?.mode;
  const link = unsubscribePath(workspace.companyId, workspace.userId, "ruleAlert");

  await test.step("following the link, as a mail scanner does, changes nothing and leads to a confirmation page", async () => {
    const anonymous = await playwright.request.newContext({ baseURL });
    const first = await anonymous.get(link, { maxRedirects: 0 });
    expect(first.status()).toBe(303);
    const location = new URL(first.headers().location ?? "", "http://localhost");
    expect(location.pathname).toMatch(/\/notification-emails\/turn-off$/);
    const token = location.searchParams.get("token") ?? "";
    expect(link).toContain(encodeURIComponent(token));
    expect(await modeOf("ruleAlert")).toBeUndefined();

    const confirmation = await anonymous.get(`${location.pathname}${location.search}`);
    expect(confirmation.status()).toBe(200);
    expect(await confirmation.text()).toContain(CONFIRMATION_FORM);
    expect(await modeOf("ruleAlert")).toBeUndefined();

    await test.step("confirming works without a signed-in browser and shows a result page that names whose emails are off", async () => {
      const confirmed = await anonymous.post("/api/notifications/unsubscribe", { form: { token }, maxRedirects: 0 });
      expect(confirmed.status()).toBe(303);
      const target = new URL(confirmed.headers().location ?? "", "http://localhost");
      expect(target.pathname).toMatch(/\/notification-emails\/turn-off$/);
      expect(target.searchParams.get("token")).toBe(token);
      expect(await modeOf("ruleAlert")).toBe("off");
      expect(await modeOf("dueToday")).toBeUndefined();

      const result = await anonymous.get(`${target.pathname}${target.search}`, { maxRedirects: 0 });
      expect(result.status()).toBe(200);
      const resultText = await result.text();
      expect(resultText).toContain("These emails are turned off");
      expect(resultText).toContain("•••@");
      expect(resultText).not.toContain(CONFIRMATION_FORM);

      const again = await anonymous.post("/api/notifications/unsubscribe", { form: { token }, maxRedirects: 0 });
      expect(again.status()).toBe(303);
      expect(await modeOf("ruleAlert")).toBe("off");
    });
    await anonymous.dispose();
  });

  await test.step("a wrong, altered or expired link leads to a page that says so and changes nothing", async () => {
    const refused = async (path: string, title: string) => {
      const first = await page.request.get(path, { maxRedirects: 0 });
      expect(first.status()).toBe(303);
      expect(new URL(first.headers().location ?? "", "http://localhost").pathname).toMatch(
        /\/notification-emails\/turn-off$/,
      );
      const shown = await page.request.get(path);
      expect(shown.status()).toBe(200);
      const text = await shown.text();
      expect(text).toContain(title);
      expect(text).not.toContain(CONFIRMATION_FORM);
    };
    await refused("/api/notifications/unsubscribe?token=wrong", "This link is not valid");
    await refused("/api/notifications/unsubscribe", "This link is not valid");
    const altered = unsubscribePath(workspace.companyId, workspace.userId, "dueToday").replace("dueToday", "ruleAlert");
    await refused(altered, "This link is not valid");
    const expired = unsubscribePath(
      workspace.companyId,
      workspace.userId,
      "replyReceived",
      new Date(Date.now() - 31 * DAY_MS),
    );
    await refused(expired, "This link has expired");
    const wrongConfirmation = await page.request.post("/api/notifications/unsubscribe", {
      form: { token: "wrong" },
      maxRedirects: 0,
    });
    expect(wrongConfirmation.status()).toBe(303);
    const wrongPage = await page.request.get("/en/notification-emails/turn-off?token=wrong");
    expect(await wrongPage.text()).not.toContain(CONFIRMATION_FORM);
    expect(await modeOf("replyReceived")).toBeUndefined();
    expect(await modeOf("dueToday")).toBeUndefined();
  });

  await test.step("opened in the signed-in browser, it asks, then shows a note and the row has changed", async () => {
    await database.query('DELETE FROM "NotificationPreference" WHERE "companyId"=$1 AND "userId"=$2', [
      workspace.companyId,
      workspace.userId,
    ]);
    await page.goto(unsubscribePath(workspace.companyId, workspace.userId, "ruleAlert"));
    await expect(page.getByRole("heading", { name: "Turn off these emails?" })).toBeVisible();
    await expect(page.getByText(/•••@\S+ will no longer get emails for “Automation alerts” from /)).toBeVisible();
    expect(await modeOf("ruleAlert")).toBeUndefined();
    await page.getByRole("button", { name: "Turn off emails" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(companyUrlPattern(workspace.companyId, "/settings/profile$"));
    await expect(page.getByText("Emails for “Automation alerts” are turned off.")).toBeVisible();
    await expect(
      page.locator('[data-notification-kind="ruleAlert"] [role="tab"][data-state="active"]'),
    ).toHaveText("No email");
    await expect(
      page.locator('[data-notification-kind="dueToday"] [role="tab"][data-state="active"]'),
    ).toHaveText("Daily digest");
    expect(await modeOf("ruleAlert")).toBe("off");
  });

  expect(errors).toEqual([]);
});

test("a member without API access is offered Agents but none of the pages that need API access", async ({
  page,
  browser,
  database,
  companyId,
}, testInfo) => {
  const model = await page.request.post("/api/v1/model/read", { data: {} });
  const { revision } = (await model.json()) as { revision: number };
  const saved = await page.request.post("/api/v1/roles/save", {
    data: {
      name: `Automations only ${randomUUID().slice(0, 6)}`,
      description: "Routines and automations, no API access, no workspace settings",
      permissions: [
        { resource: "routines", actions: ["readAll", "create", "update", "delete"] },
        { resource: "api", actions: [] },
        { resource: "company", actions: [] },
      ],
      recordGrants: [],
      expectedRevision: revision,
      idempotencyKey: randomUUID(),
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  const roleId = ((await saved.json()) as { role: { id: string } }).role.id;
  const member = await secondUser(browser, database, companyId, testInfo, roleId);
  try {
    const apiPages = ["api-keys", "webhooks", "incoming-webhooks", "webhook-deliveries"];
    await member.page.goto(companyPath(companyId, "/settings/profile"));
    await member.page.waitForLoadState("networkidle");
    await openSidebar(member.page);

    await test.step("the pages that need API access are not listed", async () => {
      await expect(member.page.locator("#nav-settings-agents")).toBeVisible();
      for (const slug of apiPages) await expect(member.page.locator(`#nav-settings-${slug}`), slug).toHaveCount(0);
    });

    await test.step("asking for one by address leads away from it instead of to an error page", async () => {
      for (const slug of apiPages) {
        await member.page.goto(companyPath(companyId, `/settings/${slug}`));
        await member.page.waitForLoadState("networkidle");
        await expect(member.page, slug).not.toHaveURL(/\/settings\//);
      }
    });

    await test.step("Agents opens, and its runners card says that the role may not see runners", async () => {
      await member.page.goto(companyPath(companyId, "/settings/agents"));
      await expect(member.page).toHaveURL(companyUrlPattern(companyId, "/settings/agents$"));
      await expect(member.page.locator("[data-agent-runners-card] [data-agent-runners-withheld]")).toHaveText(
        "Your role cannot see runners, so none are listed here.",
      );
      await expect(member.page.locator("[data-agent-runners-empty]")).toHaveCount(0);
    });

    expect(member.errors).toEqual([]);
  } finally {
    await member.close();
  }
});
