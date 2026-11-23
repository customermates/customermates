import { createHmac, randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { appApiPath, appPath } from "./app-paths";
import { localWebhookSecret } from "./local-email-provider.mjs";
import { providerRemovals } from "./provider-accounts";
import { addBrowserWorkspace } from "./workspace";
import { e2eAppMode, setActiveWorkspace } from "./workspace-switching";

test.skip(e2eAppMode() !== "cloud", "Channels connect only in the cloud");

function postWebhook(page: Page, payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", localWebhookSecret).update(`${timestamp}.${body}`).digest("hex");
  return page.request.post("/api/webhooks/unipile/v2", {
    headers: {
      "content-type": "application/json",
      "unipile-signature": `t=${timestamp},v0=${signature}`,
    },
    data: body,
  });
}

const hostedState = (userId: string) =>
  `${userId}.${createHmac("sha256", localWebhookSecret).update(userId).digest("hex")}`;

test("one mailbox connected in two workspaces receives mail in both and is removed at the provider only with the last one", async ({
  page,
  database,
  workspace,
}) => {
  test.setTimeout(240_000);
  const second = await addBrowserWorkspace(database, workspace, "Second mailbox workspace");
  const unipileAccountId = `e2e_local_imap_${randomUUID()}`;
  const accountRows = () =>
    database.query<{
      id: string;
      companyId: string;
      status: string;
      emailAddress: string | null;
    }>(
      'SELECT id,"companyId",status,"emailAddress" FROM "ConnectedAccount" WHERE "unipileAccountId"=$1 ORDER BY "createdAt"',
      [unipileAccountId],
    );

  for (const userId of [workspace.userId, second.userId]) {
    const added = await postWebhook(page, {
      type: "account.add",
      account_id: unipileAccountId,
      state: hostedState(userId),
    });
    expect(added.status()).toBe(200);
  }

  await expect
    .poll(async () => (await accountRows()).rows.map((row) => [row.companyId, row.emailAddress]), { timeout: 30_000 })
    .toEqual([
      [workspace.companyId, "onboarding-mailbox@example.test"],
      [second.companyId, "onboarding-mailbox@example.test"],
    ]);
  const failedEvents = await database.query(
    `SELECT error FROM "MessagingInboundEvent" WHERE payload->>'account_id'=$1 AND error IS NOT NULL`,
    [unipileAccountId],
  );
  expect(failedEvents.rows).toEqual([]);

  const subject = `Shared mailbox ${randomUUID()}`;
  const emailId = `e2e_email_${randomUUID()}`;
  const received = await postWebhook(page, {
    type: "email.new",
    account_id: unipileAccountId,
    payload: {
      email: {
        id: emailId,
        message_id: `<${emailId}@example.test>`,
        thread_id: `e2e_thread_${randomUUID()}`,
        subject,
        body: "<p>Hello from one mailbox in two workspaces</p>",
        date: new Date().toISOString(),
        from: [{ display_name: "Paula Prospect", email: "paula@prospect.test" }],
        to: [{ display_name: "Mailbox", email: "onboarding-mailbox@example.test" }],
        cc: [],
        bcc: [],
        folders: ["INBOX"],
      },
    },
  });
  expect(received.status()).toBe(200);

  await expect
    .poll(
      async () =>
        (
          await database.query<{ companyId: string }>(
            'SELECT m."companyId" FROM "MessagingMessage" m JOIN "MessagingThread" t ON t.id=m."messagingThreadId" WHERE t.subject=$1 ORDER BY m."companyId"',
            [subject],
          )
        ).rows.map((row) => row.companyId),
      { timeout: 30_000 },
    )
    .toEqual([workspace.companyId, second.companyId].sort());

  for (const target of [second, workspace]) {
    await setActiveWorkspace(database, workspace, target.companyId);
    await page.goto(appPath(target.slug, "/inbox"));
    await expect(page.getByText(subject).first()).toBeVisible({
      timeout: 30_000,
    });
  }

  const [first, other] = (await accountRows()).rows;
  if (!first || !other) throw new Error("Both workspaces should hold the mailbox");
  const firstRemoval = await page.request.delete(
    appApiPath(workspace.slug, `/api/v1/messaging/connected-accounts/${first.id}`),
  );
  expect(firstRemoval.status()).toBe(200);
  expect((await accountRows()).rows.map((row) => row.companyId)).toEqual([second.companyId]);
  expect(providerRemovals([{ unipileAccountId }])).toEqual([0]);

  const lastRemoval = await page.request.delete(
    appApiPath(second.slug, `/api/v1/messaging/connected-accounts/${other.id}`),
  );
  expect(lastRemoval.status()).toBe(200);
  expect((await accountRows()).rows).toEqual([]);
  expect(providerRemovals([{ unipileAccountId }])).toEqual([1]);
});
