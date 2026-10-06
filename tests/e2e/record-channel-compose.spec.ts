import { randomUUID } from "node:crypto";
import type { Locator } from "@playwright/test";
import { Buffer } from "node:buffer";
import { presetId } from "../../features/records/crm-preset";
import { isDraftThreadId } from "../../ee/messaging/provider";
import { decodeGetParams } from "../../core/utils/get-params";
import type { RecordRef } from "../../features/records/record-model.schema";
import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";

test("opens a list-qualified inbox and preserves, saves, edits and sends channel drafts locally", async ({
  page,
  context,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  const browserDiagnostics: string[] = [];
  const captureError = (message: string) => {
    if (
      message ===
      "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set."
    )
      browserDiagnostics.push(message);
    else errors.push(message);
  };
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) captureError(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) captureError(message.text());
  });
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data });
    expect(response.status(), await response.text()).toBe(200);
    return response.json();
  };
  let model = await post("/api/v1/model/discover", {});
  const typeId = presetId(companyId, "organization");
  await post("/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "putCapability",
        capability: {
          id: randomUUID(),
          kind: "channels",
          typeId,
          fields: [],
          enabled: true,
        },
      },
    ],
  });
  model = await post("/api/v1/model/discover", {});
  const recipients = ["first-channel@example.test", "second-channel@example.test"];
  const records: RecordRef[] = [];
  for (const [index, recipient] of recipients.entries()) {
    const result = await post("/api/v1/records/mutate", {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId,
        fields: [
          {
            fieldId: presetId(companyId, "organization.name"),
            value: { kind: "text", value: `Channel company ${index + 1}` },
          },
        ],
        identities: [
          { provider: "mail", value: recipient },
          ...(index === 0 ? [{ provider: "mail", value: "alias-first@example.test" }] : []),
        ],
      },
    });
    records.push(result.refs[0]);
  }
  const accounts = [randomUUID(), randomUUID()];
  for (const [index, account] of accounts.entries()) {
    await database.query(
      'INSERT INTO "ConnectedAccount" (id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","emailAddress","displayName","sentFolderIds","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'ok\',true,$5,$6,ARRAY[\'e2e_sent\'],NOW())',
      [
        account,
        companyId,
        workspace.userId,
        `e2e_local_${randomUUID()}`,
        `sender-${index + 1}@example.test`,
        `Local Sender ${index + 1}`,
      ],
    );
  }
  const threadIds = [randomUUID(), randomUUID()];
  for (const [index, thread] of threadIds.entries()) {
    await database.query(
      'INSERT INTO "MessagingThread" (id,"companyId","connectedAccountId","unipileThreadId",provider,state,"lastMessageAt","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'open\',NOW(),NOW())',
      [thread, companyId, accounts[0], randomUUID()],
    );
    await database.query(
      'INSERT INTO "MessagingThreadParticipant" (id,"companyId","messagingThreadId",provider,"providerUserId",identifier,"identityLookupValue","displayName","updatedAt") VALUES ($1,$2,$3,\'mail\',$4,$4,$4,$5,NOW())',
      [randomUUID(), companyId, thread, recipients[index], `Channel company ${index + 1}`],
    );
    await database.query(
      'INSERT INTO "MessagingMessage" (id,"companyId","messagingThreadId","connectedAccountId","unipileMessageId",provider,direction,origin,sender,recipients,"bodyText","sentAt","updatedAt") VALUES ($1,$2,$3,$4,$5,\'mail\',\'inbound\',\'unipile\',$6,$7,$8,NOW(),NOW())',
      [
        randomUUID(),
        companyId,
        thread,
        accounts[0],
        randomUUID(),
        JSON.stringify({
          attendeeId: recipients[index],
          identifier: recipients[index],
          displayName: `Channel company ${index + 1}`,
        }),
        JSON.stringify({ to: [], cc: [], bcc: [] }),
        `Existing conversation ${index + 1}`,
      ],
    );
  }
  const navigateType = async (id: string) => {
    const mobileSidebar = page.locator('[data-sidebar="sidebar"][data-mobile="true"]');
    if (testInfo.project.name === "mobile") await expect(mobileSidebar).toHaveCount(0);
    const link = page.locator(`[id="nav-records:${id}"]`);
    if (!(await link.isVisible())) await page.locator("#sidebar-trigger").click();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/en/records/${id}$`));
    if (testInfo.project.name === "mobile") await expect(mobileSidebar).toHaveCount(0);
    await expect(page.locator("#sidebar-trigger")).toHaveAttribute("aria-disabled", "false");
  };
  const activateCompose = async (button: Locator) => {
    if (testInfo.project.name === "webkit") await button.press("Enter");
    else if (testInfo.project.name === "mobile") await button.tap();
    else await button.click();
  };
  const relationCount = model.relationships.filter(
    (relation: { sourceTypeId: string; targetTypeId: string; archived: boolean }) =>
      !relation.archived && (relation.sourceTypeId === typeId || relation.targetTypeId === typeId),
  ).length;
  expect(relationCount).toBe(3);
  const waitForRelationshipReads = async (container: Locator) => {
    const fields = container.locator('[data-entity-field^="relationship:"]');
    const controls = fields.getByRole("combobox");
    await expect(controls).toHaveCount(relationCount);
    for (let index = 0; index < relationCount; index++) await expect(controls.nth(index)).toBeEnabled();
    await expect(fields.locator('[aria-busy="true"]')).toHaveCount(0);
  };
  let activeRecipient = recipients[0];
  let hasOpenedRecord = false;
  const openRecord = async (index: number) => {
    activeRecipient = recipients[index];
    if (!hasOpenedRecord) {
      await page.goto(`/en/records/${typeId}/${records[index].recordId}`);
      hasOpenedRecord = true;
    } else {
      await navigateType(typeId);
      await page
        .getByRole("row")
        .filter({ has: page.getByText(`Channel company ${index + 1}`, { exact: true }) })
        .getByRole("button", { name: `Channel company ${index + 1}`, exact: true })
        .click();
      const recordDrawer = page.getByRole("dialog", { name: "Organization", exact: true });
      // Drain this drawer's reads so the held page responses belong to its newly mounted editor.
      await waitForRelationshipReads(recordDrawer);
      await recordDrawer.getByRole("link", { name: "Open page", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}/${records[index].recordId}$`));
      await expect(recordDrawer).toHaveCount(0);
    }
    await expect(page.locator("#sidebar-trigger")).toHaveAttribute("aria-disabled", "false");
  };
  await openRecord(0);
  const channels = page.locator('[data-entity-field="system:channels"]');
  const channelRow = () => channels.locator(`[data-record-channel-key="mail:${activeRecipient}"]`);
  const openInbox = async () => {
    // The following persistence reload must not interrupt the source editor's queued relationship reads.
    await waitForRelationshipReads(page.locator("body"));
    const link = channels.getByRole("link", { name: "Go to inbox", exact: true });
    if (testInfo.project.name === "webkit") await link.press("Enter");
    else if (testInfo.project.name === "mobile") await link.tap();
    else await link.click();
    await expect(page).toHaveURL(/\/en\/inbox\?/);
  };
  if (testInfo.project.name === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.bringToFront();
  const copy = channelRow().getByRole("button", { name: "Copy", exact: true });
  if (testInfo.project.name === "webkit") await copy.press("Enter");
  else if (testInfo.project.name === "mobile") await copy.tap();
  else await copy.click();
  await expect(page.getByText(`${recipients[0]} copied to clipboard`, { exact: true })).toBeVisible();
  if (testInfo.project.name === "chromium")
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(recipients[0]);
  // Inbox first preloads the visible connection-settings shortcut in two steps.
  // Accept the follow-up response headers before reload; body/cache completion is a separate router concern.
  const applicationOrigin = new URL(page.url()).origin;
  const connectionSettingsPrefetch = page.waitForResponse((response) => {
    const request = response.request();
    const headers = request.headers();
    return (
      new URL(response.url()).origin === applicationOrigin &&
      new URL(response.url()).pathname === "/en/profile/connected-accounts" &&
      request.method() === "GET" &&
      headers["next-router-prefetch"] === "1" &&
      headers["next-router-state-tree"] !== undefined &&
      headers["next-router-segment-prefetch"] === undefined
    );
  });
  await openInbox();
  await expect(page.locator(`[data-thread-id="${threadIds[0]}"]`)).toBeVisible();
  await expect(page.locator(`[data-thread-id="${threadIds[1]}"]`)).not.toBeVisible();
  expect(decodeGetParams(new URL(page.url()).searchParams).filters).toEqual([
    { field: "participantContactId", operator: "in", value: [`${typeId}:${records[0].recordId}`] },
  ]);
  const settingsResponse = await connectionSettingsPrefetch;
  expect(settingsResponse.status()).toBe(200);
  await page.reload();
  await expect(page.locator("#sidebar-trigger")).toHaveAttribute("aria-disabled", "false");
  await expect(page.locator(`[data-thread-id="${threadIds[0]}"]`)).toBeVisible();
  await expect(page.locator(`[data-thread-id="${threadIds[1]}"]`)).not.toBeVisible();
  await openRecord(0);
  const start = () => channelRow().getByRole("button", { name: "Compose Email message", exact: true });
  const popover = page
    .locator('[data-slot="popover-content"]')
    .filter({ has: page.getByPlaceholder("Subject", { exact: true }) });
  await activateCompose(start());
  await expect(popover).toBeVisible();
  await popover.getByPlaceholder("Subject", { exact: true }).fill("Discarded subject");
  const body = popover.getByRole("textbox", { name: "Write a reply...", exact: true });
  await body.fill("Keep this draft");
  await popover.getByRole("button", { name: "Insert emoji", exact: true }).click();
  await page.getByRole("button", { name: "👍", exact: true }).click();
  await expect(body).toContainText("👍");
  await expect(page.getByRole("button", { name: "👍", exact: true })).not.toBeVisible();
  const draftText = await body.innerText();
  await body.press("Escape");
  const guard = page.getByRole("alertdialog", { name: "Unsaved Changes", exact: true });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(body).toHaveText(draftText);
  await expect(popover.getByPlaceholder("Subject", { exact: true })).toHaveValue("Discarded subject");
  await activateCompose(start());
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(popover).not.toBeVisible();
  expect(
    (
      await database.query('SELECT COUNT(*)::int AS count FROM "MessagingMessage" WHERE "companyId"=$1 AND "isDraft"', [
        companyId,
      ])
    ).rows[0].count,
  ).toBe(0);

  await activateCompose(start());
  await expect(body).toHaveText("");
  await expect(popover.getByPlaceholder("Subject", { exact: true })).toHaveValue("");
  await popover
    .locator('input[type="file"]')
    .setInputFiles({ name: "local.txt", mimeType: "text/plain", buffer: Buffer.from("local only") });
  await expect(popover.getByText("local.txt", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Cancel", exact: true }).click();
  await popover.getByRole("button", { name: "Remove attachment", exact: true }).click();
  await expect(popover.getByText("local.txt", { exact: true })).not.toBeVisible();
  await popover.getByPlaceholder("Subject", { exact: true }).fill("Owned local draft");
  await body.fill("Draft belonging to the first company");
  await popover.getByRole("button", { name: /Local Sender/ }).click();
  await page.getByRole("menuitem", { name: /Local Sender 2/ }).click();
  await popover.getByRole("button", { name: "Cc/Bcc", exact: true }).click();
  for (const [label, value] of [
    ["Cc", "copy@example.test"],
    ["Bcc", "hidden@example.test"],
  ]) {
    await popover.getByRole("textbox", { name: label, exact: true }).fill(value);
    await popover.getByRole("textbox", { name: label, exact: true }).press("Enter");
  }
  await expect(channelRow().getByRole("button", { name: /Unlink/ })).toHaveCount(0);
  const aliasRow = channels.locator('[data-record-channel-key="mail:alias-first@example.test"]');
  const aliasCompose = aliasRow.getByRole("button", { name: "Compose Email message", exact: true });
  // On a narrow screen, the open composer covers the other channel's trigger.
  // Close through the visible active trigger; desktop also exercises a dirty recipient switch.
  if (testInfo.project.name === "mobile") await activateCompose(start());
  else {
    await aliasCompose.focus();
    await aliasCompose.press("Enter");
  }
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(body).toHaveText("Draft belonging to the first company");
  await popover.getByRole("button", { name: "More send options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save as draft", exact: true }).click();
  await expect(popover).not.toBeVisible();
  const readDrafts = async () =>
    (
      await database.query(
        'SELECT m.id,m."messagingThreadId",m."connectedAccountId",m.subject,m."bodyText",m.recipients,t."unipileThreadId" FROM "MessagingMessage" m JOIN "MessagingThread" t ON t."companyId"=m."companyId" AND t.id=m."messagingThreadId" WHERE m."companyId"=$1 AND m."isDraft" ORDER BY m."createdAt"',
        [companyId],
      )
    ).rows;
  await expect.poll(async () => (await readDrafts()).length).toBe(1);
  const draft = (await readDrafts())[0];
  expect(draft).toMatchObject({
    connectedAccountId: accounts[1],
    subject: "Owned local draft",
    bodyText: "Draft belonging to the first company",
  });
  expect(draft.recipients.to.map((item: { identifier: string }) => item.identifier)).toEqual([recipients[0]]);
  expect(draft.recipients.cc.map((item: { identifier: string }) => item.identifier)).toEqual(["copy@example.test"]);
  expect(draft.recipients.bcc.map((item: { identifier: string }) => item.identifier)).toEqual(["hidden@example.test"]);
  expect(isDraftThreadId(draft.unipileThreadId)).toBe(true);
  if (testInfo.project.name === "mobile") {
    await activateCompose(aliasCompose);
    await expect(aliasCompose).toHaveAttribute("aria-expanded", "true");
    await expect(body).toHaveText("");
    await expect(popover.getByPlaceholder("Subject", { exact: true })).toHaveValue("");
    await activateCompose(aliasCompose);
    await expect(popover).not.toBeVisible();
    expect(await readDrafts()).toEqual([draft]);
  }

  let holdLinkedChoices = true;
  const releaseChoices: Array<() => void> = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (
      !holdLinkedChoices ||
      request.method() !== "POST" ||
      !request.headers()["next-action"] ||
      new URL(request.url()).pathname !== `/en/records/${typeId}/${records[1].recordId}`
    )
      return route.fallback();
    let args: unknown;
    try {
      args = JSON.parse(request.postData() ?? "null");
    } catch {
      return route.fallback();
    }
    if (
      !Array.isArray(args) ||
      args.length !== 1 ||
      !args[0]?.linkedTo ||
      args[0].linkedTo.ref?.typeId !== records[1].typeId ||
      args[0].linkedTo.ref?.recordId !== records[1].recordId
    )
      return route.fallback();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await new Promise<void>((resolve) => {
      releaseChoices.push(resolve);
    });
    await route.fulfill({ response });
  });
  await openRecord(1);
  const pendingLinkedFields = page.locator('[data-entity-field^="relationship:"] [aria-busy="true"]');
  await expect.poll(() => releaseChoices.length).toBeGreaterThan(0);
  await expect(pendingLinkedFields).toHaveCount(relationCount);
  const beforeChoiceLoad = await start().boundingBox();
  if (!beforeChoiceLoad) throw new Error("Expected visible compose trigger during relationship loading");
  if (testInfo.project.name !== "mobile") {
    await page.mouse.move(
      beforeChoiceLoad.x + beforeChoiceLoad.width / 2,
      beforeChoiceLoad.y + beforeChoiceLoad.height / 2,
    );
    await page.mouse.down();
  }
  try {
    for (let index = 0; index < relationCount; index += 1) {
      await expect.poll(() => releaseChoices.length).toBeGreaterThan(index);
      releaseChoices[index]();
      await expect(pendingLinkedFields).toHaveCount(relationCount - index - 1);
      const afterChoiceLoad = await start().boundingBox();
      if (!afterChoiceLoad) throw new Error("Relationship loading removed the compose trigger");
      expect(Math.abs(afterChoiceLoad.y - beforeChoiceLoad.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(afterChoiceLoad.x - beforeChoiceLoad.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(afterChoiceLoad.width - beforeChoiceLoad.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(afterChoiceLoad.height - beforeChoiceLoad.height)).toBeLessThanOrEqual(1);
    }
  } finally {
    holdLinkedChoices = false;
    releaseChoices.forEach((release) => release());
    if (testInfo.project.name !== "mobile") await page.mouse.up();
  }
  if (testInfo.project.name === "mobile") await activateCompose(start());
  await expect(start()).toHaveAttribute("aria-expanded", "true");
  await expect(body).toHaveText("");
  await popover.getByPlaceholder("Subject", { exact: true }).fill("Local second company delivery");
  await body.fill("Message only for the second company");
  await popover.getByRole("button", { name: /Local Sender/ }).click();
  await page.getByRole("menuitem", { name: /Local Sender 2/ }).click();
  await popover.getByRole("button", { name: "Send", exact: true }).click();
  await expect(popover).not.toBeVisible();
  const sentMessages = async () =>
    (
      await database.query(
        'SELECT id,"messagingThreadId","connectedAccountId",subject,"bodyText",recipients,direction,"unipileMessageId" FROM "MessagingMessage" WHERE "companyId"=$1 AND NOT "isDraft" AND direction=\'outbound\'',
        [companyId],
      )
    ).rows;
  await expect.poll(async () => (await sentMessages()).length).toBe(1);
  const sent = (await sentMessages())[0];
  expect(sent).toMatchObject({
    connectedAccountId: accounts[1],
    subject: "Local second company delivery",
    bodyText: "Message only for the second company",
    direction: "outbound",
  });
  expect(sent.unipileMessageId).toMatch(/^e2e_email_/);
  expect(sent.recipients.to.map((item: { identifier: string }) => item.identifier)).toEqual([recipients[1]]);
  expect(sent.recipients.cc).toEqual([]);
  expect(sent.recipients.bcc).toEqual([]);
  expect((await readDrafts()).map((row) => row.id)).toEqual([draft.id]);
  await database.query('UPDATE "MessagingMessage" SET "bodyHtml"=$1 WHERE "companyId"=$2 AND id=$3', [
    '<html style="color:#102030;background-image:url(https://example.test/root.png)"><head><style>@import url(https://example.test/import.css);@font-face{font-family:Remote;src:url(https://example.test/font.woff2)}.public-layout{color:#102030;padding:4px;background:red url(https://example.test/background.png)}</style></head><body><p class="public-layout">Message only for the second company</p><img alt="Public photo" width="80" height="40" src="https://example.test/photo.png"><svg><rect fill="url(https://example.test/paint.svg#paint) blue" filter="url(https://example.test/filter.svg#filter)"></rect></svg></body></html>',
    companyId,
    sent.id,
  ]);
  await openInbox();
  await expect(page.locator(`[data-thread-id="${sent.messagingThreadId}"]`)).toBeVisible();
  await page.locator(`[data-thread-id="${sent.messagingThreadId}"]`).click();
  await expect(
    page
      .frameLocator('iframe[title="Email content"]')
      .getByText("Message only for the second company", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('iframe[title="Email content"]')).toHaveAttribute("sandbox", "allow-same-origin");
  await expect(page.frameLocator('iframe[title="Email content"]').locator("script")).toHaveCount(0);
  const email = page.frameLocator('iframe[title="Email content"]');
  await expect(email.locator('img[alt="Public photo"]')).toHaveAttribute("width", "80");
  await expect(email.locator('img[alt="Public photo"]')).not.toHaveAttribute("src");
  await expect(email.locator(".public-layout")).toHaveCSS("color", "rgb(16, 32, 48)");
  await expect(email.locator(".public-layout")).toHaveCSS("padding", "4px");
  await expect(email.locator("rect")).toHaveAttribute("fill", "blue");
  await expect(email.locator("rect")).toHaveAttribute("filter", "none");
  await page.locator("#inbox-thread-state").click();
  await page.getByRole("option", { name: "Closed", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await database.query('SELECT state FROM "MessagingThread" WHERE "companyId"=$1 AND id=$2', [
            companyId,
            sent.messagingThreadId,
          ])
        ).rows[0].state,
    )
    .toBe("closed");
  await page.reload();
  await expect(page.locator("#sidebar-trigger")).toHaveAttribute("aria-disabled", "false");
  await expect(page.locator("#inbox-thread-state")).toHaveAttribute("aria-label", "Closed");

  await openRecord(0);
  await openInbox();
  await page.locator(`[data-thread-id="${draft.messagingThreadId}"]`).click();
  const conversation = page.getByRole("region", { name: "Conversation", exact: true });
  await conversation.getByRole("button", { name: "Edit", exact: true }).click();
  const reply = page.getByRole("textbox", { name: "Write a reply...", exact: true });
  await expect(reply).toHaveText("Draft belonging to the first company");
  await reply.fill("Updated first company draft");
  await page.getByRole("button", { name: "More send options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Update draft", exact: true }).click();
  await expect.poll(async () => (await readDrafts())[0]?.bodyText).toBe("Updated first company draft");
  expect((await readDrafts())[0].recipients.to.map((item: { identifier: string }) => item.identifier)).toEqual([
    recipients[0],
  ]);
  await conversation.getByRole("button", { name: "Discard", exact: true }).click();
  await expect.poll(async () => (await readDrafts()).length).toBe(0);
  await expect(conversation.getByRole("button", { name: "Edit", exact: true })).not.toBeVisible();
  await navigateType(typeId);
  await page
    .getByRole("row")
    .filter({ has: page.getByText("Channel company 1", { exact: true }) })
    .getByRole("button", { name: "Channel company 1", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "Organization", exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Channel company 1");
  await drawer.getByRole("button", { name: "Customize", exact: true }).click();
  await expect(drawer.getByRole("button", { name: "Hide Channels from details", exact: true })).toBeVisible();
  await activateCompose(
    drawer
      .locator('[data-record-channel-key="mail:first-channel@example.test"]')
      .getByRole("button", { name: "Compose Email message", exact: true }),
  );
  await body.fill("Protect this drawer draft");
  await expect(drawer.getByRole("button", { name: /Unlink/ })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
  for (const action of [
    drawer.getByRole("button", { name: "Hide Channels from details", exact: true }),
    drawer.getByRole("button", { name: "Done", exact: true }),
    drawer.getByRole("tab", { name: "Notes", exact: true }),
    drawer.getByRole("tab", { name: "History", exact: true }),
  ]) {
    await action.click();
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(body).toHaveText("Protect this drawer draft");
    await expect(drawer.locator('[data-entity-field="system:channels"]')).toBeVisible();
  }
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(body).toHaveText("Protect this drawer draft");
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  for (const key of ["contact", "organization"]) await navigateType(presetId(companyId, key));
  await page
    .getByRole("row")
    .filter({ has: page.getByText("Channel company 1", { exact: true }) })
    .getByRole("button", { name: "Channel company 1", exact: true })
    .click();
  await activateCompose(
    drawer
      .locator('[data-record-channel-key="mail:first-channel@example.test"]')
      .getByRole("button", { name: "Compose Email message", exact: true }),
  );
  await body.fill("Keep this message when going back");
  const recovered = page.getByRole("dialog", { name: "New message", exact: true });
  const draftUrl = page.url();
  await page.goBack();
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(draftUrl);
  await expect(drawer).toBeVisible();
  await expect(body).toHaveText("Keep this message when going back");
  await expect(recovered).toHaveCount(0);
  await page.goBack();
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(recovered).toHaveCount(0);
  await navigateType(typeId);
  await page
    .getByRole("row")
    .filter({ has: page.getByText("Channel company 1", { exact: true }) })
    .getByRole("button", { name: "Channel company 1", exact: true })
    .click();
  await drawer.getByRole("link", { name: "Open page", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}/${records[0].recordId}$`));
  await expect(drawer).toHaveCount(0);
  await expect(page.locator("#sidebar-trigger")).toHaveAttribute("aria-disabled", "false");
  await activateCompose(start());
  await body.fill("Keep this full-page history draft");
  const recordPageUrl = page.url();
  await page.goBack();
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(recordPageUrl);
  await expect(body).toHaveText("Keep this full-page history draft");
  await page.goBack();
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page).not.toHaveURL(recordPageUrl);
  await expect(recovered).toHaveCount(0);
  await expect.poll(async () => (await readDrafts()).length).toBe(0);
  if (new URL(page.url()).pathname !== `/en/records/${typeId}`) await navigateType(typeId);
  await page
    .getByRole("row")
    .filter({ has: page.getByText("Channel company 1", { exact: true }) })
    .getByRole("button", { name: "Channel company 1", exact: true })
    .click();
  await activateCompose(
    drawer
      .locator('[data-record-channel-key="mail:first-channel@example.test"]')
      .getByRole("button", { name: "Compose Email message", exact: true }),
  );
  await body.fill("Explicitly discard before opening the page");
  await drawer.getByRole("link", { name: "Open page", exact: true }).click();
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}/${records[0].recordId}$`));
  await expect(drawer).toHaveCount(0);
  await expect(recovered).not.toBeVisible();
  await expect(popover).not.toBeVisible();
  await openInbox();
  await page.locator(`[data-thread-id="${threadIds[0]}"]`).click();
  const settingsControl = page
    .getByRole("button", { name: "Thread settings", exact: true })
    .and(page.locator('[data-slot="badge"]'));
  if (testInfo.project.name === "mobile") await settingsControl.click();
  else await settingsControl.press("Enter");
  await page
    .getByRole("dialog", { name: "Thread settings", exact: true })
    .getByRole("button", { name: "Open record: Channel company 1", exact: true })
    .click();
  await drawer.getByRole("link", { name: "Open page", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}/${records[0].recordId}$`));
  await expect(drawer).toHaveCount(0);
  await expect(page.locator("#sidebar-trigger")).toHaveAttribute("aria-disabled", "false");
  await activateCompose(start());
  await popover.getByPlaceholder("Subject", { exact: true }).fill("Recovered while inbox selected");
  await body.fill("Keep separate from the existing inbox reply");
  const draftPageUrl = page.url();
  await page.goBack();
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(draftPageUrl);
  await expect(body).toHaveText("Keep separate from the existing inbox reply");
  await popover.getByRole("button", { name: "More send options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save as draft", exact: true }).click();
  await expect.poll(async () => (await readDrafts()).length).toBe(1);
  await page.goBack();
  await expect(guard).not.toBeVisible();
  await expect(recovered).toHaveCount(0);
  await expect(page.locator("#inbox-reply-expand")).toBeVisible();
  await page.locator("#inbox-reply-expand").click();
  await expect(page.locator("#inbox-reply-send")).toBeVisible();
  await expect.poll(async () => (await readDrafts()).length).toBe(1);
  const recoveredDraft = (await readDrafts())[0];
  expect(recoveredDraft).toMatchObject({
    subject: "Recovered while inbox selected",
    bodyText: "Keep separate from the existing inbox reply",
  });
  expect(recoveredDraft.recipients.to.map((item: { identifier: string }) => item.identifier)).toEqual([recipients[0]]);
  if (testInfo.project.name === "mobile") {
    await page
      .getByRole("navigation", { name: "Breadcrumb", exact: true })
      .getByRole("link", { name: "Inbox", exact: true })
      .click();
    await expect(page).toHaveURL((url) => !url.searchParams.has("threadId"));
  }
  await page.locator(`[data-thread-id="${recoveredDraft.messagingThreadId}"]`).click();
  await page
    .getByRole("region", { name: "Conversation", exact: true })
    .getByRole("button", { name: "Discard", exact: true })
    .click();
  await expect.poll(async () => (await readDrafts()).length).toBe(0);
  expect((await sentMessages()).length).toBe(1);
  await page.screenshot({
    path: testInfo.outputPath("record-channel-compose-and-inbox.png"),
    animations: "disabled",
    fullPage: true,
  });
  await testInfo.attach("expected-email-sandbox-diagnostics", {
    body: Buffer.from(JSON.stringify(browserDiagnostics)),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});
