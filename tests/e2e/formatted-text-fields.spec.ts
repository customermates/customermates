import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect, isBenignPageError } from "./fixtures";
import {
  openRecordDetails,
  recordItem,
  editFormattedText,
} from "./record-rows";
import { applyPaletteSearch, clearPaletteSearch } from "./filter-palette";
import { presetId } from "../../features/records/crm-preset";
import { serializeJSONToMarkdown } from "@/components/editor/editor.utils";

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, timeout: 120000 });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

test("edits two formatted text fields inline in the overview, collapses long text and shows table excerpts", async ({
  page,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  const typeId = presetId(companyId, "organization");
  await page.goto(`/en/records/${typeId}`);
  const current = await post(page, "/api/v1/model/discover", {});
  const summaryId = randomUUID();
  const applied = await post(page, "/api/v1/model/apply", {
    expectedRevision: current.revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "putField",
        field: {
          id: summaryId,
          typeId,
          label: "Summary",
          valueType: "richText",
          required: false,
          behavior: { kind: "input" },
          options: [],
          position: 99,
        },
      },
    ],
  });
  expect(applied).toMatchObject({ status: "completed" });

  const name = `Formatted ${randomUUID().slice(0, 6)}`;
  await page.reload();
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", {
    name: "Organization",
    exact: true,
  });
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  await expect(
    drawer.getByRole("tab", { name: "Notes", exact: true }),
  ).toHaveCount(0);
  await expect(drawer.getByText("Add Notes", { exact: true })).toBeVisible();
  await expect(drawer.getByText("Add Summary", { exact: true })).toBeVisible();

  await editFormattedText(drawer, "Notes");
  const notes = drawer.getByRole("textbox", { name: "Notes", exact: true });
  await expect(notes).toBeFocused();
  await page.keyboard.type(
    Array.from(
      { length: 12 },
      (_, index) => `Line ${index + 1} about the renewal call.`,
    ).join("\n"),
  );
  await page.keyboard.press("Escape");
  await expect(drawer).toBeVisible();
  await expect(
    drawer.locator('[data-formatted-text-field][data-state="display"]'),
  ).toHaveCount(2);
  await expect(
    drawer.getByRole("button", { name: "Edit Notes", exact: true }),
  ).toBeFocused();
  await expect(
    drawer.getByRole("button", { name: "Show more", exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByText("Line 12 about the renewal call.", { exact: true }),
  ).not.toBeInViewport();
  await drawer.getByRole("button", { name: "Show more", exact: true }).click();
  await drawer
    .getByText("Line 12 about the renewal call.", { exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    drawer.getByText("Line 12 about the renewal call.", { exact: true }),
  ).toBeInViewport();
  await expect(
    drawer.getByRole("button", { name: "Show less", exact: true }),
  ).toBeVisible();

  await editFormattedText(drawer, "Summary");
  await drawer
    .getByRole("textbox", { name: "Summary", exact: true })
    .fill("Expansion likely in Q3");
  await drawer.getByRole("textbox", { name: "Name", exact: false }).click();
  await expect(
    drawer.locator('[data-formatted-text-field][data-state="editing"]'),
  ).toHaveCount(0);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();

  await page.locator("#records-display-options").click();
  for (const label of ["Notes", "Summary"])
    await page.getByRole("checkbox", { name: label, exact: true }).check();
  await page.keyboard.press("Escape");
  const row = recordItem(page, name);
  await expect(row).toContainText(
    "Line 1 about the renewal call. Line 2 about the renewal call.",
  );
  await expect(row).toContainText("Expansion likely in");
  await applyPaletteSearch(page, "records-filter", "renewal call");
  await expect(recordItem(page, name)).toBeVisible();
  await expect(recordItem(page, "Example organization")).toHaveCount(0);
  await clearPaletteSearch(page, "records-filter");
  await applyPaletteSearch(page, "records-filter", "Q3");
  await expect(recordItem(page, name)).toBeVisible();
  await clearPaletteSearch(page, "records-filter");

  await openRecordDetails(page, name);
  await expect(
    drawer.getByRole("textbox", { name: "Summary", exact: true }),
  ).toContainText("Expansion likely in Q3");
  await page.screenshot({
    path: testInfo.outputPath("formatted-text-drawer.png"),
    animations: "disabled",
  });
  await drawer.getByRole("button", { name: "Close", exact: true }).click();

  const dealTypeId = presetId(companyId, "deal");
  const latest = await post(page, "/api/v1/model/discover", {});
  const created = await post(page, "/api/v1/records/mutate", {
    expectedRevision: latest.revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId: dealTypeId,
      fields: [
        {
          fieldId: presetId(companyId, "deal.name"),
          value: { kind: "text", value: `Card ${name}` },
        },
        {
          fieldId: presetId(companyId, "deal.notes"),
          value: {
            kind: "richText",
            documentJson: JSON.stringify({
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Budget approved for the pilot." },
                  ],
                },
              ],
            }),
          },
        },
      ],
    },
  });
  const dealId = created.refs.find(
    (ref: { typeId: string }) => ref.typeId === dealTypeId,
  ).recordId;
  await page.goto(
    `/en/records/${dealTypeId}?viewMode=card&groupBy=${presetId(companyId, "deal.stage")}`,
  );
  const card = page.locator(`[data-item-id="${dealId}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator("[data-card-excerpt]")).toHaveCount(0);
  await expect(card).not.toContainText("Budget approved");
  await page.locator("#records-display-options").click();
  await page.getByRole("checkbox", { name: "Notes", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(card.locator("[data-card-excerpt]")).toHaveText(
    "Budget approved for the pilot.",
  );
  await expect(card.locator("[data-chip-row]")).not.toContainText(
    "Budget approved",
  );
  expect(errors).toEqual([]);
});

test("keeps a bulk-edited formatted text on Escape and follows links in display mode", async ({
  page,
  companyId,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "Bulk selection uses the desktop table's row checkboxes; phone rows have no selection",
  );
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  const typeId = presetId(companyId, "organization");
  await page.goto(`/en/records/${typeId}`);
  const suffix = randomUUID().slice(0, 6);
  const names = [`Bulk A ${suffix}`, `Bulk B ${suffix}`];
  const linked = `Linked ${suffix}`;
  const brief = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Read the " },
          {
            type: "text",
            text: "brief",
            marks: [
              { type: "link", attrs: { href: "https://example.com/brief" } },
            ],
          },
          { type: "text", text: " before the call." },
        ],
      },
    ],
  };
  for (const name of [...names, linked]) {
    const current = await post(page, "/api/v1/model/discover", {});
    await post(page, "/api/v1/records/mutate", {
      expectedRevision: current.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId,
        fields: [
          {
            fieldId: presetId(companyId, "organization.name"),
            value: { kind: "text", value: name },
          },
          ...(name === linked
            ? [
                {
                  fieldId: presetId(companyId, "organization.notes"),
                  value: {
                    kind: "richText",
                    documentJson: JSON.stringify(brief),
                  },
                },
              ]
            : []),
        ],
      },
    });
  }
  await page.reload();
  for (const name of names)
    await recordItem(page, name).getByRole("checkbox").check();
  await page
    .locator("[data-record-mass-actions]")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const bulk = page.getByRole("dialog", { name: "Edit", exact: true });
  await bulk.getByRole("button", { name: "Notes", exact: true }).click();
  await editFormattedText(bulk, "Notes");
  await expect(
    bulk.getByRole("textbox", { name: "Notes", exact: true }),
  ).toBeFocused();
  await page.keyboard.type("Renewal agreed for the brief");
  await page.keyboard.press("Escape");
  await expect(bulk).toBeVisible();
  await expect(
    bulk.locator('[data-formatted-text-field][data-state="display"]'),
  ).toHaveCount(1);
  await expect(
    bulk.getByRole("textbox", { name: "Notes", exact: true }),
  ).toHaveAttribute("aria-readonly", "true");
  await expect(
    bulk.getByRole("textbox", { name: "Notes", exact: true }),
  ).toContainText("for the brief");
  await bulk.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("[data-record-mass-actions]")).not.toBeVisible();

  await openRecordDetails(page, names[0]);
  const bulkDrawer = page.getByRole("dialog", {
    name: "Organization",
    exact: true,
  });
  await expect(
    bulkDrawer.getByRole("textbox", { name: "Notes", exact: true }),
  ).toContainText("Renewal agreed for the brief");
  await bulkDrawer.getByRole("button", { name: "Close", exact: true }).click();

  await openRecordDetails(page, linked);
  const drawer = page.getByRole("dialog", {
    name: "Organization",
    exact: true,
  });
  const field = drawer.locator("[data-formatted-text-field]").filter({
    has: page.getByRole("textbox", { name: "Notes", exact: true }),
  });
  await expect(field).toHaveAttribute("data-state", "display");
  const link = field.getByRole("link", { name: "brief", exact: true });
  await expect(link).toBeVisible();
  await page
    .context()
    .route("https://example.com/**", (route) =>
      route.fulfill({ status: 200, body: "brief" }),
    );
  const popup = page.context().waitForEvent("page");
  await link.click();
  await (await popup).close();
  await expect(field).toHaveAttribute("data-state", "display");
  await field
    .getByText("before the call.", { exact: false })
    .click({ position: { x: 2, y: 4 } });
  await expect(field).toHaveAttribute("data-state", "editing");
  expect(errors).toEqual([]);
});

test("formats a formatted text field from its toolbar without leaving edit mode", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  const dealTypeId = presetId(companyId, "deal");
  await page.goto(`/en/records/${dealTypeId}`);
  const current = await post(page, "/api/v1/model/discover", {});
  const created = await post(page, "/api/v1/records/mutate", {
    expectedRevision: current.revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId: dealTypeId,
      fields: [
        {
          fieldId: presetId(companyId, "deal.name"),
          value: { kind: "text", value: `Toolbar ${randomUUID().slice(0, 6)}` },
        },
      ],
    },
  });
  const dealId = created.refs.find(
    (ref: { typeId: string }) => ref.typeId === dealTypeId,
  ).recordId;
  await page.goto(`/en/records/${dealTypeId}/${dealId}`);
  const main = page.getByRole("main");
  const notes = main.getByRole("textbox", { name: "Notes", exact: true });
  const field = main
    .locator("[data-formatted-text-field]")
    .filter({ has: page.locator("[role=textbox][aria-label=Notes]") });
  const toolbar = field.getByRole("toolbar", {
    name: "Formatting",
    exact: true,
  });
  await expect(field).toHaveAttribute("data-state", "display");
  await expect(toolbar).toHaveCount(0);

  await editFormattedText(main, "Notes");
  await expect(toolbar).toBeVisible();
  await expect(notes).toBeFocused();
  await page.keyboard.type("Plan");
  const heading = toolbar.getByRole("button", { name: "Heading", exact: true });
  await heading.click();
  await expect(notes.locator("h1")).toHaveText("Plan");
  await heading.click();
  await expect(notes.locator("h2")).toHaveText("Plan");
  await expect(heading).toHaveAttribute("data-heading-level", "2");
  await expect(field).toHaveAttribute("data-state", "editing");
  await expect(notes).toBeFocused();

  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Make this bold");
  for (let index = 0; index < 4; index++)
    await page.keyboard.press("Shift+ArrowLeft");
  const bold = toolbar.getByRole("button", { name: "Bold", exact: true });
  await bold.click();
  await expect(notes.locator("strong")).toHaveText("bold");
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(field).toHaveAttribute("data-state", "editing");
  await expect(notes).toBeFocused();
  await expect(notes.locator("p", { hasText: "Make this" })).toHaveText(
    "Make this bold",
  );

  await page.keyboard.press("End");
  await expect(page.locator("[data-editor-menu]")).toHaveCount(0);
  await field.scrollIntoViewIfNeeded();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await field.screenshot({
      path: testInfo.outputPath(`formatted-text-toolbar-${scheme}.png`),
      animations: "disabled",
    });
  }
  await page.emulateMedia({ colorScheme: "light" });

  await page.keyboard.press("Escape");
  await expect(field).toHaveAttribute("data-state", "display");
  await expect(toolbar).toHaveCount(0);
  await main.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    main.getByRole("button", { name: "Reset", exact: true }),
  ).not.toBeVisible();
  const savedMarkdown = async () => {
    const saved = await database.query(
      'SELECT "jsonValue" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
      [companyId, dealTypeId, dealId, presetId(companyId, "deal.notes")],
    );
    return saved.rows[0]?.jsonValue
      ? serializeJSONToMarkdown(saved.rows[0].jsonValue)
      : "";
  };
  await expect.poll(savedMarkdown).toContain("Make this **bold**");
  expect(await savedMarkdown()).toContain("## Plan");
  expect(errors).toEqual([]);
});
