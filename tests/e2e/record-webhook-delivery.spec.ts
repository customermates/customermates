import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { addFromConfigure, openConfigure } from "./configure";
import { test, expect, isBenignPageError } from "./fixtures";

test("delivers a custom-record event to a loopback receiver and retries a transient failure", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(300000);
  const received: Array<{ deliveryId: string | undefined; body: unknown }> = [];
  const receiver = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      received.push({
        deliveryId: request.headers["x-customermates-delivery-id"] as string | undefined,
        body: JSON.parse(body),
      });
      response.writeHead(received.length === 1 ? 503 : 200, { "Content-Type": "application/json" });
      response.end("{}");
    });
  });
  await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
  const receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/project-events`;
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  try {
    await openConfigure(page);
    await addFromConfigure(page, "List");
    const creation = page.getByRole("dialog");
    await creation.getByRole("textbox", { name: "Name", exact: false }).first().fill("Projects");
    await creation.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(page).toHaveURL(/\/en\/records\/[a-f0-9-]+$/);
    const typeId = new URL(page.url()).pathname.split("/").at(-1);
    const field = await database.query(
      `SELECT f.id, f.definition->>'label' AS label FROM "RecordFieldDefinition" f JOIN "RecordTypeDefinition" t ON t."companyId"=f."companyId" AND t.id=f."typeId" AND t.definition->>'primaryFieldId'=f.id WHERE f."companyId"=$1 AND f."typeId"=$2`,
      [companyId, typeId],
    );
    expect(field.rows).toHaveLength(1);

    await page.goto("/en/company/webhooks");
    await page.locator("#company-webhooks-add").click();
    const webhook = page.getByRole("dialog");
    await webhook.locator("#webhook-modal-url").fill(receiverUrl);
    await webhook.locator("#webhook-modal-events").click();
    await page.getByRole("option", { name: "Record created", exact: true }).click();
    await page.keyboard.press("Escape");
    await webhook.getByRole("combobox", { name: "Records from", exact: false }).click();
    await page.getByRole("option", { name: "Projects", exact: true }).click();
    await webhook.getByRole("button", { name: "Save", exact: true }).click();
    await expect(webhook).not.toBeVisible();

    await page.goto(`/en/records/${typeId}`);
    await page.locator("#records-add").click();
    const record = page.getByRole("dialog");
    await record.getByRole("textbox", { name: field.rows[0].label, exact: false }).fill("Delivered project");
    await record.getByRole("button", { name: "Save", exact: true }).click();
    await expect(record).not.toBeVisible();

    await expect.poll(() => received.length, { timeout: 90000 }).toBe(2);
    expect(received[0].deliveryId).toBeTruthy();
    expect(received[1].deliveryId).toBe(received[0].deliveryId);
    expect(received[0].body).toMatchObject({
      event: "record.created",
      data: { payload: { version: 2, record: { ref: { typeId } } } },
    });
    expect(JSON.stringify(received[1].body)).toContain("Delivered project");

    await expect
      .poll(
        async () => {
          const rows = await database.query(
            'SELECT d.status,d.attempts,d."admissionKey",e."deliveredAt" AS "eventDeliveredAt" FROM "WebhookDelivery" d JOIN "RecordEvent" e ON e."companyId"=d."companyId" AND e.id=d."recordEventId" WHERE d."companyId"=$1 AND d.url=$2',
            [companyId, receiverUrl],
          );
          return rows.rows;
        },
        { timeout: 90000 },
      )
      .toEqual([
        expect.objectContaining({
          status: "success",
          attempts: 2,
          admissionKey: expect.any(String),
          eventDeliveredAt: expect.any(Date),
        }),
      ]);

    await page.goto("/en/company/webhook-deliveries");
    await expect(page.getByText(receiverUrl).first()).toBeVisible();
    await expect(page.getByText("Delivered", { exact: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await page.close();
    await new Promise<void>((resolve, reject) => receiver.close((error) => (error ? reject(error) : resolve())));
  }
});

test("delivers only deleted records that matched the webhook filter before removal", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const received: Array<{ deliveryId: string | undefined; body: unknown }> = [];
  const receiver = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      received.push({
        deliveryId: request.headers["x-customermates-delivery-id"] as string | undefined,
        body: JSON.parse(body),
      });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end("{}");
    });
  });
  await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
  const receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/deleted-projects`;
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  try {
    await openConfigure(page);
    await addFromConfigure(page, "List");
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Name", exact: false }).first().fill("Projects");
    await dialog.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(page).toHaveURL(/\/en\/records\/[a-f0-9-]+$/);
    const typeId = new URL(page.url()).pathname.split("/").at(-1);
    const field = await database.query(
      `SELECT f.id, f.definition->>'label' AS label FROM "RecordFieldDefinition" f JOIN "RecordTypeDefinition" t ON t."companyId"=f."companyId" AND t.id=f."typeId" AND t.definition->>'primaryFieldId'=f.id WHERE f."companyId"=$1 AND f."typeId"=$2`,
      [companyId, typeId],
    );
    expect(field.rows).toHaveLength(1);
    const projects = new Map<string, string>();
    for (const title of ["Draft project", "Ready project"]) {
      await page.locator("#records-add").click();
      await dialog.getByRole("textbox", { name: field.rows[0].label, exact: false }).fill(title);
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      const persisted = await database.query(
        'SELECT "recordId" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "fieldId"=$3 AND "textValue"=$4',
        [companyId, typeId, field.rows[0].id, title],
      );
      expect(persisted.rows).toHaveLength(1);
      projects.set(title, persisted.rows[0].recordId);
    }

    await page.goto("/en/company/webhooks");
    await page.locator("#company-webhooks-add").click();
    await dialog.locator("#webhook-modal-url").fill(receiverUrl);
    await dialog.locator("#webhook-modal-events").click();
    await page.getByRole("option", { name: "Record deleted", exact: true }).click();
    await page.keyboard.press("Escape");
    await dialog.getByRole("combobox", { name: "Records from", exact: false }).click();
    await page.getByRole("option", { name: "Projects", exact: true }).click();
    await dialog.locator('[id="recordTrigger.query.search"]').fill("Ready");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const hook = await database.query('SELECT id FROM "Webhook" WHERE "companyId"=$1 AND url=$2', [
      companyId,
      receiverUrl,
    ]);
    expect(hook.rows).toHaveLength(1);
    await page.goto(`/en/records/${typeId}`);
    for (const [title, recordId] of projects) {
      await page.getByRole("button", { name: title, exact: true }).click();
      await dialog.getByRole("button", { name: "Delete", exact: true }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect(page.getByRole("button", { name: title, exact: true })).not.toBeVisible();
      await expect
        .poll(
          async () => {
            const event = await database.query(
              'SELECT "deliveredAt" FROM "RecordEvent" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND kind=\'record.deleted\'',
              [companyId, typeId, recordId],
            );
            return event.rows;
          },
          { timeout: 90000 },
        )
        .toEqual([{ deliveredAt: expect.any(Date) }]);
      if (title === "Draft project") {
        const matched = await database.query(
          'SELECT m."eventId" FROM "RecordEventMatch" m JOIN "RecordEvent" e ON e."companyId"=m."companyId" AND e.id=m."eventId" WHERE m."companyId"=$1 AND m."subscriptionId"=$2 AND e.kind=\'record.deleted\'',
          [companyId, hook.rows[0].id],
        );
        expect(matched.rows).toEqual([]);
        expect(received).toEqual([]);
      }
    }
    await expect.poll(() => received.length, { timeout: 90000 }).toBe(1);
    expect(received[0].deliveryId).toBeTruthy();
    expect(received[0].body).toMatchObject({
      event: "record.deleted",
      data: {
        payload: { version: 2, record: { ref: { typeId, recordId: projects.get("Ready project") } } },
      },
    });
    expect(JSON.stringify(received[0].body)).toContain("Ready project");
    expect(JSON.stringify(received[0].body)).not.toContain("Draft project");
    await expect
      .poll(
        async () => {
          const result = await database.query(
            'SELECT d.status,d.attempts,e."recordId",e.payload->\'afterVersion\' AS "afterVersion" FROM "WebhookDelivery" d JOIN "RecordEvent" e ON e."companyId"=d."companyId" AND e.id=d."recordEventId" WHERE d."companyId"=$1 AND d."webhookId"=$2',
            [companyId, hook.rows[0].id],
          );
          return result.rows;
        },
        { timeout: 90000 },
      )
      .toEqual([{ status: "success", attempts: 1, recordId: projects.get("Ready project"), afterVersion: null }]);
    const remaining = await database.query('SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2', [
      companyId,
      typeId,
    ]);
    expect(remaining.rows).toEqual([]);
    await page.goto("/en/company/webhook-deliveries");
    await expect(page.getByText(receiverUrl).first()).toBeVisible();
    await expect(page.getByText("Delivered", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("filtered-deletion-delivery.png"), animations: "disabled" });
    expect(errors).toEqual([]);
  } finally {
    await page.close();
    await new Promise<void>((resolve, reject) => receiver.close((error) => (error ? reject(error) : resolve())));
  }
});
