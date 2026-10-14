import { randomUUID } from "node:crypto";

import { presetId } from "../../features/records/crm-preset";
import { collectPageErrors, expect, test } from "./fixtures";

test("reviews Mate's proposed Deals view and saves a DataView row", async ({
  page,
  database,
  companyId,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const typeId = presetId(companyId, "deal");
  const surfaceKey = `records:${typeId}`;
  const conversationId = randomUUID();
  const name = `PB big proposals ${randomUUID().slice(0, 8)}`;
  const activity = {
    kind: "views.configure",
    affectedResources: [],
    risk: "write",
    viewSurfaceKey: surfaceKey,
    viewAction: "create",
    viewKey: "__all__",
    viewHref: `/records/${typeId}?view=__all__`,
    viewProposed: true,
    viewProposal: { surfaceKey, name, state: { searchTerm: "PB big", pageSize: 5 } },
  };
  await database.query(
    'INSERT INTO "AgentConversation" (id,"companyId","userId",title,"selectedAt","updatedAt") VALUES ($1,$2,$3,$4,NOW(),NOW())',
    [conversationId, companyId, workspace.userId, "Create a Deals view"],
  );
  await database.query(
    'INSERT INTO "AgentMessage" (id,"conversationId","companyId",role,parts) VALUES ($1,$2,$3,$4,$5)',
    [randomUUID(), conversationId, companyId, "user", JSON.stringify([{ type: "text", text: "Create a Deals view" }])],
  );
  await database.query(
    'INSERT INTO "AgentMessage" (id,"conversationId","companyId",role,parts) VALUES ($1,$2,$3,$4,$5)',
    [
      randomUUID(),
      conversationId,
      companyId,
      "assistant",
      JSON.stringify([
        { type: "activity", id: "view-proposal", status: "done", activity },
        { type: "text", text: "Review and save the proposed view in the app." },
      ]),
    ],
  );

  await page.goto("/en/dashboard?agentChat=open");
  const review = page.getByRole("link", { name: "Review and save view" });
  await expect(review).toBeVisible();
  await review.click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}`));
  await expect(page.locator("#global-data-views-proposed")).toContainText(name);
  await page.locator("#global-data-views-menu").click();
  await page.locator("#global-data-views-save").click();
  await expect(page.locator("#global-data-views-proposed")).toHaveCount(0);
  await expect(page.locator("#global-data-views").getByRole("link", { name, exact: true })).toBeVisible();

  const saved = await database.query(
    'SELECT id,name,"searchTerm","pageSize" FROM "DataView" WHERE "companyId"=$1 AND "userId"=$2 AND "surfaceKey"=$3 AND name=$4 AND "deletedAt" IS NULL',
    [companyId, workspace.userId, surfaceKey, name],
  );
  expect(saved.rows).toMatchObject([{ name, searchTerm: "PB big", pageSize: 5 }]);
  expect(errors).toEqual([]);
});
