import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { NavigationSwitch } from "./navigation-switch";
import { loadNavigationData } from "./navigation-data";
import { toSidebarUser } from "./sidebar-user";

import {
  getGetCompanySettingsInteractor,
  getCountSystemTasksInteractor,
  getGetSubscriptionInteractor,
  getGetUnreadThreadCountInteractor,
  getGetMyConnectedAccountsInteractor,
  getGetOperatorConsoleVisibilityInteractor,
} from "@/core/di";
import { accountNeedsAction } from "@/ee/messaging/provider";
import { env } from "@/env";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { isAgentChatAvailable } from "@/ee/agent-chat/agent-availability";
import { RootStoreProvider } from "@/core/stores/root-store.provider";
import { DEFAULT_LOCALE, isRoutingLocale } from "@/i18n/locale-registry";

type Props = {
  children: React.ReactNode;
  displayLanguage: string;
};

export async function AppShell({ children, displayLanguage }: Props) {
  const [account, cookiesStore, operatorConsoleVisible, messages] = await Promise.all([
    resolveRequestAccountState(),
    cookies(),
    getGetOperatorConsoleVisibilityInteractor().invoke(),
    getMessages(),
  ]);
  const navigation = await loadNavigationData(account.state, {
    company: async () => {
      const result = await getGetCompanySettingsInteractor().invoke();
      return {
        company: result.data,
        terminology: result.data.terminology.presets,
      };
    },
    subscription: async () => (await getGetSubscriptionInteractor().invoke()).data,
    systemTaskCount: async () => (await getCountSystemTasksInteractor().invoke()).data,
    unreadThreadCount: async () => (await getGetUnreadThreadCountInteractor().invoke()).data,
    channelsNeedingActionCount: async () => {
      const result = await getGetMyConnectedAccountsInteractor().invoke();
      return result.ok ? result.data.filter(accountNeedsAction).length : 0;
    },
  });

  const sidebarCloseCookie = cookiesStore.get("sidebar-close")?.value;
  const initialSidebarOpen = sidebarCloseCookie !== undefined ? sidebarCloseCookie !== "true" : undefined;
  const accountAllowed = account.state === "allowed";
  const appUser = accountAllowed ? account.user : null;

  const shell = (
    <RootStoreProvider
      agentChatEnabled={isAgentChatAvailable()}
      appMode={env.APP_MODE}
      initialState={{
        locale: isRoutingLocale(displayLanguage) ? displayLanguage : DEFAULT_LOCALE,
        user: appUser,
        company: accountAllowed ? navigation.company : null,
        terminology: accountAllowed ? navigation.terminology : [],
        subscription: accountAllowed ? navigation.subscription : null,
      }}
    >
      <NavigationSwitch
        accountState={account.state}
        appUser={appUser}
        channelsNeedingActionCount={navigation.channelsNeedingActionCount}
        company={navigation.company}
        defaultSidebarOpen={initialSidebarOpen}
        emailVerified={accountAllowed ? account.emailVerified : null}
        legalStatus={accountAllowed ? account.legalStatus : null}
        operatorConsoleVisible={operatorConsoleVisible}
        sidebarUser={toSidebarUser(account.user)}
        subscription={navigation.subscription}
        systemTaskCount={navigation.systemTaskCount}
        terminology={navigation.terminology}
        trialDaysLeft={navigation.trialDaysLeft}
        unreadThreadCount={navigation.unreadThreadCount}
        userDisplayLanguage={account.user?.displayLanguage}
      >
        {children}
      </NavigationSwitch>
    </RootStoreProvider>
  );

  if (account.state !== "unauthenticated") return shell;

  return (
    <NextIntlClientProvider locale={displayLanguage} messages={messages} timeZone="UTC">
      {shell}
    </NextIntlClientProvider>
  );
}
