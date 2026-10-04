import type { Page, Route } from "@playwright/test";
import { presetId } from "../../features/records/crm-preset";
import { expect, test } from "./fixtures";

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (error.message !== "ResizeObserver loop completed with undelivered notifications.") errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function delayNextAction(page: Page) {
  let accepted!: () => void;
  const received = new Promise<void>((done) => {
    accepted = done;
  });
  let finish!: () => void;
  const gate = new Promise<void>((done) => {
    finish = done;
  });
  let delivered!: () => void;
  const complete = new Promise<void>((done) => {
    delivered = done;
  });
  let armed = true;
  const handler = async (route: Route) => {
    const request = route.request();
    if (!armed || request.method() !== "POST" || !request.headers()["next-action"]) {
      await route.continue();
      return;
    }
    armed = false;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    accepted();
    await gate;
    await route.fulfill({ response });
    delivered();
  };
  await page.route("**/*", handler);
  return {
    received,
    release: async () => {
      finish();
      await complete;
      await page.unroute("**/*", handler);
    },
    cleanup: async () => {
      finish();
      if (!armed) await complete;
      await page.unroute("**/*", handler);
    },
  };
}

async function discard(page: Page) {
  await page.keyboard.press("Escape");
  const guard = page.getByRole("alertdialog");
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(guard).not.toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

test("keeps the current record draft when a previous real save response arrives after close and reopen", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  const typeId = presetId(companyId, "service");
  const errors = collectErrors(page);
  await page.goto(`/en/records/${typeId}`);
  await page.locator("#records-add").click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("textbox", { name: "Name", exact: false }).fill("Accepted earlier record");
  await editor.getByRole("textbox", { name: "Price", exact: false }).fill("12.5");
  const delayed = await delayNextAction(page);
  try {
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await delayed.received;
    expect(
      (
        await database.query(
          'SELECT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "fieldId"=$3',
          [companyId, typeId, presetId(companyId, "service.name")],
        )
      ).rows,
    ).toEqual([{ textValue: "Accepted earlier record" }]);
    await discard(page);
    await page.locator("#records-add").click();
    await expect(editor.getByRole("textbox", { name: "Name", exact: false })).toHaveCount(0);
    await delayed.release();
    await editor.getByRole("textbox", { name: "Name", exact: false }).fill("Current retained draft");
    await editor.getByRole("textbox", { name: "Price", exact: false }).fill("19.75");
    await expect(
      page.getByRole("button", { name: "Accepted earlier record", exact: true, includeHidden: true }),
    ).toHaveCount(1);
    await expect(editor.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Current retained draft");
    await expect(editor.getByRole("textbox", { name: "Price", exact: false })).toHaveValue("19.75");
    await expect(editor.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath("retained-draft-after-delayed-save.png"),
      animations: "disabled",
    });
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor).not.toBeVisible();
    expect(
      (
        await database.query(
          'SELECT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "fieldId"=$3 ORDER BY "textValue"',
          [companyId, typeId, presetId(companyId, "service.name")],
        )
      ).rows,
    ).toEqual([{ textValue: "Accepted earlier record" }, { textValue: "Current retained draft" }]);
    expect(errors).toEqual([]);
  } finally {
    await delayed.cleanup();
  }
});

test("discards an earlier real configuration preview without attaching it to another field draft", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  const typeId = presetId(companyId, "organization");
  const errors = collectErrors(page);
  await page.goto(`/en/company/data-model?typeId=${typeId}`);
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("textbox", { name: "Name", exact: false }).fill("Earlier preview field");
  const delayed = await delayNextAction(page);
  try {
    await editor.getByRole("button", { name: "Preview changes", exact: true }).click();
    await delayed.received;
    await discard(page);
    await page.getByRole("button", { name: "Add field", exact: true }).click();
    await editor.getByRole("textbox", { name: "Name", exact: false }).fill("Current configured field");
    await delayed.release();
    await expect(editor.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Current configured field");
    await expect(editor.getByRole("button", { name: "Preview changes", exact: true })).toBeEnabled();
    await expect(editor.getByRole("button", { name: "Apply changes", exact: true })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("field-draft-after-delayed-preview.png"),
      animations: "disabled",
    });
    await editor.getByRole("button", { name: "Preview changes", exact: true }).click();
    await expect(editor.getByRole("status")).toContainText("Ready to apply");
    await editor.getByRole("button", { name: "Apply changes", exact: true }).click();
    await expect(editor).not.toBeVisible();
    expect(
      (
        await database.query(
          'SELECT definition->>\'label\' AS label FROM "RecordFieldDefinition" WHERE "companyId"=$1 AND "typeId"=$2 AND definition->>\'label\' IN ($3,$4)',
          [companyId, typeId, "Earlier preview field", "Current configured field"],
        )
      ).rows,
    ).toEqual([{ label: "Current configured field" }]);
    expect(errors).toEqual([]);
  } finally {
    await delayed.cleanup();
  }
});

test("keeps a newly opened record draft when an accepted deletion response arrives later", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  const typeId = presetId(companyId, "service");
  const errors = collectErrors(page);
  await page.goto(`/en/records/${typeId}`);
  await page.locator("#records-add").click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("textbox", { name: "Name", exact: false }).fill("Earlier deletion target");
  await editor.getByRole("textbox", { name: "Price", exact: false }).fill("10");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.getByRole("button", { name: "Earlier deletion target", exact: true }).click();
  await editor.getByRole("button", { name: "Delete", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  const delayed = await delayNextAction(page);
  try {
    await confirmation.locator("#confirm-delete").click();
    await delayed.received;
    expect(
      (
        await database.query(
          'SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2',
          [companyId, typeId],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    await page.keyboard.press("Escape");
    await expect(confirmation).not.toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editor).not.toBeVisible();
    await page.locator("#records-add").click();
    await expect(editor.getByRole("textbox", { name: "Name", exact: false })).toHaveCount(0);
    await delayed.release();
    await editor.getByRole("textbox", { name: "Name", exact: false }).fill("Draft after deletion");
    await editor.getByRole("textbox", { name: "Price", exact: false }).fill("31.25");
    await expect(
      page.getByRole("button", { name: "Earlier deletion target", exact: true, includeHidden: true }),
    ).toHaveCount(0);
    await expect(editor.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Draft after deletion");
    await expect(editor.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath("retained-draft-after-delayed-deletion.png"),
      animations: "disabled",
    });
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor).not.toBeVisible();
    expect(
      (
        await database.query(
          'SELECT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "fieldId"=$3',
          [companyId, typeId, presetId(companyId, "service.name")],
        )
      ).rows,
    ).toEqual([{ textValue: "Draft after deletion" }]);
    expect(errors).toEqual([]);
  } finally {
    await delayed.cleanup();
  }
});
