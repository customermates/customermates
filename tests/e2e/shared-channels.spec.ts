import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { presetId } from "../../features/records/crm-preset";
import { localE2eEnvironment } from "./local-environment";
import { test, expect } from "./fixtures";

test("shares an indexed identifier across lists, unlinks one association and links only one conversation", async ({
  page, context, database, companyId, workspace,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const typeId = (key: string) => presetId(companyId, key);
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data });
    expect(response.status(), await response.text()).toBe(200);
    return response.json();
  };
  let model = await post("/api/v1/model/discover", {});
  await post("/api/v1/model/apply", {
    expectedRevision: model.revision, idempotencyKey: randomUUID(),
    operations: [{ operation: "putCapability", capability: {
      id: randomUUID(), kind: "channels", enabled: true, typeId: typeId("organization"), fields: [],
    } }],
  });
  model = await post("/api/v1/model/discover", {});
  const email = "shared-person@example.test";
  const create = async (kind: string, fields: Array<[string, string]>, identities?: unknown[]) => {
    const result = await post("/api/v1/records/mutate", {
      expectedRevision: model.revision, idempotencyKey: randomUUID(), mutation: {
        action: "create", typeId: typeId(kind),
        fields: fields.map(([name, value]) => ({ fieldId: typeId(`${kind}.${name}`), value: { kind: "text", value } })),
        ...(identities ? { identities } : {}),
      },
    });
    expect(result.status).toBe("completed");
    return result.refs[0];
  };
  const contact = await create("contact", [["firstName", "Shared"], ["lastName", "Person"]], [{ provider: "mail", value: email }]);
  const organization = await create("organization", [["name", "Shared Organization"]], [{ provider: "google", value: email.toUpperCase() }]);
  const deal = await create("deal", [["name", "Conversation project"]]);
  const resolve = async () => post("/api/v1/records/identities/resolve", { identifiers: [
    { provider: "mail", value: email.toUpperCase() }, { provider: "mail", value: "missing@example.test" },
  ] });
  const resolved = await resolve();
  expect(resolved.matches[0].records.map((record: { ref: unknown }) => record.ref)).toEqual(expect.arrayContaining([contact, organization]));
  expect(resolved.matches[0].records).toHaveLength(2);
  expect(resolved.matches[1].records).toEqual([]);
  const identity = (await database.query('SELECT id FROM "RecordIdentity" WHERE "companyId"=$1 AND value=$2', [companyId, email])).rows[0];
  expect((await database.query('SELECT * FROM "RecordIdentityLink" WHERE "companyId"=$1', [companyId])).rows).toHaveLength(2);
  const filtered = await post("/api/v1/records/identities/resolve", { identifiers: [{ provider: "mail", value: email }], typeIds: [organization.typeId] });
  expect(filtered.matches[0].records.map((record: { ref: unknown }) => record.ref)).toEqual([organization]);

  const accountId = randomUUID();
  await database.query('INSERT INTO "ConnectedAccount" (id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'ok\',true,NOW())', [accountId, companyId, workspace.userId, randomUUID()]);
  const threadIds = [randomUUID(), randomUUID()];
  for (const [index, threadId] of threadIds.entries()) {
    await database.query('INSERT INTO "MessagingThread" (id,"companyId","connectedAccountId","unipileThreadId",provider,state,"lastMessageAt","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'open\',NOW(),NOW())', [threadId, companyId, accountId, randomUUID()]);
    await database.query('INSERT INTO "MessagingThreadParticipant" (id,"companyId","messagingThreadId",provider,"providerUserId",identifier,"identityLookupValue","displayName","updatedAt") VALUES ($1,$2,$3,\'mail\',$4,$4,$4,\'Shared Person\',NOW())', [randomUUID(), companyId, threadId, email]);
    await database.query('INSERT INTO "MessagingMessage" (id,"companyId","messagingThreadId","connectedAccountId","unipileMessageId",provider,direction,origin,sender,recipients,"bodyText","sentAt","updatedAt") VALUES ($1,$2,$3,$4,$5,\'mail\',\'inbound\',\'unipile\',$6,$7,$8,NOW(),NOW())', [randomUUID(), companyId, threadId, accountId, randomUUID(), JSON.stringify({ attendeeId: email, identifier: email, displayName: "Shared Person" }), JSON.stringify({ to: [], cc: [], bcc: [] }), index === 0 ? "Linked conversation message" : "Other conversation message"]);
  }
  await page.goto(`/en/inbox?threadId=${threadIds[0]}`);
  await page.getByRole("button", { name: "Thread settings", exact: true }).and(page.locator('[data-slot="badge"]')).click();
  const settings = page.getByRole("dialog", { name: "Thread settings", exact: true });
  await expect(settings.getByRole("button", { name: "Open record: Shared Person", exact: true })).toBeVisible();
  await expect(settings.getByRole("button", { name: "Open record: Shared Organization", exact: true })).toBeVisible();
  await settings.getByRole("button", { name: "Unlink record: Shared Organization", exact: true }).click();
  await expect(settings.getByRole("button", { name: "Open record: Shared Organization", exact: true })).not.toBeVisible();
  expect((await database.query('SELECT id FROM "RecordIdentity" WHERE "companyId"=$1', [companyId])).rows).toEqual([identity]);
  expect((await resolve()).matches[0].records.map((record: { ref: unknown }) => record.ref)).toEqual([contact]);
  await settings.getByRole("button", { name: "Link", exact: true }).click();
  await settings.getByRole("combobox").fill("Shared Organization");
  await settings.getByRole("option", { name: "Shared Organization", exact: true }).click();
  await expect(settings.getByRole("button", { name: "Open record: Shared Organization", exact: true })).toBeVisible();
  const conversation = settings.getByRole("region", { name: "Conversation records", exact: true });
  await conversation.getByRole("button", { name: "Link record", exact: true }).click();
  await conversation.getByRole("combobox").fill("Conversation project");
  await conversation.getByRole("option").filter({ hasText: "Conversation project" }).click();
  await expect(conversation.getByRole("button", { name: "Open record: Conversation project", exact: true })).toBeVisible();
  expect((await database.query('SELECT "threadId","typeId","recordId" FROM "MessagingThreadRecordLink" WHERE "companyId"=$1', [companyId])).rows).toEqual([{ threadId: threadIds[0], typeId: deal.typeId, recordId: deal.recordId }]);
  expect((await resolve()).matches[0].records).toHaveLength(2);
  await conversation.getByRole("button", { name: "Open record: Conversation project", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Deal", exact: true });
  await drawer.getByRole("tab", { name: "Activities", exact: true }).click();
  await expect(drawer.getByText("Linked conversation message", { exact: true })).toBeVisible();
  await expect(drawer.getByText("Other conversation message", { exact: true })).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("conversation-record-history.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await conversation.getByRole("button", { name: "Unlink record: Conversation project", exact: true }).click();
  await expect(conversation.getByText("No linked records", { exact: true })).toBeVisible();
  expect((await database.query('SELECT id FROM "RecordIdentity" WHERE "companyId"=$1', [companyId])).rows).toEqual([identity]);

  const request = { action: "link", threadId: threadIds[0], ref: deal, expectedRevision: model.revision, idempotencyKey: randomUUID() };
  const first = await post("/api/v1/messaging/record-links/mutate", request);
  expect(await post("/api/v1/messaging/record-links/mutate", request)).toEqual(first);
  const conflict = await page.request.post("/api/v1/messaging/record-links/mutate", { data: { ...request, action: "unlink" } });
  expect(conflict.status()).toBe(409);
  const stale = await page.request.post("/api/v1/messaging/record-links/mutate", { data: { ...request, expectedRevision: model.revision - 1, idempotencyKey: randomUUID() } });
  expect(stale.status()).toBe(409);
  const foreign = await page.request.post("/api/v1/messaging/record-links/mutate", { data: { ...request, threadId: randomUUID(), idempotencyKey: randomUUID() } });
  expect(foreign.status()).toBe(404);
  expect((await post("/api/v1/messaging/record-links/read", { threadId: threadIds[1] })).records).toEqual([]);

  const { baseUrl } = localE2eEnvironment();
  const credentialResponse = await context.request.post(`${baseUrl}/api/auth/api-key/create`, { headers: { origin: baseUrl }, data: { name: "Shared identifier local verification", expiresIn: 86400 } });
  expect(credentialResponse.ok()).toBe(true);
  const credential = await credentialResponse.json();
  const client = new Client({ name: "local-shared-channel-verification", version: "2.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/v1/mcp`), { requestInit: { headers: { "x-api-key": credential.key } } });
  try {
    await client.connect(transport);
    const resolvedTool = await client.callTool({ name: "resolve_record_identifiers", arguments: { identifiers: [{ provider: "mail", value: email }] } });
    expect(resolvedTool.isError).not.toBe(true);
    const toolContent = resolvedTool.structuredContent as { matches: Array<{ records: Array<{ ref: unknown }> }> };
    expect(toolContent.matches[0].records.map((record) => record.ref)).toEqual(expect.arrayContaining([contact, organization]));
    const unlink = await client.callTool({ name: "manage_conversation_records", arguments: { ...request, action: "unlink", idempotencyKey: randomUUID() } });
    expect(unlink.isError).not.toBe(true);
    expect((await post("/api/v1/messaging/record-links/read", { threadId: threadIds[0] })).records).toEqual([]);
    const originalRole = (await database.query('SELECT "roleId" FROM "User" WHERE id=$1 AND "companyId"=$2', [workspace.userId, companyId])).rows[0].roleId;
    const roleId = randomUUID();
    await database.query('INSERT INTO "UserRole" (id,"companyId",name,"updatedAt") VALUES ($1,$2,\'Record reader\',NOW())', [roleId, companyId]);
    await database.query('INSERT INTO "RecordTypeGrant" ("companyId","typeId","roleId",actions) VALUES ($1,$2,$3,ARRAY[\'readAll\']::"Action"[])', [companyId, contact.typeId, roleId]);
    await database.query('UPDATE "User" SET "roleId"=$1 WHERE "companyId"=$2 AND id=$3', [roleId, companyId, workspace.userId]);
    try {
      expect((await resolve()).matches[0].records.map((record: { ref: unknown }) => record.ref)).toEqual([contact]);
      const denied = await page.request.post("/api/v1/messaging/record-links/mutate", { data: { ...request, idempotencyKey: randomUUID() } });
      expect(denied.status()).toBe(403);
      const restricted = await client.callTool({ name: "resolve_record_identifiers", arguments: { identifiers: [{ provider: "mail", value: email }] } });
      expect(restricted.isError).not.toBe(true);
      expect((restricted.structuredContent as typeof toolContent).matches[0].records.map((record) => record.ref)).toEqual([contact]);
    } finally {
      await database.query('UPDATE "User" SET "roleId"=$1 WHERE "companyId"=$2 AND id=$3', [originalRole, companyId, workspace.userId]);
    }
  } finally {
    await client.close();
    await context.request.post(`${baseUrl}/api/auth/api-key/delete`, { headers: { origin: baseUrl }, data: { keyId: credential.id } });
  }
  await page.screenshot({ path: testInfo.outputPath("shared-channel-links.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});
