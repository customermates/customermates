import type { Locator, Page } from "@playwright/test";
import type { Client } from "pg";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { presetId } from "../../features/records/crm-preset";
import { pdfFixture } from "../helpers/record-file-fixtures";
import {
  addFromConfigure,
  configureDrawer,
  openConfigure,
  saveDrawer,
} from "./configure";
import { test, expect, collectPageErrors } from "./fixtures";
import { openRecordDetails, recordItem } from "./record-rows";

const NOTES = Buffer.from("Meeting notes\nAgreed on the renewal.\n");
const OFFER = Buffer.from(
  pdfFixture([
    ["Example offer", "Synthetic record attachment for preview verification."],
  ]),
);
const IMAGE = readFileSync("public/captures/light/homepage-dashboard-en.png");

async function storedFiles(
  database: Client,
  companyId: string,
  fieldId: string,
) {
  const result = await database.query<{
    id: string;
    name: string;
    status: string;
    size: string;
  }>(
    'SELECT id, name, status::text AS status, size::text AS size FROM "RecordFile" WHERE "companyId" = $1 AND "fieldId" = $2 ORDER BY name',
    [companyId, fieldId],
  );
  return result.rows;
}

async function saveRecord(page: Page, drawer: Locator) {
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    drawer.getByRole("button", { name: "Save", exact: true }),
  ).toHaveCount(0);
  await expect(async () => {
    const close = drawer.getByRole("button", { name: "Close", exact: true });
    if (await close.isVisible()) await close.click({ timeout: 2000 });
    await expect(drawer).not.toBeVisible({ timeout: 2000 });
  }).toPass();
  await page.waitForLoadState("networkidle");
}

test("uploads, shows, downloads and removes record files and refuses uploads over the storage limit", async ({
  page,
  playwright,
  diagnostics,
  database,
  companyId,
}) => {
  test.setTimeout(300000);
  const errors = collectPageErrors(page);
  const typeId = presetId(companyId, "organization");
  const label = `Documents ${randomUUID().slice(0, 6)}`;

  await openConfigure(page, typeId);
  await addFromConfigure(page, "Field");
  const fieldDrawer = configureDrawer(page);
  await fieldDrawer
    .getByRole("textbox", { name: "Name", exact: false })
    .fill(label);
  await fieldDrawer
    .getByRole("combobox", { name: "Value type", exact: true })
    .click();
  await page.getByRole("option", { name: /^File/ }).click();
  await expect(
    fieldDrawer.getByRole("combobox", { name: "Value type", exact: true }),
  ).toContainText("File");
  await fieldDrawer
    .getByRole("switch", { name: "Allow several values", exact: true })
    .click();
  await saveDrawer(page);
  const fieldId = (
    await database.query<{ id: string }>(
      'SELECT id FROM "RecordFieldDefinition" WHERE "companyId" = $1 AND "typeId" = $2 AND "valueType" = \'file\'',
      [companyId, typeId],
    )
  ).rows[0]?.id;
  if (!fieldId) throw new Error("The file field was not created");

  await page.goto(`/en/records/${typeId}`);
  await openRecordDetails(page, "Example organization");
  const drawer = page.getByRole("dialog", {
    name: "Organization",
    exact: true,
  });
  const editor = drawer.getByRole("group", { name: label, exact: true });
  await expect(
    editor.getByRole("button", { name: "Add files", exact: true }),
  ).toBeVisible();
  await editor.locator('input[type="file"]').setInputFiles([
    { name: "notes.txt", mimeType: "text/plain", buffer: NOTES },
    { name: "offer.pdf", mimeType: "application/pdf", buffer: OFFER },
    { name: "workspace.png", mimeType: "image/png", buffer: IMAGE },
  ]);
  await expect(editor.locator("[data-record-file]")).toHaveCount(3);
  await expect(editor.locator("[data-record-file-upload]")).toHaveCount(0);
  await expect(
    editor.getByRole("button", { name: "Remove notes.txt", exact: true }),
  ).toBeVisible();
  await editor.getByRole("button", { name: /^workspace\.png/ }).click();
  const imagePreview = page.getByRole("dialog", {
    name: "workspace.png",
    exact: true,
  });
  const image = imagePreview.getByRole("img", {
    name: "workspace.png",
    exact: true,
  });
  await expect(image).toBeVisible();
  await expect(
    imagePreview.getByRole("heading", { name: "workspace.png", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      imagePreview.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= window.innerWidth + 1;
      }),
    )
    .toBe(true);
  expect(
    await imagePreview.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  const [imageDownload] = await Promise.all([
    page.waitForEvent("download"),
    imagePreview
      .getByRole("button", { name: "Download file", exact: true })
      .click(),
  ]);
  expect(imageDownload.suggestedFilename()).toBe("workspace.png");
  expect(await readFile(await imageDownload.path())).toEqual(IMAGE);
  await imagePreview
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(imagePreview).not.toBeVisible();
  await expect(editor.locator("[data-record-file]")).toHaveCount(3);
  await editor.getByRole("button", { name: /^offer\.pdf/ }).click();
  const pdfPreview = page.getByRole("dialog", {
    name: "offer.pdf",
    exact: true,
  });
  await expect(
    pdfPreview.getByRole("heading", { name: "offer.pdf", exact: true }),
  ).toBeVisible();
  if (await page.evaluate(() => navigator.pdfViewerEnabled === true)) {
    await expect(
      pdfPreview.locator('iframe[title="Preview offer.pdf"]'),
    ).toBeVisible();
  } else {
    await expect(pdfPreview.getByRole("status")).toContainText(
      "PDF preview is unavailable in this browser",
    );
    await expect(pdfPreview.locator("iframe")).toHaveCount(0);
  }
  const [pdfDownload] = await Promise.all([
    page.waitForEvent("download"),
    pdfPreview
      .getByRole("button", { name: "Download file", exact: true })
      .first()
      .click(),
  ]);
  expect(await readFile(await pdfDownload.path())).toEqual(OFFER);
  await pdfPreview.getByRole("button", { name: "Close", exact: true }).click();
  await expect(pdfPreview).not.toBeVisible();
  await saveRecord(page, drawer);
  await expect
    .poll(async () =>
      (await storedFiles(database, companyId, fieldId)).map(
        ({ name, status }) => [name, status],
      ),
    )
    .toEqual([
      ["notes.txt", "ready"],
      ["offer.pdf", "ready"],
      ["workspace.png", "ready"],
    ]);
  const [notes, offer, photo] = await storedFiles(database, companyId, fieldId);
  expect([Number(notes.size), Number(offer.size), Number(photo.size)]).toEqual([
    NOTES.byteLength,
    OFFER.byteLength,
    IMAGE.byteLength,
  ]);

  if (!test.info().project.use.isMobile) {
    const row = recordItem(page, "Example organization");
    await expect(
      row.getByRole("link", { name: /^Open notes\.txt \(/ }),
    ).toBeVisible();
    await expect(
      row.getByRole("link", { name: /^Open offer\.pdf \(/ }),
    ).toHaveAttribute("href", `/api/v1/files/${offer.id}/content`);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      row.getByRole("link", { name: /^Open notes\.txt \(/ }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("notes.txt");
    expect(await readFile(await download.path())).toEqual(NOTES);
    await row.getByRole("link", { name: /^Open workspace\.png \(/ }).click();
    await expect(
      imagePreview.getByRole("img", { name: "workspace.png", exact: true }),
    ).toBeVisible();
    await imagePreview
      .getByRole("button", { name: "Close", exact: true })
      .click();
  }

  const content = await page.request.get(`/api/v1/files/${notes.id}/content`);
  expect(content.status()).toBe(200);
  expect(content.headers()).toMatchObject({
    "content-type": "text/plain",
    "content-disposition":
      "attachment; filename=\"notes.txt\"; filename*=UTF-8''notes.txt",
    "x-content-type-options": "nosniff",
    "cache-control": "private, no-store",
    "content-security-policy": "frame-ancestors 'self'",
  });
  expect(Buffer.from(await content.body())).toEqual(NOTES);
  const inline = await page.request.get(`/api/v1/files/${offer.id}/content`);
  expect(inline.headers()).toMatchObject({
    "content-type": "application/pdf",
    "content-security-policy": "sandbox; frame-ancestors 'self'",
  });
  expect(inline.headers()["content-disposition"]).toMatch(/^inline; /);
  const details = await page.request.get(`/api/v1/files/${notes.id}`);
  expect(details.status()).toBe(200);
  const { downloadUrl } = (await details.json()) as { downloadUrl: string };
  const anonymous = await playwright.request.newContext();
  try {
    const signed = await anonymous.get(downloadUrl);
    expect(signed.status()).toBe(200);
    expect(Buffer.from(await signed.body())).toEqual(NOTES);
    expect(
      (
        await anonymous.get(downloadUrl.replace(/token=[^&]+/u, "token=0.0.0"))
      ).status(),
    ).toBe(401);
  } finally {
    await anonymous.dispose();
  }

  await openRecordDetails(page, "Example organization");
  await editor
    .getByRole("button", { name: "Remove notes.txt", exact: true })
    .click();
  await expect(editor.locator("[data-record-file]")).toHaveCount(2);
  await saveRecord(page, drawer);
  await expect
    .poll(async () =>
      (await storedFiles(database, companyId, fieldId)).map(
        ({ name, status }) => [name, status],
      ),
    )
    .toEqual([
      ["notes.txt", "detached"],
      ["offer.pdf", "ready"],
      ["workspace.png", "ready"],
    ]);
  expect(
    (await page.request.get(`/api/v1/files/${notes.id}/content`)).status(),
  ).toBe(404);

  if (process.env.APP_MODE !== "self-hosted") {
    await database.query(
      'UPDATE "Subscription" SET plan = \'enterprise\', "enterpriseFileStorageBytesPerUser" = 1024 WHERE "companyId" = $1',
      [companyId],
    );
    diagnostics.expect({
      kind: "console",
      text: /^Failed to load resource: the server responded with a status of 409/,
      source: (url) => url.pathname === "/api/v1/files/uploads",
      page,
    });
    await openRecordDetails(page, "Example organization");
    const quotaRefusal = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/files/uploads" &&
        response.status() === 409,
    );
    await editor
      .locator('input[type="file"]')
      .setInputFiles([
        {
          name: "large.bin",
          mimeType: "application/octet-stream",
          buffer: Buffer.alloc(2048, 7),
        },
      ]);
    const refused = editor.locator('[data-record-file-upload="failed"]');
    await expect(refused).toContainText("large.bin");
    await expect(refused).toContainText(
      /Your workspace uses .+ of its 1 kB file storage\./,
    );
    await quotaRefusal;
    await editor
      .getByRole("button", { name: "Remove large.bin", exact: true })
      .click();
    await expect(refused).toHaveCount(0);
    await expect(editor.locator("[data-record-file]")).toHaveCount(2);
  }
  expect(await storedFiles(database, companyId, fieldId)).toHaveLength(3);
  expect(errors).toEqual([]);
});
