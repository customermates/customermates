import type { Locator, Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { Client } from "pg";
import { presetId } from "../../features/records/crm-preset";
import { addFromConfigure, openConfigure, saveDrawer } from "./configure";
import { test, expect, collectPageErrors } from "./fixtures";
import { openRecordDetails } from "./record-rows";

const lookupUrl = process.env.ADDRESS_LOOKUP_URL ? new URL(process.env.ADDRESS_LOOKUP_URL) : null;
if (lookupUrl && (!["127.0.0.1", "localhost"].includes(lookupUrl.hostname) || !lookupUrl.port))
  throw new Error("The browser suite only serves address lookups from a loopback mock with an explicit port.");

const PHOTON_FEATURES = [
  {
    type: "Feature",
    geometry: { type: "Point", coordinates: [8.5370071, 49.4857901] },
    properties: {
      type: "house",
      housenumber: "5",
      street: "Hauptstraße",
      district: "Feudenheim",
      city: "Mannheim",
      state: "Baden-Württemberg",
      postcode: "68259",
      countrycode: "DE",
    },
  },
  {
    type: "Feature",
    geometry: { type: "Point", coordinates: [7.810244, 48.5736044] },
    properties: {
      type: "house",
      housenumber: "55",
      name: "Mannheim Gold Collection",
      street: "Hauptstraße",
      city: "Kehl",
      state: "Baden-Württemberg",
      postcode: "77694",
      countrycode: "DE",
    },
  },
];
const MANNHEIM = "Hauptstraße 5, 68259 Mannheim, Germany";
const photonRequests: URL[] = [];
let photon: Server | null = null;

test.beforeAll(async () => {
  if (!lookupUrl) return;
  photon = createServer((request, response) => {
    const url = new URL(request.url ?? "/", lookupUrl);
    photonRequests.push(url);
    const query = (url.searchParams.get("q") ?? "").toLowerCase();
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        type: "FeatureCollection",
        features: query.includes("hauptstr") ? PHOTON_FEATURES : [],
      }),
    );
  });
  await new Promise<void>((resolve) => photon?.listen(Number(lookupUrl.port), lookupUrl.hostname, resolve));
});

test.afterAll(async () => {
  if (!photon) return;
  photon.closeAllConnections();
  await new Promise<void>((resolve) => photon?.close(() => resolve()));
});

async function addAddressField(page: Page, companyId: string) {
  await openConfigure(page, presetId(companyId, "contact"));
  await addFromConfigure(page, "Field");
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill("Address");
  await drawer.getByRole("combobox", { name: "Value type", exact: true }).click();
  await page.getByRole("option", { name: /^Address/ }).click();
  await expect(drawer.getByRole("combobox", { name: "On click", exact: true })).toContainText("Open in maps");
  await saveDrawer(page);
}

async function newContact(page: Page, companyId: string, firstName: string) {
  await page.goto(`/en/records/${presetId(companyId, "contact")}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", { name: "Contact", exact: true });
  await drawer.getByRole("textbox", { name: "First name", exact: false }).fill(firstName);
  await drawer.getByRole("textbox", { name: "Last name", exact: false }).fill("Lovelace");
  return drawer;
}

function addressPart(address: Locator, name: string) {
  return address.getByRole("textbox", { name: new RegExp(`(^|\\s)${name}$`) });
}

async function showParts(address: Locator) {
  await expect(address).toBeVisible();
  const details = address.getByRole("button", { name: /^Address details/ });
  if (!(await details.count())) return;
  await expect(async () => {
    if ((await details.getAttribute("aria-expanded")) !== "true") await details.click();
    await expect(details).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
  }).toPass();
}

async function fillParts(address: Locator, parts: { street: string; postalCode: string; city: string }) {
  await showParts(address);
  await addressPart(address, "Street and number").fill(parts.street);
  await addressPart(address, "Postal code").fill(parts.postalCode);
  await addressPart(address, "City").fill(parts.city);
}

async function storedAddresses(database: Client, companyId: string) {
  const result = await database.query(
    `SELECT first."textValue" AS name, value."jsonValue" AS address
       FROM "RecordValue" value
       JOIN "RecordFieldDefinition" field ON field."companyId" = value."companyId" AND field.id = value."fieldId"
       JOIN "RecordValue" first ON first."companyId" = value."companyId" AND first."recordId" = value."recordId"
        AND first."fieldId" = $2
      WHERE value."companyId" = $1 AND field.definition ->> 'label' = 'Address' AND value.state = 'value'
      ORDER BY first."textValue"`,
    [companyId, presetId(companyId, "contact.firstName")],
  );
  return result.rows as Array<{
    name: string;
    address: {
      street: string;
      line2: string | null;
      formatted: string;
      verification: { status: string; provider: string | null };
    };
  }>;
}

test("picks a verified address from the suggestions while typing", async ({ page, database, companyId }) => {
  test.skip(!lookupUrl, "Runs against the mock address service; start the suite with ADDRESS_LOOKUP_URL set");
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  await addAddressField(page, companyId);
  const drawer = await newContact(page, companyId, "Ada");
  const address = drawer.locator("[data-address-input]");
  await address.locator("[data-address-search]").click();
  const search = page.getByPlaceholder("Street and number, postal code or city", { exact: true });
  await search.fill("Ha");
  await expect(page.getByText("Type at least 3 characters to search.", { exact: true })).toBeVisible();
  const query = `Hauptstr 5 ${test.info().project.name}`;
  await search.fill(query);
  await expect(page.getByRole("option", { name: MANNHEIM })).toBeVisible();
  await expect(page.getByRole("option", { name: /Mannheim Gold Collection/ })).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "© OpenStreetMap contributors",
      exact: true,
    }),
  ).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
  expect(Object.fromEntries(photonRequests.at(-1)?.searchParams ?? [])).toMatchObject({ q: query, lang: "en" });
  await search.press("ArrowDown");
  await search.press("ArrowUp");
  await search.press("Enter");
  await expect(search).toBeHidden();
  await expect(address.locator('[data-address-status="verified"]')).toHaveText("Verified address");
  await showParts(address);
  await expect(addressPart(address, "Street and number")).toHaveValue("Hauptstraße 5");
  await expect(addressPart(address, "Postal code")).toHaveValue("68259");
  await expect(addressPart(address, "City")).toHaveValue("Mannheim");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect
    .poll(async () => (await storedAddresses(database, companyId)).map((row) => row.address))
    .toEqual([
      expect.objectContaining({
        street: "Hauptstraße 5",
        formatted: "Hauptstraße 5, 68259 Mannheim",
        verification: expect.objectContaining({
          status: "verified",
          provider: "photon",
        }),
      }),
    ]);
  if (!test.info().project.use.isMobile) {
    const cell = page.getByRole("link", { name: MANNHEIM, exact: true });
    await expect(cell).toHaveAttribute(
      "href",
      `https://www.openstreetmap.org/search?${new URLSearchParams({ query: MANNHEIM })}`,
    );
    await expect(cell).toHaveAttribute("target", "_blank");
    await expect(page.getByRole("img", { name: "Verified address", exact: true }).first()).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: "Ada Lovelace" });
    const space = row.locator("[data-inline-edit-space]").filter({ hasText: MANNHEIM });
    await space.scrollIntoViewIfNeeded();
    const box = await space.boundingBox();
    if (!box) throw new Error("The address cell is not rendered");
    await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
    const editor = page.getByRole("dialog", { name: "Address", exact: true });
    await expect(editor.locator('[data-address-status="verified"]')).toBeVisible();
    await editor.locator("[data-address-search]").click();
    await page.getByPlaceholder("Street and number, postal code or city", { exact: true }).fill("Hauptstr 55");
    await page.getByRole("option", { name: /Mannheim Gold Collection/ }).click();
    await expect(addressPart(editor, "City")).toHaveValue("Kehl");
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect
      .poll(async () => (await storedAddresses(database, companyId)).map((row) => row.address))
      .toEqual([
        expect.objectContaining({
          street: "Hauptstraße 55",
          formatted: "Hauptstraße 55, 77694 Kehl",
          verification: expect.objectContaining({ status: "verified", provider: "photon" }),
        }),
      ]);
  }
  expect(errors).toEqual([]);
});

test("checks an address entered by hand and turns an edited one unverified", async ({ page, database, companyId }) => {
  test.skip(!lookupUrl, "Runs against the mock address service; start the suite with ADDRESS_LOOKUP_URL set");
  test.setTimeout(300000);
  const errors = collectPageErrors(page);
  await addAddressField(page, companyId);
  const drawer = await newContact(page, companyId, "Grace");
  const address = drawer.locator("[data-address-input]");
  await fillParts(address, {
    street: "Hauptstr. 5",
    postalCode: "68259",
    city: "Mannheim",
  });
  await expect(address.locator('[data-address-status="unverified"]')).toContainText("Unverified");
  const check = address.getByRole("button", {
    name: "Check address",
    exact: true,
  });
  await check.click();
  const suggestion = address.locator("[data-address-suggestion]");
  await expect(suggestion).toContainText("Hauptstraße 5, 68259 Mannheim");
  await suggestion.getByRole("button", { name: "Keep as entered", exact: true }).click();
  await expect(suggestion).toHaveCount(0);
  await expect(address.locator('[data-address-status="unverified"]')).toBeVisible();
  await check.click();
  await suggestion.getByRole("button", { name: "Use suggested address", exact: true }).click();
  await expect(address.locator('[data-address-status="verified"]')).toHaveText("Verified address");
  await expect(addressPart(address, "Street and number")).toHaveValue("Hauptstraße 5");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect
    .poll(async () => (await storedAddresses(database, companyId)).map((row) => row.address.verification.status))
    .toEqual(["verified"]);

  await openRecordDetails(page, "Grace Lovelace");
  const details = page.getByRole("dialog", { name: "Contact", exact: true });
  const edited = details.locator("[data-address-input]");
  await showParts(edited);
  await addressPart(edited, "Street and number").fill("Hauptstraße 7");
  await expect(edited.locator('[data-address-status="unverified"]')).toBeVisible();
  await edited.getByRole("button", { name: "Check address", exact: true }).click();
  await expect(edited.locator('[data-address-status="unverified"]')).toContainText("No matching address found.");
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => (await storedAddresses(database, companyId)).map((row) => row.address))
    .toEqual([
      expect.objectContaining({
        street: "Hauptstraße 7",
        verification: expect.objectContaining({
          status: "unverified",
          provider: null,
        }),
      }),
    ]);
  expect(errors).toEqual([]);
});

test("enters addresses by hand when no address service is configured", async ({ page, database, companyId }) => {
  test.skip(Boolean(lookupUrl), "Runs without an address service; start the suite without ADDRESS_LOOKUP_URL");
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  await addAddressField(page, companyId);
  const drawer = await newContact(page, companyId, "Ada");
  const address = drawer.locator("[data-address-input]");
  await expect(address.locator("[data-address-search]")).toHaveCount(0);
  await expect(address.getByRole("button", { name: /^Address details/ })).toHaveCount(0);
  await fillParts(address, {
    street: "Hauptstraße 5",
    postalCode: "68259",
    city: "Mannheim",
  });
  await expect(address.locator('[data-address-status="unverified"]')).toHaveText("Unverified");
  await expect(address.getByRole("button", { name: "Check address", exact: true })).toHaveCount(0);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect
    .poll(async () => (await storedAddresses(database, companyId)).map((row) => row.address))
    .toEqual([
      expect.objectContaining({
        formatted: "Hauptstraße 5, 68259 Mannheim",
        verification: expect.objectContaining({ status: "unverified" }),
      }),
    ]);
  expect(errors).toEqual([]);
});

test("sets one address on several selected records", async ({ page, database, companyId }) => {
  test.skip(
    Boolean(test.info().project.use.isMobile),
    "Bulk selection uses the desktop table's row checkboxes; phone rows have no selection",
  );
  test.setTimeout(300000);
  const errors = collectPageErrors(page);
  await addAddressField(page, companyId);
  for (const firstName of ["Ada", "Grace"]) {
    const drawer = await newContact(page, companyId, firstName);
    await drawer.getByRole("button", { name: "Save", exact: true }).click();
    await expect(drawer).not.toBeVisible();
    await expect(page.getByRole("link", { name: `${firstName} Lovelace`, exact: true })).toBeVisible();
  }
  await page.waitForLoadState("networkidle");
  for (const name of ["Ada Lovelace", "Grace Lovelace"])
    await page
      .getByRole("row")
      .filter({ has: page.getByRole("link", { name, exact: true }) })
      .getByRole("checkbox")
      .check();
  await expect(page.locator("[data-record-mass-actions]")).toContainText("2 items selected");
  await page.locator("[data-record-mass-actions]").getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit", exact: true });
  await dialog.getByRole("option", { name: "Address", exact: true }).click();
  await fillParts(dialog.locator("[data-address-input]"), {
    street: "Hauptstraße 5",
    postalCode: "68259",
    city: "Mannheim",
  });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("[data-record-mass-actions]")).not.toBeVisible();
  await expect
    .poll(async () => (await storedAddresses(database, companyId)).map((row) => [row.name, row.address.street]))
    .toEqual([
      ["Ada", "Hauptstraße 5"],
      ["Grace", "Hauptstraße 5"],
    ]);
  expect(errors).toEqual([]);
});
