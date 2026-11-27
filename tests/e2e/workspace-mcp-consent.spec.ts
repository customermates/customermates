import { createHash, randomBytes, randomUUID } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { appPath } from "./app-paths";
import { collectPageErrors, expect, test } from "./fixtures";
import { localE2eEnvironment } from "./local-environment";
import { addBrowserWorkspace } from "./workspace";
import { clickHydrated, e2eAppMode, giveMemberRole, setMembershipStatus } from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

const REDIRECT_URI = "https://connector.example.test/callback";

test("the MCP consent connects the whole account, lists the workspaces it can use and explains the unavailable ones", async ({
  page,
  request,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors = collectPageErrors(page);
  const { baseUrl } = localE2eEnvironment();
  const target = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  const pending = await addBrowserWorkspace(database, workspace, "Pending Partners");
  await setMembershipStatus(database, pending, "pendingAuthorization");
  const deactivated = await addBrowserWorkspace(database, workspace, "Paused Agency");
  await setMembershipStatus(database, deactivated, "inactive");
  const unpaid = await addBrowserWorkspace(database, workspace, "Unpaid Studio");
  await database.query('UPDATE "Subscription" SET status=\'unPaid\' WHERE "companyId"=$1', [unpaid.companyId]);
  const reader = await addBrowserWorkspace(database, workspace, "Reading Room");
  await giveMemberRole(database, reader, "Reader");
  const clientId = `connector-${randomUUID()}`;
  await database.query(
    'INSERT INTO "OauthApplication" (id,name,"clientId","redirectUrls",type,"updatedAt") VALUES ($1,\'Claude\',$2,$3,\'public\',NOW())',
    [randomUUID(), clientId, REDIRECT_URI],
  );
  const verifier = randomBytes(32).toString("base64url");
  const authorize = (state: string) =>
    `/api/auth/mcp/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: "openid offline_access",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "consent",
    })}`;
  const row = (companyId: string) => page.locator(`#mcp-consent-workspace-${companyId}`);
  const accountTitle = englishMessages.McpConsentWorkspace.accountTitle.replace("{client}", "Claude");
  const tokens = async () =>
    (
      await database.query<{ accessToken: string; companyId: string | null }>(
        'SELECT "accessToken","companyId" FROM "OauthAccessToken" WHERE "clientId"=$1',
        [clientId],
      )
    ).rows;
  await page.route(`${REDIRECT_URI}**`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Connector callback</title>" }),
  );
  try {
    await page.goto(authorize("approve-state"));
    await expect(page).toHaveURL(/\/en\/auth\/mcp-consent\?/);
    await expect(page.getByRole("heading", { level: 1, name: accountTitle, exact: true })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.locator("[id^='mcp-consent-workspace-']")).toHaveCount(6);
    await expect(row(target.companyId)).toContainText("Bergmann Steuern");
    await expect(row(workspace.companyId)).not.toHaveAttribute("data-unavailable");
    await expect(row(target.companyId)).not.toHaveAttribute("data-unavailable");
    for (const [membership, reason] of [
      [pending, englishMessages.Common.userStatuses.pendingAuthorization],
      [deactivated, englishMessages.McpConsentWorkspace.unavailable.inactive],
      [unpaid, englishMessages.McpConsentWorkspace.unavailable.plan],
      [reader, englishMessages.McpConsentWorkspace.unavailable.permission],
    ] as const)
      await expect(row(membership.companyId)).toContainText(reason);
    await expect(page.locator("#mcp-consent-new-workspaces")).toContainText(
      englishMessages.McpConsentWorkspace.newWorkspaces,
    );
    await page.screenshot({ path: testInfo.outputPath("ws-mcp-consent-account.png"), fullPage: true });

    await clickHydrated(page.getByRole("button", { name: "Approve", exact: true }));
    await expect(page).toHaveURL(/^https:\/\/connector\.example\.test\/callback\?/);
    const approved = new URL(page.url());
    expect(approved.searchParams.get("state")).toBe("approve-state");
    const code = approved.searchParams.get("code");
    expect(code).toBeTruthy();

    const exchanged = await request.post(`${baseUrl}/api/auth/mcp/token`, {
      form: {
        grant_type: "authorization_code",
        code: code ?? "",
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      },
    });
    expect(exchanged.status(), await exchanged.text()).toBe(200);
    const { access_token: accessToken } = z.object({ access_token: z.string() }).parse(await exchanged.json());
    expect(await tokens()).toEqual([{ accessToken, companyId: null }]);
    const mcp = new Client({ name: "workspace-consent-verification", version: "1.0.0" });
    await mcp.connect(
      new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/v1/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
      }),
    );
    try {
      const ambiguous = await mcp.callTool({ name: "get_workspace_context", arguments: {} });
      expect(ambiguous.isError).toBe(true);
      expect(JSON.stringify(ambiguous.content)).toContain("several workspaces");
      expect(JSON.stringify(ambiguous.content)).toContain(target.slug);

      const context = await mcp.callTool({ name: "get_workspace_context", arguments: { workspace: target.slug } });
      expect(context.isError, "get_workspace_context returned a tool error").not.toBe(true);
      expect(context.structuredContent).toMatchObject({
        company: { id: target.companyId, name: "Bergmann Steuern" },
      });

      const refused = await mcp.callTool({ name: "get_workspace_context", arguments: { workspace: pending.slug } });
      expect(refused.isError).toBe(true);

      const listed = await mcp.callTool({ name: "list_workspaces", arguments: {} });
      const usable = z
        .object({ workspaces: z.array(z.object({ companyId: z.string(), usable: z.boolean() })) })
        .parse(listed.structuredContent)
        .workspaces.filter((entry) => entry.usable)
        .map((entry) => entry.companyId);
      expect(usable.sort()).toEqual([workspace.companyId, target.companyId].sort());
    } finally {
      await mcp.close();
    }

    await page.goto(authorize("deny-state"));
    await expect(page.getByRole("heading", { level: 1, name: accountTitle, exact: true })).toBeVisible();
    await clickHydrated(page.getByRole("button", { name: "Deny", exact: true }));
    await expect(page).toHaveURL(/^https:\/\/connector\.example\.test\/callback\?/);
    const denied = new URL(page.url());
    expect(denied.searchParams.get("error")).toBe("access_denied");
    expect(denied.searchParams.get("state")).toBe("deny-state");
    expect(denied.searchParams.get("code")).toBeNull();
    expect(await tokens()).toEqual([{ accessToken, companyId: null }]);
  } finally {
    await database.query('DELETE FROM "OauthApplication" WHERE "clientId"=$1', [clientId]);
  }
  expect(errors).toEqual([]);
});

test("the API keys page lists the member's connected AI app once and disconnecting it revokes its tokens", async ({
  page,
  database,
  workspace,
}) => {
  test.setTimeout(120_000);
  const errors = collectPageErrors(page);
  const messages = englishMessages.ConnectedApps;
  const ownClient = `connector-${randomUUID()}`;
  const accountClient = `connector-${randomUUID()}`;
  const colleagueClient = `connector-${randomUUID()}`;
  const colleagueLogin = randomUUID();
  const application = (clientId: string, name: string) =>
    database.query(
      'INSERT INTO "OauthApplication" (id,name,"clientId","redirectUrls",type,"updatedAt") VALUES ($1,$2,$3,$4,\'public\',NOW())',
      [randomUUID(), name, clientId, REDIRECT_URI],
    );
  const token = (clientId: string, userId: string, issued: string, companyId: string | null = workspace.companyId) =>
    database.query(
      `INSERT INTO "OauthAccessToken" (id,"accessToken","refreshToken","accessTokenExpiresAt","refreshTokenExpiresAt","clientId","userId",scopes,"companyId","createdAt","updatedAt")
       VALUES ($1,$2,$3,NOW()+$4::interval+interval '1 hour',NOW()+$4::interval+interval '30 days',$5,$6,'openid offline_access',$7,NOW()+$4::interval,NOW()+$4::interval)`,
      [randomUUID(), randomUUID(), randomUUID(), issued, clientId, userId, companyId],
    );
  const tokensOf = async (clientId: string, userId: string) =>
    (
      await database.query<{ count: string }>(
        'SELECT count(*) FROM "OauthAccessToken" WHERE "clientId"=$1 AND "userId"=$2',
        [clientId, userId],
      )
    ).rows[0].count;

  await database.query(
    'INSERT INTO "AuthUser" (id,email,name,"emailVerified","updatedAt") VALUES ($1,$2,\'Colleague Login\',true,NOW())',
    [colleagueLogin, `connected-apps-${colleagueLogin}@synthetic.test`],
  );
  try {
    await application(ownClient, "Claude");
    await application(accountClient, "ChatGPT");
    await application(colleagueClient, "Colleague Connector");
    await token(ownClient, workspace.authUserId, "-45 days");
    await token(ownClient, workspace.authUserId, "-2 days");
    await token(accountClient, workspace.authUserId, "-1 day", null);
    await token(colleagueClient, colleagueLogin, "-1 day");
    await database.query(
      'INSERT INTO "OauthConsent" (id,"clientId","userId",scopes,"consentGiven","updatedAt") VALUES ($1,$2,$3,\'openid offline_access\',true,NOW())',
      [randomUUID(), ownClient, workspace.authUserId],
    );

    await page.goto(appPath(workspace.slug, "/settings/connections"));
    const card = page.locator("#connections-apps");
    await expect(
      card.getByRole("heading", { level: 2, name: englishMessages.Connections.apps.title, exact: true }),
    ).toBeVisible();
    const apps = card.locator("[data-connected-app]");
    await expect(apps).toHaveCount(2);
    const claude = card.locator(`[data-connected-app="${ownClient}"]`);
    await expect(claude).toContainText("Claude");
    await expect(claude).toContainText(englishMessages.Connections.apps.connected);
    await expect(card).not.toContainText("Colleague Connector");

    await clickHydrated(
      card.locator(`[data-connected-app="${accountClient}"]`).getByRole("button", { name: "Disconnect", exact: true }),
    );
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText(messages.disconnectTitle);
    await expect(confirm).toContainText(messages.disconnectAccountDescription.replace("{name}", "ChatGPT"));
    await confirm.locator("#confirm-delete").click();
    await expect(apps).toHaveCount(1);
    expect(await tokensOf(accountClient, workspace.authUserId)).toBe("0");

    await clickHydrated(claude.getByRole("button", { name: "Disconnect", exact: true }));
    await expect(confirm).toContainText(messages.disconnectDescription.replace("{name}", "Claude"));
    await confirm.locator("#confirm-delete").click();

    await expect(page.locator("[data-connected-app]")).toHaveCount(0);
    expect(await tokensOf(ownClient, workspace.authUserId)).toBe("0");
    expect(await tokensOf(colleagueClient, colleagueLogin)).toBe("1");
    const consents = await database.query('SELECT 1 FROM "OauthConsent" WHERE "clientId"=$1', [ownClient]);
    expect(consents.rowCount).toBe(0);
  } finally {
    await database.query('DELETE FROM "OauthApplication" WHERE "clientId" IN ($1,$2,$3)', [
      ownClient,
      accountClient,
      colleagueClient,
    ]);
    await database.query('DELETE FROM "AuthUser" WHERE id=$1', [colleagueLogin]);
  }
  expect(errors).toEqual([]);
});
