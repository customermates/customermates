import { randomUUID } from "node:crypto";
import { test, expect, collectPageErrors } from "./fixtures";
import { postOk, readModel } from "./api";
import { presetId } from "../../features/records/crm-preset";
import { linkedRecordNames, linkedRecordOpeners, openRecordDetails } from "./record-rows";
import { secondUser } from "./second-user";
import { expectHydrated } from "./workspace-switching";
import { pagePath } from "./app-paths";

test("shows the full name of truncated direct and derived relationship chips on focus and hover", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const id = (key: string) => presetId(companyId, key);
  const model = await readModel(database, companyId);
  const type = model.types.find((candidate) => candidate.id === id("deal"));
  if (!type) throw new Error("The deal fixture type is missing");
  const pathId = randomUUID();
  await postOk(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "putType",
        type: {
          ...type,
          relationshipPaths: [
            ...(type.relationshipPaths ?? []),
            {
              id: pathId,
              label: "Related organizations",
              archived: false,
              path: [{ relationId: id("deal.organizations"), direction: "outgoing" }],
            },
          ],
        },
      },
    ],
  });
  const name = "Sonnenhof Fire and Safety - Enterprise regional service and logistics operations";
  const organization = await postOk(page, "/api/v1/records/mutate", {
    expectedRevision: model.revision + 1,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId: id("organization"),
      fields: [{ fieldId: id("organization.name"), value: { kind: "text", value: name } }],
    },
  });
  const deal = await postOk(page, "/api/v1/records/mutate", {
    expectedRevision: model.revision + 1,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId: id("deal"),
      fields: [{ fieldId: id("deal.name"), value: { kind: "text", value: "Relationship tooltip parent" } }],
      links: [
        {
          relationId: id("deal.organizations"),
          direction: "outgoing",
          record: { typeId: id("organization"), recordId: organization.refs[0].recordId },
        },
      ],
    },
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(pagePath(page, `/records/${id("deal")}/${deal.refs[0].recordId}`));
  const main = page.getByRole("main");
  const fields = [
    main.locator(`[data-entity-field="relationship:${id("deal.organizations")}:outgoing"]`),
    main.locator(`[data-entity-field="path:${pathId}"]`),
  ];
  const tooltip = page.getByRole("tooltip", { name, exact: true });
  for (const field of fields) {
    const label = field.getByRole("button", { name: `Open ${name}`, exact: true });
    await expect(label).toBeVisible();
    await expectHydrated(label);
    expect(await label.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(true);
    await page.keyboard.press("Tab");
    await label.scrollIntoViewIfNeeded();
    await expect(label).toBeInViewport();
    await label.focus();
    await expect(label).toBeFocused();
    await expect.poll(() => label.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooltip).not.toBeVisible();
    if (!testInfo.project.use.hasTouch) {
      await page.mouse.move(1, 1);
      await label.hover();
      await expect(tooltip).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(tooltip).not.toBeVisible();
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const field of fields) {
    const label = field.getByRole("button", { name: `Open ${name}`, exact: true });
    await expect.poll(() => label.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await label.focus();
    await expect(tooltip).not.toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("keeps 100 linked deals within three chip rows, pages and opens them in the drawer and unlinks through the picker", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const errors = collectPageErrors(page);
  const id = (key: string) => presetId(companyId, key);
  const org = await database.query('SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 LIMIT 1', [
    companyId,
    id("organization"),
  ]);
  const recordId = org.rows[0].id as string;
  await page.goto(pagePath(page, `/records/${id("organization")}`));
  const model = await readModel(database, companyId);
  for (let index = 0; index < 100; index++) {
    await postOk(page, "/api/v1/records/mutate", {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId: id("deal"),
        fields: [
          {
            fieldId: id("deal.name"),
            value: {
              kind: "text",
              value: `Overflow deal ${String(index).padStart(3, "0")} - ${"Regional workspace expansion ".repeat(3)}`,
            },
          },
        ],
        links: [
          {
            relationId: id("deal.organizations"),
            direction: "outgoing",
            record: { typeId: id("organization"), recordId },
          },
        ],
      },
    });
  }
  await postOk(page, "/api/v1/records/mutate", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId: id("deal"),
      fields: [{ fieldId: id("deal.name"), value: { kind: "text", value: "Unlinked sentinel deal" } }],
    },
  });
  const field = page.locator(`[data-entity-field="relationship:${id("deal.organizations")}:incoming"]`);
  const more = () => field.getByRole("button", { name: /^\+\d+ more$/ });
  const chips = () => field.locator("[data-chip-id]");
  await page.goto(pagePath(page, `/records/${id("organization")}/${recordId}`));
  await expect(more()).toBeVisible();
  const baseCount = await database.query(
    'SELECT COUNT(*)::integer AS count FROM "RecordLink" WHERE "companyId"=$1 AND "relationId"=$2 AND "targetId"=$3 AND "deletedAt" IS NULL',
    [companyId, id("deal.organizations"), recordId],
  );
  expect(baseCount.rows[0].count).toBe(100);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(async () =>
        chips().evaluateAll((elements) => {
          const parent = elements[0]?.parentElement;
          if (!parent) throw new Error("The relationship chip stack is missing");
          return new Set(
            Array.from(parent.children)
              .filter((element) => element.hasAttribute("data-chip-id") || element.tagName === "BUTTON")
              .map((element) => Math.round(element.getBoundingClientRect().top)),
          ).size;
        }),
      )
      .toBe(3);
    const hidden = Number((await more().innerText()).match(/\d+/)?.[0]);
    expect((await chips().count()) + hidden).toBe(100);
    expect(await field.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  const previewName = await chips()
    .getByRole("button", { name: /^Open / })
    .first()
    .innerText();
  await more().scrollIntoViewIfNeeded();
  await more().click();
  const drawer = page.getByRole("dialog").filter({ has: page.locator("[data-linked-records]") });
  await expect(drawer.getByRole("heading", { name: "Deals", exact: true })).toBeVisible();
  await expect(drawer).toContainText("100 records");
  const rows = linkedRecordOpeners(drawer);
  await expect(rows).toHaveCount(25);
  const [first] = await linkedRecordNames(drawer);
  await drawer.getByRole("button", { name: "Next page", exact: true }).click();
  await expect.poll(async () => (await linkedRecordNames(drawer)).includes(first)).toBe(false);
  await expect(drawer).not.toContainText("Unlinked sentinel deal");
  const [opened] = await linkedRecordNames(drawer);
  await rows.first().click();
  await expect(drawer).toHaveCount(0);
  const nested = page.getByRole("dialog", { name: "Deal", exact: true });
  await expect.poll(async () => (await nested.getByRole("textbox", { name: "Name", exact: true }).inputValue()).trim()).toBe(opened);
  await nested.getByRole("button", { name: "Close", exact: true }).click();
  await expect(nested).not.toBeVisible();
  const popover = page.getByRole("dialog", { name: "Deals", exact: true });
  await field.locator("[data-relationship-field]").click({ position: { x: 3, y: 3 } });
  await popover.locator('[data-slot="command-input"]').fill(previewName);
  const linked = popover.getByRole("option", { name: previewName, exact: true });
  await expect(linked.locator(".lucide-check")).toHaveCount(1);
  await linked.click();
  await expect(linked.locator(".lucide-check")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(popover).not.toBeVisible();
  const link = field.getByRole("combobox", { name: "Deals", exact: true });
  // The blank part of the bordered input still opens its normal picker.
  await field.locator("[data-relationship-field]").click({ position: { x: 3, y: 3 } });
  await expect(popover).toBeVisible();
  await expect(popover.locator('[data-slot="command-input"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popover).not.toBeVisible();
  await expect(link).toBeFocused();
  await page.getByRole("main").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("[data-slot='unsaved-changes-bar']")).toHaveCount(0);
  await page.reload();
  await expect(more()).toBeVisible();
  const remaining = await database.query(
    'SELECT COUNT(*)::integer AS count FROM "RecordLink" WHERE "companyId"=$1 AND "relationId"=$2 AND "targetId"=$3 AND "deletedAt" IS NULL',
    [companyId, id("deal.organizations"), recordId],
  );
  expect(remaining.rows[0].count).toBe(99);
  expect((await chips().count()) + Number((await more().innerText()).match(/\d+/)?.[0])).toBe(99);
  await page.screenshot({ path: testInfo.outputPath("three-row-deal-preview.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});

test("returns focus after resizing away a read-only relationship overflow opener", async ({
  page,
  browser,
  database,
  companyId,
}, testInfo) => {
  const id = (key: string) => presetId(companyId, key);
  await page.goto(pagePath(page, `/records/${id("organization")}`));
  const model = await readModel(database, companyId);
  const created = await postOk(page, "/api/v1/records/mutate", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId: id("organization"),
      fields: [{ fieldId: id("organization.name"), value: { kind: "text", value: "Read-only overflow organization" } }],
    },
  });
  const recordId = created.refs[0].recordId as string;
  for (let index = 0; index < 4; index++) {
    await postOk(page, "/api/v1/records/mutate", {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId: id("deal"),
        fields: [
          { fieldId: id("deal.name"), value: { kind: "text", value: `Regional delivery expansion deal ${index}` } },
        ],
        links: [
          {
            relationId: id("deal.organizations"),
            direction: "outgoing",
            record: { typeId: id("organization"), recordId },
          },
        ],
      },
    });
  }
  const role = await postOk(page, "/api/v1/roles/save", {
    name: "Overflow readers",
    description: "Read organizations and deals without writes",
    permissions: [{ resource: "company", actions: [] }],
    recordGrants: ["organization", "deal"].map((key) => ({ typeId: id(key), actions: ["readAll"] })),
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
  });
  const reader = await secondUser(browser, database, companyId, testInfo, role.role.id);
  try {
    await reader.page.setViewportSize({ width: 390, height: 900 });
    await reader.page.goto(pagePath(reader.page, `/records/${id("organization")}/${recordId}`));
    const field = reader.page.locator(`[data-entity-field="relationship:${id("deal.organizations")}:incoming"]`);
    const more = field.getByRole("button", { name: /^\+\d+ more$/ });
    await expect(field.getByRole("combobox")).toHaveCount(0);
    await expect(more).toBeVisible();
    await more.click();
    const drawer = reader.page.getByRole("dialog").filter({ has: reader.page.locator("[data-linked-records]") });
    await expect(drawer).toContainText("4 records");
    await reader.page.setViewportSize({ width: 1600, height: 900 });
    await expect(more).toHaveCount(0);
    await reader.page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(field.locator("[data-relationship-field]")).toBeFocused();
    await expect(field.getByRole("button", { name: /^Unlink / })).toHaveCount(0);
    expect(reader.errors).toEqual([]);
    await reader.page.screenshot({ path: testInfo.outputPath("read-only-overflow-focus.png"), animations: "disabled" });
  } finally {
    await reader.close();
  }
});

test("wraps and expands plain text, edits it directly, and preserves the saved value on page and drawer", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const typeId = presetId(companyId, "organization");
  await page.goto(pagePath(page, `/records/${typeId}`));
  const model = await readModel(database, companyId);
  const fieldId = randomUUID();
  await postOk(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "putField",
        field: {
          id: fieldId,
          typeId,
          label: "Plain notes",
          valueType: "text",
          required: false,
          behavior: { kind: "input" },
          options: [],
          position: 99,
        },
      },
    ],
  });
  const current = await readModel(database, companyId);
  const text =
    "This is a long customer note that wraps across lines without losing the complete saved text. ".repeat(20) +
    "\n" +
    "unbroken-reference-".repeat(40);
  const result = await postOk(page, "/api/v1/records/mutate", {
    expectedRevision: current.revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId,
      fields: [
        {
          fieldId: presetId(companyId, "organization.name"),
          value: { kind: "text", value: "Overflow text organization" },
        },
        { fieldId, value: { kind: "text", value: text } },
      ],
    },
  });
  const recordId = result.refs[0].recordId as string;
  const field = page.locator(`[data-entity-field="${fieldId}"]`);
  await page.goto(pagePath(page, `/records/${typeId}/${recordId}`));
  await expect(field.getByRole("button", { name: "Show more", exact: true })).toBeVisible();
  const name = page.getByRole("main").getByRole("heading").getByRole("textbox", { name: "Name", exact: true });
  const longName = text.replaceAll("\n", " ");
  await name.fill(longName);
  await expect(name).toBeFocused();
  await expect(name).toHaveValue(longName);
  await name.fill("Overflow text organization");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      document.documentElement.classList.toggle("dark", theme === "dark");
    }, theme);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => field.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await field.getByRole("button", { name: "Show more", exact: true }).click();
      await expect(field.getByRole("textbox", { name: "Plain notes", exact: true })).toHaveValue(text);
      await field.getByRole("button", { name: "Show less", exact: true }).click();
    }
  }
  await field.getByRole("button", { name: "Edit Plain notes", exact: true }).click();
  const editor = field.getByRole("textbox", { name: "Plain notes", exact: true });
  await expect(editor).toBeFocused();
  const updated = text + "\nConfirmed for the next review.";
  await editor.fill(updated);
  await page.keyboard.press("Escape");
  await expect(field.getByRole("button", { name: "Edit Plain notes", exact: true })).toBeFocused();
  await page.getByRole("main").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("[data-slot='unsaved-changes-bar']")).toHaveCount(0);
  await page.reload();
  await field.getByRole("button", { name: "Show more", exact: true }).click();
  await expect(editor).toHaveValue(updated);
  const stored = await database.query(
    'SELECT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
    [companyId, typeId, recordId, fieldId],
  );
  expect(stored.rows[0].textValue).toBe(updated);
  await page.goto(pagePath(page, `/records/${typeId}`));
  await openRecordDetails(page, "Overflow text organization");
  const drawer = page.getByRole("dialog", { name: "Organization", exact: true });
  await drawer
    .locator(`[data-entity-field="${fieldId}"]`)
    .getByRole("button", { name: "Show more", exact: true })
    .click();
  await expect(drawer.getByRole("textbox", { name: "Plain notes", exact: true })).toHaveValue(updated);
  await page.screenshot({ path: testInfo.outputPath("expanded-plain-text.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});

test("fills a widened relationship column with chips before the remaining count", async ({
  page,
  database,
  companyId,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, "Column widths apply to the desktop table");
  const id = (key: string) => presetId(companyId, key);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(pagePath(page, `/records/${id("organization")}`));
  const model = await readModel(database, companyId);
  const created = await postOk(page, "/api/v1/records/mutate", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId: id("organization"),
      fields: [{ fieldId: id("organization.name"), value: { kind: "text", value: "Aaa wide chips organization" } }],
    },
  });
  const recordId = created.refs[0].recordId as string;
  for (let index = 0; index < 6; index++) {
    await postOk(page, "/api/v1/records/mutate", {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId: id("deal"),
        fields: [{ fieldId: id("deal.name"), value: { kind: "text", value: `Wide deal ${index}` } }],
        links: [
          {
            relationId: id("deal.organizations"),
            direction: "outgoing",
            record: { typeId: id("organization"), recordId },
          },
        ],
      },
    });
  }
  await page.goto(pagePath(page, `/records/${id("organization")}?searchTerm=${encodeURIComponent("Aaa wide chips")}`));
  const row = page.locator(`tr[data-row-id="${recordId}"]`);
  const chips = row.locator(`[data-chip-id^="${id("deal")}:"]`);
  const more = row.getByRole("button", { name: /^\+\d+/ });
  await expect(chips.first()).toBeVisible();
  await expect.poll(() => chips.count()).toBeLessThan(6);
  await expect(more).toBeVisible();
  const readable = () =>
    chips.evaluateAll((elements) => elements.every((element) => element.getBoundingClientRect().width >= 60));
  const resize = page.getByRole("button", { name: /^Resize Deals column\./ });
  const width = () => resize.evaluate((element) => element.closest("th")!.getBoundingClientRect().width);
  for (let step = 0; step < 20; step++) await resize.press("Shift+ArrowRight");
  await expect.poll(width).toBeGreaterThan(700);
  await expect(chips).toHaveCount(6);
  await expect(more).toHaveCount(0);
  await expect.poll(readable).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("wide-relationship-column.png"), animations: "disabled" });
  await resize.press("Home");
  await expect.poll(width).toBeLessThan(200);
  await expect.poll(() => chips.count()).toBeLessThan(6);
  await expect(more).toBeVisible();
});
