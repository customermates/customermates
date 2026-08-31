import "@/styles/globals.css";

import type { Metadata, Viewport } from "next";

import { getLocale, getMessages } from "next-intl/server";
import { cookies } from "next/headers";

import { latin, mono, serif } from "./fonts";
import { Providers } from "./providers";
import { NavigationSwitch } from "./components/navigation/navigation-switch";
import { loadNavigationData } from "./components/navigation/navigation-data";
import { toSidebarUser } from "./components/navigation/sidebar-user";

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
import { GLOBAL_METADATA } from "@/core/seo/homepage-metadata";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { isAgentChatAvailable } from "@/ee/agent-chat/agent-availability";
import { DEFAULT_LOCALE, isRoutingLocale } from "@/i18n/locale-registry";

export const metadata: Metadata = GLOBAL_METADATA;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eeeef0" },
    { media: "(prefers-color-scheme: dark)", color: "#08080b" },
  ],
};

type Props = {
  children: React.ReactNode;
};

export default async function RootLayout({ children }: Props) {
  const [messages, displayLanguage, account, cookiesStore, operatorConsoleVisible] = await Promise.all([
    getMessages(),
    getLocale(),
    resolveRequestAccountState(),
    cookies(),
    getGetOperatorConsoleVisibilityInteractor().invoke(),
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

  const themeCookie = cookiesStore.get("theme")?.value;
  const sidebarCloseCookie = cookiesStore.get("sidebar-close")?.value;
  const initialSidebarOpen = sidebarCloseCookie !== undefined ? sidebarCloseCookie !== "true" : undefined;
  const accountAllowed = account.state === "allowed";
  const appUser = accountAllowed ? account.user : null;
  const sidebarUser = toSidebarUser(account.user);

  return (
    <html
      suppressHydrationWarning
      className={`${latin.variable} ${mono.variable} ${serif.variable} ${latin.className}`}
      lang={displayLanguage}
    >
      <body className="h-svh flex flex-col font-sans antialiased">
        <Providers
          agentChatEnabled={isAgentChatAvailable()}
          appMode={env.APP_MODE}
          defaultTheme={themeCookie}
          displayLanguage={displayLanguage}
          initialStoreState={{
            locale: isRoutingLocale(displayLanguage) ? displayLanguage : DEFAULT_LOCALE,
            user: appUser,
            company: accountAllowed ? navigation.company : null,
            terminology: accountAllowed ? navigation.terminology : [],
            subscription: accountAllowed ? navigation.subscription : null,
          }}
          messages={messages}
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
            sidebarUser={sidebarUser}
            subscription={navigation.subscription}
            systemTaskCount={navigation.systemTaskCount}
            terminology={navigation.terminology}
            trialDaysLeft={navigation.trialDaysLeft}
            unreadThreadCount={navigation.unreadThreadCount}
            userDisplayLanguage={account.user?.displayLanguage}
          >
            {children}
          </NavigationSwitch>
        </Providers>
      </body>
    </html>
  );
}
