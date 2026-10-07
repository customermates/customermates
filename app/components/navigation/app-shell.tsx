import "@/styles/application.css";

import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { NavigationSwitch } from "./navigation-switch";
import { loadNavigationData } from "./navigation-data";
import { toSidebarUser } from "./sidebar-user";

import {
  getGetCompanySettingsInteractor,
  getGetRecordNavigationInteractor,
  getGetP13nInteractor,
  getCountSystemTasksInteractor,
  getGetSubscriptionInteractor,
  getGetUnreadThreadCountInteractor,
  getCountChannelsNeedingActionInteractor,
  getGetOperatorConsoleVisibilityInteractor,
} from "@/core/di";
import { env } from "@/env";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { isAgentChatAvailable } from "@/ee/agent-chat/agent-availability";
import { RootStoreProvider } from "@/core/stores/root-store.provider";
import { DEFAULT_LOCALE, isRoutingLocale } from "@/i18n/locale-registry";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { ForbiddenError } from "@/core/errors/app-errors";
import { SIDEBAR_P13N_ID, SidebarLayoutSchema } from "@/features/p13n/sidebar-layout.schema";

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
    records: () => unwrapValidated(getGetRecordNavigationInteractor().invoke()),
    sidebarLayout: async () =>
      SidebarLayoutSchema.safeParse((await getGetP13nInteractor().invoke({ p13nId: SIDEBAR_P13N_ID })).data?.settings)
        .data ?? null,
    company: async () => (await getGetCompanySettingsInteractor().invoke()).data,
    subscription: async () => (await getGetSubscriptionInteractor().invoke()).data,
    systemTaskCount: async () => (await getCountSystemTasksInteractor().invoke()).data,
    unreadThreadCount: async () => {
      try {
        const result = await getGetUnreadThreadCountInteractor().invoke();
        return result.ok ? result.data : 0;
      } catch (error) {
        if (error instanceof ForbiddenError) return 0;
        throw error;
      }
    },
    channelsNeedingActionCount: async () => (await getCountChannelsNeedingActionInteractor().invoke()).data,
  });

  const sidebarCloseCookie = cookiesStore.get("sidebar-close")?.value;
  const initialSidebarOpen = sidebarCloseCookie !== undefined ? sidebarCloseCookie !== "true" : undefined;
  const accountAllowed = account.state === "allowed";
  const appUser = accountAllowed ? account.user : null;

  return (
    <NextIntlClientProvider locale={displayLanguage} messages={messages} timeZone="UTC">
      <RootStoreProvider
        agentChatEnabled={isAgentChatAvailable()}
        appMode={env.APP_MODE}
        initialState={{
          locale: isRoutingLocale(displayLanguage) ? displayLanguage : DEFAULT_LOCALE,
          user: appUser,
          company: accountAllowed ? navigation.company : null,
          subscription: accountAllowed ? navigation.subscription : null,
          recordNavigation: accountAllowed ? navigation.records : null,
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
          recordNavigation={navigation.records}
          sidebarLayout={navigation.sidebarLayout}
          sidebarUser={toSidebarUser(account.user)}
          subscription={navigation.subscription}
          systemTaskCount={navigation.systemTaskCount}
          trialDaysLeft={navigation.trialDaysLeft}
          unreadThreadCount={navigation.unreadThreadCount}
          userDisplayLanguage={account.user?.displayLanguage}
        >
          {children}
        </NavigationSwitch>
      </RootStoreProvider>
    </NextIntlClientProvider>
  );
}
