import type { Company } from "@/generated/prisma";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { EntityTerminologyOverride } from "@/features/entity-terminology/entity-terminology.types";
import type { AccountState } from "@/features/auth/account-state";

type NavigationData = {
  company: Company | null;
  terminology: EntityTerminologyOverride[];
  subscription: SubscriptionDto | null;
  trialDaysLeft: number | null;
  systemTaskCount: number;
  unreadThreadCount: number;
  channelsNeedingActionCount: number;
};

export type NavigationDataLoaders = {
  company: () => Promise<{
    company: Company;
    terminology: EntityTerminologyOverride[];
  }>;
  subscription: () => Promise<SubscriptionDto | null>;
  systemTaskCount: () => Promise<number>;
  unreadThreadCount: () => Promise<number>;
  channelsNeedingActionCount: () => Promise<number>;
};

const EMPTY_NAVIGATION_DATA: NavigationData = {
  company: null,
  terminology: [],
  subscription: null,
  trialDaysLeft: null,
  systemTaskCount: 0,
  unreadThreadCount: 0,
  channelsNeedingActionCount: 0,
};

export async function loadNavigationData(
  accountState: AccountState,
  loaders: NavigationDataLoaders,
): Promise<NavigationData> {
  if (accountState !== "allowed") return { ...EMPTY_NAVIGATION_DATA };

  const [company, subscription, systemTaskCount, unreadThreadCount, channelsNeedingActionCount] = await Promise.all([
    loaders.company(),
    loaders.subscription(),
    loaders.systemTaskCount(),
    loaders.unreadThreadCount(),
    loaders.channelsNeedingActionCount(),
  ]);
  const trialEndDate = subscription?.trialEndDate ?? null;
  const trialDaysLeft = trialEndDate
    ? Math.max(0, Math.ceil((trialEndDate.getTime() - Date.now()) / 86_400_000))
    : null;

  return {
    company: company.company,
    terminology: company.terminology,
    subscription,
    trialDaysLeft,
    systemTaskCount,
    unreadThreadCount,
    channelsNeedingActionCount,
  };
}
