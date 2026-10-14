import type { Page } from "@playwright/test";
import type { Client } from "pg";
import { presetId } from "../../features/records/crm-preset";
import { configureDrawer, openConfigure, openConfigureRow, saveDrawer } from "./configure";
import { expect, test, collectPageErrors } from "./fixtures";
import { readModel } from "./api";

test("shows and saves the per-direction message switches of a relationship", async ({ page, database, companyId }) => {
  const errors = collectPageErrors(page);
  const relationId = presetId(companyId, "deal.contacts");
  const before = (await readModel(database, companyId)).relationships.find((relation) => relation.id === relationId);
  expect(before).toMatchObject({ messagesOnSource: true, messagesOnTarget: false });

  await openConfigure(page, presetId(companyId, "deal"));
  await openConfigureRow(page, "Relationships", "Contacts");
  const drawer = configureDrawer(page);
  const onDeals = drawer.getByRole("switch", { name: "Show their messages on Deals", exact: true });
  const onContacts = drawer.getByRole("switch", { name: "Show their messages on Contacts", exact: true });
  await expect(onDeals).toBeChecked();
  await expect(onContacts).not.toBeChecked();
  await expect(drawer.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  await onContacts.click();
  await expect(onContacts).toBeChecked();
  await saveDrawer(page);
  await expect
    .poll(async () =>
      (await readModel(database, companyId)).relationships.find((relation) => relation.id === relationId),
    )
    .toMatchObject({ messagesOnSource: true, messagesOnTarget: true });

  await openConfigureRow(page, "Relationships", "Contacts");
  await expect(onContacts).toBeChecked();
  await onContacts.click();
  await saveDrawer(page);
  await expect
    .poll(async () =>
      (await readModel(database, companyId)).relationships.find((relation) => relation.id === relationId),
    )
    .toMatchObject({ messagesOnSource: true, messagesOnTarget: false });
  expect(errors).toEqual([]);
});
