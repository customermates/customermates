import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

import type { Browser, Page, TestInfo } from "@playwright/test";
import type { Client } from "pg";
import type { UpsertRoleData } from "../../features/role/role-management.schema";
import type { RecordMutation } from "../../features/records/record-query.schema";

import { RoleApiMutationResultSchema } from "../../features/role/role-management.schema";
import {
  RecordDtoSchema,
  RecordModelSchema,
} from "../../features/records/record-model.schema";
import { RecordOperationResultSchema } from "../../features/records/record-query.schema";
import { RecordMeasureResultSchema } from "../../features/records/record-measure.schema";
import { presetId } from "../../features/records/crm-preset";
import { localE2eEnvironment } from "./local-environment";
import { expect, test } from "./fixtures";

async function post(page: Page, path: string, data: unknown): Promise<unknown> {
  const response = await page.request.post(path, { data });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

async function readModel(page: Page) {
  return RecordModelSchema.parse(
    await post(page, "/api/v2/model/discover", {}),
  );
}

async function saveRole(
  page: Page,
  role: Omit<UpsertRoleData, "expectedRevision" | "idempotencyKey">,
) {
  const model = await readModel(page);
  return RoleApiMutationResultSchema.parse(
    await post(page, "/api/v2/roles/save", {
      ...role,
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
    }),
  );
}

async function mutate(
  page: Page,
  mutation: Extract<RecordMutation, { action: "create" }>,
) {
  const model = await readModel(page);
  const result = RecordOperationResultSchema.parse(
    await post(page, "/api/v2/records/mutate", {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation,
    }),
  );
  if (result.status !== "completed")
    throw new Error(
      "The synthetic record mutation must complete synchronously",
    );
  const ref = result.refs.find(
    (candidate) => candidate.typeId === mutation.typeId,
  );
  if (!ref) throw new Error("The synthetic record reference is missing");
  return ref;
}

async function secondaryUser(
  browser: Browser,
  database: Client,
  companyId: string,
  roleId: string,
  testInfo: TestInfo,
) {
  const { baseUrl } = localE2eEnvironment();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("A local authentication secret is required");
  const userId = randomUUID();
  const authUserId = randomUUID();
  const email = `secondary-${userId}@example.test`;
  await database.query(
    'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,"agreeToTerms","onboardingWizardCompletedAt","displayLanguage","formattingLocale","updatedAt") VALUES ($1,$2,$3,$4,\'Secondary\',\'Browser User\',\'active\',true,NOW(),\'en\',\'en\',NOW())',
    [userId, companyId, roleId, email],
  );
  await database.query(
    'INSERT INTO "AuthUser" (id,"companyId",email,name,"emailVerified","updatedAt") VALUES ($1,$2,$3,\'Secondary Browser User\',true,NOW())',
    [authUserId, companyId, email],
  );
  const token = randomBytes(32).toString("hex");
  await database.query(
    'INSERT INTO "AuthSession" (id,token,"userId","expiresAt","createdAt","updatedAt") VALUES ($1,$2,$3,NOW()+interval \'1 hour\',NOW(),NOW())',
    [randomUUID(), token, authUserId],
  );
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.use.isMobile,
    hasTouch: testInfo.project.use.hasTouch,
    userAgent: testInfo.project.use.userAgent,
  });
  await context.addCookies([
    {
      name: "app.session_token",
      value: encodeURIComponent(
        `${token}.${createHmac("sha256", secret).update(token).digest("base64")}`,
      ),
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await context.route(
    (url) =>
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      !["data:", "blob:"].includes(url.protocol),
    async (route) => {
      const url = new URL(route.request().url());
      if (
        url.hostname === "customermates.com" &&
        /^\/demo\/avatars\/photos\/[a-z-]+\.png$/.test(url.pathname) &&
        existsSync(resolve("public", url.pathname.slice(1)))
      )
        await route.fulfill({ path: resolve("public", url.pathname.slice(1)) });
      else await route.abort("blockedbyclient");
    },
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (
      error.message !==
      "ResizeObserver loop completed with undelivered notifications."
    )
      errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return {
    page,
    userId,
    errors,
    close: async () => {
      await page.screenshot({
        path: testInfo.outputPath("secondary-user-final.png"),
        animations: "disabled",
      });
      await context.close();
      await database.query(
        'DELETE FROM "AuthUser" WHERE id=$1 AND "companyId"=$2',
        [authUserId, companyId],
      );
    },
  };
}

test("admits an assigned-record writer and separately delegates schema configuration without granting new record or role access", async ({
  page,
  browser,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(240000);
  let model = await readModel(page);
  await post(page, "/api/v2/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "createType",
        reference: "$projects",
        label: "Project",
        pluralLabel: "Projects",
        description: "Secondary-user access fixture",
        icon: "folder",
        embedded: false,
        accessPresetId: null,
      },
    ],
  });
  model = await readModel(page);
  const type = model.types.find(
    (candidate) => candidate.pluralLabel === "Projects",
  );
  if (!type) throw new Error("The synthetic Projects type is missing");
  const primaryField = model.fields.find(
    (field) => field.id === type.primaryFieldId,
  );
  if (!primaryField) throw new Error("The primary project field is missing");
  const roleInput = {
    name: "Assigned project writers",
    description: "Edit assigned projects with separate schema authority",
    permissions: { company: { canManage: "no" as const } },
    recordGrants: [
      {
        typeId: type.id,
        actions: [
          "readOwn",
          "update",
        ] as UpsertRoleData["recordGrants"][number]["actions"],
      },
    ],
  };
  const saved = await saveRole(page, roleInput);
  const member = await secondaryUser(
    browser,
    database,
    companyId,
    saved.role.id,
    testInfo,
  );
  try {
    const assigned = await mutate(page, {
      action: "create",
      typeId: type.id,
      fields: [
        {
          fieldId: type.primaryFieldId,
          value: { kind: "text", value: "Assigned project" },
        },
      ],
      assignedUserIds: [member.userId],
    });
    const unassigned = await mutate(page, {
      action: "create",
      typeId: type.id,
      fields: [
        {
          fieldId: type.primaryFieldId,
          value: { kind: "text", value: "Other member project" },
        },
      ],
      assignedUserIds: [workspace.userId],
    });
    await member.page.goto(`/en/records/${type.id}`);
    await expect(
      member.page.getByRole("button", {
        name: "Assigned project",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      member.page.getByRole("button", {
        name: "Other member project",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(member.page.locator("#records-add")).toHaveCount(0);
    await expect(member.page.locator("#nav-configure-records")).toHaveCount(0);
    await expect(member.page.locator("#records-configure")).toHaveCount(0);
    await member.page
      .getByRole("button", { name: "Assigned project", exact: true })
      .click();
    const drawer = member.page.getByRole("dialog", {
      name: "Project",
      exact: true,
    });
    await drawer
      .getByRole("textbox", { name: primaryField.label, exact: false })
      .fill("Edited assigned project");
    await drawer.getByRole("button", { name: "Save", exact: true }).click();
    await expect(drawer).not.toBeVisible();
    await expect(
      member.page.getByRole("button", {
        name: "Edited assigned project",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (
        await database.query(
          'SELECT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
          [companyId, type.id, assigned.recordId, type.primaryFieldId],
        )
      ).rows,
    ).toEqual([{ textValue: "Edited assigned project" }]);
    expect(
      (
        await member.page.request.post("/api/v2/records/read", {
          data: unassigned,
        })
      ).status(),
    ).toBe(404);
    await member.page.goto(`/en/company/data-model?typeId=${type.id}`);
    await expect(
      member.page.getByRole("heading", { name: "Projects", exact: true }),
    ).toBeVisible();
    await expect(
      member.page.getByRole("button", { name: "Type settings", exact: true }),
    ).toHaveCount(0);
    await expect(
      member.page.getByRole("button", { name: "Add field", exact: true }),
    ).toHaveCount(0);
    const unauthorized = {
      expectedRevision: (await readModel(page)).revision,
      idempotencyKey: randomUUID(),
      operations: [
        {
          operation: "createType",
          reference: "$blocked",
          label: "Blocked",
          pluralLabel: "Blocked records",
          description: "",
          icon: "folder",
          embedded: false,
          accessPresetId: null,
        },
      ],
    };
    expect(
      (
        await member.page.request.post("/api/v2/model/apply", {
          data: unauthorized,
        })
      ).status(),
    ).toBe(403);
    await saveRole(page, {
      ...roleInput,
      id: saved.role.id,
      permissions: {
        company: { canManage: "no" },
        dataModel: { canManage: "yes" },
      },
      recordGrants: [],
    });
    await member.page.reload();
    await expect(
      member.page.getByRole("button", { name: "Type settings", exact: true }),
    ).toBeVisible();
    await expect(
      member.page.getByRole("button", { name: "Add field", exact: true }),
    ).toBeVisible();
    const configure = member.page.locator("#nav-configure-records");
    if (!(await configure.isVisible()))
      await member.page.locator("#sidebar-trigger").click();
    await expect(member.page.locator("#nav-assistant")).toBeVisible();
    await expect(configure).toHaveAttribute("href", "/en/company/data-model");
    await configure.click();
    await expect(member.page).toHaveURL(/\/en\/company\/data-model$/);
    await member.page
      .getByRole("button", { name: "Create list", exact: true })
      .click();
    const creation = member.page.getByRole("dialog");
    await expect(creation).toBeVisible();
    await creation
      .getByRole("textbox", { name: "Name", exact: false })
      .first()
      .fill("Delegated records");
    await creation
      .getByRole("button", { name: "Create list", exact: true })
      .click();
    await expect(creation).not.toBeVisible();
    await expect(member.page).toHaveURL(
      /\/en\/company\/data-model\?typeId=[a-f0-9-]+$/,
    );
    await expect(
      member.page.getByRole("heading", {
        name: "Delegated records",
        exact: true,
      }),
    ).toBeVisible();
    const delegated = (await readModel(page)).types.find(
      (candidate) => candidate.pluralLabel === "Delegated records",
    );
    if (!delegated) throw new Error("The delegated type was not persisted");
    expect(
      (
        await database.query(
          'SELECT actions::text[] AS actions FROM "RecordTypeGrant" WHERE "companyId"=$1 AND "typeId"=$2 AND "roleId"=$3',
          [companyId, delegated.id, saved.role.id],
        )
      ).rows,
    ).toEqual([]);
    await expect(
      member.page.locator(`[id="nav-records:${delegated.id}"]`),
    ).toHaveCount(0);
    expect(
      (
        await member.page.request.post("/api/v2/records/query", {
          data: { typeId: delegated.id },
        })
      ).status(),
    ).toBe(403);
    const roleDenied = await member.page.request.post("/api/v2/roles/save", {
      data: {
        ...roleInput,
        id: saved.role.id,
        permissions: {},
        recordGrants: [{ typeId: delegated.id, actions: ["readAll"] }],
        expectedRevision: (await readModel(page)).revision,
        idempotencyKey: randomUUID(),
      },
    });
    expect(roleDenied.status()).toBe(403);
    await member.page.screenshot({
      path: testInfo.outputPath("delegated-schema-without-record-access.png"),
      animations: "disabled",
    });
    expect(member.errors).toEqual([]);
  } finally {
    await member.close();
  }
});

test("renders dependency-restricted calculated widget values as a secondary reader and rechecks grant changes", async ({
  page,
  browser,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const id = (key: string) => presetId(companyId, key);
  const model = await readModel(page);
  for (const key of [
    "deal.totalValue",
    "lineItem.amount",
    "lineItem.effectivePrice",
  ]) {
    const field = model.fields.find((candidate) => candidate.id === id(key));
    if (!field) throw new Error(`The synthetic calculation ${key} is missing`);
    expect(field.publishedSummary).toBe(false);
  }
  const roleInput = {
    name: "Deal summary readers",
    description: "Read deals without access to their service inputs",
    permissions: { company: { canManage: "no" as const } },
    recordGrants: [
      {
        typeId: id("deal"),
        actions: [
          "readAll",
        ] as UpsertRoleData["recordGrants"][number]["actions"],
      },
    ],
  };
  const saved = await saveRole(page, roleInput);
  const member = await secondaryUser(
    browser,
    database,
    companyId,
    saved.role.id,
    testInfo,
  );
  try {
    const deal = await mutate(page, {
      action: "create",
      typeId: id("deal"),
      fields: [
        {
          fieldId: id("deal.name"),
          value: { kind: "text", value: "Readable restricted deal" },
        },
      ],
    });
    const service = await mutate(page, {
      action: "create",
      typeId: id("service"),
      fields: [
        {
          fieldId: id("service.name"),
          value: { kind: "text", value: "Restricted source service" },
        },
        {
          fieldId: id("service.amount"),
          value: { kind: "decimal", value: "41.25", currency: "EUR" },
        },
      ],
    });
    await mutate(page, {
      action: "create",
      typeId: id("lineItem"),
      fields: [
        {
          fieldId: id("lineItem.name"),
          value: { kind: "text", value: "Restricted source line" },
        },
        {
          fieldId: id("lineItem.quantity"),
          value: { kind: "decimal", value: "2", currency: null },
        },
      ],
      links: [
        {
          relationId: id("lineItem.deal"),
          direction: "outgoing",
          record: deal,
        },
        {
          relationId: id("lineItem.service"),
          direction: "outgoing",
          record: service,
        },
      ],
    });
    const authoritative = RecordDtoSchema.parse(
      await post(page, "/api/v2/records/read", deal),
    );
    expect(
      authoritative.fields.find(
        (field) => field.fieldId === id("deal.totalValue"),
      )?.result,
    ).toEqual({
      state: "value",
      value: { kind: "decimal", value: "82.5", currency: "EUR" },
    });
    const WidgetSchema = z.object({
      id: z.uuid(),
      status: z.enum(["ready", "unavailable"]),
      data: RecordMeasureResultSchema.nullable(),
    });
    const widgetName = "Restricted deal total";
    const widget = WidgetSchema.parse(
      await post(member.page, "/api/v2/widgets/save", {
        expectedRevision: (await readModel(page)).revision,
        idempotencyKey: randomUUID(),
        name: widgetName,
        measure: {
          source: { typeId: id("deal") },
          aggregation: "sum",
          valueFieldId: id("deal.totalValue"),
          groupBy: null,
        },
        displayOptions: { displayType: "verticalBarChart", showFilters: true },
        isTemplate: false,
      }),
    );
    expect(widget).toMatchObject({
      status: "ready",
      data: { total: { count: 1, result: { state: "restricted" } } },
    });
    const card = member.page.locator('[data-uid="app-card"]').filter({
      has: member.page.getByRole("heading", { name: widgetName, exact: true }),
    });
    const expectRestricted = async () => {
      await expect(
        card.getByText("Overall: Restricted", { exact: true }),
      ).toBeVisible();
      await expect(
        card.locator("dd").getByText("Restricted", { exact: true }),
      ).toBeVisible();
      await expect(card.getByText("€82.50", { exact: true })).toHaveCount(0);
      await expect(card.locator(".recharts-wrapper")).toHaveCount(0);
      await expect(
        card.getByText(
          "This measure is unavailable. Review its configuration or access.",
          { exact: true },
        ),
      ).toHaveCount(0);
      expect(
        WidgetSchema.parse(
          await post(member.page, "/api/v2/widgets/read", { id: widget.id }),
        ),
      ).toMatchObject({
        status: "ready",
        data: {
          total: { result: { state: "restricted" } },
          groups: [{ result: { state: "restricted" } }],
        },
      });
    };
    await member.page.goto("/en/dashboard");
    await expectRestricted();
    await member.page.screenshot({
      path: testInfo.outputPath("restricted-calculated-widget.png"),
      animations: "disabled",
    });
    await saveRole(page, {
      ...roleInput,
      id: saved.role.id,
      recordGrants: [{ typeId: id("service"), actions: ["readAll"] }],
    });
    await member.page.reload();
    await expect(
      card.getByText("Overall: €82.50", { exact: true }),
    ).toBeVisible();
    await expect(card.getByText("Restricted", { exact: true })).toHaveCount(0);
    expect(
      WidgetSchema.parse(
        await post(member.page, "/api/v2/widgets/read", { id: widget.id }),
      ),
    ).toMatchObject({
      status: "ready",
      data: {
        total: {
          result: {
            state: "value",
            value: { kind: "decimal", value: "82.5", currency: "EUR" },
          },
        },
      },
    });
    await saveRole(page, {
      ...roleInput,
      id: saved.role.id,
      recordGrants: [{ typeId: id("service"), actions: [] }],
    });
    await member.page.reload();
    await expectRestricted();
    expect(
      (
        await database.query(
          'SELECT trim_scale("decimalValue")::text AS value FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
          [companyId, id("deal"), deal.recordId, id("deal.totalValue")],
        )
      ).rows,
    ).toEqual([{ value: "82.5" }]);
    expect(
      (
        await database.query(
          'SELECT "userId" FROM "Widget" WHERE "companyId"=$1 AND id=$2',
          [companyId, widget.id],
        )
      ).rows,
    ).toEqual([{ userId: member.userId }]);
    expect(member.errors).toEqual([]);
  } finally {
    await member.close();
  }
});
