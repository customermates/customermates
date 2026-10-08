import { createHmac, randomBytes, randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma";

const COOKIE_NAME = "app.session_token";
const SESSION_LIFETIME_MS = 6 * 60 * 60 * 1000;
const FIXTURE_TAG = "agent-e2e";
const CREDIT_ANCHOR = new Date("2020-01-01T00:00:00.000Z");

export const STAGES = ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"] as const;
export type Stage = (typeof STAGES)[number];

export const SEEDED_ORGANIZATIONS = ["Nordlicht GmbH", "Atlas Robotics AG", "Brightwave Ltd"] as const;

export const SEEDED_CONTACTS = [
  { key: "maria", firstName: "Maria", lastName: "Okafor", email: "maria.okafor@atlas.example" },
  { key: "lukas", firstName: "Lukas", lastName: "Brandt", email: "lukas.brandt@nordlicht.example" },
  { key: "ines", firstName: "Ines", lastName: "Haller", email: "ines.haller@brightwave.example" },
] as const;

export const SEEDED_DEALS: readonly { key: string; name: string; value: number; stage: Stage }[] = [
  { key: "atlas-renewal", name: "Atlas Robotics renewal", value: 18_000, stage: "Negotiation" },
  { key: "atlas-expansion", name: "Atlas Robotics expansion", value: 42_000, stage: "Negotiation" },
  { key: "nordlicht-pilot", name: "Nordlicht pilot", value: 9_500, stage: "Negotiation" },
  { key: "nordlicht-support", name: "Nordlicht support plan", value: 6_000, stage: "Negotiation" },
  { key: "brightwave-rollout", name: "Brightwave platform rollout", value: 27_000, stage: "Proposal" },
  { key: "brightwave-training", name: "Brightwave training", value: 3_500, stage: "Proposal" },
  { key: "atlas-audit", name: "Atlas Robotics audit", value: 7_200, stage: "Qualified" },
  { key: "nordlicht-integration", name: "Nordlicht integration", value: 15_000, stage: "Qualified" },
  { key: "brightwave-discovery", name: "Brightwave discovery", value: 2_000, stage: "Lead" },
];

export const WIKI_FACT = {
  title: "Refund policy",
  approver: "Petra Lindqvist",
  markdown: [
    "## Who approves refunds",
    "",
    "Refunds up to EUR 2,500 are approved by the account owner. Refunds above EUR 2,500 need written approval from Petra Lindqvist in finance before anything is paid out.",
    "",
    "## Timing",
    "",
    "Approved refunds are paid within ten business days.",
  ].join("\n"),
};

export const ROUTINE = {
  name: "E2E pipeline digest",
  prompt: "Count the deals in the Negotiation stage and report the number in one sentence. Do not change any record.",
};

export type Fixture = {
  companyId: string;
  userId: string;
  cookie: string;
  stageColumnId: string;
  phoneColumnId: string;
  stageOptionIds: Record<Stage, string>;
  contactIds: Record<string, string>;
  dealIds: Record<string, string>;
  wikiPageId: string;
  routineId: string;
};

function sessionCookie(token: string, secret: string) {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `${COOKIE_NAME}=${encodeURIComponent(`${token}.${signature}`)}`;
}

export async function seedAgentE2eFixture(
  prisma: PrismaClient,
  args: { creditsPerUser: number; authSecret: string; now?: Date },
): Promise<Fixture> {
  if (!Number.isSafeInteger(args.creditsPerUser) || args.creditsPerUser < 1)
    throw new Error("The fixture credit allowance must be a positive whole number of credits.");
  const now = args.now ?? new Date();
  const { Action, Resource } = await import("@/generated/prisma");
  const companyId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  const stageColumnId = randomUUID();
  const phoneColumnId = randomUUID();
  const stageOptionIds = Object.fromEntries(STAGES.map((stage) => [stage, randomUUID()])) as Record<Stage, string>;
  const organizationIds = SEEDED_ORGANIZATIONS.map(() => randomUUID());
  const contactIds = Object.fromEntries(SEEDED_CONTACTS.map((contact) => [contact.key, randomUUID()]));
  const dealIds = Object.fromEntries(SEEDED_DEALS.map((deal) => [deal.key, randomUUID()]));
  const wikiPageId = randomUUID();
  const routineId = randomUUID();
  const email = `driver+${userId}@example.invalid`;
  const token = randomBytes(32).toString("hex");

  await prisma.$transaction(async (tx) => {
    await tx.company.create({ data: { id: companyId, currency: "eur", tags: [FIXTURE_TAG] } });
    await tx.subscription.create({
      data: {
        companyId,
        status: "active",
        plan: "enterprise",
        enterpriseAgentCreditsPerUser: args.creditsPerUser,
        agentCreditAnchorAt: CREDIT_ANCHOR,
      },
    });
    await tx.userRole.create({ data: { id: roleId, companyId, name: "E2E operator", isSystemRole: false } });
    await tx.rolePermission.createMany({
      data: Object.values(Resource).flatMap((resource) =>
        Object.values(Action).map((action) => ({ id: randomUUID(), companyId, roleId, resource, action })),
      ),
    });
    await tx.user.create({
      data: {
        id: userId,
        companyId,
        roleId,
        email,
        firstName: "Erika",
        lastName: "Driver",
        status: "active",
        displayLanguage: "en",
        formattingLocale: "en",
        country: "de",
        agreeToTerms: true,
        onboardingWizardCompletedAt: now,
        onboardingWikiStepCompletedAt: now,
        agentCreditActivatedAt: CREDIT_ANCHOR,
      },
    });
    await tx.authUser.create({ data: { id: userId, companyId, name: "Erika Driver", email, emailVerified: true } });
    await tx.authSession.create({
      data: { id: randomUUID(), token, userId, expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS) },
    });

    await tx.customColumn.createMany({
      data: [
        {
          id: stageColumnId,
          companyId,
          entityType: "deal",
          label: "Stage",
          type: "singleSelect",
          options: {
            options: STAGES.map((label, index) => ({
              value: stageOptionIds[label],
              label,
              color: "secondary",
              index,
              isDefault: index === 0,
            })),
          },
        },
        {
          id: phoneColumnId,
          companyId,
          entityType: "contact",
          label: "Phone",
          type: "phone",
          options: { allowMultiple: false, color: "secondary" },
        },
      ],
    });
    await tx.organization.createMany({
      data: SEEDED_ORGANIZATIONS.map((name, index) => ({ id: organizationIds[index], companyId, name })),
    });
    for (const [index, contact] of SEEDED_CONTACTS.entries()) {
      await tx.contact.create({
        data: { id: contactIds[contact.key], companyId, firstName: contact.firstName, lastName: contact.lastName },
      });
      await tx.contactOrganization.create({
        data: { id: randomUUID(), companyId, contactId: contactIds[contact.key], organizationId: organizationIds[index] },
      });
      await tx.contactIdentifier.create({
        data: {
          companyId,
          contactId: contactIds[contact.key],
          provider: "mail",
          channelClass: "email",
          value: contact.email,
        },
      });
    }
    for (const deal of SEEDED_DEALS) {
      await tx.deal.create({
        data: { id: dealIds[deal.key], companyId, name: deal.name, totalValue: deal.value, totalQuantity: 1 },
      });
      await tx.dealUser.create({ data: { id: randomUUID(), companyId, dealId: dealIds[deal.key], userId } });
      await tx.customFieldValue.create({
        data: {
          id: randomUUID(),
          companyId,
          entityType: "deal",
          columnId: stageColumnId,
          type: "singleSelect",
          value: stageOptionIds[deal.stage],
          dealId: dealIds[deal.key],
        } as Prisma.CustomFieldValueUncheckedCreateInput,
      });
    }
    await tx.wikiPage.create({
      data: { id: wikiPageId, companyId, title: WIKI_FACT.title, markdown: WIKI_FACT.markdown, kind: "knowledge" },
    });
    await tx.routine.create({
      data: {
        id: routineId,
        companyId,
        ownerUserId: userId,
        name: ROUTINE.name,
        prompt: ROUTINE.prompt,
        enabled: true,
        triggerKind: "schedule",
        cronExpression: "0 6 1 1 *",
        timezone: "Europe/Berlin",
        nextRunAt: new Date(now.getTime() + 300 * 24 * 60 * 60 * 1000),
      },
    });
  });

  return {
    companyId,
    userId,
    cookie: sessionCookie(token, args.authSecret),
    stageColumnId,
    phoneColumnId,
    stageOptionIds,
    contactIds,
    dealIds,
    wikiPageId,
    routineId,
  };
}

