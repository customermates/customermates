import type { Locator } from "@playwright/test";

import { DEMO_COMPANY_ID, expect, settle, test } from "./demo-seed";

/** The seeded workspace beyond records: webhooks and deliveries, the inbox, the Knowledge Base and routines. */
const HEALTHY_URL = "https://erp-bridge.northwind-labs.example/hooks/crm";
const PAUSED_URL = "https://oncall.northwind-labs.example/hooks/tickets";

test("webhooks show the healthy ERP bridge with successful deliveries and the paused on-call hook with failures", async ({
  page,
  database,
  errors,
}) => {
  const { rows: hooks } = await database.query<{ url: string; description: string; enabled: boolean }>(
    `SELECT url, description, enabled FROM "Webhook" WHERE "companyId"=$1 ORDER BY url`,
    [DEMO_COMPANY_ID],
  );
  expect(hooks.map(({ url, enabled }) => [url, enabled])).toEqual([
    [HEALTHY_URL, true],
    [PAUSED_URL, false],
  ]);
  const { rows: deliveries } = await database.query<{ url: string; status: string; count: number }>(
    `SELECT url, status::text, count(*)::int AS count FROM "WebhookDelivery" WHERE "companyId"=$1
     GROUP BY url, status ORDER BY url, status`,
    [DEMO_COMPANY_ID],
  );
  expect(deliveries).toEqual([
    { url: HEALTHY_URL, status: "success", count: 18 },
    { url: PAUSED_URL, status: "failed", count: 8 },
  ]);

  await page.goto("/en/settings/webhooks");
  const healthy = page.getByRole("row").filter({ hasText: HEALTHY_URL });
  const paused = page.getByRole("row").filter({ hasText: PAUSED_URL });
  await expect(healthy).toContainText("Send deal and subscription changes to the ERP bridge");
  await expect(healthy).toContainText("Enabled");
  // The pause reason is part of the description: the receiver is down, so the hook is switched off.
  await expect(paused).toContainText("Ticket alerts for the on-call tool (paused while the receiver is down)");
  await expect(paused).toContainText(/Disabled|Paused/);

  // Let the page finish loading its lazy chunks before leaving it.
  await settle(page);
  await page.goto("/en/settings/webhook-deliveries");
  const rows = page.getByRole("row");
  await expect(rows.filter({ hasText: HEALTHY_URL }).first()).toBeVisible();
  await expect(rows.filter({ hasText: PAUSED_URL }).first()).toBeVisible();
  for (const row of await rows.filter({ hasText: HEALTHY_URL }).all()) {
    await expect(row).toContainText("Delivered");
    await expect(row.getByRole("cell").filter({ hasText: /^200$/ })).toHaveCount(1);
  }
  for (const row of await rows.filter({ hasText: PAUSED_URL }).all()) {
    await expect(row).toContainText("Failed");
    await expect(row.getByRole("cell").filter({ hasText: /^(404|500|502|503|504)$/ })).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test("inbox threads are listed and linked to their deals, tickets and candidates", async ({
  page,
  database,
  errors,
}) => {
  const { rows: threads } = await database.query<{ id: string; title: string }>(
    `SELECT id, coalesce(nullif(subject, ''), name) AS title FROM "MessagingThread" WHERE "companyId"=$1
     ORDER BY "lastMessageAt" DESC NULLS LAST LIMIT 5`,
    [DEMO_COMPANY_ID],
  );
  await page.goto("/en/inbox");
  for (const thread of threads) await expect(page.getByText(thread.title, { exact: true }).first()).toBeVisible();

  const { rows: links } = await database.query<{ threadId: string; list: string; record: string }>(
    `SELECT l."threadId", t.label AS list, v."textValue" AS record FROM "MessagingThreadRecordLink" l
     JOIN "RecordTypeDefinition" t ON t."companyId"=l."companyId" AND t.id=l."typeId"
     JOIN "RecordValue" v ON v."companyId"=l."companyId" AND v."typeId"=l."typeId" AND v."recordId"=l."recordId"
       AND v."fieldId"=t.definition->>'primaryFieldId'
     WHERE l."companyId"=$1 ORDER BY l."threadId", t.label`,
    [DEMO_COMPANY_ID],
  );
  expect([...new Set(links.map(({ list }) => list))].sort()).toEqual(["Candidate", "Deal", "Ticket"]);
  for (const threadId of [...new Set(links.map((link) => link.threadId))]) {
    await settle(page);
    await page.goto(`/en/inbox?threadId=${threadId}`);
    const settings = page
      .getByRole("button", { name: "Thread settings", exact: true })
      .and(page.locator('[data-slot="badge"]'));
    await expect(settings).toBeVisible();
    const dialog = page.getByRole("dialog", { name: "Thread settings", exact: true });
    await expect(async () => {
      if (!(await dialog.isVisible())) await settings.click();
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass();
    for (const link of links.filter((candidate) => candidate.threadId === threadId)) {
      await expect(dialog.getByRole("button", { name: `Open record: ${link.record}`, exact: true })).toBeVisible();
      await expect(dialog).toContainText(link.record);
    }
    await page.keyboard.press("Escape");
  }
  // Email bodies render in a sandboxed frame without scripts; Chromium reports that block, which is expected.
  expect(errors.filter((error) => !error.startsWith("Blocked script execution in 'about:srcdoc'"))).toEqual([]);
});

async function emailBodyColors(frame: Locator) {
  return frame.contentFrame().locator("body").evaluate((body) => {
    const luminance = (color: string) => {
      const [red = 0, green = 0, blue = 0] = (color.match(/[\d.]+/g) ?? []).map(Number);
      return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    };
    const style = getComputedStyle(body);
    const painted = [style.backgroundColor, getComputedStyle(body.ownerDocument.documentElement).backgroundColor].find(
      (color) => !/^rgba\(.*,\s*0\)$|^transparent$/.test(color),
    );
    return { background: luminance(painted ?? ""), text: luminance(style.color) };
  });
}

test("email bodies follow the app theme, adaptive emails switch, and other external HTML stays on paper", async ({
  page,
  database,
  errors,
}, testInfo) => {
  const { rows: threads } = await database.query<{ id: string; subject: string }>(
    `SELECT id, subject FROM "MessagingThread" WHERE "companyId"=$1 AND subject = ANY($2)`,
    [DEMO_COMPANY_ID, ["Service report baseline", "Order form review: Northwind Field Enterprise"]],
  );
  const threadId = (subject: string) => threads.find((thread) => thread.subject === subject)?.id;
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await settle(page);
    await page.goto(`/en/inbox?threadId=${threadId("Service report baseline")}`);
    const own = page.locator('iframe[data-email-tone="own"]').first();
    const adaptive = page.locator('iframe[data-email-tone="adaptive"]').first();
    await expect(own).toBeVisible();
    await expect(adaptive).toBeVisible();
    await expect(adaptive.contentFrame().getByText("Service journey baseline")).toBeVisible();
    await expect(own).toHaveCSS("color-scheme", scheme);
    await expect.poll(async () => (await emailBodyColors(own)).background > 0.5).toBe(scheme === "light");
    const ownColors = await emailBodyColors(own);
    const adaptiveColors = await emailBodyColors(adaptive);
    if (scheme === "dark") {
      expect(ownColors.background).toBeLessThan(0.2);
      expect(ownColors.text).toBeGreaterThan(0.8);
      expect(adaptiveColors.background).toBeLessThan(0.2);
      expect(adaptiveColors.text).toBeGreaterThan(0.8);
    } else {
      expect(ownColors.background).toBeGreaterThan(0.9);
      expect(adaptiveColors.background).toBeGreaterThan(0.9);
    }
    const ownHeight = await own.evaluate((frame) => frame.getBoundingClientRect().height);
    const ownContent = await own.contentFrame().locator("body").evaluate((body) => body.scrollHeight);
    expect(ownHeight).toBeGreaterThanOrEqual(ownContent);
    await adaptive.scrollIntoViewIfNeeded();
    await settle(page);
    await page.screenshot({ path: testInfo.outputPath(`email-thread-${scheme}.png`), animations: "disabled" });

    await page.goto(`/en/inbox?threadId=${threadId("Order form review: Northwind Field Enterprise")}`);
    const paper = page.locator('iframe[data-email-tone="paper"]').first();
    await expect(paper.contentFrame().getByText("Signature complete")).toBeVisible();
    await expect(paper).toHaveCSS("color-scheme", "light");
    expect((await emailBodyColors(paper)).background).toBeGreaterThan(0.9);
    await paper.scrollIntoViewIfNeeded();
    await settle(page);
    await page.screenshot({ path: testInfo.outputPath(`email-paper-${scheme}.png`), animations: "disabled" });
  }
  await page.emulateMedia({ colorScheme: "light" });
  expect(errors.filter((error) => !error.startsWith("Blocked script execution in 'about:srcdoc'"))).toEqual([]);
});

test("the Knowledge Base lists the Operating Guide and the procedures, and a procedure opens", async ({
  page,
  database,
  errors,
}, testInfo) => {
  const { rows: pages } = await database.query<{ id: string; title: string; kind: string }>(
    `SELECT id, title, kind::text FROM "WikiPage" WHERE "companyId"=$1 ORDER BY "sortOrder"`,
    [DEMO_COMPANY_ID],
  );
  expect(pages.length).toBe(15);
  expect(pages.filter(({ kind }) => kind === "guide").map(({ title }) => title)).toEqual(["Operating Guide"]);
  const procedures = pages.filter(({ kind }) => kind === "procedure");
  expect(procedures.length).toBe(8);

  const procedure = procedures.find(({ title }) => title === "Support SLA and Escalation") ?? procedures[0];
  if (testInfo.project.use.isMobile) {
    await page.goto("/en/wiki");
    await page.locator("#wiki-document-panel button[aria-expanded]").first().click();
    const sheet = page.getByRole("dialog", { name: "Knowledge Base pages" });
    await expect(sheet).toHaveAttribute("data-vaul-drawer-direction", "left");
    await expect.poll(async () => Math.round((await sheet.boundingBox())?.x ?? -1)).toBe(0);
    await expect
      .poll(async () => (await sheet.boundingBox())?.height ?? 0)
      .toBeGreaterThan((page.viewportSize()?.height ?? 0) * 0.9);
    await sheet.getByText(procedure.title, { exact: true }).first().click();
    await expect(sheet).not.toBeVisible();
  } else {
    await page.goto("/en/wiki");
    const list = page
      .getByRole("navigation", { name: "Knowledge Base pages" })
      .or(page.getByLabel("Knowledge Base pages"));
    for (const { title } of pages) await expect(list.getByText(title, { exact: true }).first()).toBeVisible();
    await list.getByText(procedure.title, { exact: true }).first().click();
  }
  await expect(page).toHaveURL(new RegExp(`[?&]page=${procedure.id}`));
  await expect(page.getByRole("textbox", { name: "Page title", exact: true })).toHaveValue(procedure.title);
  await expect(page.getByRole("combobox", { name: "Page type" })).toHaveText("Procedure");
  await expect(page.getByRole("textbox", { name: /When to use/ })).not.toHaveValue("");
  await expect(page.getByRole("heading", { name: "Priorities and response times" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("routines are listed with their owners and triggers", async ({ page, database, errors }) => {
  const { rows: routines } = await database.query<{
    name: string;
    trigger: string;
    cron: string | null;
    enabled: boolean;
  }>(
    `SELECT name, "triggerKind"::text AS trigger, "cronExpression" AS cron, enabled FROM "Routine"
     WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY name`,
    [DEMO_COMPANY_ID],
  );
  expect(routines.length).toBeGreaterThanOrEqual(10);
  expect(new Set(routines.map(({ trigger }) => trigger))).toEqual(new Set(["event", "schedule"]));
  await page.goto("/en/routines");
  for (const routine of routines) {
    const row = page.getByRole("row").filter({ has: page.getByText(routine.name, { exact: true }) });
    await expect(row, routine.name).toBeVisible();
    if (routine.trigger === "event") await expect(row).toContainText("When something changes");
    else {
      // Schedules read in words, for example "Weekdays at 08:00 AM" or "Every Monday at 07:00 AM", never as cron.
      await expect(row).toContainText(/(Every|Weekdays|Weekends|Daily)\b.* at \d{1,2}:\d{2}/);
      if (routine.cron) await expect(row).not.toContainText(routine.cron);
    }
    await expect(row).toContainText(routine.enabled ? "Active" : "Paused");
  }
  expect(errors).toEqual([]);
});
