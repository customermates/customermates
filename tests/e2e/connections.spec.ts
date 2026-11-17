import { randomUUID } from "node:crypto";

import {
  notificationUnsubscribeSecret,
  signNotificationUnsubscribe,
} from "../../features/notifications/notification-unsubscribe-token";
import { companyPath, companyUrlPattern } from "./app-paths";
import { collectPageErrors, expect, test } from "./fixtures";
import { secondUser } from "./second-user";
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

test("Connections opens each tab and keeps it in the address", async ({ page, companyId }) => {
  const errors = collectPageErrors(page);
  await page.goto(companyPath(companyId, "/settings/connections"));
  await page.waitForLoadState("networkidle");
  const tabs = page.getByRole("tablist", { name: "Connection types" });
  await expect(tabs.getByRole("tab")).toHaveText(["Channels", "Apps", "Agents", "Developers"]);

  await test.step("Channels holds the connected accounts, or explains why it cannot on self-hosted", async () => {
    await expect(tabs.getByRole("tab", { name: "Channels" })).toHaveAttribute("data-state", "active");
    if (e2eAppMode() === "self-hosted") {
      await expect(page.getByText("Channels need Customermates Cloud")).toBeVisible();
      return;
    }
    await expect(page.getByRole("tablist", { name: "Channel sections" })).toHaveCount(0);
    await expect(page.locator("[data-connection-scope='accounts']")).toBeAttached();
  });

  await test.step("Apps says no app is connected yet and names its owner and scope", async () => {
    await tabs.getByRole("tab", { name: "Apps" }).click();
    await expect(page).toHaveURL(companyUrlPattern(companyId, "/settings/connections\\?tab=apps$"));
    await expect(page.getByText("No apps connected yet")).toBeVisible();
    await expect(page.locator("[data-connection-scope='apps']")).toContainText("Owner: this workspace");
  });

  await test.step("Agents holds the runtimes, provider keys, runners and recent runs", async () => {
    await tabs.getByRole("tab", { name: "Agents" }).click();
    await expect(page).toHaveURL(companyUrlPattern(companyId, "/settings/connections\\?tab=agents$"));
    await expect(page.locator("[data-connection-tab='agents']")).toBeVisible();
    await expect(page.locator("[data-connection-scope='agents']")).toContainText("Owner: this workspace");
  });

  await test.step("Developers holds the keys, webhooks, deliveries and incoming webhooks as sections", async () => {
    await tabs.getByRole("tab", { name: "Developers" }).click();
    await expect(page).toHaveURL(companyUrlPattern(companyId, "/settings/connections\\?tab=developers$"));
    const sections = page.getByRole("tablist", { name: "Developer sections" });
    await expect(sections.getByRole("tab")).toHaveText([
      "API keys & connectors",
      "Webhooks",
      "Webhook log",
      "Incoming webhooks",
    ]);
    await expect(page.locator("[data-connection-scope='keys']")).toContainText("Owner: this workspace");

    for (const [name, section, scope] of [
      ["Webhooks", "webhooks", "webhooks"],
      ["Webhook log", "deliveries", "deliveries"],
      ["Incoming webhooks", "incoming", "incoming"],
    ] as const) {
      await sections.getByRole("tab", { name, exact: true }).click();
      await expect(page).toHaveURL(
        companyUrlPattern(companyId, `/settings/connections\\?tab=developers&section=${section}$`),
      );
      await expect(page.locator(`[data-connection-scope='${scope}']`)).toBeAttached();
    }
  });

  expect(errors).toEqual([]);
});

test("the old settings routes open the tab that now holds them and keep their query", async ({ page, companyId }) => {
  const errors = collectPageErrors(page);

  for (const [old, expected] of [
    ["channels", "tab=channels"],
    ["agents", "tab=agents"],
    ["api-keys", "tab=developers"],
    ["webhooks", "tab=developers&section=webhooks"],
    ["webhook-deliveries", "tab=developers&section=deliveries"],
    ["incoming-webhooks", "tab=developers&section=incoming"],
  ] as const) {
    await page.goto(companyPath(companyId, `/settings/${old}`));
    await expect(page, old).toHaveURL(companyUrlPattern(companyId, `/settings/connections\\?${expected}$`));
  }

  await page.goto(companyPath(companyId, "/settings/webhook-deliveries?search=hello"));
  await expect(page).toHaveURL(
    companyUrlPattern(companyId, "/settings/connections\\?tab=developers&section=deliveries&"),
  );
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

test("a member without API access opens Connections and is offered only the tabs the role allows", async ({
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
    await member.page.goto(companyPath(companyId, "/settings/connections"));
    await member.page.waitForLoadState("networkidle");
    await expect(member.page.locator("[data-connections-page]")).toBeVisible();
    const tabs = member.page.getByRole("tablist", { name: "Connection types" });

    await test.step("the Developers tab, which needs API access, is not offered", async () => {
      await expect(tabs.getByRole("tab", { name: "Apps" })).toBeVisible();
      await expect(tabs.getByRole("tab", { name: "Developers" })).toHaveCount(0);
      await expect(member.page.getByRole("tablist", { name: "Developer sections" })).toHaveCount(0);
    });

    await test.step("asking for it by address opens a tab the role allows instead of an error page", async () => {
      await member.page.goto(companyPath(companyId, "/settings/connections?tab=developers&section=webhooks"));
      await member.page.waitForLoadState("networkidle");
      await expect(member.page.locator("[data-connections-page]")).toBeVisible();
      await expect(member.page.locator("[data-connection-scope='keys']")).toHaveCount(0);
      await expect(member.page.locator("[data-connection-scope='webhooks']")).toHaveCount(0);
      await expect(tabs.getByRole("tab", { selected: true })).not.toHaveText("Developers");
    });

    await test.step("every tab that is offered opens, also Agents, whose runner list needs API access", async () => {
      for (const tab of await tabs.getByRole("tab").all()) {
        await tab.click();
        await expect(tab).toHaveAttribute("data-state", "active");
        await member.page.waitForLoadState("networkidle");
        await expect(member.page.locator("[data-connections-page]")).toBeVisible();
      }
    });

    expect(member.errors).toEqual([]);
  } finally {
    await member.close();
  }
});
