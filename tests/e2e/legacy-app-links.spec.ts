import { z } from "zod";

import { appPath } from "./app-paths";
import { mintApiKey } from "./api-key";
import { localE2eEnvironment } from "./local-environment";
import { expect, test } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";

const Page = z.object({ id: z.uuid() });

function exactUrl(path: string) {
  return new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

test("old links without a workspace segment open the same page in the current workspace", async ({
  page,
  playwright,
  database,
  companyId,
  workspace,
  slug,
}) => {
  const typeId = presetId(companyId, "organization");
  const record = await database.query('SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 LIMIT 1', [
    companyId,
    typeId,
  ]);
  const recordId = record.rows[0]?.id;
  if (!recordId) throw new Error("Seed organization is missing");
  const recordPath = `/records/${typeId}/${recordId}`;

  const { baseUrl } = localE2eEnvironment();
  const { key } = await mintApiKey(database, workspace, "Legacy app links");
  const api = await playwright.request.newContext({ baseURL: baseUrl, extraHTTPHeaders: { "x-api-key": key } });
  let wikiPageId: string;
  try {
    const created = await api.post("/api/v1/wiki/create", {
      data: { pages: [{ title: "Old links", markdown: `# Old links\n\n[Stored record link](/en${recordPath})` }] },
    });
    expect(created.ok()).toBe(true);
    [{ id: wikiPageId }] = z.array(Page).parse(await created.json());
  } finally {
    await api.dispose();
  }

  for (const path of [`${recordPath}?tab=notes`, "/settings/profile", "/calendar", "/trash", `/wiki?page=${wikiPageId}`]) {
    await page.goto(`/en${path}`);
    await expect(page, path).toHaveURL(exactUrl(appPath(slug, path)));
  }

  const storedHref = await page.getByRole("link", { name: "Stored record link" }).getAttribute("href");
  expect(storedHref).toBe(`/en${recordPath}`);
  await page.goto(storedHref ?? "");
  await expect(page).toHaveURL(new RegExp(exactUrl(appPath(slug, recordPath)).source.replace(/\$$/u, "(?:\\?|$)")));
});
