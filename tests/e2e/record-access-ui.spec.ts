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
import {
  addFromConfigure,
  openDrawerTab,
  configureTopBar,
  followConfigureLink,
  openConfigure,
  openConfigureRow,
  openConfigureTab,
  openListAction,
  saveDrawer,
  setShowArchivedParts,
} from "./configure";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";
import { createBrowserWorkspace, removeBrowserWorkspace } from "./workspace";
import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { RecordIdentityReferenceSchema } from "../../features/records/record-identity-reference.schema";

async function post(page: Page, path: string, data: unknown): Promise<unknown> {
  const response = await page.request.post(path, { data });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

async function readModel(page: Page) {
  return RecordModelSchema.parse(
    await post(page, "/api/v1/model/discover", {}),
  );
}

async function saveRole(
  page: Page,
  role: Omit<UpsertRoleData, "expectedRevision" | "idempotencyKey">,
) {
  const model = await readModel(page);
  return RoleApiMutationResultSchema.parse(
    await post(page, "/api/v1/roles/save", {
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
    await post(page, "/api/v1/records/mutate", {
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
    locale: "en-GB",
    reducedMotion: "reduce",
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
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
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
  await post(page, "/api/v1/model/apply", {
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
    permissions: [{ resource: "company" as const, actions: [] }],
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
        await member.page.request.post("/api/v1/records/read", {
          data: unassigned,
        })
      ).status(),
    ).toBe(404);
    const assignees = async () =>
      (
        await database.query(
          'SELECT "userId" FROM "RecordAssignment" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 ORDER BY "userId"',
          [companyId, type.id, unassigned.recordId],
        )
      ).rows.map((row: { userId: string }) => row.userId);
    await page.goto(`/en/records/${type.id}`);
    await page
      .getByRole("button", { name: "Other member project", exact: true })
      .click();
    const administratorEditor = page.getByRole("dialog", {
      name: "Project",
      exact: true,
    });
    const assignmentControl = administratorEditor.getByRole("combobox", {
      name: "Assigned to",
      exact: true,
    });
    await expect(assignmentControl).toContainText("Browser Administrator");
    if (testInfo.project.use.isMobile) {
      const bounds = await assignmentControl.boundingBox();
      if (!bounds) throw new Error("The assignment picker is missing");
      await assignmentControl.tap({
        position: { x: bounds.width - 18, y: bounds.height / 2 },
      });
    } else await assignmentControl.click();
    await page
      .getByRole("option")
      .filter({ hasText: "Secondary Browser User" })
      .click();
    await page.keyboard.press("Escape");
    await expect(assignmentControl).toHaveAttribute("aria-expanded", "false");
    await administratorEditor
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(administratorEditor).not.toBeVisible();
    await expect
      .poll(assignees)
      .toEqual([workspace.userId, member.userId].sort());
    await member.page.reload();
    await expect(
      member.page.getByRole("button", {
        name: "Other member project",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (
        await member.page.request.post("/api/v1/records/read", {
          data: unassigned,
        })
      ).status(),
    ).toBe(200);
    await page
      .getByRole("button", { name: "Other member project", exact: true })
      .click();
    const assignmentField = administratorEditor.locator(
      '[data-entity-field="system:assignedTo"]',
    );
    await assignmentField
      .locator('[data-slot="badge"]')
      .filter({ hasText: "Secondary Browser User" })
      .getByRole("button", {
        name: englishMessages.Common.actions.remove,
        exact: true,
      })
      .click();
    await administratorEditor
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(administratorEditor).not.toBeVisible();
    await expect.poll(assignees).toEqual([workspace.userId]);
    await member.page.reload();
    await expect(
      member.page.getByRole("button", {
        name: "Other member project",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      member.page.getByRole("button", {
        name: "Edited assigned project",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (
        await member.page.request.post("/api/v1/records/read", {
          data: unassigned,
        })
      ).status(),
    ).toBe(404);
    await openConfigure(member.page, type.id);
    await expect(
      member.page.getByRole("heading", { name: "Projects", exact: true }),
    ).toBeVisible();
    await expect(
      configureTopBar(member.page).getByRole("button", {
        name: "Add",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      configureTopBar(member.page).getByRole("button", {
        name: "List actions",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      member.page
        .getByRole("region", { name: "General", exact: true })
        .getByRole("textbox"),
    ).toHaveCount(0);
    await openConfigureTab(member.page, "Fields");
    await expect(
      member.page
        .getByRole("region", { name: "Fields", exact: true })
        .getByRole("listitem")
        .first(),
    ).toBeVisible();
    await expect(
      member.page
        .getByRole("region", { name: "Fields", exact: true })
        .getByRole("button"),
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
        await member.page.request.post("/api/v1/model/apply", {
          data: unauthorized,
        })
      ).status(),
    ).toBe(403);
    await saveRole(page, {
      ...roleInput,
      id: saved.role.id,
      permissions: [
        { resource: "company", actions: [] },
        { resource: "dataModel", actions: ["update"] },
      ],
      recordGrants: [],
    });
    await member.page.reload();
    await expect(
      configureTopBar(member.page).getByRole("button", {
        name: "Add",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      configureTopBar(member.page).getByRole("button", {
        name: "List actions",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      member.page
        .getByRole("region", { name: "Fields", exact: true })
        .getByRole("button")
        .first(),
    ).toBeVisible();
    const configure = member.page.locator("#nav-configure-records");
    if (!(await configure.isVisible()))
      await member.page.locator("#sidebar-trigger").click();
    await expect(member.page.locator("#nav-assistant")).toBeVisible();
    await expect(configure).toHaveAttribute("href", "/en/configure");
    await configure.click();
    await expect(member.page).toHaveURL(
      /\/en\/configure(?:\?typeId=[a-f0-9-]+)?$/,
    );
    await addFromConfigure(member.page, "List");
    const creation = member.page.getByRole("dialog");
    await expect(creation).toBeVisible();
    await creation
      .getByRole("textbox", { name: "Name", exact: false })
      .first()
      .fill("Delegated records");
    await creation
      .getByRole("button", { name: "Save", exact: true })
      .first()
      .click();
    await expect(creation).not.toBeVisible();
    await expect(member.page).toHaveURL(/\/en\/configure\?typeId=[a-f0-9-]+$/);
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
        await member.page.request.post("/api/v1/records/query", {
          data: { typeId: delegated.id },
        })
      ).status(),
    ).toBe(404);
    const roleDenied = await member.page.request.post("/api/v1/roles/save", {
      data: {
        ...roleInput,
        id: saved.role.id,
        permissions: [],
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
    model = await readModel(page);
    const presetId = randomUUID();
    expect(
      await post(page, "/api/v1/model/apply", {
        expectedRevision: model.revision,
        idempotencyKey: randomUUID(),
        operations: [
          {
            operation: "putAccessPreset",
            preset: {
              id: presetId,
              label: "Approved assigned writers",
              archived: false,
              grants: [
                {
                  roleId: saved.role.id,
                  actions: ["create", "readOwn", "update"],
                },
              ],
            },
          },
        ],
      }),
    ).toMatchObject({ status: "completed" });
    await openConfigure(member.page);
    await addFromConfigure(member.page, "List");
    await creation
      .getByRole("textbox", {
        name: englishMessages.RecordModel.name,
        exact: false,
      })
      .first()
      .fill("Approved delegated records");
    await creation
      .getByRole("combobox", {
        name: englishMessages.RecordModel.access,
        exact: true,
      })
      .click();
    await member.page
      .getByRole("option", { name: "Approved assigned writers", exact: true })
      .click();
    await creation
      .getByRole("button", { name: "Save", exact: true })
      .first()
      .click();
    await expect(creation).not.toBeVisible();
    const approved = (await readModel(page)).types.find(
      (candidate) => candidate.pluralLabel === "Approved delegated records",
    );
    if (!approved)
      throw new Error("Expected the delegated type with approved grants");
    await expect(member.page).toHaveURL(
      new RegExp(`/en/records/${approved.id}$`),
    );
    expect(
      (
        await database.query(
          'SELECT actions::text[] AS actions FROM "RecordTypeGrant" WHERE "companyId"=$1 AND "typeId"=$2 AND "roleId"=$3',
          [companyId, approved.id, saved.role.id],
        )
      ).rows,
    ).toEqual([{ actions: ["create", "readOwn", "update"] }]);
    await member.page.locator("#records-add").click();
    const approvedDrawer = member.page.getByRole("dialog", {
      name: approved.label,
      exact: true,
    });
    await approvedDrawer
      .getByRole("textbox", { name: approved.label, exact: false })
      .fill("Own approved record");
    await approvedDrawer
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(approvedDrawer).not.toBeVisible();
    await expect(
      member.page.getByRole("button", {
        name: "Own approved record",
        exact: true,
      }),
    ).toBeVisible();
    const foreign = await mutate(page, {
      action: "create",
      typeId: approved.id,
      fields: [
        {
          fieldId: approved.primaryFieldId,
          value: { kind: "text", value: "Unassigned approved record" },
        },
      ],
      assignedUserIds: [],
    });
    expect(
      (
        await member.page.request.post("/api/v1/records/read", {
          data: foreign,
        })
      ).status(),
    ).toBe(404);
    const readable = await post(member.page, "/api/v1/records/query", {
      typeId: approved.id,
    });
    expect(readable).toMatchObject({ total: 1 });
    expect(
      (
        await database.query(
          'SELECT assignment."userId",value."textValue" FROM "RecordAssignment" assignment JOIN "RecordValue" value ON value."companyId"=assignment."companyId" AND value."typeId"=assignment."typeId" AND value."recordId"=assignment."recordId" WHERE assignment."companyId"=$1 AND assignment."typeId"=$2 AND value."fieldId"=$3',
          [companyId, approved.id, approved.primaryFieldId],
        )
      ).rows,
    ).toEqual([{ userId: member.userId, textValue: "Own approved record" }]);
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
    permissions: [{ resource: "company" as const, actions: [] }],
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
      await post(page, "/api/v1/records/read", deal),
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
      await post(member.page, "/api/v1/widgets/save", {
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
          await post(member.page, "/api/v1/widgets/read", { id: widget.id }),
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
        await post(member.page, "/api/v1/widgets/read", { id: widget.id }),
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

test("keeps shared Inbox participants permission-scoped across genuine readers and isolates identical identifiers in another workspace", async ({
  page,
  browser,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(240000);
  const errors = relationshipCaptureErrors(page);
  const contactTypeId = presetId(companyId, "contact");
  const email = "shared-reader@example.test";
  const contact = await mutate(page, {
    action: "create",
    typeId: contactTypeId,
    fields: [
      {
        fieldId: presetId(companyId, "contact.firstName"),
        value: { kind: "text", value: "Private CRM" },
      },
      {
        fieldId: presetId(companyId, "contact.lastName"),
        value: { kind: "text", value: "Ada" },
      },
    ],
    identities: [{ provider: "mail", value: email }],
  });
  const baselinePermissions: UpsertRoleData["permissions"] = [
    { resource: "company", actions: [] },
    { resource: "inboxMessages", actions: ["readAll"] },
  ];
  const noAccessRole = await saveRole(page, {
    name: "Inbox without record access",
    description: "Read shared conversations without CRM association access",
    permissions: baselinePermissions,
    recordGrants: [],
  });
  const readerRole = await saveRole(page, {
    name: "Inbox contact readers",
    description: "Read contacts and shared conversations without editing",
    permissions: baselinePermissions,
    recordGrants: [{ typeId: contactTypeId, actions: ["readAll"] }],
  });
  const noAccess = await secondaryUser(
    browser,
    database,
    companyId,
    noAccessRole.role.id,
    testInfo,
  );
  const reader = await secondaryUser(
    browser,
    database,
    companyId,
    readerRole.role.id,
    testInfo,
  );
  let foreignWorkspace:
    | Awaited<ReturnType<typeof createBrowserWorkspace>>
    | undefined;
  let foreign: Awaited<ReturnType<typeof secondaryUser>> | undefined;
  try {
    const accountId = randomUUID();
    const threadId = randomUUID();
    const body = "Shared participant visibility message";
    await database.query(
      'INSERT INTO "ConnectedAccount" (id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","displayName","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'ok\',true,\'Private synthetic mailbox\',NOW())',
      [accountId, companyId, workspace.userId, randomUUID()],
    );
    await database.query(
      'INSERT INTO "MessagingThread" (id,"companyId","connectedAccountId","unipileThreadId",provider,state,"lastMessageAt","lastMessagePreview","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'open\',NOW(),$5,NOW())',
      [threadId, companyId, accountId, randomUUID(), body],
    );
    await database.query(
      'INSERT INTO "MessagingThreadParticipant" (id,"companyId","messagingThreadId",provider,"providerUserId",identifier,"identityLookupValue","displayName","updatedAt") VALUES ($1,$2,$3,\'mail\',$4,$4,$4,\'Provider Ada\',NOW())',
      [randomUUID(), companyId, threadId, email],
    );
    await database.query(
      'INSERT INTO "MessagingMessage" (id,"companyId","messagingThreadId","connectedAccountId","unipileMessageId",provider,direction,origin,sender,recipients,"bodyText","sentAt","updatedAt") VALUES ($1,$2,$3,$4,$5,\'mail\',\'inbound\',\'unipile\',$6,$7,$8,NOW(),NOW())',
      [
        randomUUID(),
        companyId,
        threadId,
        accountId,
        randomUUID(),
        JSON.stringify({
          attendeeId: email,
          identifier: email,
          displayName: "Provider Ada",
        }),
        JSON.stringify({ to: [], cc: [], bcc: [] }),
        body,
      ],
    );
    const readIdentities = async (actorPage: Page) =>
      z
        .object({
          matches: z.array(
            z.object({ records: z.array(RecordIdentityReferenceSchema.extend({ version: z.number().int() })) }),
          ),
        })
        .parse(
          await post(actorPage, "/api/v1/records/identities/resolve", {
            identifiers: [{ provider: "mail", value: email.toUpperCase() }],
          }),
        );
    expect((await readIdentities(noAccess.page)).matches[0]?.records).toEqual([]);
    expect((await readIdentities(reader.page)).matches[0]?.records.map((record) => record.ref)).toEqual([contact]);
    expect(
      (
        await reader.page.request.post("/api/v1/records/mutate", {
          data: {
            expectedRevision: (await readModel(page)).revision,
            idempotencyKey: randomUUID(),
            mutation: {
              action: "update",
              ref: contact,
              expectedVersion: 1,
              fields: [
                {
                  fieldId: presetId(companyId, "contact.firstName"),
                  value: { kind: "text", value: "Unauthorized" },
                },
              ],
            },
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await noAccess.page.request.post("/api/v1/records/read", {
          data: contact,
        })
      ).status(),
    ).toBe(404);
    for (const member of [noAccess, reader])
      expect(
        (
          await member.page.request.get(`/api/v1/messaging/threads/${threadId}`)
        ).status(),
      ).toBe(404);

    const settingsName = englishMessages.Inbox.settings.title;
    const adminSettings = page.getByRole("dialog", {
      name: settingsName,
      exact: true,
    });
    const openSettings = async (actorPage: Page) => {
      await actorPage.goto(`/en/inbox?threadId=${threadId}`);
      await actorPage
        .getByRole("button", { name: settingsName, exact: true })
        .and(actorPage.locator('[data-slot="badge"]'))
        .click();
      const settings = actorPage.getByRole("dialog", {
        name: settingsName,
        exact: true,
      });
      await expect(settings).toBeVisible();
      return settings;
    };
    await openSettings(page);
    await adminSettings.locator("#thread-shared").click();
    await expect(adminSettings.locator("#thread-shared")).toBeChecked();
    await expect
      .poll(
        async () =>
          (
            await database.query(
              'SELECT "sharedToCrm" FROM "MessagingThread" WHERE "companyId"=$1 AND id=$2',
              [companyId, threadId],
            )
          ).rows,
      )
      .toEqual([{ sharedToCrm: true }]);
    for (const [member, readable] of [
      [noAccess, false],
      [reader, true],
    ] as const) {
      const response = await member.page.request.get(
        `/api/v1/messaging/threads/${threadId}`,
      );
      expect(response.status(), await response.text()).toBe(200);
      const detail = z
        .object({
          thread: z.object({
            participants: z.array(
              z.object({
                records: z.array(
                  z.object({
                    ref: z.object({ typeId: z.uuid(), recordId: z.uuid() }),
                    canEdit: z.boolean(),
                  }),
                ),
              }),
            ),
          }),
        })
        .parse(await response.json());
      expect(
        detail.thread.participants.flatMap((participant) =>
          participant.records.map((record) => record.ref),
        ),
      ).toEqual(readable ? [contact] : []);
      for (const participant of detail.thread.participants)
        expect(participant.records.every((record) => !record.canEdit)).toBe(
          true,
        );
      const settings = await openSettings(member.page);
      await expect(settings.locator("#thread-shared")).toBeChecked();
      await expect(settings.locator("#thread-shared")).toBeDisabled();
      await expect(
        settings.getByRole("button", {
          name: "Open record: Private CRM Ada",
          exact: true,
        }),
      ).toHaveCount(readable ? 1 : 0);
      await expect(
        settings.getByRole("button", { name: /^Unlink record:/ }),
      ).toHaveCount(0);
      await expect(
        settings.getByRole("button", { name: "Link", exact: true }),
      ).toHaveCount(0);
      await expect(
        settings
          .getByRole("region", { name: "Conversation records", exact: true })
          .getByRole("button", { name: "Link record", exact: true }),
      ).toHaveCount(0);
      if (!readable)
        await expect(
          settings.getByText("Private CRM Ada", { exact: true }),
        ).toHaveCount(0);
      await member.page.screenshot({
        path: testInfo.outputPath(
          readable
            ? "reader-inbox-association.png"
            : "inbox-without-record-access.png",
        ),
        animations: "disabled",
      });
      await member.page.keyboard.press("Escape");
      await expect(member.page.locator("#sidebar-trigger")).toHaveAttribute(
        "aria-disabled",
        "false",
      );
      if (!(await member.page.locator("#nav-assistant").isVisible()))
        await member.page.locator("#sidebar-trigger").click();
      await expect(member.page.locator("#nav-assistant")).toBeVisible();
      await expect(
        member.page.locator(`[id="nav-records:${contactTypeId}"]`),
      ).toHaveCount(readable ? 1 : 0);
      await expect(member.page.locator("#nav-configure-records")).toHaveCount(
        0,
      );
      await member.page.goto(`/en/inbox?threadId=${threadId}`);
      await expect(
        member.page.getByText(body, { exact: true }).last(),
      ).toBeVisible();
    }
    await adminSettings.locator("#thread-shared").click();
    await expect(adminSettings.locator("#thread-shared")).not.toBeChecked();
    await expect
      .poll(
        async () =>
          (
            await database.query(
              'SELECT "sharedToCrm" FROM "MessagingThread" WHERE "companyId"=$1 AND id=$2',
              [companyId, threadId],
            )
          ).rows,
      )
      .toEqual([{ sharedToCrm: false }]);
    for (const member of [noAccess, reader]) {
      await member.page.goto("/en/inbox");
      await expect(
        member.page
          .locator("#inbox-thread-list")
          .getByText(englishMessages.Common.emptyState.genericTitle, {
            exact: true,
          }),
      ).toBeVisible();
      await expect(
        member.page.locator(`[data-thread-id="${threadId}"]`),
      ).toHaveCount(0);
      await expect(member.page.getByText(body, { exact: true })).toHaveCount(0);
      expect(
        (
          await member.page.request.get(`/api/v1/messaging/threads/${threadId}`)
        ).status(),
      ).toBe(404);
      expect(
        (
          await member.page.request.post(
            "/api/v1/messaging/record-links/read",
            { data: { threadId } },
          )
        ).status(),
      ).toBe(404);
    }
    expect(
      (await readIdentities(reader.page)).matches[0]?.records.map(
        (record) => record.ref,
      ),
    ).toEqual([contact]);

    foreignWorkspace = await createBrowserWorkspace(database);
    const role = await database.query(
      'SELECT "roleId" FROM "User" WHERE "companyId"=$1 AND id=$2',
      [foreignWorkspace.companyId, foreignWorkspace.userId],
    );
    const roleId = z.object({ roleId: z.uuid() }).parse(role.rows[0]).roleId;
    foreign = await secondaryUser(
      browser,
      database,
      foreignWorkspace.companyId,
      roleId,
      testInfo,
    );
    const foreignContactTypeId = presetId(
      foreignWorkspace.companyId,
      "contact",
    );
    const foreignContact = await mutate(foreign.page, {
      action: "create",
      typeId: foreignContactTypeId,
      fields: [
        {
          fieldId: presetId(foreignWorkspace.companyId, "contact.firstName"),
          value: { kind: "text", value: "Foreign CRM" },
        },
        {
          fieldId: presetId(foreignWorkspace.companyId, "contact.lastName"),
          value: { kind: "text", value: "Ada" },
        },
      ],
      identities: [{ provider: "mail", value: email }],
    });
    expect(
      (await readIdentities(foreign.page)).matches[0]?.records.map(
        (record) => record.ref,
      ),
    ).toEqual([foreignContact]);
    expect(
      (await readIdentities(reader.page)).matches[0]?.records.map(
        (record) => record.ref,
      ),
    ).toEqual([contact]);
    expect(
      (
        await foreign.page.request.post("/api/v1/records/read", {
          data: contact,
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await foreign.page.request.post("/api/v1/messaging/record-links/read", {
          data: { threadId },
        })
      ).status(),
    ).toBe(404);
    await foreign.page.goto(`/en/records/${foreignContactTypeId}`);
    await expect(
      foreign.page.getByRole("button", {
        name: "Foreign CRM Ada",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      foreign.page.getByRole("button", {
        name: "Private CRM Ada",
        exact: true,
      }),
    ).toHaveCount(0);
    await foreign.page.screenshot({
      path: testInfo.outputPath("foreign-workspace-identical-identifier.png"),
      animations: "disabled",
    });
    expect(
      (
        await database.query(
          'SELECT "companyId","typeId","recordId" FROM "RecordIdentityLink" WHERE "companyId"=ANY($1::text[]) ORDER BY "companyId"',
          [[companyId, foreignWorkspace.companyId]],
        )
      ).rows,
    ).toEqual(
      expect.arrayContaining([
        { companyId, typeId: contact.typeId, recordId: contact.recordId },
        {
          companyId: foreignWorkspace.companyId,
          typeId: foreignContact.typeId,
          recordId: foreignContact.recordId,
        },
      ]),
    );
    expect(errors).toEqual([]);
    expect(noAccess.errors).toEqual([]);
    expect(reader.errors).toEqual([]);
    expect(foreign.errors).toEqual([]);
  } finally {
    if (foreign) await foreign.close();
    if (foreignWorkspace)
      await removeBrowserWorkspace(database, foreignWorkspace);
    await reader.close();
    await noAccess.close();
  }
});

function relationshipCaptureErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  return errors;
}

async function relationshipCreateTypeUi(page: Page, name: string) {
  await openConfigure(page);
  await addFromConfigure(page, "List");
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", {
      name: englishMessages.RecordModel.name,
      exact: false,
    })
    .first()
    .fill(name);
  await dialog
    .getByRole("button", { name: "Save", exact: true })
    .first()
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/en\/records\/[a-f0-9-]+$/);
  const typeId = new URL(page.url()).pathname.split("/").at(-1);
  const type = (await readModel(page)).types.find(
    (candidate) => candidate.id === typeId,
  );
  if (!type)
    throw new Error("The relationship browser fixture type is missing");
  return type;
}

async function relationshipApplyUi(page: Page) {
  await expect(
    page.getByRole("dialog", {
      name: englishMessages.RecordModel.relationship,
      exact: true,
    }),
  ).toBeVisible();
  await saveDrawer(page);
}

async function relationshipOptionUi(page: Page, id: string, label: string) {
  if (id === "onSourceDelete" || id === "onTargetDelete")
    await openDrawerTab(
      page,
      englishMessages.RecordModel.relationshipEditor.onDelete,
    );
  await page
    .getByRole("dialog", {
      name: englishMessages.RecordModel.relationship,
      exact: true,
    })
    .locator(`[id="${id}"]`)
    .click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

async function relationshipCreateUi(
  page: Page,
  typeId: string,
  targetLabel: string,
  sourceLabel: string,
  oppositeLabel: string,
  singular: boolean,
  restrictTarget = false,
) {
  await openConfigure(page, typeId);
  await addFromConfigure(page, "Relationship");
  const dialog = page.getByRole("dialog", {
    name: englishMessages.RecordModel.relationship,
    exact: true,
  });
  await relationshipOptionUi(page, "targetTypeId", targetLabel);
  await dialog.locator("#sourceLabel").fill(sourceLabel);
  await dialog.locator("#targetLabel").fill(oppositeLabel);
  await relationshipOptionUi(
    page,
    "cardinality",
    singular
      ? englishMessages.RecordModel.cardinality.manyToOne
      : englishMessages.RecordModel.cardinality.manyToMany,
  );
  if (restrictTarget)
    await relationshipOptionUi(
      page,
      "onTargetDelete",
      englishMessages.RecordModel.deletion.restrict,
    );
  await relationshipApplyUi(page);
  const relation = (await readModel(page)).relationships.find(
    (candidate) =>
      candidate.sourceTypeId === typeId &&
      candidate.sourceLabel === sourceLabel,
  );
  if (!relation)
    throw new Error("The configured browser relationship is missing");
  return relation;
}

async function relationshipEditUi(
  page: Page,
  typeId: string,
  label: string,
  restore = false,
) {
  await followConfigureLink(page);
  await expect(page).toHaveURL(`/en/configure?typeId=${typeId}`);
  await openConfigureTab(page, "Relationships");
  await expect(
    page.getByRole("region", {
      name: englishMessages.RecordModel.relationships,
      exact: true,
    }),
  ).toBeVisible();
  if (restore) await setShowArchivedParts(page, true);
  await openConfigureRow(page, "Relationships", label);
  if (restore) {
    await expect(
      page
        .getByRole("dialog")
        .getByRole("switch", { name: "Archive relationship", exact: true }),
    ).not.toBeChecked();
  }
  return page.getByRole("dialog", {
    name: englishMessages.RecordModel.relationship,
    exact: true,
  });
}

async function relationshipOpenRecordUi(
  page: Page,
  typeId: string,
  typeLabel: string,
  title: string,
) {
  await page.waitForLoadState("networkidle");
  await page.goto(`/en/records/${typeId}`);
  await page.getByRole("button", { name: title, exact: true }).click();
  const editor = page.getByRole("dialog", { name: typeLabel, exact: true });
  await expect(editor).toBeVisible();
  await expect(
    editor.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  return editor;
}

function relationshipFieldUi(
  page: Page,
  typeLabel: string,
  relationId: string,
  direction: "incoming" | "outgoing",
) {
  return page
    .getByRole("dialog", { name: typeLabel, exact: true })
    .locator(`[data-entity-field="relationship:${relationId}:${direction}"]`);
}

async function relationshipStageUi(
  page: Page,
  typeLabel: string,
  relationId: string,
  direction: "incoming" | "outgoing",
  title: string,
) {
  const field = relationshipFieldUi(page, typeLabel, relationId, direction);
  await expect(field.getByRole("combobox")).toBeEnabled();
  await field.getByRole("combobox").click();
  await page.getByRole("option", { name: title, exact: true }).click();
}

async function relationshipSaveUi(page: Page, typeLabel: string) {
  const editor = page.getByRole("dialog", { name: typeLabel, exact: true });
  await editor
    .getByRole("button", {
      name: englishMessages.Common.actions.save,
      exact: true,
    })
    .click();
  await expect(editor).not.toBeVisible();
}

async function relationshipCloseRecordUi(page: Page, typeLabel: string) {
  while (
    await page.getByRole("dialog", { name: typeLabel, exact: true }).count()
  ) {
    const editor = page
      .getByRole("dialog", { name: typeLabel, exact: true })
      .last();
    await expect(editor.locator('[aria-busy="true"]')).toHaveCount(0);
    const id = await editor.getAttribute("id");
    if (!id) throw new Error("Expected the owned record drawer's DOM identity");
    await page.keyboard.press("Escape");
    const discard = page.getByRole("alertdialog", {
      name: englishMessages.Common.navigationGuard.title,
      exact: true,
    });
    if (await discard.isVisible()) {
      await discard
        .getByRole("button", {
          name: englishMessages.Common.actions.discard,
          exact: true,
        })
        .click();
      await expect(discard).toHaveCount(0);
    }
    await expect(page.locator(`[id="${id}"]`)).toHaveCount(0);
  }
}

function relationshipOpenName(title: string) {
  return englishMessages.RecordModel.openRecord.replace("{name}", title);
}

function relationshipUnlinkName(title: string) {
  return englishMessages.RecordModel.unlinkRecord.replace("{name}", title);
}

test("configures self-type singular and many relationships, edits from both ends, preserves archived links and previews deletion policies", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(360000);
  const errors = relationshipCaptureErrors(page);
  const type = await relationshipCreateTypeUi(page, "Graph nodes");
  const parent = await relationshipCreateUi(
    page,
    type.id,
    type.pluralLabel,
    "Parent node",
    "Child nodes",
    true,
    true,
  );
  const related = await relationshipCreateUi(
    page,
    type.id,
    type.pluralLabel,
    "Related nodes",
    "Linked from",
    false,
  );
  expect(parent).toMatchObject({
    sourceTypeId: type.id,
    targetTypeId: type.id,
    sourceCardinality: "one",
    targetCardinality: "many",
    onTargetDelete: "restrict",
  });
  expect(related).toMatchObject({
    sourceTypeId: type.id,
    targetTypeId: type.id,
    sourceCardinality: "many",
    targetCardinality: "many",
  });
  const create = async (title: string) =>
    mutate(page, {
      action: "create",
      typeId: type.id,
      fields: [
        { fieldId: type.primaryFieldId, value: { kind: "text", value: title } },
      ],
    });
  const alpha = await create("Alpha node");
  const beta = await create("Beta node");
  const gamma = await create("Gamma node");
  const untouched = await create("Unrelated node");
  const links = async (relationId: string) =>
    (
      await database.query(
        'SELECT "sourceId","targetId" FROM "RecordLink" WHERE "companyId"=$1 AND "relationId"=$2 AND "sourceTypeId"=$3 AND "targetTypeId"=$3',
        [companyId, relationId, type.id],
      )
    ).rows
      .map(
        (row: { sourceId: string; targetId: string }) =>
          `${row.sourceId}:${row.targetId}`,
      )
      .sort();
  const pair = (source: string, target: string) => `${source}:${target}`;

  await relationshipOpenRecordUi(page, type.id, type.label, "Alpha node");
  await relationshipStageUi(
    page,
    type.label,
    parent.id,
    "outgoing",
    "Beta node",
  );
  await relationshipSaveUi(page, type.label);
  expect(await links(parent.id)).toEqual([pair(alpha.recordId, beta.recordId)]);
  await relationshipOpenRecordUi(page, type.id, type.label, "Beta node");
  const children = relationshipFieldUi(page, type.label, parent.id, "incoming");
  await expect(
    children.getByRole("button", {
      name: relationshipOpenName("Alpha node"),
      exact: true,
    }),
  ).toBeVisible();
  await relationshipStageUi(
    page,
    type.label,
    parent.id,
    "incoming",
    "Gamma node",
  );
  await relationshipSaveUi(page, type.label);
  expect(await links(parent.id)).toEqual(
    [
      pair(alpha.recordId, beta.recordId),
      pair(gamma.recordId, beta.recordId),
    ].sort(),
  );
  await relationshipOpenRecordUi(page, type.id, type.label, "Alpha node");
  await relationshipStageUi(
    page,
    type.label,
    parent.id,
    "outgoing",
    "Gamma node",
  );
  await relationshipSaveUi(page, type.label);
  expect(await links(parent.id)).toEqual(
    [
      pair(alpha.recordId, gamma.recordId),
      pair(gamma.recordId, beta.recordId),
    ].sort(),
  );
  await relationshipOpenRecordUi(page, type.id, type.label, "Alpha node");
  await relationshipStageUi(
    page,
    type.label,
    related.id,
    "outgoing",
    "Beta node",
  );
  await relationshipStageUi(
    page,
    type.label,
    related.id,
    "outgoing",
    "Gamma node",
  );
  await relationshipSaveUi(page, type.label);
  expect(await links(related.id)).toEqual(
    [
      pair(alpha.recordId, beta.recordId),
      pair(alpha.recordId, gamma.recordId),
    ].sort(),
  );
  await relationshipOpenRecordUi(page, type.id, type.label, "Beta node");
  const incoming = relationshipFieldUi(
    page,
    type.label,
    related.id,
    "incoming",
  );
  await incoming
    .getByRole("button", {
      name: relationshipUnlinkName("Alpha node"),
      exact: true,
    })
    .click();
  await relationshipSaveUi(page, type.label);
  expect(await links(related.id)).toEqual([
    pair(alpha.recordId, gamma.recordId),
  ]);
  await relationshipOpenRecordUi(page, type.id, type.label, "Alpha node");
  await relationshipStageUi(
    page,
    type.label,
    related.id,
    "outgoing",
    "Beta node",
  );
  await relationshipSaveUi(page, type.label);

  const alphaEditor = await relationshipOpenRecordUi(
    page,
    type.id,
    type.label,
    "Alpha node",
  );
  await alphaEditor
    .getByRole("textbox", { name: type.label, exact: false })
    .fill("Unsaved Alpha");
  const openGamma = relationshipFieldUi(
    page,
    type.label,
    parent.id,
    "outgoing",
  ).getByRole("button", {
    name: relationshipOpenName("Gamma node"),
    exact: true,
  });
  await openGamma.click();
  const guard = page.getByRole("alertdialog", {
    name: englishMessages.Common.navigationGuard.title,
    exact: true,
  });
  await expect(guard).toBeVisible();
  await guard
    .getByRole("button", {
      name: englishMessages.Common.actions.cancel,
      exact: true,
    })
    .click();
  await expect(
    alphaEditor.getByRole("textbox", { name: type.label, exact: false }),
  ).toHaveValue("Unsaved Alpha");
  await openGamma.click();
  await guard
    .getByRole("button", {
      name: englishMessages.Common.actions.discard,
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: type.label, exact: true })
      .getByRole("heading", { name: "Gamma node", exact: true }),
  ).toBeVisible();
  expect(
    (
      await database.query(
        'SELECT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
        [companyId, type.id, alpha.recordId, type.primaryFieldId],
      )
    ).rows,
  ).toEqual([{ textValue: "Alpha node" }]);
  await relationshipCloseRecordUi(page, type.label);

  const edit = await relationshipEditUi(page, type.id, related.sourceLabel);
  await edit.locator("#archived").check();
  await relationshipApplyUi(page);
  expect(
    (await readModel(page)).relationships.find(
      (relation) => relation.id === related.id,
    )?.archived,
  ).toBe(true);
  expect(await links(related.id)).toEqual(
    [
      pair(alpha.recordId, beta.recordId),
      pair(alpha.recordId, gamma.recordId),
    ].sort(),
  );
  await relationshipOpenRecordUi(page, type.id, type.label, "Alpha node");
  await expect(
    relationshipFieldUi(page, type.label, related.id, "outgoing"),
  ).toHaveCount(0);
  await relationshipCloseRecordUi(page, type.label);
  const restore = await relationshipEditUi(
    page,
    type.id,
    related.sourceLabel,
    true,
  );
  await expect(restore.locator("#archived")).not.toBeChecked();
  await relationshipApplyUi(page);
  expect(
    (await readModel(page)).relationships.find(
      (relation) => relation.id === related.id,
    )?.archived,
  ).toBe(false);
  await relationshipOpenRecordUi(page, type.id, type.label, "Alpha node");
  const restored = relationshipFieldUi(
    page,
    type.label,
    related.id,
    "outgoing",
  );
  await expect(
    restored.getByRole("button", {
      name: relationshipOpenName("Beta node"),
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    restored.getByRole("button", {
      name: relationshipOpenName("Gamma node"),
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("restored-self-relationships.png"),
    animations: "disabled",
  });
  await relationshipCloseRecordUi(page, type.label);

  let gammaEditor = await relationshipOpenRecordUi(
    page,
    type.id,
    type.label,
    "Gamma node",
  );
  await gammaEditor
    .getByRole("button", {
      name: englishMessages.Common.actions.delete,
      exact: true,
    })
    .click();
  await expect(page.locator("[data-sonner-toast]")).toContainText(
    englishMessages.Common.errors.recordDependencies,
  );
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(
    (
      await database.query(
        'SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 AND id=$3',
        [companyId, type.id, gamma.recordId],
      )
    ).rows,
  ).toEqual([{ id: gamma.recordId }]);
  await relationshipCloseRecordUi(page, type.label);
  await relationshipEditUi(page, type.id, parent.sourceLabel);
  await relationshipOptionUi(
    page,
    "onTargetDelete",
    englishMessages.RecordModel.deletion.unlink,
  );
  await relationshipApplyUi(page);
  gammaEditor = await relationshipOpenRecordUi(
    page,
    type.id,
    type.label,
    "Gamma node",
  );
  await gammaEditor
    .getByRole("button", {
      name: englishMessages.Common.actions.delete,
      exact: true,
    })
    .click();
  let confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText(`${type.pluralLabel}: 1`);
  await confirmation.locator("#confirm-delete").click();
  await expect(gammaEditor).not.toBeVisible();
  expect(await links(parent.id)).toEqual([]);
  expect(await links(related.id)).toEqual([
    pair(alpha.recordId, beta.recordId),
  ]);
  await relationshipOpenRecordUi(page, type.id, type.label, "Alpha node");
  await relationshipStageUi(
    page,
    type.label,
    parent.id,
    "outgoing",
    "Beta node",
  );
  await relationshipSaveUi(page, type.label);
  await relationshipEditUi(page, type.id, parent.sourceLabel);
  await relationshipOptionUi(
    page,
    "onSourceDelete",
    englishMessages.RecordModel.deletion.cascade,
  );
  await relationshipApplyUi(page);
  const deleting = await relationshipOpenRecordUi(
    page,
    type.id,
    type.label,
    "Alpha node",
  );
  await deleting
    .getByRole("button", {
      name: englishMessages.Common.actions.delete,
      exact: true,
    })
    .click();
  confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText(`${type.pluralLabel}: 2`);
  await confirmation.locator("#confirm-delete-cancel").click();
  expect(
    (
      await database.query(
        'SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 AND id=ANY($3::text[])',
        [companyId, type.id, [alpha.recordId, beta.recordId]],
      )
    ).rows,
  ).toHaveLength(2);
  await deleting
    .getByRole("button", {
      name: englishMessages.Common.actions.delete,
      exact: true,
    })
    .click();
  await expect(confirmation).toContainText(`${type.pluralLabel}: 2`);
  await page.screenshot({
    path: testInfo.outputPath("custom-relationship-cascade-preview.png"),
    animations: "disabled",
  });
  await confirmation.locator("#confirm-delete").click();
  await expect(deleting).not.toBeVisible();
  expect(
    (
      await database.query(
        'SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2',
        [companyId, type.id],
      )
    ).rows,
  ).toEqual([{ id: untouched.recordId }]);
  expect(await links(parent.id)).toEqual([]);
  expect(await links(related.id)).toEqual([]);
  expect(errors).toEqual([]);
});

test("configures a two-hop relationship path and lets a genuine read-only user navigate it without changing links", async ({
  page,
  browser,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const errors = relationshipCaptureErrors(page);
  const type = await relationshipCreateTypeUi(page, "Reporting nodes");
  const parent = await relationshipCreateUi(
    page,
    type.id,
    type.pluralLabel,
    "Reports to",
    "Direct reports",
    true,
  );
  await openConfigure(page, type.id);
  await addFromConfigure(page, "Relationship");
  const dialog = page.getByRole("dialog", {
    name: englishMessages.RecordModel.relationship,
    exact: true,
  });
  await relationshipOptionUi(
    page,
    "mode",
    englishMessages.RecordModel.relationshipPath,
  );
  await dialog.locator("#sourceLabel").fill("Second-level manager");
  for (let step = 0; step < 2; step++) {
    await dialog
      .getByRole("combobox", {
        name: englishMessages.RecordModel.addPathStep,
        exact: true,
      })
      .click();
    await page
      .getByRole("option", { name: parent.sourceLabel, exact: true })
      .click();
  }
  await relationshipApplyUi(page);
  const configured = (await readModel(page)).types
    .find((candidate) => candidate.id === type.id)
    ?.relationshipPaths?.find((path) => path.label === "Second-level manager");
  expect(configured).toMatchObject({
    path: [
      { relationId: parent.id, direction: "outgoing" },
      { relationId: parent.id, direction: "outgoing" },
    ],
    archived: false,
  });
  const create = async (
    title: string,
    manager?: Awaited<ReturnType<typeof mutate>>,
  ) =>
    mutate(page, {
      action: "create",
      typeId: type.id,
      fields: [
        { fieldId: type.primaryFieldId, value: { kind: "text", value: title } },
      ],
      ...(manager
        ? {
            links: [
              {
                relationId: parent.id,
                direction: "outgoing" as const,
                record: manager,
              },
            ],
          }
        : {}),
    });
  const gamma = await create("Executive manager");
  const beta = await create("Direct manager", gamma);
  const alpha = await create("Individual contributor", beta);
  const role = await saveRole(page, {
    name: "Reporting readers",
    description: "Read relationships without editing records or schemas",
    permissions: [{ resource: "company", actions: [] }],
    recordGrants: [{ typeId: type.id, actions: ["readAll"] }],
  });
  const reader = await secondaryUser(
    browser,
    database,
    companyId,
    role.role.id,
    testInfo,
  );
  try {
    const editor = await relationshipOpenRecordUi(
      reader.page,
      type.id,
      type.label,
      "Individual contributor",
    );
    const path = editor.getByRole("region", {
      name: "Second-level manager",
      exact: true,
    });
    await expect(
      path.getByRole("button", {
        name: relationshipOpenName("Executive manager"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(path.getByRole("combobox")).toHaveCount(0);
    await expect(
      path.getByRole("button", {
        name: relationshipUnlinkName("Executive manager"),
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      editor.getByRole("button", {
        name: englishMessages.Common.actions.save,
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      editor.getByRole("button", {
        name: englishMessages.Common.actions.delete,
        exact: true,
      }),
    ).toHaveCount(0);
    await path
      .getByRole("button", {
        name: relationshipOpenName("Executive manager"),
        exact: true,
      })
      .click();
    const manager = reader.page.getByRole("dialog", {
      name: type.label,
      exact: true,
    });
    await expect(
      manager.getByRole("heading", { name: "Executive manager", exact: true }),
    ).toBeVisible();
    await expect(
      manager.getByRole("textbox", { name: type.label, exact: false }),
    ).toHaveAttribute("readonly", "");
    await expect(
      manager.getByRole("button", {
        name: englishMessages.Common.actions.save,
        exact: true,
      }),
    ).toHaveCount(0);
    await reader.page.screenshot({
      path: testInfo.outputPath("read-only-two-hop-navigation.png"),
      animations: "disabled",
    });
    expect(
      (
        await database.query(
          'SELECT "sourceId","targetId" FROM "RecordLink" WHERE "companyId"=$1 AND "relationId"=$2 AND "sourceTypeId"=$3 AND "targetTypeId"=$3',
          [companyId, parent.id, type.id],
        )
      ).rows,
    ).toEqual(
      expect.arrayContaining([
        { sourceId: alpha.recordId, targetId: beta.recordId },
        { sourceId: beta.recordId, targetId: gamma.recordId },
      ]),
    );
    expect(reader.errors).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await reader.close();
  }
});

async function presentationOptionUi(page: Page, id: string, label: string) {
  await page
    .getByRole("dialog", {
      name: englishMessages.RecordModel.sharedDefaults,
      exact: true,
    })
    .locator(`#${id}`)
    .click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

async function presentationAppearanceUi(page: Page) {
  await page
    .getByRole("button", {
      name: englishMessages.Common.ariaLabels.tooltipFields,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("combobox", {
      name: englishMessages.Common.table.groupBy,
      exact: true,
    }),
  ).toBeVisible();
}

async function presentationCloseAppearanceUi(page: Page, testInfo: TestInfo) {
  if (testInfo.project.name === "mobile")
    await page.locator('[data-slot="drawer-close"]').click();
  else await page.keyboard.press("Escape");
  await expect(
    page.getByRole("combobox", {
      name: englishMessages.Common.table.groupBy,
      exact: true,
    }),
  ).not.toBeVisible();
}

async function presentationViewMenuUi(page: Page, label: string) {
  await expect(
    page.locator(
      '[data-slot="dropdown-menu-content"][aria-labelledby="global-data-views-menu"]',
    ),
  ).toHaveCount(0);
  await page.locator("#global-data-views-menu").click();
  await expect(page.locator("#global-data-views-menu")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}

async function presentationNameViewUi(page: Page, name: string) {
  await page.locator("#view-editor-name").fill(name);
  await page
    .getByRole("button", {
      name: englishMessages.Common.actions.save,
      exact: true,
    })
    .click();
  await expect(page.locator("#view-editor-name")).not.toBeVisible();
  await expect(
    page.locator("#global-data-views").getByRole("link", { name, exact: true }),
  ).toHaveAttribute("aria-current", "page");
}

test("keeps personal views separate from shared defaults and completes their UI lifecycle for two genuine users", async ({
  page,
  browser,
  context,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(360000);
  const errors = relationshipCaptureErrors(page);
  let model = await readModel(page);
  await post(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "createType",
        reference: "$portfolio",
        label: "Portfolio",
        pluralLabel: "Portfolios",
        description: "Independent personal and shared presentation",
        icon: "folder",
        embedded: false,
        accessPresetId: null,
      },
    ],
  });
  model = await readModel(page);
  const type = model.types.find(
    (candidate) => candidate.pluralLabel === "Portfolios",
  );
  if (!type) throw new Error("The presentation fixture type is missing");
  const stageId = randomUUID();
  const budgetId = randomUUID();
  const internalId = randomUUID();
  const definitions = [
    {
      id: stageId,
      label: "Stage",
      valueType: "select",
      options: [
        { id: "open", label: "Open", color: null, attributes: [] },
        { id: "closed", label: "Closed", color: null, attributes: [] },
      ],
      position: 2,
    },
    {
      id: budgetId,
      label: "Budget",
      valueType: "number",
      options: [],
      position: 3,
    },
    {
      id: internalId,
      label: "Internal memo",
      valueType: "text",
      options: [],
      position: 4,
    },
  ];
  await post(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: definitions.map((definition) => ({
      operation: "putField",
      field: {
        ...definition,
        typeId: type.id,
        behavior: { kind: "input", defaultValue: null },
        required: false,
        archived: false,
      },
    })),
  });
  const create = (title: string, stage: string, budget: string) =>
    mutate(page, {
      action: "create",
      typeId: type.id,
      fields: [
        { fieldId: type.primaryFieldId, value: { kind: "text", value: title } },
        { fieldId: stageId, value: { kind: "select", value: stage } },
        {
          fieldId: budgetId,
          value: { kind: "decimal", value: budget, currency: null },
        },
        {
          fieldId: internalId,
          value: {
            kind: "text",
            value: `Private presentation note for ${title}`,
          },
        },
      ],
    });
  const alpha = await create("Alpha portfolio", "open", "50");
  const beta = await create("Beta portfolio", "open", "75");
  await create("Gamma portfolio", "closed", "20");
  const surfaceKey = `records:${type.id}`;
  const viewRows = async (userId: string) =>
    (
      await database.query(
        'SELECT id,name,position,"viewMode",grouping,"sortDescriptor","columnOrder","columnWidths","hiddenColumns" FROM "DataView" WHERE "companyId"=$1 AND "userId"=$2 AND "surfaceKey"=$3 ORDER BY position,id',
        [companyId, userId, surfaceKey],
      )
    ).rows;
  await page.goto(`/en/records/${type.id}`);
  await presentationAppearanceUi(page);
  await page
    .getByRole("combobox", {
      name: englishMessages.Common.sort.field,
      exact: true,
    })
    .click();
  await page.getByRole("option", { name: type.label, exact: true }).click();
  await page.locator(`#field-${budgetId}`).uncheck();
  await presentationCloseAppearanceUi(page, testInfo);
  await expect
    .poll(
      async () =>
        (
          await database.query(
            'SELECT "sortDescriptor","viewMode","hiddenColumns" FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3',
            [companyId, workspace.userId, surfaceKey],
          )
        ).rows[0],
    )
    .toMatchObject({
      sortDescriptor: { field: type.primaryFieldId, direction: "asc" },
      viewMode: "table",
      hiddenColumns: [budgetId],
    });
  await page.locator("#global-data-views-new").click();
  await presentationNameViewUi(page, "My working table");
  await expect.poll(() => viewRows(workspace.userId)).toHaveLength(1);
  const personal = (await viewRows(workspace.userId))[0];
  await expect
    .poll(
      async () =>
        (
          await database.query(
            'SELECT "activeViewKey" FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3',
            [companyId, workspace.userId, surfaceKey],
          )
        ).rows[0]?.activeViewKey,
    )
    .toBe(personal.id);
  expect(personal).toMatchObject({
    name: "My working table",
    viewMode: "table",
    grouping: null,
    sortDescriptor: { field: type.primaryFieldId, direction: "asc" },
    hiddenColumns: [budgetId],
  });
  await openConfigure(page, type.id);
  await openListAction(page, "Shared defaults");
  const shared = page.getByRole("dialog", {
    name: englishMessages.RecordModel.sharedDefaults,
    exact: true,
  });
  await presentationOptionUi(page, "layout", englishMessages.RecordModel.board);
  await presentationOptionUi(page, "groupBy", "Stage");
  await presentationOptionUi(page, "sortField", "Budget");
  await presentationOptionUi(
    page,
    "sortDirection",
    englishMessages.RecordModel.descending,
  );
  const columns = shared.getByRole("group", {
    name: englishMessages.RecordModel.defaultColumns,
    exact: true,
  });
  await columns
    .getByRole("checkbox", { name: "Internal memo", exact: true })
    .uncheck();
  await columns
    .getByRole("button", {
      name: englishMessages.RecordModel.moveUp.replace("{field}", "Budget"),
      exact: true,
    })
    .click();
  const pinned = shared.getByRole("group", {
    name: englishMessages.RecordModel.pinnedFields,
    exact: true,
  });
  await pinned.getByRole("checkbox", { name: "Budget", exact: true }).check();
  await shared
    .getByRole("button", {
      name: englishMessages.RecordModel.addGroupSummary,
      exact: true,
    })
    .click();
  await presentationOptionUi(page, "type-summary-field-0", "Budget");
  await presentationOptionUi(
    page,
    "type-summary-aggregation-0",
    englishMessages.RecordModel.reducers.average,
  );
  await presentationOptionUi(
    page,
    "type-summary-aggregation-0",
    englishMessages.RecordModel.reducers.sum,
  );
  await saveDrawer(page);
  const changed = (await readModel(page)).types.find(
    (candidate) => candidate.id === type.id,
  );
  expect(changed?.defaults).toMatchObject({
    layout: "board",
    groupBy: stageId,
    sortField: budgetId,
    sortDirection: "desc",
    hiddenColumns: [internalId],
    pinnedFields: [type.primaryFieldId, budgetId],
    groupSummaries: [{ fieldId: budgetId, aggregation: "sum" }],
  });
  expect(changed?.defaults.columns.slice(0, 3)).toEqual([
    type.primaryFieldId,
    budgetId,
    stageId,
  ]);
  expect(await viewRows(workspace.userId)).toEqual([personal]);
  await page.goto(`/en/records/${type.id}`);
  await expect(
    page
      .locator("#global-data-views")
      .getByRole("link", { name: personal.name, exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-slot="kanban-root"]')).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: "Budget", exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: "Internal memo", exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Alpha portfolio", exact: true })
    .click();
  const detail = page.getByRole("dialog", { name: type.label, exact: true });
  await expect(
    detail.locator(`[data-summary-field="${budgetId}"]`),
  ).toContainText("50");
  await page.keyboard.press("Escape");
  await expect(detail).not.toBeVisible();
  const role = await saveRole(page, {
    name: "Portfolio viewers",
    description:
      "Read the shared presentation without schema or record editing",
    permissions: [{ resource: "company", actions: [] }],
    recordGrants: [{ typeId: type.id, actions: ["readAll"] }],
  });
  const reader = await secondaryUser(
    browser,
    database,
    companyId,
    role.role.id,
    testInfo,
  );
  const assertBoard = async (target: Page) => {
    const open = target.locator('[data-group-key="value:open"]');
    await expect(open.locator("[data-item-id]")).toHaveCount(2);
    await expect
      .poll(() =>
        open
          .locator("[data-item-id]")
          .evaluateAll((cards) =>
            cards.map((card) => card.getAttribute("data-item-id")),
          ),
      )
      .toEqual([beta.recordId, alpha.recordId]);
    await expect(
      open.locator('[aria-label="Budget · Sum: 125"]'),
    ).toBeVisible();
    await expect(
      target.locator(
        '[data-group-key="value:closed"] [aria-label="Budget · Sum: 20"]',
      ),
    ).toBeVisible();
    await expect(
      open
        .locator(`[data-item-id="${beta.recordId}"]`)
        .getByText("Budget", { exact: true }),
    ).toBeVisible();
    await expect(
      target
        .locator('[data-slot="kanban-root"]')
        .getByText("Internal memo", { exact: true }),
    ).toHaveCount(0);
  };
  try {
    await reader.page.goto(`/en/records/${type.id}`);
    await assertBoard(reader.page);
    await expect(
      reader.page.locator("#global-data-views [data-view-chip]"),
    ).toHaveCount(1);
    await expect(reader.page.locator("#global-data-views-all")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      reader.page.getByRole("link", { name: personal.name, exact: true }),
    ).toHaveCount(0);
    await presentationAppearanceUi(reader.page);
    await expect(
      reader.page.getByRole("combobox", {
        name: englishMessages.Common.table.groupBy,
        exact: true,
      }),
    ).toContainText("Stage");
    await expect(
      reader.page.getByRole("combobox", {
        name: englishMessages.Common.sort.field,
        exact: true,
      }),
    ).toContainText("Budget");
    await expect(
      reader.page.getByRole("button", {
        name: englishMessages.Common.sort.descending,
        exact: true,
      }),
    ).toBeVisible();
    await expect(reader.page.locator(`#field-${internalId}`)).not.toBeChecked();
    await expect(reader.page.locator(`#field-${budgetId}`)).toBeChecked();
    expect(
      (
        await reader.page
          .locator('label[for^="field-"]')
          .evaluateAll((labels) =>
            labels.map((label) => label.getAttribute("for")?.slice(6)),
          )
      ).slice(0, 3),
    ).toEqual([type.primaryFieldId, budgetId, stageId]);
    await presentationCloseAppearanceUi(reader.page, testInfo);
    await reader.page.locator(`[data-item-id="${alpha.recordId}"]`).click();
    const readerDetail = reader.page.getByRole("dialog", {
      name: type.label,
      exact: true,
    });
    await expect(
      readerDetail.locator(`[data-summary-field="${budgetId}"]`),
    ).toContainText("50");
    await reader.page.keyboard.press("Escape");
    await expect(readerDetail).not.toBeVisible();
    await reader.page.reload();
    await assertBoard(reader.page);
    expect(await viewRows(reader.userId)).toEqual([]);
    await reader.page.screenshot({
      path: testInfo.outputPath("inherited-shared-board-defaults.png"),
      animations: "disabled",
    });
    expect(reader.errors).toEqual([]);
  } finally {
    await reader.close();
  }
  await presentationViewMenuUi(page, englishMessages.DataView.views.duplicate);
  await expect(page.locator("#view-editor-name")).toHaveValue(
    englishMessages.DataView.views.duplicateName.replace(
      "{name}",
      personal.name,
    ),
  );
  await presentationNameViewUi(page, "My duplicate table");
  await expect.poll(() => viewRows(workspace.userId)).toHaveLength(2);
  const duplicate = (await viewRows(workspace.userId)).find(
    (view) => view.name === "My duplicate table",
  );
  if (!duplicate) throw new Error("The duplicate personal view is missing");
  const duplicateId = duplicate.id;
  const originalState = {
    ...personal,
    id: undefined,
    name: undefined,
    position: undefined,
  };
  expect({
    ...duplicate,
    id: undefined,
    name: undefined,
    position: undefined,
  }).toEqual(originalState);
  await presentationViewMenuUi(page, englishMessages.DataView.views.editTitle);
  await presentationNameViewUi(page, "My renamed table");
  await presentationViewMenuUi(page, englishMessages.DataView.views.moveLeft);
  await expect
    .poll(async () =>
      (await viewRows(workspace.userId)).map((view) => view.name),
    )
    .toEqual(["My renamed table", personal.name]);
  await expect
    .poll(() =>
      page.locator("#global-data-views [data-view-chip]").allTextContents(),
    )
    .toEqual([
      englishMessages.DataView.views.all,
      "My renamed table",
      personal.name,
    ]);
  await presentationViewMenuUi(page, englishMessages.DataView.views.moveRight);
  await expect
    .poll(async () =>
      (await viewRows(workspace.userId)).map((view) => view.name),
    )
    .toEqual([personal.name, "My renamed table"]);
  expect(
    (await viewRows(workspace.userId)).find((view) => view.id === duplicateId)
      ?.name,
  ).toBe("My renamed table");
  if (testInfo.project.name === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: localE2eEnvironment().baseUrl,
    });
    await presentationViewMenuUi(page, englishMessages.DataView.views.copyLink);
    await expect(page.locator("[data-sonner-toast]")).toContainText(
      englishMessages.DataView.views.linkCopied,
    );
    const copied = new URL(
      await page.evaluate(() => navigator.clipboard.readText()),
    );
    expect(copied.origin).toBe(localE2eEnvironment().baseUrl);
    expect(copied.pathname).toBe(`/en/records/${type.id}`);
    expect([...copied.searchParams]).toEqual([["view", duplicateId]]);
  }
  await presentationAppearanceUi(page);
  await page
    .getByRole("button", {
      name: englishMessages.RecordModel.resetDefaults,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("combobox", {
      name: englishMessages.Common.table.groupBy,
      exact: true,
    }),
  ).not.toBeVisible();
  await assertBoard(page);
  await expect
    .poll(async () =>
      (await viewRows(workspace.userId)).find(
        (view) => view.id === duplicateId,
      ),
    )
    .toMatchObject({
      viewMode: null,
      grouping: null,
      sortDescriptor: null,
      columnOrder: null,
      columnWidths: null,
      hiddenColumns: null,
    });
  expect(
    (await viewRows(workspace.userId)).find((view) => view.id === personal.id),
  ).toEqual(personal);
  await page.reload();
  await assertBoard(page);
  await expect(
    page
      .locator("#global-data-views")
      .getByRole("link", { name: "My renamed table", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await presentationViewMenuUi(page, englishMessages.DataView.views.delete);
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("My renamed table");
  await confirmation.locator("#confirm-delete").click();
  await expect(page.locator("#global-data-views-all")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect
    .poll(async () => (await viewRows(workspace.userId)).map((view) => view.id))
    .toEqual([personal.id]);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("view"))
    .toBeNull();
  await page
    .locator("#global-data-views")
    .getByRole("link", { name: personal.name, exact: true })
    .click();
  await expect(
    page.getByRole("columnheader", { name: "Internal memo", exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Budget", exact: false }),
  ).toHaveCount(0);
  await presentationViewMenuUi(page, englishMessages.DataView.views.delete);
  await expect(confirmation).toContainText(personal.name);
  await confirmation.locator("#confirm-delete").click();
  await expect.poll(() => viewRows(workspace.userId)).toEqual([]);
  await expect(page.locator("#global-data-views-all")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await presentationAppearanceUi(page);
  await page
    .getByRole("button", {
      name: englishMessages.RecordModel.resetDefaults,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("combobox", {
      name: englishMessages.Common.table.groupBy,
      exact: true,
    }),
  ).not.toBeVisible();
  await assertBoard(page);
  await expect
    .poll(
      async () =>
        (
          await database.query(
            'SELECT "viewStateKeys","hiddenColumns","columnOrder","viewMode","sortDescriptor",grouping FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3',
            [companyId, workspace.userId, surfaceKey],
          )
        ).rows[0],
    )
    .toMatchObject({
      hiddenColumns: [],
      columnOrder: [],
      viewMode: null,
      sortDescriptor: null,
      grouping: null,
    });
  const keys = (
    await database.query(
      'SELECT "viewStateKeys" FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3',
      [companyId, workspace.userId, surfaceKey],
    )
  ).rows[0]?.viewStateKeys;
  expect(keys).toEqual(expect.any(Array));
  for (const key of [
    "hiddenColumns",
    "columnOrder",
    "columnWidths",
    "viewMode",
    "sortDescriptor",
    "grouping",
  ])
    expect(keys).not.toContain(key);
  await page.reload();
  await assertBoard(page);
  await page.screenshot({
    path: testInfo.outputPath("reset-personal-view-to-shared-defaults.png"),
    animations: "disabled",
  });
  expect(
    (
      await database.query(
        'SELECT id FROM "DataView" WHERE "companyId"=$1 AND "surfaceKey"=$2',
        [companyId, surfaceKey],
      )
    ).rows,
  ).toEqual([]);
  await openConfigure(page, type.id);
  await openListAction(page, "Shared defaults");
  await expect(shared.locator("#type-summary-field-0")).toContainText("Budget");
  await shared
    .getByRole("button", {
      name: englishMessages.RecordModel.removeGroupSummary,
      exact: true,
    })
    .click();
  await expect(shared.locator("#type-summary-field-0")).toHaveCount(0);
  await saveDrawer(page);
  expect(
    (await readModel(page)).types.find((candidate) => candidate.id === type.id)
      ?.defaults.groupSummaries,
  ).toEqual([]);
  await page.reload();
  await openListAction(page, "Shared defaults");
  await expect(shared.locator("#type-summary-field-0")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(shared).not.toBeVisible();
  expect(await viewRows(workspace.userId)).toEqual([]);
  expect(errors).toEqual([]);
});

async function summaryFieldEditorUi(page: Page, typeId: string, label: string) {
  await openConfigure(page, typeId);
  await openConfigureRow(page, "Fields", label);
  const dialog = page.getByRole("dialog", {
    name: englishMessages.RecordModel.editField,
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("keeps retained values restricted after a delegated manager converts fields and archives their private source through the UI", async ({
  page,
  browser,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors = relationshipCaptureErrors(page);
  await post(page, "/api/v1/model/apply", {
    expectedRevision: (await readModel(page)).revision,
    idempotencyKey: randomUUID(),
    operations: [
      ...[
        {
          reference: "$source",
          label: "Private source row",
          pluralLabel: "Private source rows",
        },
        {
          reference: "$summary",
          label: "Archive summary",
          pluralLabel: "Archive summaries",
        },
      ].map((type) => ({
        operation: "createType",
        ...type,
        description: "",
        icon: "folder",
        embedded: false,
        accessPresetId: null,
      })),
      {
        operation: "putRelationship",
        relationship: {
          id: "$sourceLink",
          sourceTypeId: "$summary",
          targetTypeId: "$source",
          sourceLabel: "Private source",
          targetLabel: "Summaries",
          sourceCardinality: "one",
          targetCardinality: "many",
          onSourceDelete: "unlink",
          onTargetDelete: "unlink",
          archived: false,
        },
      },
      {
        operation: "putField",
        field: {
          id: "$amount",
          typeId: "$source",
          label: "Private amount",
          valueType: "currency",
          format: { currency: "EUR" },
          required: false,
          archived: false,
          options: [],
          position: 2,
          behavior: { kind: "input" },
        },
      },
      {
        operation: "putField",
        field: {
          id: "$total",
          typeId: "$summary",
          label: "Retained total",
          valueType: "currency",
          format: { currency: "EUR" },
          required: false,
          archived: false,
          options: [],
          position: 2,
          behavior: {
            kind: "rollup",
            expression: {
              kind: "related",
              relationId: "$sourceLink",
              direction: "outgoing",
              expression: { kind: "field", fieldId: "$amount" },
              reducer: "sum",
            },
          },
        },
      },
      {
        operation: "putField",
        field: {
          id: "$memo",
          typeId: "$summary",
          label: "Private memo",
          valueType: "text",
          required: false,
          archived: false,
          options: [],
          position: 3,
          behavior: {
            kind: "lookup",
            expression: {
              kind: "related",
              relationId: "$sourceLink",
              direction: "outgoing",
              expression: { kind: "field", fieldId: "$source.name" },
              reducer: "one",
            },
          },
        },
      },
    ],
  });
  let model = await readModel(page);
  const sourceType = model.types.find(
    (type) => type.pluralLabel === "Private source rows",
  );
  const summaryType = model.types.find(
    (type) => type.pluralLabel === "Archive summaries",
  );
  const amount = model.fields.find((field) => field.label === "Private amount");
  const total = model.fields.find((field) => field.label === "Retained total");
  const memo = model.fields.find((field) => field.label === "Private memo");
  const relation = model.relationships.find(
    (entry) => entry.sourceLabel === "Private source",
  );
  if (!sourceType || !summaryType || !amount || !total || !memo || !relation)
    throw new Error("The private-source fixture schema is incomplete");
  await post(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "putType",
        type: {
          ...summaryType,
          defaults: {
            ...summaryType.defaults,
            columns: [summaryType.primaryFieldId, total.id, memo.id],
          },
        },
      },
    ],
  });
  const canary = `Private-${randomUUID()}`;
  const source = await mutate(page, {
    action: "create",
    typeId: sourceType.id,
    fields: [
      {
        fieldId: sourceType.primaryFieldId,
        value: { kind: "text", value: canary },
      },
      {
        fieldId: amount.id,
        value: { kind: "decimal", value: "41.25", currency: "EUR" },
      },
    ],
  });
  const summary = await mutate(page, {
    action: "create",
    typeId: summaryType.id,
    fields: [
      {
        fieldId: summaryType.primaryFieldId,
        value: { kind: "text", value: "Readable archive summary" },
      },
    ],
    links: [{ relationId: relation.id, direction: "outgoing", record: source }],
  });
  expect(
    RecordDtoSchema.parse(
      await post(page, "/api/v1/records/read", summary),
    ).fields.find((field) => field.fieldId === total.id)?.result,
  ).toEqual({
    state: "value",
    value: { kind: "decimal", value: "41.25", currency: "EUR" },
  });
  model = await readModel(page);
  const readerRole = await saveRole(page, {
    name: "All active lists reader",
    description: "No private-source access",
    permissions: [{ resource: "company", actions: [] }],
    recordGrants: model.types
      .filter((type) => type.id !== sourceType.id && !type.embedded)
      .map((type) => ({ typeId: type.id, actions: ["readAll"] })),
  });
  const managerRole = await saveRole(page, {
    name: "Archive schema manager",
    description: "Schema configuration without record access or publication",
    permissions: [
      { resource: "company", actions: [] },
      { resource: "dataModel", actions: ["update"] },
    ],
    recordGrants: [],
  });
  const reader = await secondaryUser(
    browser,
    database,
    companyId,
    readerRole.role.id,
    testInfo,
  );
  const manager = await secondaryUser(
    browser,
    database,
    companyId,
    managerRole.role.id,
    testInfo,
  );
  const widgetSchema = z.object({
    id: z.uuid(),
    status: z.enum(["ready", "unavailable"]),
    data: RecordMeasureResultSchema.nullable(),
  });
  const widgetName = "Retained private total";
  try {
    expect(
      (
        await manager.page.request.post("/api/v1/records/read", {
          data: source,
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await manager.page.request.post("/api/v1/records/read", {
          data: summary,
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await reader.page.request.post("/api/v1/records/read", { data: source })
      ).status(),
    ).toBe(404);
    for (const type of model.types.filter((type) => type.embedded)) {
      expect(
        (
          await reader.page.request.post("/api/v1/records/query", {
            data: { typeId: type.id },
          })
        ).status(),
      ).toBe(200);
    }
    const widget = widgetSchema.parse(
      await post(reader.page, "/api/v1/widgets/save", {
        expectedRevision: (await readModel(page)).revision,
        idempotencyKey: randomUUID(),
        name: widgetName,
        measure: {
          source: { typeId: summaryType.id },
          aggregation: "sum",
          valueFieldId: total.id,
          groupBy: null,
        },
        displayOptions: { displayType: "verticalBarChart", showFilters: true },
        isTemplate: false,
      }),
    );
    const assertStored = async () => {
      expect(
        (
          await database.query(
            'SELECT state,trim_scale("decimalValue")::text AS amount,currency FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
            [companyId, summary.typeId, summary.recordId, total.id],
          )
        ).rows,
      ).toEqual([{ state: "value", amount: "41.25", currency: "EUR" }]);
      expect(
        (
          await database.query(
            'SELECT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
            [companyId, summary.typeId, summary.recordId, memo.id],
          )
        ).rows,
      ).toEqual([{ textValue: canary }]);
      for (const field of [total, memo]) {
        expect(
          (
            await database.query(
              'SELECT "sourceTypeId","sourceId" FROM "RecordValueDependency" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
              [companyId, summary.typeId, summary.recordId, field.id],
            )
          ).rows,
        ).toEqual([{ sourceTypeId: source.typeId, sourceId: source.recordId }]);
      }
    };
    const assertRestricted = async () => {
      const dto = RecordDtoSchema.parse(
        await post(reader.page, "/api/v1/records/read", summary),
      );
      for (const field of [total, memo])
        expect(
          dto.fields.find((entry) => entry.fieldId === field.id)?.result,
        ).toEqual({ state: "restricted" });
      await reader.page.goto(`/en/records/${summaryType.id}`);
      const row = reader.page
        .getByRole("row")
        .filter({
          has: reader.page.getByRole("button", {
            name: "Readable archive summary",
            exact: true,
          }),
        });
      await expect(
        row.getByRole("cell", { name: "Restricted", exact: true }),
      ).toHaveCount(2);
      await expect(row).not.toContainText(canary);
      await expect(row).not.toContainText("€41.25");
      await row
        .getByRole("button", { name: "Readable archive summary", exact: true })
        .click();
      const editor = reader.page.getByRole("dialog", {
        name: summaryType.label,
        exact: true,
      });
      for (const field of [total, memo]) {
        const value = editor.locator(`[data-entity-field="${field.id}"]`);
        await expect(
          value.getByText("Restricted", { exact: true }),
        ).toBeVisible();
        await expect(value.locator("input,textarea")).toHaveCount(0);
        const pinned = editor.locator(`[data-summary-field="${field.id}"]`);
        if ((await pinned.count()) === 0)
          await editor
            .getByRole("button", {
              name: `Pin ${field.label} to the overview`,
              exact: true,
            })
            .click();
        await expect(
          pinned.getByText("Restricted", { exact: true }),
        ).toBeVisible();
      }
      await reader.page.waitForLoadState("networkidle");
      await editor.getByRole("button", { name: "Close", exact: true }).click();
      await expect(editor).not.toBeVisible();
      if (!(await reader.page.locator("#nav-search").isVisible()))
        await reader.page.locator("#sidebar-trigger").click();
      await reader.page.locator("#nav-search").click();
      await reader.page.locator("#global-search-input input").fill(canary);
      await expect(
        reader.page.getByText(englishMessages.GlobalSearch.noResults, {
          exact: true,
        }),
      ).toBeVisible();
      expect(
        z
          .object({ results: z.array(z.unknown()) })
          .parse(
            await post(reader.page, "/api/v1/records/search", {
              searchTerm: canary,
            }),
          ).results,
      ).toEqual([]);
      await reader.page
        .locator("#global-search-input input")
        .fill("Readable archive summary");
      await reader.page
        .getByRole("option")
        .filter({ hasText: "Readable archive summary" })
        .click();
      for (const field of [total, memo]) {
        await expect(
          editor
            .locator(`[data-entity-field="${field.id}"]`)
            .getByText("Restricted", { exact: true }),
        ).toBeVisible();
      }
      await reader.page.waitForLoadState("networkidle");
      await editor.getByRole("button", { name: "Close", exact: true }).click();
      await expect(editor).not.toBeVisible();
      await reader.page.goto("/en/dashboard");
      const card = reader.page
        .locator('[data-uid="app-card"]')
        .filter({
          has: reader.page.getByRole("heading", {
            name: widgetName,
            exact: true,
          }),
        });
      await expect(
        card.getByText("Overall: Restricted", { exact: true }),
      ).toBeVisible();
      await expect(
        card.locator("dd").getByText("Restricted", { exact: true }),
      ).toBeVisible();
      await expect(card.locator(".recharts-wrapper")).toHaveCount(0);
      await expect(card).not.toContainText("€41.25");
      expect(
        widgetSchema.parse(
          await post(reader.page, "/api/v1/widgets/read", { id: widget.id }),
        ),
      ).toMatchObject({
        status: "ready",
        data: { total: { result: { state: "restricted" } } },
      });
      await assertStored();
    };
    await assertRestricted();
    const applyUi = async () => {
      const dialog = manager.page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await saveDrawer(manager.page);
    };
    for (const field of [total, memo]) {
      const dialog = await summaryFieldEditorUi(
        manager.page,
        summaryType.id,
        field.label,
      );
      await openDrawerTab(manager.page, "Calculation");
      await expect(
        dialog.getByRole("switch", {
          name: englishMessages.RecordModel.publishSummary,
          exact: true,
        }),
      ).toHaveCount(0);
      await openDrawerTab(manager.page, "General");
      await dialog.locator("#behavior").click();
      await manager.page
        .getByRole("option", { name: "Entered manually", exact: true })
        .click();
      await applyUi();
    }
    await assertRestricted();
    await openConfigure(manager.page, summaryType.id);
    await openConfigureRow(manager.page, "Relationships", "Private source");
    await manager.page.getByRole("dialog").locator("#archived").check();
    await applyUi();
    await openConfigure(manager.page, sourceType.id);
    await openConfigureRow(
      manager.page,
      "Activity connections",
      sourceType.pluralLabel,
    );
    await manager.page
      .getByRole("dialog")
      .getByRole("switch", { name: "Archive connection", exact: true })
      .check();
    await applyUi();
    await openListAction(manager.page, "Archive list");
    await applyUi();
    model = await readModel(page);
    expect(
      model.types.find((type) => type.id === sourceType.id)?.archived,
    ).toBe(true);
    expect(
      model.relationships.find((entry) => entry.id === relation.id)?.archived,
    ).toBe(true);
    for (const field of [total, memo]) {
      expect(model.fields.find((entry) => entry.id === field.id)).toMatchObject(
        {
          behavior: { kind: "input" },
          publishedSummary: false,
        },
      );
    }
    expect(
      (
        await database.query(
          'SELECT "typeId",actions::text[] AS actions FROM "RecordTypeGrant" WHERE "companyId"=$1 AND "roleId"=$2 ORDER BY "typeId"',
          [companyId, readerRole.role.id],
        )
      ).rows,
    ).toEqual(
      model.types
        .filter((type) => type.id !== sourceType.id && !type.embedded)
        .map((type) => ({ typeId: type.id, actions: ["readAll"] }))
        .sort((a, b) => a.typeId.localeCompare(b.typeId)),
    );
    expect(
      (
        await manager.page.request.post("/api/v1/records/read", {
          data: source,
        })
      ).status(),
    ).toBe(404);
    await assertRestricted();
    await reader.page.reload();
    await expect(
      reader.page.getByText("Overall: Restricted", { exact: true }),
    ).toBeVisible();
    await reader.page.screenshot({
      path: testInfo.outputPath("archived-source-restricted-widget.png"),
      animations: "disabled",
    });
    expect(reader.errors).toEqual([]);
    expect(manager.errors).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await manager.close();
    await reader.close();
  }
});

test("publishes and withdraws a private-input summary through the field UI without granting the delegated reader access to its inputs", async ({
  page,
  browser,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors = relationshipCaptureErrors(page);
  const id = (key: string) => presetId(companyId, key);
  const initial = await readModel(page);
  const summary = initial.fields.find(
    (field) => field.id === id("deal.totalValue"),
  );
  if (!summary) throw new Error("The total-value field is missing");
  for (const key of [
    "deal.totalValue",
    "lineItem.amount",
    "lineItem.effectivePrice",
  ])
    expect(
      initial.fields.find((field) => field.id === id(key))?.publishedSummary,
    ).toBe(false);
  const deal = await mutate(page, {
    action: "create",
    typeId: id("deal"),
    fields: [
      {
        fieldId: id("deal.name"),
        value: { kind: "text", value: "Summary publication deal" },
      },
    ],
  });
  const service = await mutate(page, {
    action: "create",
    typeId: id("service"),
    fields: [
      {
        fieldId: id("service.name"),
        value: { kind: "text", value: "Private publication input" },
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
        value: { kind: "text", value: "Publication input line" },
      },
      {
        fieldId: id("lineItem.quantity"),
        value: { kind: "decimal", value: "2", currency: null },
      },
    ],
    links: [
      { relationId: id("lineItem.deal"), direction: "outgoing", record: deal },
      {
        relationId: id("lineItem.service"),
        direction: "outgoing",
        record: service,
      },
    ],
  });
  const role = await saveRole(page, {
    name: "Delegated summary readers",
    description:
      "Configure schemas and read deals without publishing private summaries or reading services",
    permissions: [
      { resource: "company", actions: [] },
      { resource: "dataModel", actions: ["update"] },
    ],
    recordGrants: [{ typeId: id("deal"), actions: ["readAll"] }],
  });
  const member = await secondaryUser(
    browser,
    database,
    companyId,
    role.role.id,
    testInfo,
  );
  const published = async () =>
    (await readModel(page)).fields.find((field) => field.id === summary.id)
      ?.publishedSummary;
  const sourceValue = async () =>
    (
      await database.query(
        'SELECT state,trim_scale("decimalValue")::text AS amount,currency FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
        [companyId, deal.typeId, deal.recordId, summary.id],
      )
    ).rows;
  const readSummary = async () =>
    RecordDtoSchema.parse(
      await post(member.page, "/api/v1/records/read", deal),
    ).fields.find((field) => field.fieldId === summary.id)?.result;
  const openReader = async () => {
    await member.page.goto(`/en/records/${deal.typeId}`);
    await member.page
      .getByRole("button", { name: "Summary publication deal", exact: true })
      .click();
    return member.page.getByRole("dialog", { name: "Deal", exact: true });
  };
  const privateInputsStayPrivate = async () => {
    const response = await member.page.request.post("/api/v1/records/read", {
      data: service,
    });
    expect(response.status(), await response.text()).toBe(404);
    expect(
      (
        await database.query(
          'SELECT actions FROM "RecordTypeGrant" WHERE "companyId"=$1 AND "roleId"=$2 AND "typeId"=$3',
          [companyId, role.role.id, service.typeId],
        )
      ).rows,
    ).toEqual([]);
  };
  const applyPublication = async (next: boolean) => {
    const dialog = await summaryFieldEditorUi(page, deal.typeId, summary.label);
    await openDrawerTab(page, "Calculation");
    const toggle = dialog.getByRole("switch", {
      name: englishMessages.RecordModel.publishSummary,
      exact: true,
    });
    if (next) await toggle.check();
    else await toggle.uncheck();
    await saveDrawer(page);
    await expect.poll(published).toBe(next);
    expect(
      (
        await database.query(
          'SELECT definition->\'publishedSummary\' AS published FROM "RecordFieldDefinition" WHERE "companyId"=$1 AND id=$2',
          [companyId, summary.id],
        )
      ).rows,
    ).toEqual([{ published: next }]);
  };
  try {
    let editor = await openReader();
    let value = editor.locator(`[data-entity-field="${summary.id}"]`);
    await expect(
      value.getByText(englishMessages.RecordModel.restricted, { exact: true }),
    ).toBeVisible();
    await expect(value.getByText("€82.50", { exact: true })).toHaveCount(0);
    expect(await readSummary()).toEqual({ state: "restricted" });
    await privateInputsStayPrivate();
    const delegated = await summaryFieldEditorUi(
      member.page,
      deal.typeId,
      summary.label,
    );
    const delegatedSave = delegated
      .getByRole("button", {
        name: englishMessages.Common.actions.save,
        exact: true,
      })
      .first();
    await expect(delegatedSave).toBeVisible();
    await expect(delegatedSave).toBeDisabled();
    await openDrawerTab(member.page, "Calculation");
    await expect(
      delegated.getByRole("region", { name: "Calculation", exact: true }),
    ).toBeVisible();
    await expect(delegated.locator("#publishedSummary")).toHaveCount(0);
    await expect(
      delegated.getByText(englishMessages.RecordModel.summaryApprovalRequired, {
        exact: true,
      }),
    ).toHaveCount(0);
    await member.page.keyboard.press("Escape");
    await expect(delegated).not.toBeVisible();
    const denied = await member.page.request.post("/api/v1/model/apply", {
      data: {
        expectedRevision: (await readModel(page)).revision,
        idempotencyKey: randomUUID(),
        operations: [
          {
            operation: "publishSummary",
            fieldId: summary.id,
            published: true,
            dependencyHash: "0".repeat(64),
          },
        ],
      },
    });
    expect(denied.status(), await denied.text()).toBe(403);
    expect(await published()).toBe(false);
    await applyPublication(true);
    editor = await openReader();
    value = editor.locator(`[data-entity-field="${summary.id}"]`);
    await expect(value.getByText("€82.50", { exact: true })).toBeVisible();
    await expect(
      value.getByText(englishMessages.RecordModel.restricted, { exact: true }),
    ).toHaveCount(0);
    expect(await readSummary()).toEqual({
      state: "value",
      value: { kind: "decimal", value: "82.5", currency: "EUR" },
    });
    await privateInputsStayPrivate();
    await member.page.screenshot({
      path: testInfo.outputPath("administrator-published-summary.png"),
      animations: "disabled",
    });
    const stillDelegated = await summaryFieldEditorUi(
      member.page,
      deal.typeId,
      summary.label,
    );
    await openDrawerTab(member.page, "Calculation");
    await expect(stillDelegated.locator("#publishedSummary")).toHaveCount(0);
    await expect(
      stillDelegated.getByText(
        englishMessages.RecordModel.summaryApprovalRequired,
        { exact: true },
      ),
    ).toBeVisible();
    await member.page.screenshot({
      path: testInfo.outputPath("delegated-summary-approval-required.png"),
      animations: "disabled",
    });
    await member.page.keyboard.press("Escape");
    await expect(stillDelegated).not.toBeVisible();
    const delegatedSource = await summaryFieldEditorUi(
      member.page,
      service.typeId,
      "Price",
    );
    await delegatedSource
      .getByRole("switch", {
        name: englishMessages.RecordModel.setDefaultValue,
        exact: true,
      })
      .check();
    await delegatedSource
      .getByRole("textbox", {
        name: englishMessages.RecordModel.defaultValue,
        exact: true,
      })
      .fill("50");
    await delegatedSource
      .getByRole("button", {
        name: englishMessages.Common.actions.save,
        exact: true,
      })
      .first()
      .click();
    await expect(delegatedSource.getByRole("status")).toContainText(
      englishMessages.RecordModel.summaryApprovalRequired,
    );
    await expect(
      delegatedSource.locator("#renew-published-summaries"),
    ).toHaveCount(0);
    await expect(delegatedSource.getByRole("status").filter({ hasText: "Ready to apply" })).toHaveCount(0);
    await member.page.keyboard.press("Escape");
    await member.page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Discard", exact: true })
      .click();
    await expect(delegatedSource).not.toBeVisible();
    const sourceEditor = await summaryFieldEditorUi(
      page,
      service.typeId,
      "Price",
    );
    await sourceEditor
      .getByRole("switch", {
        name: englishMessages.RecordModel.setDefaultValue,
        exact: true,
      })
      .check();
    await sourceEditor
      .getByRole("textbox", {
        name: englishMessages.RecordModel.defaultValue,
        exact: true,
      })
      .fill("50");
    await sourceEditor
      .getByRole("button", {
        name: englishMessages.Common.actions.save,
        exact: true,
      })
      .first()
      .click();
    await expect(sourceEditor.getByRole("status")).toContainText(
      englishMessages.RecordModel.summaryApprovalRequired,
    );
    await expect(
      sourceEditor.getByRole("checkbox", {
        name: englishMessages.RecordModel.renewPublishedSummaries,
        exact: true,
      }),
    ).not.toBeChecked();
    await sourceEditor
      .getByRole("checkbox", {
        name: englishMessages.RecordModel.renewPublishedSummaries,
        exact: true,
      })
      .check();
    await expect(
      sourceEditor
        .getByRole("button", {
          name: englishMessages.Common.actions.save,
          exact: true,
        })
        .first(),
    ).toBeEnabled();
    await saveDrawer(page);
    expect(
      (await readModel(page)).fields.find(
        (field) => field.id === id("service.amount"),
      )?.behavior,
    ).toEqual({
      kind: "input",
      defaultValue: { kind: "decimal", value: "50", currency: "EUR" },
    });
    expect(await published()).toBe(true);
    expect(await sourceValue()).toEqual([
      { state: "value", amount: "82.5", currency: "EUR" },
    ]);
    expect(await readSummary()).toEqual({
      state: "value",
      value: { kind: "decimal", value: "82.5", currency: "EUR" },
    });
    await privateInputsStayPrivate();
    await applyPublication(false);
    editor = await openReader();
    value = editor.locator(`[data-entity-field="${summary.id}"]`);
    await expect(
      value.getByText(englishMessages.RecordModel.restricted, { exact: true }),
    ).toBeVisible();
    await expect(editor.getByText("€82.50", { exact: true })).toHaveCount(0);
    expect(await readSummary()).toEqual({ state: "restricted" });
    await privateInputsStayPrivate();
    expect(await sourceValue()).toEqual([
      { state: "value", amount: "82.5", currency: "EUR" },
    ]);
    expect(
      (await readModel(page)).fields.find((field) => field.id === summary.id)
        ?.behavior,
    ).toEqual(summary.behavior);
    await member.page.screenshot({
      path: testInfo.outputPath("withdrawn-private-summary.png"),
      animations: "disabled",
    });
    expect(member.errors).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await member.close();
  }
});

test("copies another member's widget template into an independent owned widget without changing the original", async ({
  page,
  browser,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(240000);
  const errors = relationshipCaptureErrors(page);
  const serviceId = presetId(companyId, "service");
  for (const name of ["Template service A", "Template service B"]) {
    await mutate(page, {
      action: "create",
      typeId: serviceId,
      fields: [
        {
          fieldId: presetId(companyId, "service.name"),
          value: { kind: "text", value: name },
        },
        {
          fieldId: presetId(companyId, "service.amount"),
          value: { kind: "decimal", value: "5", currency: "EUR" },
        },
      ],
    });
  }
  const role = await saveRole(page, {
    name: "Template dashboard reader",
    description: "Own dashboard widgets with read-only service access",
    permissions: [{ resource: "company", actions: [] }],
    recordGrants: [{ typeId: serviceId, actions: ["readAll"] }],
  });
  const overall = englishMessages.RecordWidgets.overall.replace("{value}", "2");
  const sourceName = "Owner service template";
  const copyName = "Reader copied service chart";
  await page.goto("/en/dashboard");
  await page.locator("#dashboard-add-widget").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#widget-kind-chart").click();
  await dialog
    .getByRole("textbox", { name: "Name", exact: false })
    .fill(sourceName);
  await dialog
    .getByRole("combobox", { name: "Records from", exact: true })
    .click();
  await page.getByRole("option", { name: "Services", exact: true }).click();
  await dialog.getByRole("tab", { name: "Appearance", exact: true }).click();
  await dialog
    .getByRole("switch", { name: "Share as a template", exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Preview measure", exact: true })
    .click();
  await expect(dialog.getByText(overall, { exact: true })).toBeVisible();
  await dialog.locator("#widget-modal-save").click();
  await expect(dialog).not.toBeVisible();
  const sourceCard = page
    .locator('[data-uid="app-card"]')
    .filter({
      has: page.getByRole("heading", { name: sourceName, exact: true }),
    });
  await expect(sourceCard.getByText(overall, { exact: true })).toBeVisible();
  const read = async (name: string) =>
    (
      await database.query(
        'SELECT id,"userId","companyId",name,version,measure,"displayOptions",layout,"isTemplate","activityQuery" FROM "Widget" WHERE "companyId"=$1 AND name=$2 ORDER BY id',
        [companyId, name],
      )
    ).rows;
  const original = (await read(sourceName))[0];
  if (!original) throw new Error("The source template must exist");
  expect(original).toMatchObject({
    userId: workspace.userId,
    isTemplate: true,
  });
  const member = await secondaryUser(
    browser,
    database,
    companyId,
    role.role.id,
    testInfo,
  );
  try {
    await member.page.goto("/en/dashboard");
    await expect(member.page.locator("#dashboard-add-widget")).toBeVisible();
    await expect(
      member.page.getByRole("heading", { name: sourceName, exact: true }),
    ).toHaveCount(0);
    await member.page.locator("#dashboard-add-widget").click();
    const copiedDialog = member.page.getByRole("dialog");
    const template = copiedDialog.locator(`#widget-template-${original.id}`);
    await expect(template).toContainText(sourceName);
    await template.click();
    await expect(
      copiedDialog.getByRole("textbox", { name: "Name", exact: false }),
    ).toHaveValue(sourceName);
    await copiedDialog
      .getByRole("textbox", { name: "Name", exact: false })
      .fill(copyName);
    await copiedDialog
      .getByRole("tab", { name: "Appearance", exact: true })
      .click();
    await expect(
      copiedDialog.getByRole("switch", {
        name: "Share as a template",
        exact: true,
      }),
    ).not.toBeChecked();
    await copiedDialog
      .getByRole("switch", { name: "Show metric and filters", exact: true })
      .uncheck();
    await copiedDialog
      .getByRole("button", { name: "Preview measure", exact: true })
      .click();
    await expect(copiedDialog.locator("svg.recharts-surface")).toBeVisible();
    await expect(
      copiedDialog
        .locator("svg.recharts-surface")
        .getByText(englishMessages.Diagrams.total, { exact: true }),
    ).toBeVisible();
    await expect(copiedDialog.getByText(overall, { exact: true })).toHaveCount(
      0,
    );
    await copiedDialog.locator("#widget-modal-save").click();
    await expect(copiedDialog).not.toBeVisible();
    const copiedCard = member.page
      .locator('[data-uid="app-card"]')
      .filter({
        has: member.page.getByRole("heading", { name: copyName, exact: true }),
      });
    await expect(copiedCard.locator("svg.recharts-surface")).toBeVisible();
    await expect(
      copiedCard
        .locator("svg.recharts-surface")
        .getByText(englishMessages.Diagrams.total, { exact: true }),
    ).toBeVisible();
    await expect(copiedCard.getByText(overall, { exact: true })).toHaveCount(0);
    const copied = (await read(copyName))[0];
    expect(copied).toMatchObject({
      userId: member.userId,
      companyId,
      isTemplate: false,
      measure: original.measure,
    });
    expect(copied.id).not.toBe(original.id);
    expect(copied.displayOptions.showFilters).toBe(false);
    expect(await read(sourceName)).toEqual([original]);
    await member.page.reload();
    await expect(copiedCard.locator("svg.recharts-surface")).toBeVisible();
    await expect(
      copiedCard
        .locator("svg.recharts-surface")
        .getByText(englishMessages.Diagrams.total, { exact: true }),
    ).toBeVisible();
    await expect(copiedCard.getByText(overall, { exact: true })).toHaveCount(0);
    await expect(
      member.page.getByRole("heading", { name: sourceName, exact: true }),
    ).toHaveCount(0);
    const edit = member.page.getByRole("button", {
      name: `Edit ${copyName}`,
      exact: true,
    });
    await edit.focus();
    await edit.press("Enter");
    await copiedDialog
      .getByRole("textbox", { name: "Name", exact: false })
      .fill("Reader edited copy");
    await copiedDialog
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(copiedDialog).not.toBeVisible();
    await expect(
      member.page.getByRole("heading", {
        name: "Reader edited copy",
        exact: true,
      }),
    ).toBeVisible();
    const editedCard = member.page
      .locator('[data-uid="app-card"]')
      .filter({
        has: member.page.getByRole("heading", {
          name: "Reader edited copy",
          exact: true,
        }),
      });
    await expect(editedCard.locator("svg.recharts-surface")).toBeVisible();
    expect(await read(copyName)).toEqual([]);
    expect((await read("Reader edited copy"))[0]).toMatchObject({
      id: copied.id,
      userId: member.userId,
      measure: original.measure,
    });
    expect(await read(sourceName)).toEqual([original]);
    await member.page.screenshot({
      path: testInfo.outputPath("other-owner-template-copy.png"),
      animations: "disabled",
    });
    await page.reload();
    await expect(sourceCard.getByText(overall, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Reader edited copy", exact: true }),
    ).toHaveCount(0);
    expect(await read(sourceName)).toEqual([original]);
    expect(member.errors).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await member.close();
  }
});

test("enforces partial system manage actions for a restricted member in the API and the UI", async ({
  page,
  browser,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const role = await saveRole(page, {
    name: "Webhook creators",
    description: "Create and read webhooks without editing or deleting them",
    permissions: [
      { resource: "company", actions: [] },
      { resource: "api", actions: ["create", "readAll"] },
    ],
    recordGrants: [],
  });
  expect(
    (
      await database.query(
        'SELECT action::text FROM "RolePermission" WHERE "roleId"=$1 AND resource=\'api\' ORDER BY action',
        [role.role.id],
      )
    ).rows.map(({ action }) => action),
  ).toEqual(["create", "readAll"]);
  const { revision } = await readModel(page);
  const webhook = (url: string) => ({
    url,
    events: ["record.created"],
    description: "Partial rights check",
    expectedSchemaRevision: revision,
  });
  const adminCreated = await page.request.post("/api/v1/webhooks", {
    data: webhook("https://receiver.example.test/admin"),
  });
  expect(adminCreated.status(), await adminCreated.text()).toBe(201);
  const adminHook = await adminCreated.json();
  const member = await secondaryUser(
    browser,
    database,
    companyId,
    role.role.id,
    testInfo,
  );
  try {
    const created = await member.page.request.post("/api/v1/webhooks", {
      data: webhook("https://receiver.example.test/member"),
    });
    expect(created.status(), await created.text()).toBe(201);
    const memberHook = await created.json();
    const edit = await member.page.request.post("/api/v1/webhooks", {
      data: { id: memberHook.id, enabled: false },
    });
    expect(edit.status()).toBe(403);
    expect(
      (
        await member.page.request.delete(`/api/v1/webhooks/${adminHook.id}`)
      ).status(),
    ).toBe(403);
    expect(
      (
        await member.page.request.delete(`/api/v1/webhooks/${memberHook.id}`)
      ).status(),
    ).toBe(403);

    await member.page.goto("/en/settings/webhooks");
    await expect(member.page.locator("#settings-webhooks-add")).toBeVisible();
    await member.page
      .getByText("https://receiver.example.test/member", { exact: true })
      .click();
    const dialog = member.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#webhook-modal-delete")).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "Save", exact: true }),
    ).toHaveCount(0);
    expect(member.errors).toEqual([]);
  } finally {
    await member.close();
  }
});
