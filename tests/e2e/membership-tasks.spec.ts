import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { expect, test, isBenignPageError } from "./fixtures";

test("resolves a protected task through member approval and rejects ordinary record edits", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  const memberId = randomUUID();
  const roleId = randomUUID();
  const recordId = randomUUID();
  const typeId = presetId(companyId, "task");
  const title = "Approve invited member";
  await database.query('INSERT INTO "UserRole" (id,"companyId",name,"updatedAt") VALUES ($1,$2,\'Member\',NOW())', [
    roleId,
    companyId,
  ]);
  await database.query(
    'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,country,"updatedAt") VALUES ($1,$2,$3,$4,\'Invited\',\'Member\',\'pendingAuthorization\',\'de\',NOW())',
    [memberId, companyId, roleId, `${memberId}@example.test`],
  );
  await database.query(
    'INSERT INTO "CrmRecord" ("companyId","typeId",id,"protectedKind","systemData","updatedAt") VALUES ($1,$2,$3,\'membershipAuthorization\',$4::jsonb,NOW())',
    [companyId, typeId, recordId, JSON.stringify({ relatedUserId: memberId })],
  );
  await database.query(
    'INSERT INTO "RecordValue" ("companyId","typeId","recordId","fieldId",state,"textValue","schemaRevision","updatedAt") VALUES ($1,$2,$3,$4,\'value\',$5,1,NOW())',
    [companyId, typeId, recordId, presetId(companyId, "task.name"), title],
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  await page.goto(`/en/records/${typeId}`);
  await page.getByRole("button", { name: title, exact: true }).click();
  const task = page.getByRole("dialog", { name: "Task", exact: true });
  await expect(
    task.getByText("This is a system task that cannot be manually deleted.", { exact: false }),
  ).toBeVisible();
  await expect(task.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await expect(task.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await expect(task.getByRole("textbox", { name: "Name", exact: false })).toHaveAttribute("readonly", "");
  for (const action of ["update", "delete"] as const) {
    const mutation = {
      action,
      ref: { typeId, recordId },
      expectedVersion: 1,
      ...(action === "update" ? { fields: [] } : {}),
    };
    const result = await page.request.post("/api/v2/records/mutate", {
      data: { expectedRevision: 1, idempotencyKey: randomUUID(), mutation },
    });
    expect(result.status()).toBe(403);
  }
  await expect(task.locator('[aria-busy="true"]')).toHaveCount(0);
  await task.screenshot({ path: testInfo.outputPath("protected-membership-task.png"), animations: "disabled" });
  await task.getByRole("link", { name: "company settings", exact: true }).click();
  await expect(page).toHaveURL(/\/company\/members$/);
  await page.getByRole("button", { name: /Invited Member/ }).click();
  const member = page.getByRole("dialog", { name: "User", exact: true });
  await member.locator("#member-modal-status").click();
  await page.getByRole("option", { name: "Active", exact: true }).click();
  await member.getByRole("button", { name: "Save", exact: true }).click();
  await expect(member).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (await database.query('SELECT status FROM "User" WHERE "companyId"=$1 AND id=$2', [companyId, memberId]))
          .rows[0]?.status,
    )
    .toBe("active");
  expect(
    (
      await database.query(
        'SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 AND id=$3',
        [companyId, typeId, recordId],
      )
    ).rows[0].count,
  ).toBe(0);
  expect(
    (
      await database.query(
        'SELECT COUNT(*)::integer AS count FROM "RecordEvent" WHERE "companyId"=$1 AND "recordId"=$2 AND kind=\'record.deleted\'',
        [companyId, recordId],
      )
    ).rows[0].count,
  ).toBe(1);
  expect((await database.query("SELECT to_regclass('\"Task\"') AS table")).rows[0].table).toBeNull();
  await page.goto(`/en/records/${typeId}`);
  await expect(page.getByRole("button", { name: title, exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
