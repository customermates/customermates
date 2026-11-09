import { randomUUID } from "node:crypto";

import { z } from "zod";

import { expect, test } from "./fixtures";
import { createBrowserWorkspace, removeBrowserWorkspace } from "./workspace";
import {
  inviteToken,
  joinFromInvitation,
  loginEmail,
} from "./workspace-membership";
import { e2eAppMode, signInLogin } from "./workspace-switching";

test.skip(
  e2eAppMode() === "demo",
  "Demo mode signs every visitor in as the shared demo account",
);

const webhook = {
  url: "https://hooks.example.com/escalation",
  events: ["messaging.message.received"],
};
const refused = {
  error: {
    kind: "authorization",
    issues: [{ customCode: "roleExceedsOwnPermissions" }],
  },
};

test("a member with Users & Roles cannot raise another member or a role above their own permissions", async ({
  browser,
  page,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(240_000);
  const revision = async () =>
    (
      await database.query<{ revision: number }>(
        'SELECT revision FROM "RecordSchemaState" WHERE "companyId"=$1',
        [workspace.companyId],
      )
    ).rows[0].revision;
  const membership = async (email: string) =>
    (
      await database.query<{ status: string; roleId: string | null }>(
        'SELECT status::text,"roleId" FROM "User" WHERE "companyId"=$1 AND email=$2',
        [workspace.companyId, email],
      )
    ).rows[0];
  const adminRoleId = (
    await database.query<{ roleId: string }>(
      'SELECT "roleId" FROM "User" WHERE id=$1',
      [workspace.userId],
    )
  ).rows[0].roleId;
  const json = async (response: {
    status(): number;
    json(): Promise<unknown>;
  }) => ({
    status: response.status(),
    body: (await response.json()) as Record<string, unknown>,
  });

  const leadLogin = await createBrowserWorkspace(database, "Lead home");
  const attackerLogin = await createBrowserWorkspace(database, "Attacker home");
  const lead = await signInLogin(browser, database, leadLogin, testInfo);
  const attacker = await signInLogin(
    browser,
    database,
    attackerLogin,
    testInfo,
  );
  try {
    const teamLead = await json(
      await page.request.post("/api/v1/roles/save", {
        data: {
          name: "Team Lead",
          description: "Users and roles",
          permissions: [
            { resource: "users", actions: ["create", "update", "readAll"] },
          ],
          recordGrants: [],
          expectedRevision: await revision(),
          idempotencyKey: `k-${randomUUID()}`,
        },
      }),
    );
    expect(teamLead.status, JSON.stringify(teamLead.body)).toBe(200);
    const teamLeadId = z
      .object({ role: z.object({ id: z.uuid() }) })
      .parse(teamLead.body).role.id;

    await lead.page.goto(
      `/en/invitation/${await inviteToken(database, { companyId: workspace.companyId, createdById: workspace.userId })}`,
    );
    await joinFromInvitation(lead.page);
    await expect(lead.page).toHaveURL(/\/en\/auth\/pending$/);
    const leadEmail = await loginEmail(database, leadLogin);
    const approved = await json(
      await page.request.post("/api/v1/members/update", {
        data: { email: leadEmail, status: "active", roleId: teamLeadId },
      }),
    );
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);

    expect(
      (
        await lead.page.request.post("/api/v1/webhooks", { data: webhook })
      ).status(),
    ).toBe(403);

    const link = await json(
      await lead.page.request.post("/api/v1/members/invite-link", { data: {} }),
    );
    expect(link.status, JSON.stringify(link.body)).toBe(200);
    await attacker.page.goto(
      new URL(z.object({ link: z.string() }).parse(link.body).link).pathname,
    );
    await joinFromInvitation(attacker.page);
    await expect(attacker.page).toHaveURL(/\/en\/auth\/pending$/);
    const attackerEmail = await loginEmail(database, attackerLogin);
    expect(await membership(attackerEmail)).toEqual({
      status: "pendingAuthorization",
      roleId: null,
    });

    const promoted = await json(
      await lead.page.request.post("/api/v1/members/update", {
        data: { email: attackerEmail, status: "active", roleId: adminRoleId },
      }),
    );
    expect(promoted.status, JSON.stringify(promoted.body)).toBe(403);
    expect(promoted.body).toMatchObject(refused);
    expect(await membership(attackerEmail)).toEqual({
      status: "pendingAuthorization",
      roleId: null,
    });

    const withinOwn = await json(
      await lead.page.request.post("/api/v1/members/update", {
        data: { email: attackerEmail, status: "active", roleId: teamLeadId },
      }),
    );
    expect(withinOwn.status, JSON.stringify(withinOwn.body)).toBe(200);
    expect(await membership(attackerEmail)).toEqual({
      status: "active",
      roleId: teamLeadId,
    });

    const hook = await json(
      await attacker.page.request.post("/api/v1/webhooks", { data: webhook }),
    );
    expect(hook.status, JSON.stringify(hook.body)).toBe(403);
    const hooks = await database.query(
      'SELECT 1 FROM "Webhook" WHERE "companyId"=$1',
      [workspace.companyId],
    );
    expect(hooks.rowCount).toBe(0);

    const xlead = await json(
      await lead.page.request.post("/api/v1/roles/save", {
        data: {
          name: "Xlead",
          description: "d",
          permissions: [{ resource: "company", actions: ["update"] }],
          recordGrants: [],
          expectedRevision: await revision(),
          idempotencyKey: "k-lead-0001",
        },
      }),
    );
    expect(xlead.status, JSON.stringify(xlead.body)).toBe(403);
    expect(xlead.body).toMatchObject(refused);
    const stored = await database.query(
      'SELECT 1 FROM "UserRole" WHERE "companyId"=$1 AND name=\'Xlead\'',
      [workspace.companyId],
    );
    expect(stored.rowCount).toBe(0);

    const byAdmin = await json(
      await page.request.post("/api/v1/members/update", {
        data: { email: attackerEmail, status: "active", roleId: adminRoleId },
      }),
    );
    expect(byAdmin.status, JSON.stringify(byAdmin.body)).toBe(200);
  } finally {
    await lead.close();
    await attacker.close();
    await removeBrowserWorkspace(database, leadLogin);
    await removeBrowserWorkspace(database, attackerLogin);
  }
});
