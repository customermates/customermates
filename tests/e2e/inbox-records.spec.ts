import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { expect, test } from "./fixtures";

test("creates, unlinks and relinks a generic person from the inbox", async ({
  page,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const accountId = randomUUID();
  const threadId = randomUUID();
  const email = "inbox-person@example.test";
  await database.query(
    'INSERT INTO "ConnectedAccount" (id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'ok\',true,NOW())',
    [accountId, companyId, workspace.userId, randomUUID()],
  );
  await database.query(
    'INSERT INTO "MessagingThread" (id,"companyId","connectedAccountId","unipileThreadId",provider,state,"lastMessageAt","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'open\',NOW(),NOW())',
    [threadId, companyId, accountId, randomUUID()],
  );
  await database.query(
    'INSERT INTO "MessagingThreadParticipant" (id,"companyId","messagingThreadId",provider,"providerUserId",identifier,"identityLookupValue","displayName","updatedAt") VALUES ($1,$2,$3,\'mail\',$4,$4,$4,\'Inbox Person\',NOW())',
    [randomUUID(), companyId, threadId, email],
  );
  await database.query(
    'INSERT INTO "MessagingMessage" (id,"companyId","messagingThreadId","connectedAccountId","unipileMessageId",provider,direction,origin,sender,recipients,"bodyText","sentAt","updatedAt") VALUES ($1,$2,$3,$4,$5,\'mail\',\'inbound\',\'unipile\',$6,$7,\'Local identity integration\',NOW(),NOW())',
    [
      randomUUID(),
      companyId,
      threadId,
      accountId,
      randomUUID(),
      JSON.stringify({ attendeeId: email, identifier: email, displayName: "Inbox Person" }),
      JSON.stringify({ to: [], cc: [], bcc: [] }),
    ],
  );
  await page.goto(`/en/inbox?threadId=${threadId}`);
  const settingsControl = page
    .getByRole("button", { name: "Thread settings", exact: true })
    .and(page.locator('[data-slot="badge"]'));
  if (testInfo.project.name === "mobile") await settingsControl.click();
  else await settingsControl.press("Enter");
  const settings = page.getByRole("dialog", { name: "Thread settings", exact: true });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "Link", exact: true }).click();
  await settings.getByRole("option", { name: 'Create "Inbox Person"', exact: true }).click();
  await expect(settings.getByRole("button", { name: "Unlink record: Inbox Person", exact: true })).toBeVisible();
  const stored = await database.query(
    'SELECT i.id,l."typeId",l."recordId",i.value FROM "RecordIdentity" i JOIN "RecordIdentityLink" l ON l."companyId"=i."companyId" AND l."identityId"=i.id WHERE i."companyId"=$1',
    [companyId],
  );
  expect(stored.rows).toHaveLength(1);
  expect(stored.rows[0]).toMatchObject({ typeId: presetId(companyId, "contact"), value: email });
  expect((await database.query("SELECT to_regclass('\"Contact\"') AS table")).rows[0].table).toBeNull();
  await settings.getByRole("button", { name: "Open record: Inbox Person", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Contact", exact: true });
  await expect(drawer.getByText(email, { exact: true })).toBeVisible();
  await drawer.getByRole("tab", { name: "History", exact: true }).click();
  await expect(drawer.getByText("Local identity integration", { exact: true })).toBeVisible();
  await drawer.getByText("Local identity integration", { exact: true }).click();
  const messageDetail = page.getByRole("dialog", { name: "Inbox Person", exact: true });
  await expect(messageDetail.getByText("Local identity integration", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(messageDetail).not.toBeVisible();
  await expect(drawer).toBeVisible();
  await drawer.getByText("Browser Administrator", { exact: true }).click();
  const historyDetail = page.getByRole("dialog", { name: /^Record created at / });
  await expect(historyDetail).toBeVisible();
  await expect(historyDetail.getByText("Inbox Person", { exact: true }).first()).toBeVisible();
  const journal = await database.query(
    'SELECT kind,payload FROM "RecordEvent" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 ORDER BY "createdAt"',
    [companyId, stored.rows[0].typeId, stored.rows[0].recordId],
  );
  expect(journal.rows.map((row) => row.kind)).toEqual(["record.created"]);
  expect(journal.rows[0].payload).toMatchObject({
    version: 2,
    ref: { typeId: stored.rows[0].typeId, recordId: stored.rows[0].recordId },
  });
  await page.screenshot({ path: testInfo.outputPath("record-history-detail.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(historyDetail).not.toBeVisible();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "Unlink record: Inbox Person", exact: true }).click();
  await expect(settings.getByRole("button", { name: "Unlink record: Inbox Person", exact: true })).not.toBeVisible();
  await expect(settings.getByRole("button", { name: "Link", exact: true })).toBeVisible();
  expect(
    (await database.query('SELECT COUNT(*)::int AS count FROM "RecordIdentityLink" WHERE "companyId"=$1', [companyId]))
      .rows[0].count,
  ).toBe(0);
  await settings.getByRole("button", { name: "Link", exact: true }).click();
  await settings.getByRole("option", { name: "Inbox Person", exact: true }).click();
  await expect(settings.getByRole("button", { name: "Unlink record: Inbox Person", exact: true })).toBeVisible();
  const relinked = await database.query('SELECT l."recordId",i.value FROM "RecordIdentity" i JOIN "RecordIdentityLink" l ON l."companyId"=i."companyId" AND l."identityId"=i.id WHERE i."companyId"=$1', [
    companyId,
  ]);
  expect(relinked.rows).toEqual([{ recordId: stored.rows[0].recordId, value: email }]);
  await page.keyboard.press("Escape");
  await page.reload();
  await settingsControl.click();
  await expect(settings.getByRole("button", { name: "Unlink record: Inbox Person", exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("inbox-record-identity.png"),
    animations: "disabled",
    fullPage: true,
  });
  await database.query(
    'INSERT INTO "MessagingThreadParticipant" (id,"companyId","messagingThreadId",provider,"providerUserId",identifier,"identityLookupValue","displayName","updatedAt") VALUES ($1,$2,$3,\'mail\',$4,$4,$4,\'Suggested Channel\',NOW())',
    [randomUUID(), companyId, threadId, "suggested-channel@example.test"],
  );
  await page.goto(`/en/records/${stored.rows[0].typeId}/${stored.rows[0].recordId}`);
  const channelInput = page.getByRole("combobox", { name: "Add channel", exact: true });
  await channelInput.fill("Suggested Channel");
  await expect(channelInput).toHaveValue("Suggested Channel");
  await expect(channelInput).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("option", { name: /Suggested Channel/ }).click();
  await expect(page.getByText("suggested-channel@example.test", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await database.query('SELECT value,"displayName" FROM "RecordIdentity" WHERE "companyId"=$1 AND value=$2', [
            companyId,
            "suggested-channel@example.test",
          ])
        ).rows,
    )
    .toEqual([{ value: "suggested-channel@example.test", displayName: "Suggested Channel" }]);
  await page.reload();
  await expect(page.getByText("suggested-channel@example.test", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
