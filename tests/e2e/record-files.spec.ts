import type { Locator, Page } from "@playwright/test";
import type { Client } from "pg";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { presetId } from "../../features/records/crm-preset";
import { WORKSPACE_HEADER } from "../../core/navigation/workspace-paths";
import {
  docxFixture,
  pdfFixture,
  xlsxFixture,
} from "../helpers/record-file-fixtures";
import {
  addFromConfigure,
  configureDrawer,
  openConfigure,
  saveDrawer,
} from "./configure";
import { appApiPath, companyPath, companySlug } from "./app-paths";
import { mintApiKey } from "./api-key";
import { test, expect, collectPageErrors } from "./fixtures";
import { openRecordDetails, recordItem } from "./record-rows";

const NOTES = Buffer.from("Meeting notes\nAgreed on the renewal.\n");
const OFFER = Buffer.from(
  pdfFixture([
    ["Example offer", "Synthetic record attachment for preview verification."],
  ]),
);
const IMAGE = readFileSync("public/captures/light/homepage-dashboard-en.png");
const VIDEO = readFileSync("tests/fixtures/record-video.mp4");

function largeVideo() {
  // A valid MP4 free-space atom makes the real upload exceed the former 25 MB cap.
  const bytes = Buffer.alloc(26 * 1024 * 1024);
  bytes.set(VIDEO);
  bytes.writeUInt32BE(bytes.byteLength - VIDEO.byteLength, VIDEO.byteLength);
  bytes.write("free", VIDEO.byteLength + 4);
  return bytes;
}

async function checkStreamingUpload(
  database: Client,
  companyId: string,
  target: { fileId: string; url: URL; headers: Record<string, string>; parts: number },
) {
  // Storage must receive the first part while the rest of the request is still withheld.
  let releaseUpload!: () => void;
  const firstPartStored = new Promise<void>((resolve) => { releaseUpload = resolve; });
  const part = new Uint8Array(1024 * 1024);
  let sent = 0;
  const abort = new AbortController();
  const request: RequestInit & { duplex: "half" } = {
    method: "PUT",
    headers: target.headers,
    signal: abort.signal,
    duplex: "half",
    body: new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (sent > 0) await firstPartStored;
        if (sent === target.parts * part.byteLength) return controller.close();
        controller.enqueue(part);
        sent += part.byteLength;
      },
    }),
  };
  const uploading = fetch(target.url, request);
  void uploading.catch(() => undefined);
  try {
    await expect.poll(async () => {
      const result = await database.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM "RecordFileContent" c JOIN "RecordFile" f ON f."storageKey" = c."fileKey" WHERE f.id = $1 AND f."companyId" = $2',
        [target.fileId, companyId],
      );
      return result.rows[0].count;
    }).toBeGreaterThan(0);
    releaseUpload();
    const uploaded = await uploading;
    expect(uploaded.status).toBe(200);
    expect(await uploaded.json()).toMatchObject({ fileId: target.fileId, size: target.parts * part.byteLength });
    const parts = await database.query<{ count: number; largest: number }>(
      'SELECT COUNT(*)::int AS count, MAX(octet_length(c.data)) AS largest FROM "RecordFileContent" c JOIN "RecordFile" f ON f."storageKey" = c."fileKey" WHERE f.id = $1 AND f."companyId" = $2',
      [target.fileId, companyId],
    );
    expect(parts.rows[0]).toEqual({ count: target.parts, largest: part.byteLength });
  } finally {
    releaseUpload();
    abort.abort();
    await uploading.catch(() => undefined);
  }
}

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

async function createFileField(
  page: Page,
  database: Client,
  companyId: string,
  typeId: string,
  label: string,
) {
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
  return fieldId;
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

  const fieldId = await createFileField(
    page,
    database,
    companyId,
    typeId,
    label,
  );

  await page.goto(companyPath(companyId, `/records/${typeId}`));
  await openRecordDetails(page, "Example organization");
  const drawer = page.getByRole("dialog", {
    name: "Organization",
    exact: true,
  });
  const editor = drawer.getByRole("group", { name: label, exact: true });
  const addRow = editor.locator("[data-record-file-add]");
  await expect(addRow).toHaveText("Add files or drop them here");
  const fieldCount = drawer.locator(`[data-entity-field="${fieldId}"] [data-record-file-count]`);
  await expect(fieldCount).toHaveCount(0);
  const chooser = page.waitForEvent("filechooser");
  await addRow.click();
  await (await chooser).setFiles([
    { name: "notes.txt", mimeType: "text/plain", buffer: NOTES },
    { name: "offer.pdf", mimeType: "application/pdf", buffer: OFFER },
    { name: "workspace.png", mimeType: "image/png", buffer: IMAGE },
  ]);
  await expect(editor.locator("[data-record-file]")).toHaveCount(3);
  await expect(editor.locator("[data-record-file-upload]")).toHaveCount(0);

  const list = editor.locator("[data-record-file-add]").locator("xpath=ancestor::ul/..");
  const dropped = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["# Plan\n"], "plan.md", { type: "text/markdown" }));
    return transfer;
  });
  await list.dispatchEvent("dragover", { dataTransfer: dropped });
  await expect(list).toHaveAttribute("data-dragging", "true");
  await expect(editor.locator("[data-record-file-drop-overlay]")).toHaveText(`Drop to add to ${label}`);
  await list.dispatchEvent("drop", { dataTransfer: dropped });
  await expect(editor.locator("[data-record-file-drop-overlay]")).toHaveCount(0);
  await expect(editor.locator("[data-record-file]")).toHaveCount(4);
  await expect(editor.locator("[data-record-file-upload]")).toHaveCount(0);
  await expect(fieldCount).toHaveText("4");

  const fileRow = (name: string) => editor.locator("[data-record-file]", { hasText: name });
  for (const [name, kind, text] of [
    ["notes.txt", "text", "TXT"],
    ["offer.pdf", "pdf", "PDF"],
    ["plan.md", "markdown", "MD"],
  ]) {
    await expect(fileRow(name).locator("[data-file-badge]")).toHaveAttribute("data-file-badge", kind);
    await expect(fileRow(name).locator("[data-file-badge]")).toHaveText(text);
  }
  await expect(fileRow("workspace.png").locator('img[data-file-badge="image"]')).toBeVisible();
  await expect(fileRow("workspace.png").locator("[data-record-file-meta]")).toContainText(/^\d+ × \d+ · [\d.]+ [KM]B · /u);
  await expect(fileRow("notes.txt").locator("[data-record-file-meta]")).toContainText(`${NOTES.byteLength} B · `);

  await fileRow("notes.txt").hover();
  await expect(fileRow("notes.txt").locator("[data-item-actions-trigger]")).toBeVisible();
  const [rowDownload] = await Promise.all([
    page.waitForEvent("download"),
    fileRow("notes.txt").getByRole("button", { name: "Download notes.txt", exact: true }).click(),
  ]);
  expect(rowDownload.suggestedFilename()).toBe("notes.txt");
  expect(await readFile(await rowDownload.path())).toEqual(NOTES);

  const order = await editor.locator("[data-record-file] [data-record-file-name]").allTextContents();
  const at = order.indexOf("workspace.png");
  const after = order[(at + 1) % order.length];
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
  await expect(imagePreview.locator("[data-record-file-position]")).toHaveText(
    `${at + 1} of 4 in ${label}`,
  );
  await expect(imagePreview.locator("[data-record-file-preview-meta]")).toContainText(
    /^Image · \d+ × \d+ · [\d.]+ [KM]B · Added by .+ · /u,
  );
  await expect(
    imagePreview.getByRole("link", { name: "Open in new tab", exact: true }),
  ).toHaveAttribute("href", /^\/api\/w\/[^/]+\/v1\/files\/[^/]+\/content$/u);
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
  await page.getByRole("button", { name: "Next file", exact: true }).click();
  const stepped = page.getByRole("dialog", { name: after, exact: true });
  await expect(stepped.getByRole("heading", { name: after, exact: true })).toBeVisible();
  await expect(stepped.locator("[data-record-file-position]")).toHaveText(
    `${((at + 1) % 4) + 1} of 4 in ${label}`,
  );
  await page.keyboard.press("ArrowLeft");
  await expect(imagePreview.getByRole("heading", { name: "workspace.png", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(stepped.getByRole("heading", { name: after, exact: true })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await imagePreview
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(imagePreview).not.toBeVisible();
  await expect(editor.locator("[data-record-file]")).toHaveCount(4);
  await editor.getByRole("button", { name: /^offer\.pdf/ }).click();
  const pdfPreview = page.getByRole("dialog", {
    name: "offer.pdf",
    exact: true,
  });
  await expect(
    pdfPreview.getByRole("heading", { name: "offer.pdf", exact: true }),
  ).toBeVisible();
  if (await page.evaluate(() => navigator.pdfViewerEnabled !== false)) {
    const frame = pdfPreview.locator('iframe[title="Preview offer.pdf"]');
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute("src", /^\/api\/w\/[^/]+\/v1\/files\/[^/]+\/content$/u);
    await expect(pdfPreview.getByText("PDF preview is unavailable in this browser")).toHaveCount(0);
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
      ["plan.md", "ready"],
      ["workspace.png", "ready"],
    ]);
  const [notes, offer, , photo] = await storedFiles(database, companyId, fieldId);
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
    ).toHaveAttribute("href", new RegExp(`/v1/files/${offer.id}/content$`, "u"));
    await row.getByRole("link", { name: /^Open notes\.txt \(/ }).click();
    const notesPreview = page.getByRole("dialog", {
      name: "notes.txt",
      exact: true,
    });
    await expect(notesPreview.locator("pre")).toContainText(
      "Agreed on the renewal.",
    );
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      notesPreview
        .getByRole("button", { name: "Download file", exact: true })
        .click(),
    ]);
    expect(download.suggestedFilename()).toBe("notes.txt");
    expect(await readFile(await download.path())).toEqual(NOTES);
    await notesPreview
      .getByRole("button", { name: "Close", exact: true })
      .click();
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
    "content-security-policy": "frame-ancestors 'self'",
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
  const named = (name: string) =>
    editor.locator("[data-record-file]", {
      has: page.locator("[data-record-file-name]", { hasText: new RegExp(`^${name.replaceAll(".", "\\.")}$`, "u") }),
    });
  await named("plan.md").hover();
  await named("plan.md").locator("[data-item-actions-trigger]").click();
  await page.getByRole("menuitem", { name: "Rename plan.md", exact: true }).click();
  const nameInput = editor.getByRole("textbox", { name: "File name", exact: true });
  await expect(nameInput).toBeFocused();
  await expect(nameInput).toHaveValue("plan.md");
  expect(
    await nameInput.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd]),
  ).toEqual([0, 4]);
  await page.keyboard.type("plan final");
  const renamed = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().includes("/v1/files/"),
  );
  await page.keyboard.press("Enter");
  await expect(named("plan final.md")).toBeVisible();
  expect((await renamed).status()).toBe(200);
  await expect(named("plan.md")).toHaveCount(0);
  await expect
    .poll(async () => (await storedFiles(database, companyId, fieldId)).map(({ name }) => name))
    .toContain("plan final.md");

  await named("plan final.md").hover();
  await named("plan final.md").locator("[data-item-actions-trigger]").click();
  await page.getByRole("menuitem", { name: "Rename plan final.md", exact: true }).click();
  await expect(nameInput).toBeFocused();
  await page.keyboard.type("discarded");
  await page.keyboard.press("Escape");
  await expect(nameInput).toHaveCount(0);
  await expect(drawer).toBeVisible();
  await expect(named("plan final.md")).toBeVisible();

  await named("plan final.md").locator("[data-record-file-name]").click();
  const renamedPreview = page.getByRole("dialog", { name: "plan final.md", exact: true });
  await expect(renamedPreview.getByRole("heading", { name: "plan final.md", exact: true })).toBeVisible();
  const [renamedDownload] = await Promise.all([
    page.waitForEvent("download"),
    renamedPreview.getByRole("button", { name: "Download file", exact: true }).first().click(),
  ]);
  expect(renamedDownload.suggestedFilename()).toBe("plan final.md");
  await renamedPreview.getByRole("button", { name: "Rename plan final.md", exact: true }).click();
  const drawerInput = renamedPreview.getByRole("textbox", { name: "File name", exact: true });
  await expect(drawerInput).toBeFocused();
  await page.keyboard.type("plan v2");
  await page.keyboard.press("Enter");
  await expect(renamedPreview).toHaveCount(0);
  const renamedAgain = page.getByRole("dialog", { name: "plan v2.md", exact: true });
  await expect(renamedAgain.getByRole("heading", { name: "plan v2.md", exact: true })).toBeVisible();
  await renamedAgain.getByRole("button", { name: "Close", exact: true }).click();
  await expect(named("plan v2.md")).toBeVisible();

  const notesTile = editor.locator("[data-record-file]", { hasText: "notes.txt" });
  await notesTile.hover();
  await notesTile.locator("[data-item-actions-trigger]").click();
  await page.getByRole("menuitem", { name: "Remove notes.txt", exact: true }).click();
  await expect(editor.locator("[data-record-file]")).toHaveCount(3);
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
      ["plan v2.md", "ready"],
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
      source: (url) => /^\/api(?:\/w\/[^/]+)?\/v1\/files\/uploads$/u.test(url.pathname),
      page,
    });
    await openRecordDetails(page, "Example organization");
    const quotaRefusal = page.waitForResponse(
      (response) =>
        /^\/api(?:\/w\/[^/]+)?\/v1\/files\/uploads$/u.test(new URL(response.url()).pathname) &&
        response.status() === 409,
    );
    await editor.locator('input[type="file"]').setInputFiles([
      {
        name: "large.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.alloc(2048, 7),
      },
    ]);
    const refused = editor.locator('[data-record-file-upload="failed"]');
    await expect(refused).toContainText("large.bin");
    await expect(refused).toContainText(
      /Your workspace uses .+ of its 1 KB file storage\./,
    );
    await quotaRefusal;
    await editor
      .getByRole("button", { name: "Remove large.bin", exact: true })
      .click();
    await expect(refused).toHaveCount(0);
    await expect(editor.locator("[data-record-file]")).toHaveCount(3);
  }
  expect(await storedFiles(database, companyId, fieldId)).toHaveLength(4);
  expect(errors).toEqual([]);
});

test("uploads a video over 25 MB, previews and seeks it privately, and falls back for unreadable MP4 files", async ({
  page,
  database,
  companyId,
  playwright,
  workspace,
}, testInfo) => {
  test.setTimeout(300000);
  const typeId = presetId(companyId, "organization");
  const label = `Video files ${randomUUID().slice(0, 6)}`;
  const fieldId = await createFileField(
    page,
    database,
    companyId,
    typeId,
    label,
  );
  const bytes = largeVideo();
  await page.goto(companyPath(companyId, `/records/${typeId}`));
  await openRecordDetails(page, "Example organization");
  const drawer = page.getByRole("dialog", {
    name: "Organization",
    exact: true,
  });
  const editor = drawer.getByRole("group", { name: label, exact: true });
  await editor.locator('input[type="file"]').setInputFiles([
    { name: "demo.mp4", mimeType: "video/mp4", buffer: bytes },
    {
      name: "broken.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("unreadable video"),
    },
  ]);
  await expect(editor.locator("[data-record-file]")).toHaveCount(2);
  await expect(editor.locator("[data-record-file-upload]")).toHaveCount(0);
  await saveRecord(page, drawer);
  const stored = await storedFiles(database, companyId, fieldId);
  const { key } = await mintApiKey(database, workspace, "File streaming");
  for (const mode of ["grant", "api-key", "workspace-api-key"] as const) {
    const parts = mode === "grant" ? 64 : 32;
    const streaming = await page.request.post("/api/v1/files/uploads", {
      data: { typeId, fieldId, name: `${mode}.bin`, mimeType: "application/octet-stream", size: parts * 1024 * 1024 },
    });
    expect(streaming.status()).toBe(200);
    const target = await streaming.json() as {
      fileId: string;
      upload: { url: string; method: string; headers: Record<string, string> };
    };
    const url = new URL(target.upload.url);
    expect(url.pathname).toBe(`/api/v1/files/${target.fileId}/content`);
    const invalidUpload = new URL(url);
    invalidUpload.searchParams.set("token", "invalid");
    expect((await page.request.put(invalidUpload.href, {
      data: "refused",
      headers: { [WORKSPACE_HEADER]: "forged" },
    })).status()).toBe(401);
    invalidUpload.search = "token=&token=invalid";
    expect((await page.request.put(invalidUpload.href, {
      data: "refused",
      headers: { [WORKSPACE_HEADER]: "forged" },
    })).status()).toBe(400);
    const headers: Record<string, string> = { ...target.upload.headers, [WORKSPACE_HEADER]: "forged" };
    if (mode !== "grant") {
      url.searchParams.delete("token");
      headers["x-api-key"] = key;
      if (mode === "workspace-api-key") url.pathname = appApiPath(companySlug(companyId), url.pathname);
    }
    await checkStreamingUpload(database, companyId, { fileId: target.fileId, url, headers, parts });
  }
  for (const storageDriver of ["s3", "vercel-blob"]) {
    const reserved = await page.request.post("/api/v1/files/uploads", {
      data: { typeId, fieldId, name: `${storageDriver}.mp4`, mimeType: "video/mp4", size: 26 * 1024 * 1024 },
    });
    expect(reserved.status()).toBe(200);
    const target = await reserved.json() as { fileId: string };
    await database.query('UPDATE "RecordFile" SET "storageDriver" = $1 WHERE id = $2 AND "companyId" = $3', [
      storageDriver, target.fileId, companyId,
    ]);
    const refused = await page.request.put(`/api/v1/files/${target.fileId}/content`, {
      data: "refused",
      headers: { "x-api-key": key, [WORKSPACE_HEADER]: "forged" },
    });
    expect(refused.status()).toBe(400);
    expect(await refused.text()).toContain("recordFileUploadTargetRequired");
  }
  const master = await page.request.post("/api/v1/files/uploads", {
    data: { typeId, fieldId, name: "master.mp4", mimeType: "video/mp4", size: 830238702 },
  });
  expect(master.status()).toBe(200);
  const tooLarge = await page.request.post("/api/v1/files/uploads", {
    data: { typeId, fieldId, name: "over-limit.mp4", mimeType: "video/mp4", size: 1024 * 1024 * 1024 + 1 },
  });
  expect(tooLarge.status()).toBe(400);
  expect(await tooLarge.text()).toContain("A file can be at most 1 GB.");
  const file = stored.find((item) => item.name === "demo.mp4");
  if (!file) throw new Error("The large video was not saved");
  expect([file.status, Number(file.size)]).toEqual(["ready", bytes.byteLength]);
  const path = `/api/v1/files/${file.id}/content`;
  const range = await page.request.get(path, {
    headers: { range: "bytes=0-63" },
  });
  expect(range.status()).toBe(206);
  expect(range.headers()).toMatchObject({
    "content-type": "video/mp4",
    "content-length": "64",
    "content-range": `bytes 0-63/${bytes.byteLength}`,
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
  });
  expect(range.headers()["content-disposition"]).toMatch(/^inline;/u);
  expect(await range.body()).toEqual(bytes.subarray(0, 64));
  const tail = await page.request.get(path, {
    headers: { range: "bytes=-32" },
  });
  expect(tail.status()).toBe(206);
  expect(await tail.body()).toEqual(bytes.subarray(-32));
  const outside = await page.request.get(path, {
    headers: { range: `bytes=${bytes.byteLength}-` },
  });
  expect(outside.status()).toBe(416);
  expect(outside.headers()["content-range"]).toBe(
    `bytes */${bytes.byteLength}`,
  );
  const details = await page.request.get(`/api/v1/files/${file.id}`);
  expect(details.status()).toBe(200);
  const { downloadUrl } = (await details.json()) as { downloadUrl: string };
  const anonymous = await playwright.request.newContext();
  try {
    expect((await anonymous.get(new URL(path, page.url()).href)).status()).toBe(401);
    const granted = await anonymous.get(downloadUrl, {
      headers: { range: "bytes=0-63" },
    });
    expect(granted.status()).toBe(206);
    expect(await granted.body()).toEqual(bytes.subarray(0, 64));
  } finally {
    await anonymous.dispose();
  }
  await openRecordDetails(page, "Example organization");
  await editor.getByRole("button", { name: /^demo\.mp4/ }).click();
  const preview = page.getByRole("dialog", { name: "demo.mp4", exact: true });
  const video = preview.locator("video[data-record-file-video]");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("preload", "metadata");
  await expect(video).toHaveAttribute("playsinline", "");
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.readyState),
    )
    .toBeGreaterThan(0);
  expect(
    await video.evaluate((element: HTMLVideoElement) => ({
      controls: element.controls,
      paused: element.paused,
      autoplay: element.autoplay,
      width: element.videoWidth,
      duration: element.duration,
    })),
  ).toEqual({
    controls: true,
    paused: true,
    autoplay: false,
    width: 160,
    duration: 12,
  });
  await video.evaluate(async (element: HTMLVideoElement) => {
    element.muted = true;
    await element.play();
  });
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeGreaterThan(0.25);
  await video.focus();
  await video.press("ArrowRight");
  await expect(preview).toBeVisible();
  await video.evaluate((element: HTMLVideoElement) => {
    element.pause();
    element.currentTime = 8;
  });
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.seeking))
    .toBe(false);
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeGreaterThanOrEqual(8);
  const screenshot = testInfo.outputPath("video-preview.png");
  await preview.screenshot({ path: screenshot });
  await testInfo.attach("video-preview", {
    path: screenshot,
    contentType: "image/png",
  });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    preview.getByRole("button", { name: "Download file", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("demo.mp4");
  expect(await readFile(await download.path())).toEqual(bytes);
  const player = await video.elementHandle();
  await video.evaluate(async (element: HTMLVideoElement) => {
    await element.play();
  });
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await expect(preview).not.toBeVisible();
  expect(
    await player?.evaluate((element: HTMLVideoElement) => element.paused),
  ).toBe(true);
  await editor.getByRole("button", { name: /^broken\.mp4/ }).click();
  const broken = page.getByRole("dialog", { name: "broken.mp4", exact: true });
  await expect(broken.getByRole("status")).toContainText("Preview unavailable");
  await expect(broken.getByRole("status")).toContainText(
    "Download it to open it in its original app.",
  );
  const [original] = await Promise.all([
    page.waitForEvent("download"),
    broken
      .getByRole("button", { name: "Download file", exact: true })
      .last()
      .click(),
  ]);
  expect(await readFile(await original.path())).toEqual(
    Buffer.from("unreadable video"),
  );
});

test("previews Excel, CSV, Word and text files in the record drawer with bounded content and a download fallback", async ({
  page,
  database,
  companyId,
  playwright,
}) => {
  test.setTimeout(300000);
  const typeId = presetId(companyId, "organization");
  const label = `Documents ${randomUUID().slice(0, 6)}`;
  const fieldId = await createFileField(
    page,
    database,
    companyId,
    typeId,
    label,
  );
  const workbook = Buffer.from(
    await xlsxFixture({
      Budget: [
        ["Item", "Amount"],
        ["Kickoff", { formula: "100+50", result: 150 }],
        ...Array.from({ length: 203 }, (_, index) => [`Line ${index}`, index]),
      ],
      Tasks: [
        ["Task", "Owner"],
        ["Review", "Alex"],
      ],
    }),
  );
  const files = [
    {
      name: "Budget.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: workbook,
    },
    {
      name: "Contacts.csv",
      mimeType: "text/csv",
      buffer: Buffer.from('Name,Notes\nAcme,"First line\nSecond, line"\n'),
    },
    {
      name: "Brief.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from(
        docxFixture([
          { heading: 1, text: "Project brief" },
          { text: "Kickoff in Mannheim." },
        ]),
      ),
    },
    {
      name: "Notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(`Meeting notes\n${"long".repeat(500)}`),
    },
    {
      name: "Plan.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        '# Plan\n<img src="https://example.org/pixel" onerror="alert(1)">',
      ),
    },
    {
      name: "Data.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"count":2,"name":"Acme"}'),
    },
    {
      name: "Broken.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from("Not a valid Office archive"),
    },
  ];
  await page.goto(companyPath(companyId, `/records/${typeId}`));
  await openRecordDetails(page, "Example organization");
  const drawer = page.getByRole("dialog", {
    name: "Organization",
    exact: true,
  });
  const editor = drawer.getByRole("group", { name: label, exact: true });
  await editor.locator('input[type="file"]').setInputFiles(files);
  await expect(editor.locator("[data-record-file]")).toHaveCount(files.length);
  await expect(editor.locator("[data-record-file-upload]")).toHaveCount(0);
  for (const [name, kind, text, meta] of [
    ["Budget.xlsx", "spreadsheet", "XLSX", "B · "],
    ["Contacts.csv", "csv", "CSV", "B · "],
    ["Brief.docx", "document", "DOCX", "B · "],
    ["Plan.md", "markdown", "MD", "B · "],
    ["Data.json", "json", "JSON", "B · "],
  ]) {
    const badge = editor.locator("[data-record-file]", { hasText: name }).locator("[data-file-badge]");
    await expect(badge).toHaveAttribute("data-file-badge", kind);
    await expect(badge).toHaveText(text);
    await expect(
      editor.locator("[data-record-file]", { hasText: name }).locator("[data-record-file-meta]"),
    ).toContainText(meta);
  }
  const open = async (name: string) => {
    await editor
      .getByRole("button", {
        name: new RegExp(`^${name.replaceAll(".", "\\.")}`),
      })
      .click();
    const preview = page.getByRole("dialog", { name, exact: true });
    await expect(
      preview.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    return preview;
  };
  const close = async (preview: Locator) => {
    expect(
      await preview.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
    await preview.getByRole("button", { name: "Close", exact: true }).click();
    await expect(preview).not.toBeVisible();
    await expect(editor.locator("[data-record-file]")).toHaveCount(
      files.length,
    );
  };
  const excel = await open("Budget.xlsx");
  await expect(
    excel.getByRole("table", { name: "Budget", exact: true }),
  ).toContainText("150");
  await expect(excel.getByRole("status")).toContainText(
    "Only part of this file is shown",
  );
  expect(await excel.getByRole("table").getByRole("row").count()).toBe(201);
  await excel.getByRole("tab", { name: "Tasks", exact: true }).click();
  await expect(
    excel.getByRole("table", { name: "Tasks", exact: true }),
  ).toContainText("Alex");
  await excel
    .getByRole("tab", { name: "Tasks", exact: true })
    .press("ArrowLeft");
  await expect(
    excel.getByRole("table", { name: "Budget", exact: true }),
  ).toBeVisible();
  await expect(excel.getByRole("heading", { name: "Budget.xlsx", exact: true })).toBeVisible();
  await expect(excel.locator("[data-record-file-preview-meta]")).toContainText(/^Spreadsheet · [\d.]+ KB · /u);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    excel.getByRole("button", { name: "Download file", exact: true }).click(),
  ]);
  expect(await readFile(await download.path())).toEqual(workbook);
  await close(excel);
  const csv = await open("Contacts.csv");
  await expect(
    csv.getByRole("table", { name: "CSV", exact: true }),
  ).toContainText("Second, line");
  await close(csv);
  for (const [name, text] of [
    ["Brief.docx", "Kickoff in Mannheim."],
    ["Notes.txt", "Meeting notes"],
    ["Plan.md", "<img src="],
    ["Data.json", '"count": 2'],
  ]) {
    const preview = await open(name);
    await expect(preview.locator("pre")).toContainText(text);
    await expect(preview.locator("img,script")).toHaveCount(0);
    await close(preview);
  }
  const broken = await open("Broken.docx");
  await expect(broken.getByRole("status")).toContainText(
    "This file could not be previewed",
  );
  const [brokenDownload] = await Promise.all([
    page.waitForEvent("download"),
    broken
      .getByRole("button", { name: "Download file", exact: true })
      .first()
      .click(),
  ]);
  expect(await readFile(await brokenDownload.path())).toEqual(
    files.at(-1)?.buffer,
  );
  await close(broken);
  await saveRecord(page, drawer);
  const stored = await storedFiles(database, companyId, fieldId);
  const excelFile = stored.find((file) => file.name === "Budget.xlsx");
  expect(excelFile?.status).toBe("ready");
  const saved = await page.request.get(
    `/api/v1/files/${excelFile?.id}/preview`,
  );
  expect(saved.status()).toBe(200);
  expect(saved.headers()["cache-control"]).toBe("private, no-store");
  expect(await saved.json()).toMatchObject({ kind: "sheets", truncated: true });
  const anonymous = await playwright.request.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    expect(
      (await anonymous.get(`/api/v1/files/${excelFile?.id}/preview`)).status(),
    ).toBe(401);
  } finally {
    await anonymous.dispose();
  }
});
