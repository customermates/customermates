import { test, expect } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";
import { companyPath } from "./app-paths";
import { recordItem } from "./record-rows";
import { expectHydrated } from "./workspace-switching";
import { invokesServerAction, serverActionIds } from "./server-actions";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("omits hidden formatted values on load and fetches a revealed column before displaying its cells", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  const typeId = presetId(companyId, "organization");
  const notesId = presetId(companyId, "organization.notes");
  const marker = "Notes loaded only when this column is visible";
  await database.query(
    'INSERT INTO "RecordValue" ("companyId","typeId","recordId","fieldId",state,"jsonValue","schemaRevision","updatedAt") SELECT $1,$2,r.id,$3,\'value\',$4,s.revision,NOW() FROM "CrmRecord" r JOIN "RecordSchemaState" s ON s."companyId"=r."companyId" WHERE r."companyId"=$1 AND r."typeId"=$2',
    [
      companyId,
      typeId,
      notesId,
      JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: marker }] }] }),
    ],
  );
  const response = await page.goto(companyPath(companyId, `/records/${typeId}`));
  if (!response) throw new Error("The record page did not load");
  expect(await response.text()).not.toContain(marker);
  await expect(recordItem(page, "Example organization")).toBeVisible();
  const presentation = serverActionIds(
    "app/[locale]/(protected)/w/[workspace]/records/actions.ts",
    "getRecordPresentationAction",
  );
  const requested = deferred();
  const release = deferred();
  let calls = 0;
  await page.route(
    (url) => url.pathname.includes(`/records/${typeId}`),
    async (route) => {
      if (invokesServerAction(route.request(), presentation)) {
        calls += 1;
        requested.resolve();
        await release.promise;
      }
      await route.continue();
    },
  );
  try {
    await page.locator("#records-display-options").click();
    await page.getByRole("checkbox", { name: "Notes", exact: true }).check();
    await requested.promise;
    await expect(page.locator('[data-page-state="loading"]')).toBeVisible();
    await expect(page.getByText(marker, { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("projected-column-loading.png"), animations: "disabled" });
    release.resolve();
    if (testInfo.project.name === "mobile") await page.locator('[data-slot="drawer-close"]').click();
    else await page.keyboard.press("Escape");
    await expect(recordItem(page, "Example organization")).toContainText(marker);
    await page.screenshot({ path: testInfo.outputPath("projected-column-loaded.png"), animations: "disabled" });
    expect(calls).toBe(1);
    await page.reload();
    await expect(recordItem(page, "Example organization")).toContainText(marker);
  } finally {
    release.resolve();
  }
});

test("coalesces repeated visible events during a route refresh and refreshes again after it completes", async ({
  page,
  database,
  companyId,
}) => {
  const typeId = presetId(companyId, "organization");
  await page.goto(companyPath(companyId, `/records/${typeId}`));
  await expectHydrated(page.locator("#records-add"));
  await expect(recordItem(page, "Example organization")).toBeVisible();
  const changeName = (name: string) =>
    database.query('UPDATE "RecordValue" SET "textValue"=$3 WHERE "companyId"=$1 AND "fieldId"=$2', [
      companyId,
      presetId(companyId, "organization.name"),
      name,
    ]);
  await changeName("First refreshed organization");
  const release = deferred();
  let refreshes = 0;
  await page.route(
    (url) => url.pathname.includes(`/records/${typeId}`) && url.searchParams.has("_rsc"),
    async (route) => {
      if (route.request().method() === "GET" && !route.request().headers()["next-router-prefetch"]) {
        refreshes += 1;
        if (refreshes === 1) await release.promise;
      }
      await route.continue();
    },
  );
  const visible = () =>
    page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  try {
    await visible();
    await expect.poll(() => refreshes).toBe(1);
    await visible();
    await visible();
    expect(refreshes).toBe(1);
    release.resolve();
    await expect(recordItem(page, "First refreshed organization")).toBeVisible();
    await changeName("Second refreshed organization");
    await visible();
    await expect(recordItem(page, "Second refreshed organization")).toBeVisible();
    expect(refreshes).toBe(2);
  } finally {
    release.resolve();
  }
});
