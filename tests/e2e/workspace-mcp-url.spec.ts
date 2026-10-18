import type { Page } from "@playwright/test";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { mintApiKey } from "./api-key";
import { collectPageErrors, expect, test } from "./fixtures";
import { localE2eEnvironment } from "./local-environment";
import { addBrowserWorkspace } from "./workspace";
import { mcpWorkspaceName } from "./workspace-credentials";
import { clickHydrated, e2eAppMode, setActiveWorkspace, setMembershipStatus } from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

const REDIRECT_URI = "https://connector.example.test/callback";

class ConnectorProvider implements OAuthClientProvider {
  authorizationUrl: URL | null = null;
  private storedTokens: OAuthTokens | undefined;
  private verifier = "";

  constructor(private readonly client: { information?: OAuthClientInformationMixed }) {}

  get redirectUrl() {
    return REDIRECT_URI;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Claude",
      redirect_uris: [REDIRECT_URI],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  clientInformation() {
    return this.client.information;
  }

  saveClientInformation(information: OAuthClientInformationMixed) {
    this.client.information = information;
  }

  tokens() {
    return this.storedTokens;
  }

  saveTokens(tokens: OAuthTokens) {
    this.storedTokens = tokens;
  }

  redirectToAuthorization(authorizationUrl: URL) {
    this.authorizationUrl = authorizationUrl;
  }

  saveCodeVerifier(codeVerifier: string) {
    this.verifier = codeVerifier;
  }

  codeVerifier() {
    return this.verifier;
  }
}

function workspaceMcpUrl(companyId: string) {
  return `${localE2eEnvironment().baseUrl}/api/v1/mcp/w/${companyId}`;
}

async function companyReachedBy(mcpUrl: string, provider: ConnectorProvider) {
  const client = new Client({ name: "workspace-mcp-url", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl), { authProvider: provider }));
  try {
    const result = await client.callTool({ name: "get_workspace_context", arguments: {} });
    expect(result.isError, "get_workspace_context returned a tool error").not.toBe(true);
    return z.looseObject({ company: z.looseObject({ id: z.string() }) }).parse(result.structuredContent).company.id;
  } finally {
    await client.close();
  }
}

async function initialize(mcpUrl: string, credential: Record<string, string>) {
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json", ...credential },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mismatch", version: "1" } },
    }),
  });
  const text = await response.text();
  const error = response.headers.get("content-type")?.includes("application/json")
    ? ((JSON.parse(text) as { error?: string }).error ?? null)
    : null;
  return { status: response.status, challenge: response.headers.get("www-authenticate"), error };
}

async function approveOnConsentScreen(page: Page, authorizationUrl: URL, workspaceName: string) {
  await page.goto(authorizationUrl.toString());
  await expect(page).toHaveURL(/\/en\/auth\/mcp-consent\?/);
  await expect(
    page.getByRole("heading", { level: 1, name: `Connect Claude to ${workspaceName}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByText(englishMessages.McpConsentWorkspace.pickerLabel, { exact: true })).toHaveCount(0);
  await expect(page.locator("[id^='mcp-consent-fixed-workspace-']")).toContainText(workspaceName);
  await clickHydrated(page.getByRole("button", { name: "Approve", exact: true }));
  await expect(page).toHaveURL(/^https:\/\/connector\.example\.test\/callback\?/);
  const code = new URL(page.url()).searchParams.get("code");
  expect(code).toBeTruthy();
  return code ?? "";
}

async function connectThroughWorkspaceUrl(
  page: Page,
  mcpUrl: string,
  workspaceName: string,
  client: { information?: OAuthClientInformationMixed },
) {
  const provider = new ConnectorProvider(client);
  expect(await auth(provider, { serverUrl: mcpUrl })).toBe("REDIRECT");
  const authorizationUrl = provider.authorizationUrl ?? new URL("about:blank");
  expect(authorizationUrl.searchParams.get("resource")).toBe(mcpUrl);
  const code = await approveOnConsentScreen(page, authorizationUrl, workspaceName);
  expect(await auth(provider, { serverUrl: mcpUrl, authorizationCode: code })).toBe("AUTHORIZED");
  return { provider, authorizationUrl };
}

test("the Claude quick connection shows the current workspace's own MCP URL", async ({ page, workspace }) => {
  const errors = collectPageErrors(page);
  const mcpUrl = workspaceMcpUrl(workspace.companyId);

  await page.goto("/en/settings/api-keys");
  await clickHydrated(page.locator("#settings-api-keys-generate"));
  const dialog = page.getByRole("dialog");
  await dialog.locator("[data-provider='claude']").click();
  await dialog.locator("[aria-controls='claude-account-details']").click();
  const details = dialog.locator("#claude-account-details");

  await expect(details.locator("pre code")).toHaveText(mcpUrl);
  await expect(details).toContainText(
    englishMessages.OnboardingWizard.ai.connector.workspaceNote
      .replace("{workspace}", "Browser workspace")
      .replace("{client}", "Claude"),
  );
  const href = await details
    .getByRole("link", { name: englishMessages.OnboardingWizard.ai.connector.claudeButton })
    .getAttribute("href");
  const connectorLink = new URL(href ?? "");
  expect(connectorLink.searchParams.get("connectorUrl")).toBe(mcpUrl);
  expect(connectorLink.searchParams.get("connectorName")).toBe("Customermates (Browser workspace)");
  expect(errors).toEqual([]);
});

test("two workspaces connect through their own MCP URLs with one client and login, each token reaching only its own", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors = collectPageErrors(page);
  const { baseUrl } = localE2eEnvironment();
  const bergmann = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  const browserUrl = workspaceMcpUrl(workspace.companyId);
  const bergmannUrl = workspaceMcpUrl(bergmann.companyId);
  await page.route(`${REDIRECT_URI}**`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Connector callback</title>" }),
  );

  const unauthorized = await initialize(bergmannUrl, {});
  expect(unauthorized.status).toBe(401);
  expect(unauthorized.challenge).toBe(
    `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/api/v1/mcp/w/${bergmann.companyId}"`,
  );
  const metadata = (await (
    await fetch(`${baseUrl}/.well-known/oauth-protected-resource/api/v1/mcp/w/${bergmann.companyId}`)
  ).json()) as { resource: string; authorization_servers: string[] };
  expect(metadata.resource).toBe(bergmannUrl);
  expect(metadata.authorization_servers).toEqual([baseUrl]);

  const client: { information?: OAuthClientInformationMixed } = {};
  const first = await connectThroughWorkspaceUrl(page, browserUrl, "Browser workspace", client);
  const clientId = client.information?.client_id ?? "";
  expect(clientId).toBeTruthy();
  const second = await connectThroughWorkspaceUrl(page, bergmannUrl, "Bergmann Steuern", client);
  expect(client.information?.client_id).toBe(clientId);
  await page.screenshot({ path: testInfo.outputPath("ws-mcp-url-consent.png"), fullPage: true });

  try {
    expect(await companyReachedBy(browserUrl, first.provider)).toBe(workspace.companyId);
    expect(await companyReachedBy(bergmannUrl, second.provider)).toBe(bergmann.companyId);
    const tokens = await database.query<{ accessToken: string; companyId: string }>(
      'SELECT "accessToken","companyId" FROM "OauthAccessToken" WHERE "clientId"=$1',
      [clientId],
    );
    expect(tokens.rows.map((row) => row.companyId).sort()).toEqual([workspace.companyId, bergmann.companyId].sort());

    for (const [provider, foreignUrl, foreignId] of [
      [first.provider, bergmannUrl, bergmann.companyId],
      [second.provider, browserUrl, workspace.companyId],
    ] as const) {
      const refused = await initialize(foreignUrl, { authorization: `Bearer ${provider.tokens()?.access_token}` });
      expect(refused).toMatchObject({ status: 401, error: "invalid_token" });
      expect(refused.challenge).toContain('error="invalid_token"');
      expect(refused.challenge).toContain(`/.well-known/oauth-protected-resource/api/v1/mcp/w/${foreignId}"`);
    }

    await setActiveWorkspace(database, workspace, bergmann.companyId);
    const again = new ConnectorProvider(client);
    expect(await auth(again, { serverUrl: browserUrl })).toBe("REDIRECT");
    const reauthorization = new URL(again.authorizationUrl ?? "about:blank");
    reauthorization.searchParams.delete("prompt");
    const code = await approveOnConsentScreen(page, reauthorization, "Browser workspace");
    expect(await auth(again, { serverUrl: browserUrl, authorizationCode: code })).toBe("AUTHORIZED");
    expect(await companyReachedBy(browserUrl, again)).toBe(workspace.companyId);
    const reissued = await database.query<{ companyId: string }>(
      'SELECT "companyId" FROM "OauthAccessToken" WHERE "accessToken"=$1',
      [again.tokens()?.access_token ?? ""],
    );
    expect(reissued.rows).toEqual([{ companyId: workspace.companyId }]);
    const consents = await database.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM "OauthConsent" WHERE "clientId"=$1',
      [clientId],
    );
    expect(consents.rows[0].count).toBe(1);

    const refreshed = new ConnectorProvider(client);
    refreshed.saveTokens({ ...(second.provider.tokens() as OAuthTokens), access_token: "expired" });
    expect(await auth(refreshed, { serverUrl: bergmannUrl })).toBe("AUTHORIZED");
    expect(refreshed.tokens()?.access_token).not.toBe("expired");
    expect(await companyReachedBy(bergmannUrl, refreshed)).toBe(bergmann.companyId);
  } finally {
    await database.query('DELETE FROM "OauthAccessToken" WHERE "clientId"=$1', [clientId]);
    await database.query('DELETE FROM "OauthConsent" WHERE "clientId"=$1', [clientId]);
    await database.query('DELETE FROM "OauthApplication" WHERE "clientId"=$1', [clientId]);
  }
  expect(errors).toEqual([]);
});

test("a workspace's MCP URL refuses an API key of another workspace and the bare endpoint keeps working", async ({
  database,
  workspace,
}) => {
  const bergmann = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  const { key } = await mintApiKey(database, workspace, "Browser workspace key");

  expect((await mcpWorkspaceName(key)).id).toBe(workspace.companyId);
  expect(await initialize(workspaceMcpUrl(workspace.companyId), { "x-api-key": key })).toMatchObject({ status: 200 });
  expect(await initialize(workspaceMcpUrl(bergmann.companyId), { "x-api-key": key })).toEqual({
    status: 403,
    challenge: null,
    error: "workspace_mismatch",
  });
  expect(
    await initialize(`${localE2eEnvironment().baseUrl}/api/v1/mcp/w/not-a-workspace`, { "x-api-key": key }),
  ).toMatchObject({
    status: 404,
  });
});

test("the consent screen of a workspace's MCP URL explains why the workspace cannot be connected", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const paused = await addBrowserWorkspace(database, workspace, "Paused Agency");
  await setMembershipStatus(database, paused, "inactive");
  await page.route(`${REDIRECT_URI}**`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Connector callback</title>" }),
  );
  const client: { information?: OAuthClientInformationMixed } = {};
  const provider = new ConnectorProvider(client);
  const mcpUrl = workspaceMcpUrl(paused.companyId);

  try {
    expect(await auth(provider, { serverUrl: mcpUrl })).toBe("REDIRECT");
    await page.goto(provider.authorizationUrl?.toString() ?? "about:blank");
    await expect(
      page.getByRole("heading", { level: 1, name: "Connect Claude to Paused Agency", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        englishMessages.McpConsentWorkspace.fixed.unavailable.inactive.replace("{workspace}", "Paused Agency"),
      ),
    ).toBeVisible();
    await expect(page.locator(`#mcp-consent-fixed-workspace-${paused.companyId}`)).toContainText(
      englishMessages.McpConsentWorkspace.unavailable.inactive,
    );
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    await clickHydrated(page.getByRole("button", { name: "Deny", exact: true }));
    await expect(page).toHaveURL(/^https:\/\/connector\.example\.test\/callback\?/);
    expect(new URL(page.url()).searchParams.get("error")).toBe("access_denied");
  } finally {
    await database.query('DELETE FROM "OauthApplication" WHERE "clientId"=$1', [client.information?.client_id ?? ""]);
  }
  expect(errors).toEqual([]);
});
