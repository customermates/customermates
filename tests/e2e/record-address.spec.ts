import type { Locator, Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { Client } from "pg";
import { presetId } from "../../features/records/crm-preset";
import { geonamesLine, zipFixture } from "../../features/addresses/postal-codes/__tests__/zip-fixture";
import { addFromConfigure, openConfigure, saveDrawer } from "./configure";
import { companyPath } from "./app-paths";
import { test, expect, collectPageErrors } from "./fixtures";
import { openRecordDetails } from "./record-rows";

const lookupUrl = process.env.ADDRESS_LOOKUP_URL ? new URL(process.env.ADDRESS_LOOKUP_URL) : null;
if (lookupUrl && (!["127.0.0.1", "localhost"].includes(lookupUrl.hostname) || !lookupUrl.port))
  throw new Error("The browser suite only serves address lookups from a loopback mock with an explicit port.");
const postalUrl =
  process.env.POSTAL_CODE_DATA_URL && process.env.POSTAL_CODE_DATA_URL !== "off"
    ? new URL(process.env.POSTAL_CODE_DATA_URL)
    : null;
if (postalUrl && (!["127.0.0.1", "localhost"].includes(postalUrl.hostname) || !postalUrl.port))
  throw new Error("The browser suite only serves postal codes from a loopback mock with an explicit port.");
const POSTAL_FILES: Record<string, Buffer> = {
  "/DE.zip": zipFixture([
    {
      name: "DE.txt",
      content: [
        geonamesLine(
          "DE",
          "68259",
          "Mannheim",
          { name1: "Baden-Württemberg", code1: "BW", name3: "Mannheim" },
          49.4903,
          8.5339,
        ),
        geonamesLine(
          "DE",
          "69117",
          "Heidelberg",
          { name1: "Baden-Württemberg", code1: "BW", name3: "Heidelberg" },
          49.4093,
          8.6936,
        ),
        geonamesLine("DE", "01945", "Ruhland", { name1: "Brandenburg", code1: "BB" }, 51.4576, 13.8664),
        geonamesLine("DE", "01945", "Tettau", { name1: "Brandenburg", code1: "BB" }, 51.4333, 13.7333),
      ].join("\n"),
    },
  ]),
};
const postalRequests: string[] = [];
let postal: Server | null = null;

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
  if (!postalUrl) return;
  postal = createServer((request, response) => {
    const path = new URL(request.url ?? "/", postalUrl).pathname;
    postalRequests.push(path);
    const body = POSTAL_FILES[path];
    response.writeHead(body ? 200 : 404, { "content-type": body ? "application/zip" : "text/plain" });
    response.end(body ?? "");
  });
  await new Promise<void>((resolve) => postal?.listen(Number(postalUrl.port), postalUrl.hostname, resolve));
});

test.afterAll(async () => {
  if (!postal) return;
  postal.closeAllConnections();
  await new Promise<void>((resolve) => postal?.close(() => resolve()));
});

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
  await page.goto(companyPath(companyId, `/records/${presetId(companyId, "contact")}`));
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", { name: "Contact", exact: true });
  await drawer.getByRole("textbox", { name: "First name", exact: false }).fill(firstName);
  await drawer.getByRole("textbox", { name: "Last name", exact: false }).fill("Lovelace");
  return drawer;
}

async function openAddress(page: Page, owner: Locator) {
  await owner.getByRole("button", { name: /^Edit Address/ }).click();
  const drawer = page.getByRole("dialog", { name: "Edit Address", exact: true });
  await expect(drawer).toBeVisible();
  return drawer.locator("[data-address-input]");
}

async function applyAddress(page: Page) {
  const drawer = page.getByRole("dialog", { name: "Edit Address", exact: true });
  await drawer.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(drawer).toHaveCount(0);
}

function addressPart(address: Locator, name: string) {
  return address.getByRole("textbox", { name: new RegExp(`(^|\\s)${name}$`) });
}

async function fillParts(address: Locator, parts: { street: string; postalCode: string; city: string }) {
  await addressPart(address, "Street and number").fill(parts.street);
  await addressPart(address, "Postal code").fill(parts.postalCode);
  await addressPart(address, "City").fill(parts.city);
}

function addressChoice(address: Locator, label: string) {
  return address.getByRole("combobox", { name: new RegExp(`(^|\\s)${label}$`) });
}

async function chooseOption(page: Page, address: Locator, label: string, option: string) {
  await addressChoice(address, label).click();
  await page.getByPlaceholder("Search...", { exact: true }).fill(option);
  await page.getByRole("option", { name: new RegExp(`(^|\\s)${option}$`) }).click();
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
      postalCode: string | null;
      city: string | null;
      region: string | null;
      countryCode: string | null;
      formatted: string;
      location: { lat: number; lon: number; precision: string } | null;
      verification: { status: string; provider: string | null };
    };
  }>;
}

test("keeps address edits in their drawer until confirmed and saves only with the record", async ({ page, database, companyId }) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  await addAddressField(page, companyId);
  const record = await newContact(page, companyId, "Draft");
  let address = await openAddress(page, record);
  await fillParts(address, { street: "Tentative street 1", postalCode: "68161", city: "Mannheim" });
  await page.keyboard.press("Escape");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(addressPart(address, "Street and number")).toHaveValue("Tentative street 1");
  await page.getByRole("dialog", { name: "Edit Address", exact: true }).getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit Address", exact: true })).toHaveCount(0);
  await expect(record.getByRole("textbox", { name: "First name", exact: false })).toHaveValue("Draft");
  await expect(record.locator("[data-address-field]")).not.toContainText("Tentative street");
  expect(await storedAddresses(database, companyId)).toEqual([]);
  address = await openAddress(page, record);
  await fillParts(address, { street: "Planken 1", postalCode: "68161", city: "Mannheim" });
  await applyAddress(page);
  await expect(record.locator("[data-address-field]")).toContainText("Planken 1");
  expect(await storedAddresses(database, companyId)).toEqual([]);
  address = await openAddress(page, record);
  await expect(addressPart(address, "Street and number")).toHaveValue("Planken 1");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Edit Address", exact: true })).toHaveCount(0);
  await record.getByRole("button", { name: "Save", exact: true }).click();
  await expect(record).toHaveCount(0);
  await expect.poll(async () => (await storedAddresses(database, companyId)).map((row) => row.address.street)).toEqual(["Planken 1"]);
  expect(errors).toEqual([]);
});

test("picks a verified address from the suggestions while typing", async ({ page, database, companyId }) => {
  test.skip(!lookupUrl, "Runs against the mock address service; start the suite with ADDRESS_LOOKUP_URL set");
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  await addAddressField(page, companyId);
  const drawer = await newContact(page, companyId, "Ada");
  const address = await openAddress(page, drawer);
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
  await expect(addressPart(address, "Street and number")).toHaveValue("Hauptstraße 5");
  await expect(addressPart(address, "Postal code")).toHaveValue("68259");
  await expect(addressPart(address, "City")).toHaveValue("Mannheim");
  await applyAddress(page);
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
    await space.hover();
    await space.getByRole("button", { name: "Edit Address", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Address", exact: true });
    const inlineAddress = await openAddress(page, editor);
    await expect(inlineAddress.locator('[data-address-status="verified"]')).toBeVisible();
    await inlineAddress.locator("[data-address-search]").click();
    await page.getByPlaceholder("Street and number, postal code or city", { exact: true }).fill("Hauptstr 55");
    await page.getByRole("option", { name: /Mannheim Gold Collection/ }).click();
    await expect(addressPart(inlineAddress, "City")).toHaveValue("Kehl");
    await applyAddress(page);
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
  const address = await openAddress(page, drawer);
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
  await applyAddress(page);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect
    .poll(async () => (await storedAddresses(database, companyId)).map((row) => row.address.verification.status))
    .toEqual(["verified"]);

  await openRecordDetails(page, "Grace Lovelace");
  const details = page.getByRole("dialog", { name: "Contact", exact: true });
  const edited = await openAddress(page, details);
  await addressPart(edited, "Street and number").fill("Hauptstraße 7");
  await expect(edited.locator('[data-address-status="unverified"]')).toBeVisible();
  await edited.getByRole("button", { name: "Check address", exact: true }).click();
  await expect(edited.locator('[data-address-status="unverified"]')).toContainText("No matching address found.");
  await applyAddress(page);
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
  const address = await openAddress(page, drawer);
  await expect(address.locator("[data-address-search]")).toHaveCount(0);
  await fillParts(address, {
    street: "Hauptstraße 5",
    postalCode: "68259",
    city: "Mannheim",
  });
  await expect(address.locator("[data-address-status]")).toHaveCount(0);
  await expect(address.getByRole("button", { name: "Check address", exact: true })).toHaveCount(0);
  await expect(address.locator('[data-address-issue="countryMissing"]')).toBeVisible();
  await applyAddress(page);
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
  const address = await openAddress(page, dialog);
  await fillParts(address, {
    street: "Hauptstraße 5",
    postalCode: "68259",
    city: "Mannheim",
  });
  await applyAddress(page);
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

test("checks an address while it is typed and completes it from the postal code", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  await addAddressField(page, companyId);
  const drawer = await newContact(page, companyId, "Ada");
  const address = await openAddress(page, drawer);
  await chooseOption(page, address, "Country", "Germany");
  await expect(addressPart(address, "Postal code")).toBeVisible();
  await expect(addressChoice(address, "State or region")).toHaveCount(0);
  await addressPart(address, "Street and number").fill("Hauptstraße 5");
  await addressPart(address, "Postal code").fill("6825");
  await expect(address.locator('[data-address-issue="postalCodeInvalid"]')).toHaveText(
    "This is not a postal code of Germany. Postal codes there look like 26133.",
  );
  await addressPart(address, "Postal code").fill("68259");
  await expect(address.locator('[data-address-issue="postalCodeInvalid"]')).toHaveCount(0);
  if (postalUrl) {
    await expect(addressPart(address, "City")).toHaveValue("Mannheim", { timeout: 60000 });
    await expect(
      address.getByRole("link", { name: "Postal codes: GeoNames (CC BY 4.0)", exact: true }),
    ).toHaveAttribute("href", "https://www.geonames.org/");
    expect(postalRequests).toContain("/DE.zip");
  } else {
    await expect(address.locator('[data-address-issue="partMissing"]')).toHaveText(
      "City is missing. Addresses in Germany need it.",
    );
    await addressPart(address, "City").fill("Mannheim");
  }
  await applyAddress(page);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect
    .poll(async () => (await storedAddresses(database, companyId)).map((row) => row.address))
    .toEqual([
      expect.objectContaining({
        street: "Hauptstraße 5",
        postalCode: "68259",
        city: "Mannheim",
        countryCode: "de",
        formatted: "Hauptstraße 5, 68259 Mannheim",
        location: postalUrl ? { lat: 49.4903, lon: 8.5339, precision: "postcode" } : null,
        verification: expect.objectContaining({ status: "unverified" }),
      }),
    ]);
  expect(errors).toEqual([]);
});

test("offers the cities of a postal code and corrects a city that does not belong to it", async ({
  page,
  database,
  companyId,
}) => {
  test.skip(!postalUrl, "Needs the mock postal code directory; start the suite with POSTAL_CODE_DATA_URL set");
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  await addAddressField(page, companyId);
  const drawer = await newContact(page, companyId, "Grace");
  const address = await openAddress(page, drawer);
  await chooseOption(page, address, "Country", "Germany");
  await addressPart(address, "Street and number").fill("Bahnhofstraße 1");
  await addressPart(address, "Postal code").fill("01945");
  const places = address.locator("[data-address-places]");
  await expect(places).toContainText("Cities with this postal code:", { timeout: 60000 });
  await expect(places.getByRole("button")).toHaveText(["Use Ruhland", "Use Tettau"]);
  await expect(addressPart(address, "City")).toHaveValue("");
  await places.getByRole("button", { name: "Use Tettau", exact: true }).click();
  await expect(addressPart(address, "City")).toHaveValue("Tettau");
  await expect(places).toHaveCount(0);

  await addressPart(address, "Postal code").fill("68259");
  const mismatch = address.locator('[data-address-issue="cityMismatch"]');
  await expect(mismatch).toContainText("This city does not belong to postal code 68259.");
  await mismatch.getByRole("button", { name: "Use Mannheim", exact: true }).click();
  await expect(addressPart(address, "City")).toHaveValue("Mannheim");
  await expect(mismatch).toHaveCount(0);
  await applyAddress(page);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect
    .poll(async () =>
      (await storedAddresses(database, companyId)).map((row) => [row.address.postalCode, row.address.city]),
    )
    .toEqual([["68259", "Mannheim"]]);
  expect(errors).toEqual([]);
});

test("refuses to save a postal code that does not fit the country", async ({ page, database, companyId }) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  await addAddressField(page, companyId);
  const drawer = await newContact(page, companyId, "Ada");
  const address = await openAddress(page, drawer);
  await chooseOption(page, address, "Country", "Germany");
  await addressPart(address, "Postal code").fill("682591");
  await addressPart(address, "City").fill("Mannheim");
  await applyAddress(page);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    drawer.getByText(
      "In Address, 682591 is not a postal code of the chosen country. Postal codes there look like 26133.",
      { exact: true },
    ),
  ).toBeVisible();
  const invalid = await openAddress(page, drawer);
  await expect(addressPart(invalid, "Postal code")).toHaveAttribute("aria-invalid", "true");
  await expect(addressPart(invalid, "City")).not.toHaveAttribute("aria-invalid", "true");
  await expect(drawer).toBeVisible();
  expect(await storedAddresses(database, companyId)).toEqual([]);
  expect(errors).toEqual([]);
});

test("lays an address out the way its country writes it", async ({ page, companyId }) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  await addAddressField(page, companyId);
  const drawer = await newContact(page, companyId, "Ada");
  const address = await openAddress(page, drawer);
  await chooseOption(page, address, "Country", "United States");
  await expect(addressPart(address, "ZIP code")).toBeVisible();
  await expect(addressPart(address, "Postal code")).toHaveCount(0);
  await chooseOption(page, address, "State or territory", "California");
  await expect(addressChoice(address, "State or territory")).toContainText("California");
  await chooseOption(page, address, "Country", "Japan");
  await expect(addressChoice(address, "Prefecture")).toBeVisible();
  await chooseOption(page, address, "Country", "United Kingdom");
  await expect(addressPart(address, "Post town")).toBeVisible();
  expect(errors).toEqual([]);
});
