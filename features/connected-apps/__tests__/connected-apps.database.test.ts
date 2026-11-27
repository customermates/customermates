import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { AuthService } = await import("@/features/auth/auth.service");
const { PrismaConnectedAppRepo } = await import("../prisma-connected-app.repository");
const { GetConnectedAppsInteractor } = await import("../get-connected-apps.interactor");
const { DisconnectConnectedAppInteractor } = await import("../disconnect-connected-app.interactor");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const DAY_MS = 86_400_000;
const companies: string[] = [];
const logins: string[] = [];
const clients: string[] = [];

const days = (count: number) => new Date(Date.now() + count * DAY_MS);

async function company() {
  const created = await runWithoutTenant(() => prisma.company.create({ data: {} }));
  companies.push(created.id);
  return created.id;
}

async function login() {
  const id = randomUUID();
  const email = `${id}@example.test`;
  await prisma.authUser.create({ data: { id, email, name: "Connected Apps", emailVerified: true } });
  logins.push(id);
  return { id, email };
}

async function client(name: string) {
  const clientId = `client-${randomUUID()}`;
  await prisma.oauthApplication.create({
    data: { id: randomUUID(), name, clientId, redirectUrls: "https://client.example.test/callback", type: "public" },
  });
  clients.push(clientId);
  return clientId;
}

async function token(args: {
  userId: string;
  companyId: string | null;
  clientId: string;
  createdAt?: Date;
  refreshTokenExpiresAt?: Date;
}) {
  const createdAt = args.createdAt ?? days(-1);
  await prisma.oauthAccessToken.create({
    data: {
      id: randomUUID(),
      accessToken: randomUUID(),
      refreshToken: randomUUID(),
      accessTokenExpiresAt: new Date(createdAt.getTime() + 3_600_000),
      refreshTokenExpiresAt: args.refreshTokenExpiresAt ?? new Date(createdAt.getTime() + 30 * DAY_MS),
      clientId: args.clientId,
      userId: args.userId,
      companyId: args.companyId,
      scopes: "openid offline_access",
      createdAt,
      updatedAt: createdAt,
    },
  });
}

async function consent(userId: string, clientId: string) {
  await prisma.oauthConsent.create({
    data: { id: randomUUID(), userId, clientId, scopes: "openid offline_access", consentGiven: true },
  });
}

function signedIn(member: { id: string; email: string }) {
  const service = new AuthService({ send: vi.fn() } as never);
  vi.spyOn(service, "getInteractiveSession").mockResolvedValue({ user: member } as never);
  return service;
}

function inWorkspace<T>(companyId: string, member: { email: string }, work: () => Promise<T>) {
  return runWithTenant(createMockUser({ companyId, email: member.email }), work);
}

const tokensOf = (userId: string, clientId: string, companyId: string | null) =>
  prisma.oauthAccessToken.count({ where: { userId, clientId, companyId } });

describeDatabase("connected AI apps against the database", { timeout: 120_000 }, () => {
  afterAll(async () => {
    await prisma.authUser.deleteMany({ where: { id: { in: logins } } });
    await prisma.oauthApplication.deleteMany({ where: { clientId: { in: clients } } });
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
  });

  it("groups the member's account-wide tokens by app and hides expired ones and other members' ones", async () => {
    const [workspace, otherWorkspace, me, colleague] = [await company(), await company(), await login(), await login()];
    const [claude, chatgpt, cursor, stale] = [
      await client("Claude"),
      await client("ChatGPT"),
      await client("Cursor"),
      await client("Stale"),
    ];
    const firstConnected = days(-45);
    const lastRefreshed = days(-2);
    await token({ userId: me.id, companyId: workspace, clientId: claude, createdAt: firstConnected });
    await token({ userId: me.id, companyId: workspace, clientId: claude, createdAt: lastRefreshed });
    await token({ userId: me.id, companyId: workspace, clientId: chatgpt, createdAt: days(-1) });
    await token({ userId: me.id, companyId: workspace, clientId: stale, createdAt: days(-90) });
    await token({ userId: me.id, companyId: otherWorkspace, clientId: cursor });
    await token({ userId: me.id, companyId: null, clientId: cursor });
    await token({ userId: colleague.id, companyId: workspace, clientId: cursor });

    const result = await inWorkspace(workspace, me, () =>
      new GetConnectedAppsInteractor(new PrismaConnectedAppRepo(), signedIn(me)).invoke(),
    );

    expect(result.data.map((app) => app.name).sort()).toEqual(["ChatGPT", "Claude", "Cursor"]);
    expect(result.data.find((app) => app.id === claude)).toMatchObject({
      connectedAt: firstConnected,
      lastActiveAt: lastRefreshed,
    });
  });

  it("disconnects one app of one member across the account and forgets its consent", async () => {
    const [workspace, otherWorkspace, me, colleague] = [await company(), await company(), await login(), await login()];
    const [claude, chatgpt] = [await client("Claude"), await client("ChatGPT")];
    await token({ userId: me.id, companyId: workspace, clientId: claude, createdAt: days(-40) });
    await token({ userId: me.id, companyId: workspace, clientId: claude });
    await token({ userId: me.id, companyId: null, clientId: claude });
    await token({ userId: me.id, companyId: otherWorkspace, clientId: claude });
    await token({ userId: me.id, companyId: workspace, clientId: chatgpt });
    await token({ userId: colleague.id, companyId: workspace, clientId: claude });
    await consent(me.id, claude);
    await consent(me.id, chatgpt);
    await consent(colleague.id, claude);
    const consents = (userId: string, clientId: string) => prisma.oauthConsent.count({ where: { userId, clientId } });

    const first = await inWorkspace(workspace, me, () =>
      new DisconnectConnectedAppInteractor(signedIn(me)).invoke({ id: claude }),
    );

    expect(first).toEqual({ ok: true, data: claude });
    expect(await tokensOf(me.id, claude, workspace)).toBe(0);
    expect(await tokensOf(me.id, claude, null)).toBe(0);
    expect(await tokensOf(me.id, claude, otherWorkspace)).toBe(0);
    expect(await tokensOf(me.id, chatgpt, workspace)).toBe(1);
    expect(await tokensOf(colleague.id, claude, workspace)).toBe(1);
    expect(await consents(me.id, claude)).toBe(0);
    expect(await consents(me.id, chatgpt)).toBe(1);
    expect(await consents(colleague.id, claude)).toBe(1);
  });
});
