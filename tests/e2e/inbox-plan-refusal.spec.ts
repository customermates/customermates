import { randomUUID } from "node:crypto";

import { collectPageErrors, expect, test } from "./fixtures";
import { invokesServerAction, serverActionIds } from "./server-actions";

test("a locked German phone Inbox stays quiet and recovers when the subscription resumes", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const accountId = randomUUID();
  const threadId = randomUUID();
  await database.query('UPDATE "User" SET "displayLanguage"=$1,theme=$2 WHERE id=$3', ["de", "dark", workspace.userId]);
  await database.query(
    'INSERT INTO "ConnectedAccount"(id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","emailAddress","updatedAt") VALUES($1,$2,$3,$4,\'google\',\'ok\',true,\'owned@synthetic.test\',now())',
    [accountId, workspace.companyId, workspace.userId, `e2e_local_${accountId}`],
  );
  await database.query(
    'INSERT INTO "MessagingThread"(id,"companyId","connectedAccountId","unipileThreadId",provider,subject,"lastMessageAt","updatedAt") VALUES($1,$2,$3,$4,\'google\',\'Private subscription thread\',now(),now())',
    [threadId, workspace.companyId, accountId, `e2e_local_${threadId}`],
  );
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    (window as Window & { inboxToasts?: string[] }).inboxToasts = [];
    document.addEventListener("DOMContentLoaded", () => {
      new MutationObserver(() => {
        for (const toast of document.querySelectorAll("[data-sonner-toast]")) {
          const message = toast.textContent;
          const messages = (window as Window & { inboxToasts?: string[] }).inboxToasts ?? [];
          if (message && !messages.includes(message)) messages.push(message);
        }
      }).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
  });
  await page.goto("/de/inbox");
  await expect(page.getByText("Private subscription thread")).toBeVisible();
  const actionIds = serverActionIds("app/[locale]/(protected)/inbox/actions.ts", "getMessagingThreadsAction");
  await database.query('UPDATE "Subscription" SET status=$1 WHERE "companyId"=$2', ["pastDue", workspace.companyId]);
  await page.waitForResponse((response) => invokesServerAction(response.request(), actionIds), { timeout: 25_000 });
  expect(
    (await page.evaluate(() => (window as Window & { inboxToasts?: string[] }).inboxToasts ?? [])).some((message) =>
      /unerwarteter Fehler|Etwas ist schiefgelaufen/i.test(message),
    ),
  ).toBe(false);
  await page.reload();
  await expect(page.getByText("Upgrade nötig, um Messaging freizuschalten")).toBeVisible();
  let blockedPolls = 0;
  page.on("request", (request) => {
    if (invokesServerAction(request, actionIds)) blockedPolls += 1;
  });
  await page.waitForTimeout(11_500);
  expect(blockedPolls).toBe(0);
  expect(
    (await page.evaluate(() => (window as Window & { inboxToasts?: string[] }).inboxToasts ?? [])).some((message) =>
      /unerwarteter Fehler|Etwas ist schiefgelaufen/i.test(message),
    ),
  ).toBe(false);
  const privateState = await database.query('SELECT "sharedToCrm" FROM "MessagingThread" WHERE id=$1', [threadId]);
  expect(privateState.rows[0]?.sharedToCrm).toBe(false);
  await database.query('UPDATE "Subscription" SET status=$1 WHERE "companyId"=$2', ["active", workspace.companyId]);
  await page.reload();
  await expect(page.getByText("Private subscription thread")).toBeVisible();
  expect(errors).toEqual([]);
});
