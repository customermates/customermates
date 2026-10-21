import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { addFromConfigure, openConfigure, saveDrawer } from "./configure";
import { test, expect } from "./fixtures";
import { postOk, readModel } from "./api";

test("opens or copies contact values and edits them from empty cell space", async ({
  page,
  context,
  companyId,
}, testInfo) => {
  test.skip(
    Boolean(test.info().project.use.isMobile),
    "Editing from empty cell space belongs to the desktop table cells; phone rows have no cells",
  );
  test.setTimeout(300000);
  if (testInfo.project.name === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const typeId = presetId(companyId, "organization");
  const suffix = randomUUID().slice(0, 6);
  const emailLabel = `Billing email ${suffix}`;
  const siteLabel = `Homepage ${suffix}`;

  await openConfigure(page, typeId);
  for (const [label, type, action] of [
    [emailLabel, "Email", "Copy address"],
    [siteLabel, "Web address", null],
  ] as const) {
    await addFromConfigure(page, "Field");
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("textbox", { name: "Name", exact: false }).fill(label);
    await drawer.getByRole("combobox", { name: "Value type", exact: true }).click();
    await page.getByRole("option", { name: type, exact: true }).click();
    const onClick = drawer.getByRole("combobox", { name: "On click", exact: true });
    await expect(onClick).toContainText(type === "Email" ? "Open in mail app" : "Open link");
    if (action) {
      await onClick.click();
      await page.getByRole("option", { name: action, exact: true }).click();
    }
    await saveDrawer(page);
  }

  const email = `billing-${suffix}@example.test`;
  const site = `https://example.test/${suffix}`;
  await page.goto(`/en/records/${typeId}?viewMode=table`);
  const recordDrawer = page.getByRole("dialog", { name: "Organization", exact: true });
  await page.locator("#records-add").click();
  await recordDrawer.getByRole("textbox", { name: "Name", exact: false }).fill(`Contact ${suffix}`);
  await recordDrawer.getByRole("textbox", { name: emailLabel, exact: true }).fill(email);
  await recordDrawer.getByRole("textbox", { name: siteLabel, exact: true }).fill(site);
  await expect(recordDrawer.getByRole("button", { name: "Copy address", exact: true })).toBeVisible();
  await expect(recordDrawer.getByRole("link", { name: "Open link", exact: true })).toHaveAttribute("href", site);
  await recordDrawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(recordDrawer).not.toBeVisible();

  const row = page.getByRole("row").filter({ hasText: `Contact ${suffix}` });
  const link = row.getByRole("link", { name: site, exact: true });
  await expect(link).toHaveAttribute("href", site);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(row.getByRole("link", { name: email, exact: true })).toHaveCount(0);

  await row.getByRole("button", { name: email, exact: true }).click();
  await expect(page.getByText(`${email} copied to clipboard`, { exact: true })).toBeVisible();
  if (testInfo.project.name === "chromium")
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(email);
  await expect(recordDrawer).not.toBeVisible();

  const space = row.locator(`[data-inline-edit-space]`).filter({ hasText: email });
  await space.scrollIntoViewIfNeeded();
  const box = await space.boundingBox();
  if (!box) throw new Error("The email cell is not rendered");
  await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
  const editor = row.locator("[data-in-place-editor]");
  await expect(editor.getByRole("textbox", { name: emailLabel, exact: true })).toHaveValue(email);
  await expect(editor.getByRole("textbox", { name: emailLabel, exact: true })).toBeFocused();
  await expect(recordDrawer).not.toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
});

test("contact chips reuse inline copy actions without reserved space across detail, table and card surfaces", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as typeof window & { copiedValue?: string }).copiedValue = value;
        },
      },
    });
  });
  const typeId = presetId(companyId, "organization");
  const fields = [
    {
      id: randomUUID(),
      label: "Billing",
      valueType: "email",
      action: "copy",
      value: "billing.person.with.a.long.name@regional-service.example.test",
    },
    {
      id: randomUUID(),
      label: "Support",
      valueType: "email",
      action: "open",
      value: "support.person.with.a.long.name@regional-service.example.test",
    },
    {
      id: randomUUID(),
      label: "Website",
      valueType: "url",
      action: "open",
      value: "https://example.test/a/long/path/for/the/regional/customer/support/guide",
    },
    { id: randomUUID(), label: "Telephone", valueType: "phone", action: "open", value: "+493012345678" },
  ];
  await page.goto(`/en/records/${typeId}`);
  const model = await readModel(database, companyId);
  await postOk(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: fields.map((field, index) => ({
      operation: "putField",
      field: {
        id: field.id,
        typeId,
        label: field.label,
        valueType: field.valueType,
        required: false,
        behavior: { kind: "input" },
        options: [],
        position: 30 + index,
        format: { onClick: field.action },
      },
    })),
  });
  const created = await postOk(page, "/api/v1/records/mutate", {
    expectedRevision: (await readModel(database, companyId)).revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId,
      fields: [
        { fieldId: presetId(companyId, "organization.name"), value: { kind: "text", value: "Inline contact actions" } },
        ...fields.map((field) => ({ fieldId: field.id, value: { kind: "text", value: field.value } })),
      ],
    },
  });
  const recordId = created.refs[0].recordId as string;
  await page.goto(`/en/records/${typeId}/${recordId}`);
  for (const field of fields) {
    await page.getByRole("button", { name: "Pin or unpin fields", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: field.label, exact: true }).click();
    await page.keyboard.press("Escape");
  }
  const chip = (fieldId: string) => page.locator(`[data-record-chip-row] [data-chip-column="${fieldId}"]`);
  const fineHover = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => document.documentElement.classList.toggle("dark", theme === "dark"), theme);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const field of fields) {
        const value = chip(field.id).locator('[data-slot="copyable-text"]');
        await expect(value).toBeVisible();
        await page.mouse.move(0, 0);
        await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
        const before = await value.evaluate((element) => {
          const label = element.tagName === "BUTTON" ? element.querySelector("span")! : element.querySelector("a")!;
          return { width: element.getBoundingClientRect().width, textWidth: label.getBoundingClientRect().width };
        });
        if (fineHover) {
          expect(Math.abs(before.width - before.textWidth)).toBeLessThan(1);
          await value.hover();
          await expect
            .poll(() =>
              value.evaluate((element) => {
                const action =
                  element.tagName === "BUTTON" ? element.querySelector("svg")! : element.querySelector("button")!;
                return Number(getComputedStyle(action).opacity);
              }),
            )
            .toBeGreaterThan(0.5);
          await expect(page.getByRole("tooltip").filter({ hasText: field.value }).first()).toBeVisible();
          const after = await value.boundingBox();
          expect(Math.abs(after!.width - before.width)).toBeLessThan(1);
        }
        const action = field.action === "copy" ? value : value.getByRole("button");
        await action.focus();
        await page.keyboard.press("Enter");
        await expect
          .poll(() => page.evaluate(() => (window as typeof window & { copiedValue?: string }).copiedValue))
          .toBe(field.value);
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(chip(field.id).locator("button a, a button")).toHaveCount(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  }
  await page.screenshot({ path: testInfo.outputPath("contact-chip-actions.png"), animations: "disabled" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/en/records/${typeId}?viewMode=table`);
  const row = page.getByRole("row").filter({ hasText: "Inline contact actions" });
  await row.getByRole("button", { name: fields[0].value, exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/en/records/${typeId}?viewMode=card&groupBy=system%3AcreatedAt`);
    const value = page.locator(`[data-chip-column="${fields[0].id}"] [data-slot="contact-value"]`);
    await expect(value).toBeVisible();
    await value.getByRole("button", { name: fields[0].value, exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});
