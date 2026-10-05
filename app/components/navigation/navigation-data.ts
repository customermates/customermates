import type { Company } from "@/generated/prisma";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { AccountState } from "@/features/auth/account-state";
import type { RecordNavigation } from "@/features/records/record-navigation.schema";

type NavigationData = {
  records: RecordNavigation | null;
  company: Company | null;
  subscription: SubscriptionDto | null;
  trialDaysLeft: number | null;
  systemTaskCount: number;
  unreadThreadCount: number;
  channelsNeedingActionCount: number;
};

export type NavigationDataLoaders = {
  records: () => Promise<RecordNavigation>;
  company: () => Promise<Company>;
  subscription: () => Promise<SubscriptionDto | null>;
  systemTaskCount: () => Promise<number>;
  unreadThreadCount: () => Promise<number>;
  channelsNeedingActionCount: () => Promise<number>;
};

const EMPTY_NAVIGATION_DATA: NavigationData = {
  records: null,
  company: null,
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

  const [company, subscription, systemTaskCount, unreadThreadCount, channelsNeedingActionCount, records] =
    await Promise.all([
      loaders.company(),
      loaders.subscription(),
      loaders.systemTaskCount(),
      loaders.unreadThreadCount(),
      loaders.channelsNeedingActionCount(),
      loaders.records(),
    ]);
  const trialEndDate = subscription?.trialEndDate ?? null;
  const trialDaysLeft = trialEndDate
    ? Math.max(0, Math.ceil((trialEndDate.getTime() - Date.now()) / 86_400_000))
    : null;

  return {
    records,
    company,
    subscription,
    trialDaysLeft,
    systemTaskCount,
    unreadThreadCount,
    channelsNeedingActionCount,
  };
}
