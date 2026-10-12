import type { Page } from "@playwright/test";

import { randomUUID } from "node:crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { presetId } from "../../features/records/crm-preset";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";
import {
  createConfiguredList,
  deleteSelectedList,
  openConfigure,
} from "./configure";
import { secondUser } from "./second-user";

const NOT_FOUND_DOCUMENT =
  /Failed to load resource: the server responded with a status of 404/;

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message) && !NOT_FOUND_DOCUMENT.test(message.text()))
      errors.push(message.text());
  });
  return errors;
}

async function createView(
  page: Page,
  surfaceKey: string,
  name: string,
): Promise<string> {
  const response = await page.request.post("/api/v1/data-views/create", {
    data: { surfaceKey, name, state: {} },
  });
  expect(response.status(), await response.text()).toBe(200);
  const { viewKey } = (await response.json()) as { viewKey: string };
  return viewKey;
}

async function expectNotFoundPage(page: Page) {
  await expect(
    page.getByText(englishMessages.NotFoundPage.title, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(englishMessages.ErrorCard.title)).toHaveCount(0);
}

test("shows the not-found page for an unknown or foreign list instead of the error page", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = collectErrors(page);

  for (const typeId of [randomUUID(), presetId(randomUUID(), "deal")]) {
    await page.goto(`/en/records/${typeId}`);
    await expectNotFoundPage(page);

    await page.goto(`/en/records/${typeId}/${randomUUID()}`);
    await expectNotFoundPage(page);
  }

  expect(errors).toEqual([]);
});

test("falls back to the All view and drops an unknown or foreign view id from the list URL", async ({
  page,
  companyId,
}) => {
  test.setTimeout(120000);
  const errors = collectErrors(page);
  const dealTypeId = presetId(companyId, "deal");
  const contactTypeId = presetId(companyId, "contact");
  const ownView = await createView(
    page,
    `records:${dealTypeId}`,
    `Own deals ${randomUUID().slice(0, 6)}`,
  );
  const contactView = await createView(
    page,
    `records:${contactTypeId}`,
    `Contacts ${randomUUID().slice(0, 6)}`,
  );
  const selected = await page.request.post("/api/v1/data-views/select", {
    data: { surfaceKey: `records:${dealTypeId}`, viewKey: "__all__" },
  });
  expect(selected.status(), await selected.text()).toBe(200);

  for (const viewId of [randomUUID(), contactView]) {
    await page.goto(`/en/records/${dealTypeId}?view=${viewId}&searchTerm=zz`);
    await expect
      .poll(() => {
        const url = new URL(page.url());
        return {
          path: url.pathname,
          searchTerm: url.searchParams.get("searchTerm"),
          view: url.searchParams.get("view"),
        };
      })
      .toEqual({
        path: `/en/records/${dealTypeId}`,
        searchTerm: "zz",
        view: null,
      });
    await expect(page.locator("#records-add")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("view")).toBeNull();
    await expect(page.getByText(englishMessages.ErrorCard.title)).toHaveCount(
      0,
    );
    await expect(
      page.getByText(englishMessages.NotFoundPage.title, { exact: true }),
    ).toHaveCount(0);
  }

  await page.goto(`/en/records/${dealTypeId}?view=${ownView}`);
  await expect(page.locator("#records-add")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`[?&]view=${ownView}`));

  await page.goto(`/en/dashboard?view=${randomUUID()}`);
  await expect(page.locator("[data-joins-top-bar]")).toBeVisible();
  await expect(
    page.getByText(englishMessages.Dashboard.mainView, { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(englishMessages.ErrorCard.title)).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("shows a trashed list as In Trash with restore for schema managers and as not found for a member without access", async ({
  page,
  browser,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors = collectErrors(page);
  const model = await page.request.post("/api/v1/model/read", { data: {} });
  expect(model.status()).toBe(200);
  const { revision } = (await model.json()) as { revision: number };
  const saved = await page.request.post("/api/v1/roles/save", {
    data: {
      name: `Contacts only ${randomUUID().slice(0, 6)}`,
      description: "Reads contacts and nothing else",
      permissions: [{ resource: "company", actions: [] }],
      recordGrants: [
        { typeId: presetId(companyId, "contact"), actions: ["readAll"] },
      ],
      expectedRevision: revision,
      idempotencyKey: randomUUID(),
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  const roleId = ((await saved.json()) as { role: { id: string } }).role.id;
  const member = await secondUser(
    browser,
    database,
    companyId,
    testInfo,
    roleId,
  );
  try {
    const dealTypeId = presetId(companyId, "deal");
    await member.page.goto(`/en/records/${dealTypeId}`);
    await expect(
      member.page.getByText(englishMessages.NotFoundPage.title, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      member.page.getByText(englishMessages.ErrorCard.title),
    ).toHaveCount(0);

    const name = `Partners ${randomUUID().slice(0, 6)}`;
    const typeId = await createConfiguredList(page, name);
    await openConfigure(page, typeId);
    await deleteSelectedList(page);
    await expect(page.locator(`[id="nav-records:${typeId}"]`)).toHaveCount(0);

    await page.goto(`/en/records/${typeId}`);
    const trashState = page.locator("[data-record-list-trash]");
    await expect(trashState).toContainText(name);
    await expect(trashState).toContainText(englishMessages.Trash.inTrash);
    await expect(page.getByText(englishMessages.ErrorCard.title)).toHaveCount(
      0,
    );

    await member.page.goto(`/en/records/${typeId}`);
    await expect(
      member.page.getByText(englishMessages.NotFoundPage.title, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(member.page.getByText(name)).toHaveCount(0);

    await page.locator("#record-list-restore").click();
    await expect(page.locator("#records-add")).toBeVisible();
    await expect(trashState).toHaveCount(0);
  } finally {
    await member.close();
  }

  expect(errors).toEqual([]);
});
