import { hashPassword } from "better-auth/crypto";

import type { CountryCode, Prisma } from "@/generated/prisma";
import type { AppLocale } from "@/i18n/locale-registry";

import { COUNTRY_CODES } from "@/constants/countries";
import { agentCreditPeriodForAnchor } from "@/ee/agent-chat/agent-credit-policy";
import { APP_LOCALES } from "@/i18n/locale-registry";

import type { SeedContext } from "./context";

const HOUR = 60 * 60_000;

const FIXTURE_CREATED_AT = new Date("2026-08-02T08:00:00.000Z");
const FIXTURE_COMPANY_CREATED_AT = new Date("2026-08-01T08:00:00.000Z");
const OPERATOR_TABLE_CREATED_AT = new Date("2026-08-10T08:00:00.000Z");
const OPERATOR_TABLE_CREDIT_ANCHOR = new Date("2026-08-01T08:00:00.000Z");
const OPERATOR_TABLE_CURRENT_PERIOD_END = new Date("2026-09-01T08:00:00.000Z");

const OPERATOR_TABLE_PLANS = ["starter", "pro", "business", "enterprise"] as const;
const OPERATOR_TABLE_SUBSCRIPTION_STATUSES = ["trial", "active", "cancelled", "expired", "pastDue", "unPaid"] as const;
const OPERATOR_TABLE_USER_STATUSES = ["active", "inactive", "pendingAuthorization"] as const;
const OPERATOR_TABLE_COUNTRIES = APP_LOCALES.filter((locale): locale is AppLocale & CountryCode =>
  COUNTRY_CODES.some((country) => country === locale),
);
const OPERATOR_TABLE_COMBINATION_COUNT = OPERATOR_TABLE_PLANS.length * OPERATOR_TABLE_SUBSCRIPTION_STATUSES.length;

type OperatorTablePlan = (typeof OPERATOR_TABLE_PLANS)[number];
type OperatorTableSubscriptionStatus = (typeof OPERATOR_TABLE_SUBSCRIPTION_STATUSES)[number];

type SyntheticHostedAiOperatorSubscriptionDefinition = Readonly<{
  agentCreditAnchorAt: Date;
  createdAt: Date;
  currentPeriodEnd: Date;
  enterpriseAgentCreditsPerUser: number | null;
  id: string;
  lemonSqueezyId: string | null;
  lemonSqueezyVariantId: string | null;
  plan: OperatorTablePlan;
  quantity: number | null;
  status: OperatorTableSubscriptionStatus;
  trialEndDate: Date | null;
  updatedAt: Date;
}>;

export type SyntheticHostedAiOperatorUserDefinition = Readonly<{
  authEmailVerified: boolean;
  companyId: string;
  createdAt: Date;
  email: string;
  firstName: string;
  id: string;
  isPlatformOperator: boolean;
  lastName: string;
  status: (typeof OPERATOR_TABLE_USER_STATUSES)[number];
  subscription: SyntheticHostedAiOperatorSubscriptionDefinition | null;
}>;

function operatorTableUuid(namespace: string, index: number): string {
  return `${namespace}-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

const operatorTableSubscriptionScenarios: Array<Readonly<{
  plan: OperatorTablePlan;
  status: OperatorTableSubscriptionStatus;
}> | null> = [
  ...OPERATOR_TABLE_PLANS.flatMap((plan) => OPERATOR_TABLE_SUBSCRIPTION_STATUSES.map((status) => ({ plan, status }))),
  null,
  null,
  null,
  null,
  { plan: "business", status: "trial" },
  { plan: "starter", status: "active" },
  { plan: "enterprise", status: "active" },
  { plan: "pro", status: "active" },
];

export const SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS: readonly SyntheticHostedAiOperatorUserDefinition[] =
  operatorTableSubscriptionScenarios.map((scenario, index) => {
    const createdAt = new Date(OPERATOR_TABLE_CREATED_AT.getTime() + Math.floor(index / 2) * HOUR);
    const status = OPERATOR_TABLE_USER_STATUSES[index % OPERATOR_TABLE_USER_STATUSES.length];
    const companyId = operatorTableUuid("c1260000", index);
    const number = String(index + 1).padStart(2, "0");
    const providerManaged =
      index < OPERATOR_TABLE_COMBINATION_COUNT && scenario?.plan === "pro" && scenario.status === "active";
    const missingEnterpriseAllowance =
      index < OPERATOR_TABLE_COMBINATION_COUNT && scenario?.plan === "enterprise" && scenario.status === "active";
    const subscription = scenario
      ? {
          agentCreditAnchorAt: OPERATOR_TABLE_CREDIT_ANCHOR,
          createdAt,
          currentPeriodEnd: OPERATOR_TABLE_CURRENT_PERIOD_END,
          enterpriseAgentCreditsPerUser:
            scenario.plan === "enterprise" && !missingEnterpriseAllowance ? 1_200 + index : null,
          id: operatorTableUuid("b1260000", index),
          lemonSqueezyId: providerManaged ? "synthetic-operator-provider-subscription" : null,
          lemonSqueezyVariantId: providerManaged ? "synthetic-operator-provider-variant" : null,
          plan: scenario.plan,
          quantity: index % 3 === 0 ? null : index % 3,
          status: scenario.status,
          trialEndDate: null,
          updatedAt: createdAt,
        }
      : null;

    return {
      authEmailVerified: (index + 1) % 6 !== 0,
      companyId,
      createdAt,
      email: `hosted-ai.operator-user-${number}@example.invalid`,
      firstName: titleCase(status === "pendingAuthorization" ? "pending" : status),
      id: operatorTableUuid("a1260000", index),
      isPlatformOperator: index % 11 === 0 || index === 30,
      lastName: scenario
        ? `${titleCase(scenario.plan)} ${titleCase(scenario.status)} ${number}`
        : `No Subscription ${number}`,
      status,
      subscription,
    };
  });

export const SYNTHETIC_HOSTED_AI_ORDINARY_USER = {
  email: "hosted-ai.ordinary@example.invalid",
  firstName: "Olivia",
  lastName: "Ordinary",
  name: "Olivia Ordinary",
} as const;

export const SYNTHETIC_HOSTED_AI_GLOBAL_CONTROL = {
  hostedProviderWorkPaused: false,
  monthlySpendCapMicrocents: 1_000_000_000n,
  reason: "Synthetic local operator fixture",
  version: 1,
} as const;

export const SYNTHETIC_HOSTED_AI_USAGE = {
  released: {
    chargedCredits: 0,
    costMicrocents: 0n,
    reservedCredits: 10,
    state: "released",
  },
  reserved: {
    chargedCredits: 0,
    costMicrocents: 0n,
    reservedCredits: 25,
    state: "reserved",
  },
  settled: {
    chargedCredits: 18,
    costMicrocents: 18_000_000n,
    reservedCredits: 40,
    state: "settled",
  },
} as const;

async function reconcileAuthUserId(context: SeedContext, id: string, email: string): Promise<void> {
  const [existingById, existingByEmail] = await Promise.all([
    context.prisma.authUser.findUnique({ where: { id }, select: { id: true } }),
    context.prisma.authUser.findUnique({
      where: { email },
      select: { id: true },
    }),
  ]);

  if (!existingByEmail || existingByEmail.id === id) return;
  if (existingById) await context.prisma.authUser.delete({ where: { id: existingByEmail.id } });
  else {
    await context.prisma.authUser.update({
      where: { id: existingByEmail.id },
      data: { id },
    });
  }
}

async function reconcileDomainUserId(context: SeedContext, id: string, email: string): Promise<void> {
  const [existingById, existingByEmail] = await Promise.all([
    context.prisma.user.findUnique({ where: { id }, select: { id: true } }),
    context.prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);

  if (!existingByEmail || existingByEmail.id === id) return;
  if (existingById) await context.prisma.user.delete({ where: { id: existingByEmail.id } });
  else {
    await context.prisma.user.update({
      where: { id: existingByEmail.id },
      data: { id },
    });
  }
}

export async function seedHostedAiOperatorFixtures(context: SeedContext, now = new Date()): Promise<void> {
  const { ids, prisma, sharedUserPassword } = context;
  const { resetAt: periodEnd, start: periodStart } = agentCreditPeriodForAnchor(FIXTURE_COMPANY_CREATED_AT, now);
  const password = await hashPassword(sharedUserPassword);

  const company = {
    createdAt: FIXTURE_COMPANY_CREATED_AT,
    currency: "eur" as const,
    updatedAt: FIXTURE_COMPANY_CREATED_AT,
  };
  await prisma.company.upsert({
    where: { id: ids.hostedAiFixtureCompany },
    update: company,
    create: { id: ids.hostedAiFixtureCompany, ...company },
  });

  const fixtureRole = await prisma.userRole.upsert({
    where: {
      name_companyId: { companyId: ids.hostedAiFixtureCompany, name: "Admin" },
    },
    update: {
      description: "Full tenant access for the synthetic hosted-AI fixture",
      isSystemRole: true,
    },
    create: {
      id: ids.hostedAiFixtureRole,
      companyId: ids.hostedAiFixtureCompany,
      description: "Full tenant access for the synthetic hosted-AI fixture",
      isSystemRole: true,
      name: "Admin",
    },
  });

  await reconcileAuthUserId(context, ids.hostedAiOrdinaryUser, SYNTHETIC_HOSTED_AI_ORDINARY_USER.email);
  const authUser = {
    companyId: ids.hostedAiFixtureCompany,
    email: SYNTHETIC_HOSTED_AI_ORDINARY_USER.email,
    emailVerified: true,
    image: null,
    name: SYNTHETIC_HOSTED_AI_ORDINARY_USER.name,
  };
  await prisma.authUser.upsert({
    where: { id: ids.hostedAiOrdinaryUser },
    update: authUser,
    create: { id: ids.hostedAiOrdinaryUser, ...authUser },
  });

  await reconcileDomainUserId(context, ids.hostedAiOrdinaryUser, SYNTHETIC_HOSTED_AI_ORDINARY_USER.email);
  const user = {
    agentCreditActivatedAt: FIXTURE_CREATED_AT,
    agreeToTerms: true,
    companyId: ids.hostedAiFixtureCompany,
    country: "de" as const,
    createdAt: FIXTURE_CREATED_AT,
    email: SYNTHETIC_HOSTED_AI_ORDINARY_USER.email,
    firstName: SYNTHETIC_HOSTED_AI_ORDINARY_USER.firstName,
    isPlatformOperator: false,
    lastName: SYNTHETIC_HOSTED_AI_ORDINARY_USER.lastName,
    onboardingWizardCompletedAt: FIXTURE_CREATED_AT,
    roleId: fixtureRole.id,
    status: "active" as const,
    updatedAt: FIXTURE_CREATED_AT,
  } satisfies Prisma.UserUncheckedCreateInput;
  await prisma.user.upsert({
    where: { id: ids.hostedAiOrdinaryUser },
    update: user,
    create: { id: ids.hostedAiOrdinaryUser, ...user },
  });

  await prisma.authAccount.deleteMany({
    where: {
      id: { not: ids.hostedAiOrdinaryCredentialAccount },
      providerId: "credential",
      userId: ids.hostedAiOrdinaryUser,
    },
  });
  const credentialAccount = {
    accountId: ids.hostedAiOrdinaryUser,
    password,
    providerId: "credential",
    userId: ids.hostedAiOrdinaryUser,
  };
  await prisma.authAccount.upsert({
    where: { id: ids.hostedAiOrdinaryCredentialAccount },
    update: credentialAccount,
    create: { id: ids.hostedAiOrdinaryCredentialAccount, ...credentialAccount },
  });

  const subscription = {
    agentCreditAnchorAt: FIXTURE_COMPANY_CREATED_AT,
    enterpriseAgentCreditsPerUser: null,
    plan: "enterprise" as const,
    quantity: 1,
    status: "active" as const,
  };
  await prisma.subscription.upsert({
    where: { companyId: ids.hostedAiFixtureCompany },
    update: subscription,
    create: {
      id: ids.hostedAiFixtureSubscription,
      companyId: ids.hostedAiFixtureCompany,
      ...subscription,
    },
  });

  await prisma.hostedAiGlobalControl.upsert({
    where: { id: "global" },
    update: {
      ...SYNTHETIC_HOSTED_AI_GLOBAL_CONTROL,
      updatedAt: FIXTURE_CREATED_AT,
      updatedByOperatorUserId: ids.user,
    },
    create: {
      id: "global",
      ...SYNTHETIC_HOSTED_AI_GLOBAL_CONTROL,
      createdAt: FIXTURE_CREATED_AT,
      updatedAt: FIXTURE_CREATED_AT,
      updatedByOperatorUserId: ids.user,
    },
  });

  const commonUsage = {
    allowanceCreditsSnapshot: 500,
    companyId: ids.hostedAiFixtureCompany,
    model: "openai/gpt-5-nano",
    periodEnd,
    periodStart,
    planSnapshot: "enterprise" as const,
    sessionId: "synthetic-hosted-ai-operator",
    subscriptionStatusSnapshot: "active" as const,
    userId: ids.hostedAiOrdinaryUser,
  };
  const usageRows = [
    {
      id: ids.hostedAiSettledUsage,
      ...commonUsage,
      ...SYNTHETIC_HOSTED_AI_USAGE.settled,
      costSource: "measured" as const,
      createdAt: new Date(periodStart.getTime() + HOUR),
      providerStartedAt: new Date(periodStart.getTime() + 2 * HOUR),
      settledAt: new Date(periodStart.getTime() + 3 * HOUR),
    },
    {
      id: ids.hostedAiReservedUsage,
      ...commonUsage,
      ...SYNTHETIC_HOSTED_AI_USAGE.reserved,
      costSource: "estimated" as const,
      createdAt: new Date(periodStart.getTime() + 4 * HOUR),
      providerStartedAt: null,
      settledAt: null,
    },
    {
      id: ids.hostedAiReleasedUsage,
      ...commonUsage,
      ...SYNTHETIC_HOSTED_AI_USAGE.released,
      costSource: "estimated" as const,
      createdAt: new Date(periodStart.getTime() + 5 * HOUR),
      providerStartedAt: null,
      settledAt: new Date(periodStart.getTime() + 6 * HOUR),
    },
  ] satisfies Prisma.AgentUsageEventUncheckedCreateInput[];

  for (const row of usageRows) {
    await prisma.agentUsageEvent.upsert({
      where: { id: row.id },
      update: row,
      create: row,
    });
  }
}

export async function seedLocalHostedAiOperatorAccess(context: SeedContext): Promise<void> {
  await context.prisma.user.update({
    where: { id: context.ids.user },
    data: { isPlatformOperator: true },
  });
}

export async function seedHostedAiOperatorUserTableFixtures(
  context: SeedContext,
  options: { includeLocalOperatorAccess?: boolean } = {},
): Promise<void> {
  const { prisma } = context;

  for (const [index, definition] of SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.entries()) {
    const company = {
      createdAt: new Date(definition.createdAt.getTime() - HOUR),
      currency: "eur" as const,
      updatedAt: definition.createdAt,
    };
    await prisma.company.upsert({
      where: { id: definition.companyId },
      update: company,
      create: { id: definition.companyId, ...company },
    });

    await reconcileAuthUserId(context, definition.id, definition.email);
    const authUser = {
      companyId: definition.companyId,
      createdAt: definition.createdAt,
      email: definition.email,
      emailVerified: definition.authEmailVerified,
      image: null,
      name: `${definition.firstName} ${definition.lastName}`,
      updatedAt: definition.createdAt,
    };
    await prisma.authUser.upsert({
      where: { id: definition.id },
      update: authUser,
      create: { id: definition.id, ...authUser },
    });

    await reconcileDomainUserId(context, definition.id, definition.email);
    const user = {
      agentCreditActivatedAt: definition.status === "active" ? definition.createdAt : null,
      agreeToTerms: definition.status !== "pendingAuthorization",
      companyId: definition.companyId,
      country: OPERATOR_TABLE_COUNTRIES[index % OPERATOR_TABLE_COUNTRIES.length],
      createdAt: definition.createdAt,
      email: definition.email,
      firstName: definition.firstName,
      isPlatformOperator: options.includeLocalOperatorAccess ? definition.isPlatformOperator : false,
      lastName: definition.lastName,
      onboardingWizardCompletedAt: definition.status === "pendingAuthorization" ? null : definition.createdAt,
      roleId: null,
      status: definition.status,
      updatedAt: definition.createdAt,
    } satisfies Prisma.UserUncheckedCreateInput;
    await prisma.user.upsert({
      where: { id: definition.id },
      update: user,
      create: { id: definition.id, ...user },
    });

    if (!definition.subscription) {
      await prisma.subscription.deleteMany({
        where: { companyId: definition.companyId },
      });
      continue;
    }

    const { id, ...subscription } = definition.subscription;
    await prisma.subscription.upsert({
      where: { companyId: definition.companyId },
      update: subscription,
      create: { id, companyId: definition.companyId, ...subscription },
    });
  }
}
