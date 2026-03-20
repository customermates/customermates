import "@/styles/globals.css";

import type { Metadata, Viewport } from "next";

import { Inter } from "next/font/google";
import { getLocale, getMessages } from "next-intl/server";
import { cookies } from "next/headers";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";

import { Locale, Status } from "@/generated/prisma";
import type { Company } from "@/generated/prisma";

import { Providers } from "./providers";
import { NavigationSwitch } from "./components/navigation/navigation-switch";

import { di } from "@/core/dependency-injection/container";
import { GetCompanyDetailsInteractor } from "@/features/company/get-company-details.interactor";
import { UserService } from "@/features/user/user.service";
import { BASE_URL, IS_CLOUD_HOSTED, IS_DEMO_MODE } from "@/constants/env";
import { homepageSource } from "@/core/fumadocs/source";
import { ROUTING_DEFAULT_LOCALE, ROUTING_LOCALES } from "@/i18n/routing";
import { CountSystemTasksInteractor } from "@/features/tasks/count-system-tasks.interactor";
import { GetSubscriptionInteractor } from "@/ee/subscription/get-subscription.interactor";

const latin = Inter({ subsets: ["latin"], weight: ["400", "500", "700"], display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const page = homepageSource.getPage(["homepage"], locale);

  if (!page) return {};

  const { rootMetadata } = page.data;
  const alternates: Record<string, string> = Object.fromEntries(
    ROUTING_LOCALES.map((loc) => [loc, `${BASE_URL}/${loc}`]),
  );
  alternates["x-default"] = `${BASE_URL}/${ROUTING_DEFAULT_LOCALE}`;

  const canonical = `${BASE_URL}/${locale}`;

  return {
    title: {
      default: rootMetadata.defaultTitle,
      template: rootMetadata.titleTemplate,
    },
    description: rootMetadata.defaultDescription,
    icons: {
      icon: rootMetadata.icon,
    },
    alternates: {
      canonical,
      languages: alternates,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

function localeEnumToString(locale: Locale | undefined | null, systemLocale: string): string {
  switch (locale) {
    case Locale.de:
      return "de-DE";
    case Locale.en:
      return "en-US";
    default:
      return systemLocale === "de" ? "de-DE" : systemLocale === "en" ? "en-US" : "en-US";
  }
}

type Props = {
  children: React.ReactNode;
};

export default async function RootLayout({ children }: Props) {
  const [messages, displayLanguage, user, cookiesStore] = await Promise.all([
    getMessages(),
    getLocale(),
    di.get(UserService).getUser(),
    cookies(),
  ]);

  const themeCookie = cookiesStore.get("theme")?.value;

  const sidebarCloseCookie = cookiesStore.get("sidebar-close")?.value;
  const initialSidebarOpen = sidebarCloseCookie !== undefined ? sidebarCloseCookie !== "true" : undefined;

  const isRegistered = user?.email != null;
  let systemTaskCount = 0;
  let company: Company | null = null;
  let subscriptionPlan: "basic" | "pro" | null = null;
  let isAuthenticated = false;

  if (isRegistered) {
    isAuthenticated = user?.status === Status.active;

    if (isAuthenticated) {
      const [companyResult, systemTaskCountResult, subscriptionResult] = await Promise.all([
        di.get(GetCompanyDetailsInteractor).invoke(),
        di.get(CountSystemTasksInteractor).invoke(),
        di.get(GetSubscriptionInteractor).invoke(),
      ]);
      company = companyResult;
      systemTaskCount = systemTaskCountResult;
      subscriptionPlan = subscriptionResult?.plan ?? null;
    }
  }

  return (
    <html suppressHydrationWarning className={latin.className} lang={displayLanguage}>
      <head />

      <body className="h-screen flex flex-col font-sans antialiased">
        <Providers
          defaultTheme={themeCookie}
          displayLanguage={displayLanguage}
          formattingLocale={localeEnumToString(user?.formattingLocale, displayLanguage)}
          initialNavbarVisible={!isAuthenticated}
          initialSidebarOpen={initialSidebarOpen}
          isCloudHosted={IS_CLOUD_HOSTED}
          isDemoMode={IS_DEMO_MODE}
          messages={messages}
        >
          <NavigationSwitch
            company={company}
            isAuthenticated={isAuthenticated}
            subscriptionPlan={subscriptionPlan}
            systemTaskCount={systemTaskCount}
            user={user}
          >
            {children}
          </NavigationSwitch>
        </Providers>

        <Analytics />

        <Script id="lemon-squeezy-affiliate-config" strategy="beforeInteractive">
          {`window.lemonSqueezyAffiliateConfig = { store: "customermates" };`}
        </Script>

        <Script defer src="https://lmsqueezy.com/affiliate.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
