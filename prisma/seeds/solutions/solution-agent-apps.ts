import { randomBytes } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma";

import { workspaceFixtureId } from "../helpers";
import { TEAM_MEMBER_IDS } from "../team";
import { storyMoment } from "../timeline";
import type { SolutionContent } from "./define-solution";
import type { SolutionWorkspace } from "./solution-workspaces";

const AGENT_APP_GROUPS = { application: "2c000000", token: "2c100000", consent: "2c200000" } as const;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ACCESS_TOKEN_MINUTES = 60;
const REFRESH_TOKEN_DAYS = 400;
const SCOPES = "openid profile email offline_access";

function unusableToken(): string {
  return `demo_${randomBytes(32).toString("base64url")}`;
}

/**
 * Seeds the AI apps Max signed in to over OAuth: one public client per app, its consent and one grant whose times say
 * when it connected and when it last worked. Token values are random and written only when a grant is created, so no
 * seed source can be replayed against a workspace; apps the workspace no longer has are removed.
 */
export async function seedSolutionAgentApps(
  prisma: PrismaClient,
  workspace: SolutionWorkspace,
  content: SolutionContent,
): Promise<void> {
  const { companyId, tag } = workspace;
  const userId = TEAM_MEMBER_IDS.maxBergmann;
  const id = (group: keyof typeof AGENT_APP_GROUPS, index: number) =>
    workspaceFixtureId(AGENT_APP_GROUPS[group], tag, index);
  const apps = (content.agentApps ?? []).map((spec, index) => {
    const connectedAt = storyMoment(spec.connectedDaysAgo);
    const lastActiveAt = storyMoment(0, spec.activeMinutesAgo);
    return {
      spec,
      applicationId: id("application", index + 1),
      tokenId: id("token", index + 1),
      consentId: id("consent", index + 1),
      clientId: `demo-fixture-${tag}-${spec.slug}`,
      connectedAt,
      lastActiveAt,
    };
  });

  for (const app of apps) {
    const application = {
      name: app.spec.name,
      metadata: JSON.stringify({ device: app.spec.device }),
      clientId: app.clientId,
      clientSecret: null,
      redirectUrls: app.spec.redirectUrl,
      type: "public",
      disabled: false,
      userId: null,
      createdAt: app.connectedAt,
      updatedAt: app.connectedAt,
    };
    await prisma.oauthApplication.upsert({
      where: { id: app.applicationId },
      update: application,
      create: { id: app.applicationId, ...application },
    });

    const consent = {
      clientId: app.clientId,
      userId,
      scopes: SCOPES,
      consentGiven: true,
      createdAt: app.connectedAt,
      updatedAt: app.connectedAt,
    };
    await prisma.oauthConsent.upsert({
      where: { id: app.consentId },
      update: consent,
      create: { id: app.consentId, ...consent },
    });

    const grant = {
      clientId: app.clientId,
      userId,
      companyId,
      scopes: SCOPES,
      accessTokenExpiresAt: new Date(app.lastActiveAt.getTime() + ACCESS_TOKEN_MINUTES * MINUTE),
      refreshTokenExpiresAt: new Date(app.lastActiveAt.getTime() + REFRESH_TOKEN_DAYS * DAY),
      createdAt: app.connectedAt,
      updatedAt: app.lastActiveAt,
    };
    await prisma.oauthAccessToken.upsert({
      where: { id: app.tokenId },
      update: grant,
      create: { id: app.tokenId, accessToken: unusableToken(), refreshToken: unusableToken(), ...grant },
    });
  }

  const prefix = (group: keyof typeof AGENT_APP_GROUPS) => `${AGENT_APP_GROUPS[group]}-${tag}-`;
  await prisma.oauthAccessToken.deleteMany({
    where: { companyId, id: { startsWith: prefix("token"), notIn: apps.map((app) => app.tokenId) } },
  });
  await prisma.oauthConsent.deleteMany({
    where: { id: { startsWith: prefix("consent"), notIn: apps.map((app) => app.consentId) } },
  });
  await prisma.oauthApplication.deleteMany({
    where: { id: { startsWith: prefix("application"), notIn: apps.map((app) => app.applicationId) } },
  });
}
