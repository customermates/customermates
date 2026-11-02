import type { Page } from "@playwright/test";
import type { Client } from "pg";

import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { mintApiKey } from "../api-key";
import { expect, test } from "../fixtures";
import { localE2eEnvironment } from "../local-environment";
import { isTestInbox, TEST_ACCOUNT_IDS } from "./live-allowlist.mjs";

// Real sends through the Unipile development application, from the sender test inbox to the receiver test inbox.
// scripts/verify/live-checks.mjs starts these with the secrets in the environment and the egress guard in the server.
const SENDER_ACCOUNT = "acc_01m42y7hj1ecva9pb0sycgqq51";
const RECEIVER_ACCOUNT = "acc_01m6b96qwsfesbrjkgd8xxmzjy";
const sender = process.env.UNIPILE_TEST_SENDER_EMAIL ?? "";
const receiver = process.env.UNIPILE_TEST_RECEIVER_EMAIL ?? "";
const ledgerFile = process.env.CRM_LIVE_SEND_LEDGER ?? "";

test.beforeAll(() => {
  if (process.env.CRM_E2E_LIVE_UNIPILE !== "true") throw new Error("Run live checks through scripts/verify/live-checks.mjs");
  if (!isTestInbox(sender) || !isTestInbox(receiver)) throw new Error("The configured fixture addresses are not the designated test inboxes");
  if (!TEST_ACCOUNT_IDS.has(SENDER_ACCOUNT) || !TEST_ACCOUNT_IDS.has(RECEIVER_ACCOUNT)) throw new Error("Unknown fixture account");
});

type LedgerEntry = { forwarded?: boolean; blocked?: string; path?: string; reason?: string; status?: number; at: string };

function ledgerSince(startedAt: string): LedgerEntry[] {
  if (!existsSync(ledgerFile)) return [];
  return readFileSync(ledgerFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LedgerEntry)
    .filter((entry) => entry.at >= startedAt);
}

const forwardedSends = (startedAt: string) =>
  ledgerSince(startedAt).filter((entry) => entry.forwarded && /\/emails(\/send)?$/.test(entry.path ?? "")).length;

async function connectSender(database: Client, workspace: { companyId: string; userId: string }) {
  await database.query('DELETE FROM "ConnectedAccount" WHERE "unipileAccountId"=$1', [SENDER_ACCOUNT]);
  const id = randomUUID();
  await database.query(
    'INSERT INTO "ConnectedAccount" (id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","emailAddress","displayName","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'ok\',true,$5,$6,NOW())',
    [id, workspace.companyId, workspace.userId, SENDER_ACCOUNT, sender, "Live check sender"],
  );
  return id;
}

/** Distinct copies in the receiver test inbox, counted read-only over IMAP (the provider's listing can lag minutes). */
function receiverCopies(marker: string) {
  const output = execFileSync("python3", ["-I", resolve("tests/e2e/live/imap-count.py"), marker], { encoding: "utf8" });
  const result = JSON.parse(output) as { count?: number; error?: string };
  if (typeof result.count !== "number") throw new Error(`Counting the receiver inbox failed: ${result.error ?? "no count"}`);
  return result.count;
}

/** Waits until the receiver inbox has the marked email, then checks that it arrived exactly once. */
async function expectDeliveredOnce(marker: string) {
  await expect.poll(() => receiverCopies(marker), { timeout: 240000, intervals: [5000, 10000, 15000] }).toBeGreaterThanOrEqual(1);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 20000));
  expect(receiverCopies(marker)).toBe(1);
}

type ReceivedAttachment = { filename: string | null; contentType: string; size: number; sha256: string };

/** Attachments of the marked email in the receiver test inbox, read-only over IMAP. */
function receivedAttachments(marker: string) {
  const output = execFileSync("python3", ["-I", resolve("tests/e2e/live/imap-attachments.py"), marker], { encoding: "utf8" });
  const result = JSON.parse(output) as { attachments?: ReceivedAttachment[]; error?: string };
  if (!result.attachments) throw new Error(`Reading the receiver inbox failed: ${result.error ?? "no attachments"}`);
  return result.attachments;
}

/** A small valid one-page PDF that carries the marker, so its bytes are unique to this run. */
function markerPdf(marker: string) {
  const text = `BT /F1 18 Tf 72 720 Td (${marker}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

async function workspaceMcp(database: Client, workspace: { authUserId: string; companyId: string }) {
  const credential = await mintApiKey(database, workspace, "Live draft attachment check");
  const client = new McpClient({ name: "live-draft-attachments", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${localE2eEnvironment().baseUrl}/api/v1/mcp`), {
      requestInit: { headers: { "x-api-key": credential.key } },
    }),
  );
  const call = async (name: string, arguments_: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: arguments_ });
    expect(result.isError, `${name}: ${JSON.stringify(result.content)}`).not.toBe(true);
    return result.structuredContent as Record<string, unknown>;
  };
  return { call, close: () => client.close() };
}

async function saveDraft(page: Page, connectedAccountId: string, subject: string, body: string) {
  const response = await page.request.post("/api/v1/messaging/drafts", {
    data: { connectedAccountId, recipients: [receiver], subject, body },
  });
  expect(response.status(), "saving the draft").toBe(200);
  return (await response.json()) as { id: string; messagingThreadId: string; draftRevision: string };
}

test("refuses a live send to an address outside the test inboxes without contacting the provider", async ({ page, database, workspace }) => {
  const startedAt = new Date().toISOString();
  const accountId = await connectSender(database, workspace);
  const response = await page.request.post("/api/v1/messaging/send-email", {
    data: {
      connectedAccountId: accountId,
      to: [{ identifier: `not-a-test-inbox-${randomUUID()}@example.invalid` }],
      subject: `LIVE-GUARD ${randomUUID()}`,
      body: "Must never leave the machine",
      bodyFormat: "markdown",
    },
  });
  expect(response.ok()).toBe(false);
  expect(forwardedSends(startedAt)).toBe(0);
  expect(ledgerSince(startedAt).some((entry) => entry.blocked === "unipile" && /test inbox/.test(entry.reason ?? ""))).toBe(true);
});

test("sends a saved draft once to the receiver test inbox", async ({ page, database, workspace }) => {
  const startedAt = new Date().toISOString();
  const marker = `LIVE-S1-${Date.now().toString(36)}`;
  const accountId = await connectSender(database, workspace);
  const draft = await saveDraft(page, accountId, `${marker} draft send`, `${marker} body`);
  await page.goto(`/en/inbox?threadId=${draft.messagingThreadId}`);
  const actions = page.locator("[data-message-actions]");
  await actions.getByRole("button", { name: "Send draft", exact: true }).click();
  await expect(page.getByText(/^Message sent\./)).toBeVisible({ timeout: 120000 });
  expect(forwardedSends(startedAt)).toBe(1);
  await expectDeliveredOnce(marker);
});

test("edits a draft in the inbox and sends the edited text once", async ({ page, database, workspace }) => {
  const startedAt = new Date().toISOString();
  const marker = `LIVE-S2-${Date.now().toString(36)}`;
  const accountId = await connectSender(database, workspace);
  const draft = await saveDraft(page, accountId, `${marker} edited draft`, `${marker} first version`);
  await page.goto(`/en/inbox?threadId=${draft.messagingThreadId}`);
  await page.locator("[data-message-actions]").getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.locator("form:has(#inbox-reply-send)").getByRole("textbox", { name: "Write a reply...", exact: true });
  await expect(editor).toContainText("first version");
  await editor.fill(`${marker} edited version`);
  await page.locator("#inbox-reply-send").click();
  await expect(page.getByText(/^Message sent\./)).toBeVisible({ timeout: 120000 });
  expect(forwardedSends(startedAt)).toBe(1);
  await expectDeliveredOnce(marker);
  const stored = await database.query(
    'SELECT "bodyText" FROM "MessagingMessage" WHERE "companyId"=$1 AND NOT "isDraft" AND subject LIKE $2',
    [workspace.companyId, `${marker}%`],
  );
  for (const row of stored.rows) expect(String(row.bodyText)).toContain("edited version");
});

test("sends a PDF draft prepared over MCP with the file intact", async ({ page, database, workspace }) => {
  const startedAt = new Date().toISOString();
  const marker = `LIVE-S3-${Date.now().toString(36)}`;
  const accountId = await connectSender(database, workspace);
  const pdf = markerPdf(marker);
  const fileName = `${marker} invoice.pdf`;
  const mcp = await workspaceMcp(database, workspace);
  let draft = { draftMessageId: "", threadId: "" };
  try {
    const discovery = (await mcp.call("discover_record_types", { includeEmbedded: false, page: 1, pageSize: 25 })) as {
      schemaRevision: number;
      types: { id: string }[];
    };
    const typeId = discovery.types[0]?.id;
    if (!typeId) throw new Error("The live workspace has no list");
    const label = `${marker} files`;
    const change = {
      expectedRevision: discovery.schemaRevision,
      idempotencyKey: randomUUID(),
      operations: [
        {
          operation: "putField",
          field: {
            id: "$files",
            typeId,
            label,
            valueType: "file",
            behavior: { kind: "input" },
            required: false,
            archived: false,
            options: [],
            position: 90,
          },
        },
      ],
    };
    await mcp.call("configure_record_model", { action: "preview", change });
    await mcp.call("configure_record_model", { action: "apply", change });
    const field = await database.query(
      'SELECT id FROM "RecordFieldDefinition" WHERE "companyId"=$1 AND "typeId"=$2 AND "valueType"=\'file\' AND definition->>\'label\'=$3',
      [workspace.companyId, typeId, label],
    );
    const fieldId = String(field.rows[0]?.id ?? "");
    expect(fieldId, "the file field was created").not.toBe("");

    const upload = (await mcp.call("manage_record_files", {
      action: "upload",
      typeId,
      fieldId,
      name: fileName,
      mimeType: "application/pdf",
      content: Buffer.from(pdf, "latin1").toString("base64"),
    })) as { file: { id: string } };
    draft = (await mcp.call("save_message_draft", {
      connectedAccountId: accountId,
      recipients: [receiver],
      subject: `${marker} invoice`,
      body: `${marker} the invoice is attached.`,
      fileIds: [upload.file.id],
    })) as { draftMessageId: string; threadId: string };
  } finally {
    await mcp.close();
  }

  await page.goto(`/en/inbox?threadId=${draft.threadId}`);
  const attachment = page.locator("a[href*='/messaging/attachments/']", { hasText: fileName });
  await expect(attachment).toBeVisible({ timeout: 60000 });
  const preview = await page.request.get(String(await attachment.getAttribute("href")));
  expect(preview.status(), "downloading the draft attachment").toBe(200);
  expect(Buffer.from(await preview.body()).toString("latin1"), "the inbox serves the stored PDF bytes").toBe(pdf);

  await page.locator("[data-message-actions]").getByRole("button", { name: "Send draft", exact: true }).click();
  await expect(page.getByText(/^Message sent\./)).toBeVisible({ timeout: 120000 });
  expect(forwardedSends(startedAt)).toBe(1);
  await expectDeliveredOnce(marker);
  const received = receivedAttachments(marker).filter((item) => item.filename === fileName);
  expect(received).toHaveLength(1);
  expect(received[0]).toMatchObject({
    contentType: "application/pdf",
    size: Buffer.byteLength(pdf, "latin1"),
    sha256: createHash("sha256").update(pdf, "latin1").digest("hex"),
  });
});
