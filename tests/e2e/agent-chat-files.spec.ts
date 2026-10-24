import { randomUUID } from "node:crypto";

import { presetId } from "../../features/records/crm-preset";
import { assertPublishedResponse } from "../helpers/openapi-validator";
import { pdfFixture } from "../helpers/record-file-fixtures";
import { postOk } from "./api";
import { collectPageErrors, expect, test } from "./fixtures";
import { openRecordDetails } from "./record-rows";

const OFFER = Buffer.from(
  pdfFixture([["Offer 2026 for Example organization", "Total: 4,200 EUR net, valid until 30 November."]]),
);
const CARD = "Ada Lovelace\nAnalytical Engines Ltd\n+49 30 1234567\n";

test("gives Mate files by button, drop and paste, sends them with the message and files one onto a record", async ({
  page,
  diagnostics,
  database,
  companyId,
}) => {
  test.skip(process.env.APP_MODE === "self-hosted", "Mate is part of the cloud service only");
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  const typeId = presetId(companyId, "organization");
  const fieldId = randomUUID();
  await page.goto("/en/dashboard");
  const model = await postOk(page, "/api/v1/model/read", {});
  await postOk(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "putField",
        field: {
          id: fieldId,
          typeId,
          label: "Offers",
          valueType: "file",
          required: false,
          multiple: true,
          behavior: { kind: "input" },
          options: [],
          position: 99,
        },
      },
    ],
  });

  await page.goto("/en/dashboard?agentChat=open");
  const panel = page.getByTestId("agent-panel");
  await expect(panel.getByRole("button", { name: "Attach files", exact: true })).toBeVisible();
  await panel
    .getByTestId("agent-file-input")
    .setInputFiles([{ name: "Offer.pdf", mimeType: "application/pdf", buffer: OFFER }]);
  const dropped = await page.evaluateHandle((card) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([card], "Card.txt", { type: "text/plain" }));
    return transfer;
  }, CARD);
  const greeting = panel.getByRole("article");
  await greeting.dispatchEvent("dragover", { dataTransfer: dropped });
  await expect(panel).toHaveAttribute("data-dragging", "true");
  await expect(panel.getByTestId("agent-file-drop-overlay")).toHaveText("Drop files to attach them");
  await greeting.dispatchEvent("drop", { dataTransfer: dropped });
  await expect(panel).not.toHaveAttribute("data-dragging");
  await page.locator("#agent-composer").evaluate((editor) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], "Screenshot.png", { type: "image/png" }));
    editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  });

  const chips = panel.locator("[data-agent-file-context]");
  await expect(chips).toHaveCount(3, { timeout: 60000 });
  await expect(panel.locator("[data-agent-upload]")).toHaveCount(0);
  await expect(chips.filter({ hasText: "Offer.pdf" })).toContainText(`${OFFER.byteLength} B`);
  const stored = await database.query<{
    id: string;
    name: string;
    status: string;
    extraction: string;
    pages: number | null;
    text: string | null;
  }>(
    `SELECT id, name, status::text AS status, "extractionStatus"::text AS extraction, "pageCount" AS pages,
       "extractedText" AS text
     FROM "RecordFile" WHERE "companyId"=$1 AND "fieldId" IS NULL AND "typeId" IS NULL ORDER BY name`,
    [companyId],
  );
  expect(stored.rows.map(({ name, status, extraction, pages }) => [name, status, extraction, pages])).toEqual([
    ["Card.txt", "pending", "done", null],
    ["Offer.pdf", "pending", "done", 1],
    ["Screenshot.png", "pending", "unsupported", null],
  ]);
  expect(stored.rows.find((row) => row.name === "Offer.pdf")?.text).toContain("4,200 EUR net");
  const fileId = (name: string) => stored.rows.find((row) => row.name === name)?.id ?? "";

  await panel.getByRole("button", { name: "Remove Screenshot.png", exact: true }).click();
  await expect(chips).toHaveCount(2);

  const offlineMate = diagnostics.expect({
    kind: "console",
    text: /^Failed to load resource: the server responded with a status of 422/,
    source: (url) => url.pathname === "/api/agent/messages",
    page,
  });
  const sent = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/agent/messages" && response.request().method() === "POST",
  );
  await page.locator("#agent-composer").focus();
  await page.keyboard.type("Attach the offer to Example organization and create a contact from the card");
  await page.keyboard.press("Enter");
  const response = await sent;
  const contexts = response.request().postDataJSON().contexts as { label: string }[];
  expect(contexts.toSorted((left, right) => left.label.localeCompare(right.label))).toEqual([
    {
      reference: { kind: "file", fileId: fileId("Card.txt"), mimeType: "text/plain", size: Buffer.byteLength(CARD) },
      label: "Card.txt",
    },
    {
      reference: { kind: "file", fileId: fileId("Offer.pdf"), mimeType: "application/pdf", size: OFFER.byteLength },
      label: "Offer.pdf",
    },
  ]);
  // The offline e2e server has no hosted AI: the files pass Mate's checks and only the provider admission answers 422.
  expect(response.status()).toBe(422);
  await expect.poll(() => offlineMate.events.length).toBe(1);
  const sentFiles = panel.locator('[role="log"] a[href^="/api/v1/files/"]');
  await expect(sentFiles).toHaveCount(2);
  await expect(sentFiles.filter({ hasText: "Offer.pdf" })).toHaveAttribute("aria-label", /^Open Offer\.pdf \(/);
  await expect(chips).toHaveCount(2);

  const record = await database.query<{ id: string }>(
    `SELECT r.id FROM "CrmRecord" r JOIN "RecordValue" v
       ON v."companyId"=r."companyId" AND v."typeId"=r."typeId" AND v."recordId"=r.id
     WHERE r."companyId"=$1 AND r."typeId"=$2 AND r."deletedAt" IS NULL AND v."textValue"='Example organization'
     LIMIT 1`,
    [companyId, typeId],
  );
  const recordId = record.rows[0]?.id;
  if (!recordId) throw new Error("Example organization is missing");
  const attachResponse = await page.request.post(`/api/v1/files/${fileId("Offer.pdf")}/attach`, {
    data: { typeId, recordId, fieldId, mode: "append" },
  });
  expect(attachResponse.status(), await attachResponse.text()).toBe(200);
  const attached = await attachResponse.json();
  assertPublishedResponse("/v1/files/{id}/attach", "post", 200, attached);
  expect(attached).toMatchObject({
    attached: true,
    file: { id: fileId("Offer.pdf"), typeId, fieldId, recordId, status: "ready", name: "Offer.pdf" },
  });

  await page.goto(`/en/records/${typeId}`);
  await openRecordDetails(page, "Example organization");
  const drawer = page.getByRole("dialog", { name: "Organization", exact: true });
  await expect(drawer.getByText("Offer.pdf", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
