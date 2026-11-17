import {
  notificationUnsubscribeSecret,
  signNotificationUnsubscribe,
} from "../../features/notifications/notification-unsubscribe-token";
import { companyPath, companyUrlPattern } from "./app-paths";
import { collectPageErrors, expect, test } from "./fixtures";
import { e2eAppMode } from "./workspace-switching";

type Kind = "dueToday" | "replyReceived" | "ruleAlert";

const DAY_MS = 24 * 60 * 60 * 1000;

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

  await test.step("Channels holds the accounts and the booking pages, or explains why it cannot on self-hosted", async () => {
    await expect(tabs.getByRole("tab", { name: "Channels" })).toHaveAttribute("data-state", "active");
    if (e2eAppMode() === "self-hosted") {
      await expect(page.getByText("Channels need Customermates Cloud")).toBeVisible();
      return;
    }
    const sections = page.getByRole("tablist", { name: "Channel sections" });
    await expect(sections.getByRole("tab")).toHaveText(["Channels & calendars", "Booking pages"]);
    await sections.getByRole("tab", { name: "Booking pages" }).click();
    await expect(page).toHaveURL(companyUrlPattern(companyId, "/settings/connections\\?tab=channels&section=booking$"));
    await expect(sections.getByRole("tab", { name: "Booking pages" })).toHaveAttribute("data-state", "active");
  });

  await test.step("Apps says no app is connected yet and names its owner and scope", async () => {
    await tabs.getByRole("tab", { name: "Apps" }).click();
    await expect(page).toHaveURL(companyUrlPattern(companyId, "/settings/connections\\?tab=apps$"));
    await expect(page.getByText("No apps connected yet")).toBeVisible();
    await expect(page.locator("[data-connection-scope='apps']")).toContainText("Owner: this workspace");
  });

  await test.step("Agents links to the agent settings", async () => {
    await tabs.getByRole("tab", { name: "Agents" }).click();
    await expect(page).toHaveURL(companyUrlPattern(companyId, "/settings/connections\\?tab=agents$"));
    await expect(page.getByRole("link", { name: "Open agent settings" })).toHaveAttribute(
      "href",
      /\/settings\/agents$/,
    );
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
      await sections.getByRole("tab", { name }).click();
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
    ["booking", "tab=channels&section=booking"],
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

test("a turn-off link from a notification email switches that kind off without a session", async ({
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

  await test.step("the link works without a signed-in browser and sends the person to Profile & preferences", async () => {
    const anonymous = await playwright.request.newContext({ baseURL });
    const first = await anonymous.get(link, { maxRedirects: 0 });
    expect(first.status()).toBe(303);
    const location = new URL(first.headers().location ?? "", "http://localhost");
    expect(location.pathname).toMatch(/\/settings\/profile$/);
    expect(location.searchParams.get("notice")).toBe("notification-kind-off");
    expect(location.searchParams.get("kind")).toBe("ruleAlert");
    expect(await modeOf("ruleAlert")).toBe("off");
    expect(await modeOf("dueToday")).toBeUndefined();

    const again = await anonymous.get(link, { maxRedirects: 0 });
    expect(again.status()).toBe(303);
    expect(await modeOf("ruleAlert")).toBe("off");
    await anonymous.dispose();
  });

  await test.step("a wrong, altered or expired link is refused and changes nothing", async () => {
    expect((await page.request.get("/api/notifications/unsubscribe?token=wrong")).status()).toBe(400);
    expect((await page.request.get("/api/notifications/unsubscribe")).status()).toBe(400);
    const altered = unsubscribePath(workspace.companyId, workspace.userId, "dueToday").replace("dueToday", "ruleAlert");
    expect((await page.request.get(altered)).status()).toBe(400);
    const expired = unsubscribePath(
      workspace.companyId,
      workspace.userId,
      "replyReceived",
      new Date(Date.now() - 31 * DAY_MS),
    );
    expect((await page.request.get(expired)).status()).toBe(410);
    expect(await modeOf("replyReceived")).toBeUndefined();
    expect(await modeOf("dueToday")).toBeUndefined();
  });

  await test.step("opened in the signed-in browser, it shows a note and the row has changed", async () => {
    await database.query('DELETE FROM "NotificationPreference" WHERE "companyId"=$1 AND "userId"=$2', [
      workspace.companyId,
      workspace.userId,
    ]);
    await page.goto(unsubscribePath(workspace.companyId, workspace.userId, "ruleAlert"));
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
