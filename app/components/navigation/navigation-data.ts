import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { AccountState } from "@/features/auth/account-state";
import type { RecordNavigation } from "@/features/records/record-navigation.schema";
import type { SidebarLayout } from "@/features/p13n/sidebar-layout.schema";
import type { KeyboardPreferences } from "@/features/p13n/keyboard-preferences.schema";

type NavigationData = {
  records: RecordNavigation | null;
  sidebarLayout: SidebarLayout | null;
  keyboardPreferences: KeyboardPreferences | null;
  subscription: SubscriptionDto | null;
  trialDaysLeft: number | null;
  systemTaskCount: number;
  unreadThreadCount: number;
  channelsNeedingActionCount: number;
};

export type NavigationDataLoaders = {
  records: () => Promise<RecordNavigation>;
  sidebarLayout: () => Promise<SidebarLayout | null>;
  keyboardPreferences: () => Promise<KeyboardPreferences | null>;
  subscription: () => Promise<SubscriptionDto | null>;
  systemTaskCount: () => Promise<number>;
  unreadThreadCount: () => Promise<number>;
  channelsNeedingActionCount: () => Promise<number>;
};

const EMPTY_NAVIGATION_DATA: NavigationData = {
  records: null,
  sidebarLayout: null,
  keyboardPreferences: null,
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

  const [
    subscription,
    systemTaskCount,
    unreadThreadCount,
    channelsNeedingActionCount,
    records,
    sidebarLayout,
    keyboardPreferences,
  ] = await Promise.all([
    loaders.subscription(),
    loaders.systemTaskCount(),
    loaders.unreadThreadCount(),
    loaders.channelsNeedingActionCount(),
    loaders.records(),
    loaders.sidebarLayout(),
    loaders.keyboardPreferences(),
  ]);
  const trialEndDate = subscription?.trialEndDate ?? null;
  const trialDaysLeft = trialEndDate
    ? Math.max(0, Math.ceil((trialEndDate.getTime() - Date.now()) / 86_400_000))
    : null;

  return {
    records,
    sidebarLayout,
    keyboardPreferences,
    subscription,
    trialDaysLeft,
    systemTaskCount,
    unreadThreadCount,
    channelsNeedingActionCount,
  };
}
