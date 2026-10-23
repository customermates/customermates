import { randomUUID } from "node:crypto";

import { serializeSignedCookie } from "better-call";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { WORKSPACE_HEADER } from "@/core/navigation/workspace-paths";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const requestContext = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(requestContext.headers),
  cookies: () =>
    Promise.resolve({ get: () => undefined, getAll: () => [], set: () => undefined, delete: () => undefined }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => {
    const translate = (key: string) => key;
    return Promise.resolve(Object.assign(translate, { raw: translate }));
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`Unexpected redirect to ${path}`);
  },
}));

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const SERVER_ACTION = { "next-action": "7f00c0ffee", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" };

type Login = { authUserId: string; email: string; companyId: string; userId: string; cookie: string; slug: string };

async function memberFacingActions() {
  const protectedActions = await import("@/app/[locale]/(protected)/actions");
  const dashboard = await import("@/app/[locale]/(protected)/w/[workspace]/dashboard/actions");
  const routines = await import("@/app/[locale]/(protected)/w/[workspace]/routines/actions");
  const trash = await import("@/app/[locale]/(protected)/w/[workspace]/trash/actions");
  const inbox = await import("@/app/[locale]/(protected)/w/[workspace]/inbox/actions");
  const workspace = await import("@/app/[locale]/(protected)/w/[workspace]/settings/(workspace)/actions");
  const account = await import("@/app/[locale]/(protected)/w/[workspace]/settings/(account)/actions");
  const channels = await import("@/app/[locale]/(protected)/w/[workspace]/settings/(account)/channels/actions");
  const records = await import("@/app/[locale]/(protected)/w/[workspace]/records/actions");
  const search = await import("@/app/[locale]/(protected)/w/[workspace]/search/actions");
  const agentChat = await import("@/app/components/agent-chat/actions");
  const wiki = await import("@/app/[locale]/(protected)/w/[workspace]/wiki/actions");
  const setup = await import("@/app/[locale]/(protected)/onboarding/wizard/workspace-setup-actions");
  const id = randomUUID();

  return {
    refreshWidgetsAction: () => dashboard.refreshWidgetsAction(),
    discoverWidgetRecordTypesAction: () => dashboard.discoverWidgetRecordTypesAction({}),
    getWidgetByIdAction: () => dashboard.getWidgetByIdAction({ id }),
    getRoutinesAction: () => routines.getRoutinesAction(),
    getRoutineRunsAction: () => routines.getRoutineRunsAction({ id }),
    getRoutineFilterFieldsAction: () => routines.getRoutineFilterFieldsAction(),
    getTrashAction: () => trash.getTrashAction(),
    getIdentityRecordChoicesAction: () => inbox.getIdentityRecordChoicesAction(""),
    getRolesAction: () => workspace.getRolesAction(),
    getUsersAction: () => workspace.getUsersAction(),
    getActiveUsersAction: () => workspace.getActiveUsersAction(),
    getUserByIdAction: () => workspace.getUserByIdAction({ id }),
    getWebhooksAction: () => workspace.getWebhooksAction(),
    resolveWebhookOptionsAction: () => workspace.resolveWebhookOptionsAction([id]),
    getWebhookDeliveriesAction: () => workspace.getWebhookDeliveriesAction(),
    resolveUserOptionsAction: () => workspace.resolveUserOptionsAction({ ids: [id] }),
    getOrCreateInviteTokenAction: () => workspace.getOrCreateInviteTokenAction(),
    createCheckoutSessionAction: () => workspace.createCheckoutSessionAction({ plan: "pro", cadence: "monthly" }),
    getBillingPortalUrlAction: () => workspace.getBillingPortalUrlAction(),
    refreshApiKeysAction: () => account.refreshApiKeysAction(),
    startConnectAccountAction: () => channels.startConnectAccountAction("google"),
    startReconnectAccountAction: () => channels.startReconnectAccountAction(id),
    getConnectedAccountsAction: () => protectedActions.getConnectedAccountsAction(),
    getMessagingFilterOptionsAction: () => protectedActions.getMessagingFilterOptionsAction(),
    getCalendarsAction: () => protectedActions.getCalendarsAction(),
    resolveCalendarOptionsAction: () => protectedActions.resolveCalendarOptionsAction([id]),
    getRecordActivityPresentationAction: () =>
      records.getRecordActivityPresentationAction({ record: null, params: {} }),
    discoverRecordTypesAction: () => records.discoverRecordTypesAction(),
    getRecordNavigationAction: () => records.getRecordNavigationAction(),
    getRecordPresentationAction: () => records.getRecordPresentationAction(id),
    getRecordModelAction: () => records.getRecordModelAction(),
    commandSearchAction: () =>
      search.commandSearchAction({ searchTerm: "deal", scope: null, locale: "en", semantic: false }),
    getAgentConversationAction: () => agentChat.getAgentConversationAction(id),
    listAgentConversationsAction: () => agentChat.listAgentConversationsAction(),
    getWikiPageProposalsAction: () => wiki.getWikiPageProposalsAction(),
    getWorkspaceSetupStatusAction: () => setup.getWorkspaceSetupStatusAction(),
  } satisfies Record<string, () => Promise<unknown>>;
}

describeDatabase("member-facing server actions in a tab whose workspace is gone", { timeout: 240_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const authUserIds: string[] = [];
  const companyIds: string[] = [];
  let secret = "";

  async function createMember(name: string): Promise<Login> {
    const authUserId = randomUUID();
    const companyId = randomUUID();
    const userId = randomUUID();
    const roleId = randomUUID();
    const email = `${name}-${randomUUID()}@example.invalid`;
    authUserIds.push(authUserId);
    companyIds.push(companyId);

    const company = await client.query<{ slug: string }>(
      'INSERT INTO "Company" ("id", "name", "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING "slug"',
      [companyId, name],
    );
    await client.query(
      'INSERT INTO "Subscription" ("id", "companyId", "status", "updatedAt") VALUES ($1, $2, \'active\', CURRENT_TIMESTAMP)',
      [randomUUID(), companyId],
    );
    await client.query(
      'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, \'Admin\', TRUE, $2, CURRENT_TIMESTAMP)',
      [roleId, companyId],
    );
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "lastActiveAt", "onboardingWizardCompletedAt", "updatedAt") VALUES ($1, $2, \'Synthetic\', \'Member\', $3, $4, \'active\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [userId, email, companyId, roleId],
    );
    await client.query(
      'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "companyId", "updatedAt") VALUES ($1, \'Synthetic Member\', $2, TRUE, $3, CURRENT_TIMESTAMP)',
      [authUserId, email, companyId],
    );

    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { initializeStarterRecordModel } = await import("@/tests/helpers/record-repository");
    const { createMockUser } = await import("@/tests/helpers/mock-user");
    const owner = createMockUser({ id: userId, companyId, roleId });
    await runWithTenant(owner, () => initializeStarterRecordModel());

    const token = randomUUID().replaceAll("-", "");
    await client.query(
      'INSERT INTO "AuthSession" ("id", "token", "userId", "expiresAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [randomUUID(), token, authUserId, new Date(Date.now() + 60 * 60 * 1000)],
    );
    const cookie = (await serializeSignedCookie("app.session_token", token, secret)).split(";")[0];
    return { authUserId, email, companyId, userId, cookie, slug: company.rows[0].slug };
  }

  async function expectEveryActionRefused(login: Login, codes: readonly string[]) {
    const { isWorkspaceChangedFailure } = await import("@/core/errors/workspace-changed");
    const actions = await memberFacingActions();

    for (const [name, call] of Object.entries(actions)) {
      requestContext.headers = new Headers({ cookie: login.cookie, ...SERVER_ACTION, [WORKSPACE_HEADER]: login.slug });
      const settled = await call().then(
        (result) => ({ resolved: true as const, result }),
        (error: unknown) => ({ resolved: false as const, error }),
      );

      expect(settled, name).toMatchObject({ resolved: true });
      if (!settled.resolved) continue;
      const result = settled.result as {
        ok: boolean;
        code?: string;
        failure?: { issues: Array<{ customCode?: string }> };
      };
      expect(result.ok, name).toBe(false);
      expect(isWorkspaceChangedFailure(result), name).toBe(true);
      const code = result.code ?? result.failure?.issues[0]?.customCode;
      expect(codes, name).toContain(code);
    }
  }

  beforeAll(async () => {
    await client.connect();
    const { auth } = await import("@/core/auth/better-auth");
    secret = (await auth.$context).secret;
  });

  afterAll(async () => {
    await client.query('DELETE FROM "AuthUser" WHERE "id" = ANY($1)', [authUserIds]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [companyIds]);
    await client.end();
  });

  it("answers every action with a workspace change after the session's workspace was deleted", async () => {
    const login = await createMember("deleted");
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [login.companyId]);

    await expectEveryActionRefused(login, ["workspaceChanged"]);
  });

  it("answers every action with an inactive membership after the member was deactivated", async () => {
    const login = await createMember("inactive");
    await client.query('UPDATE "User" SET "status" = \'inactive\' WHERE "id" = $1', [login.userId]);

    await expectEveryActionRefused(login, ["userInactive", "workspaceChanged"]);
  });
});
