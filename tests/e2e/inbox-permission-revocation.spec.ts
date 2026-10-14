import { randomUUID } from "node:crypto";
import { collectPageErrors, expect, test } from "./fixtures";

test("losing Inbox permission leaves the thread private without generic background toasts", async ({
  page,
  database,
  workspace,
  diagnostics,
}) => {
  const errors = collectPageErrors(page);
  const accountId = randomUUID();
  const threadId = randomUUID();
  const roleId = randomUUID();
  await database.query('UPDATE "User" SET "displayLanguage"=$1 WHERE id=$2', ["de", workspace.userId]);
  await database.query(
    'INSERT INTO "ConnectedAccount"(id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","emailAddress","updatedAt") VALUES($1,$2,$3,$4,\'google\',\'ok\',true,\'owned@synthetic.test\',now())',
    [accountId, workspace.companyId, workspace.userId, `e2e_local_${accountId}`],
  );
  await database.query(
    'INSERT INTO "MessagingThread"(id,"companyId","connectedAccountId","unipileThreadId",provider,subject,"lastMessageAt","updatedAt") VALUES($1,$2,$3,$4,\'google\',\'Local permission thread\',now(),now())',
    [threadId, workspace.companyId, accountId, `e2e_local_${threadId}`],
  );
  await database.query('INSERT INTO "UserRole"(id,name,"companyId","updatedAt") VALUES($1,$2,$3,now())', [
    roleId,
    "No Inbox",
    workspace.companyId,
  ]);
  diagnostics.expect({
    kind: "console",
    text: /Failed to load resource|Forbidden|An error occurred/i,
    page,
    limit: 20,
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.addInitScript(() => {
    (window as Window & { inboxToasts?: string[] }).inboxToasts = [];
    document.addEventListener("DOMContentLoaded", () => {
      new MutationObserver(() => {
        for (const toast of document.querySelectorAll("[data-sonner-toast]")) {
          const message = toast.textContent;
          const messages = (window as Window & { inboxToasts?: string[] }).inboxToasts ?? [];
          if (message && !messages.includes(message)) messages.push(message);
        }
      }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    });
  });
  await page.goto(`/de/inbox?threadId=${threadId}`);
  await page
    .getByRole("button", { name: /Thread-Einstellungen|Konversationseinstellungen|Einstellungen/i })
    .last()
    .click();
  const shared = page.locator("#thread-shared");
  await expect(shared).toBeVisible();
  await page.evaluate(() => ((window as Window & { inboxToasts?: string[] }).inboxToasts = []));
  await database.query('UPDATE "User" SET "roleId"=$1 WHERE id=$2', [roleId, workspace.userId]);
  await shared.click();
  await expect
    .poll(() => page.evaluate(() => (window as Window & { inboxToasts?: string[] }).inboxToasts ?? []))
    .toContain(
      "Deine Posteingang-Berechtigung hat sich geändert. Du kannst die Sichtbarkeit dieser Konversation nicht mehr ändern.",
    );
  await page.waitForLoadState("networkidle");
  const toasts = await page.evaluate(() => (window as Window & { inboxToasts?: string[] }).inboxToasts ?? []);
  expect(toasts.some((message) => /unerwarteter Fehler|Etwas ist schiefgelaufen/i.test(message))).toBe(false);
  const state = await database.query('SELECT "sharedToCrm" FROM "MessagingThread" WHERE id=$1', [threadId]);
  expect(state.rows[0]?.sharedToCrm).toBe(false);
  expect(errors).toEqual([]);
});
