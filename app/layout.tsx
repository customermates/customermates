import "@/styles/globals.css";

import type { Metadata, Viewport } from "next";

import { Inter, JetBrains_Mono, Lora } from "next/font/google";
import { getLocale, getMessages } from "next-intl/server";
import { cookies } from "next/headers";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { Status } from "@/generated/prisma";

import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";

import type { Company } from "@/generated/prisma";
import type { EntityTerminologyOverride } from "@/features/entity-terminology/entity-terminology.types";
import type { LegalUpdateStatus } from "@/features/legal/legal-status.service";

import { Providers } from "./providers";
import { NavigationSwitch } from "./components/navigation/navigation-switch";

import {
  getAuthService,
  getUserService,
  getGetCompanySettingsInteractor,
  getCountSystemTasksInteractor,
  getGetSubscriptionInteractor,
  getGetUnreadThreadCountInteractor,
  getGetMyConnectedAccountsInteractor,
  getLegalStatusService,
} from "@/core/di";
import { accountNeedsAction } from "@/ee/messaging/provider";
import { env } from "@/env";
import { homepageSource } from "@/core/fumadocs/source";
import { ROUTING_DEFAULT_LOCALE, ROUTING_LOCALES } from "@/i18n/routing";

const latin = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono",
});

const serif = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-serif",
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const page = homepageSource.getPage(["homepage"], locale);

  if (!page) return {};

  const { rootMetadata } = page.data;
  const alternates: Record<string, string> = Object.fromEntries(
    ROUTING_LOCALES.map((loc) => [loc, `${env.BASE_URL}/${loc}`]),
  );
  alternates["x-default"] = `${env.BASE_URL}/${ROUTING_DEFAULT_LOCALE}`;

  const canonical = `${env.BASE_URL}/${locale}`;
  const params = new URLSearchParams({
    description: rootMetadata.defaultDescription,
    title: rootMetadata.defaultTitle,
  });
  const defaultOgImageUrl = `/og/image.png?${params.toString()}`;

  return {
    title: {
      default: rootMetadata.defaultTitle,
      template: rootMetadata.titleTemplate,
    },
    description: rootMetadata.defaultDescription,
    metadataBase: new URL(env.BASE_URL),
    icons: {
      icon: rootMetadata.icon,
    },
    openGraph: {
      description: rootMetadata.defaultDescription,
      images: [defaultOgImageUrl],
      siteName: "Customermates",
      title: rootMetadata.defaultTitle,
      type: "website",
      url: canonical,
    },
    alternates: {
      canonical,
      languages: alternates,
    },
    twitter: {
      card: "summary_large_image",
      description: rootMetadata.defaultDescription,
      images: [defaultOgImageUrl],
      title: rootMetadata.defaultTitle,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

type Props = {
  children: React.ReactNode;
};

export default async function RootLayout({ children }: Props) {
  const [messages, displayLanguage, user, cookiesStore] = await Promise.all([
    getMessages(),
    getLocale(),
    getUserService().getUser(),
    cookies(),
  ]);

  const themeCookie = cookiesStore.get("theme")?.value;

  const sidebarCloseCookie = cookiesStore.get("sidebar-close")?.value;
  const initialSidebarOpen = sidebarCloseCookie !== undefined ? sidebarCloseCookie !== "true" : undefined;

  const isRegistered = user?.email != null;
  let systemTaskCount = 0;
  let unreadThreadCount = 0;
  let channelsNeedingActionCount = 0;
  let company: Company | null = null;
  let terminology: EntityTerminologyOverride[] = [];
  let subscription: SubscriptionDto | null = null;
  let trialDaysLeft: number | null = null;
  let emailVerified: boolean | null = null;
  let isAuthenticated = false;
  let legalStatus: LegalUpdateStatus | null = null;
  const onboardingComplete = user?.onboardingWizardCompletedAt != null;

  if (isRegistered) {
    isAuthenticated = user?.status === Status.active;
    const authSession = await getAuthService().getSession();
    emailVerified = authSession?.user?.emailVerified ?? false;

    if (isAuthenticated) {
      const [
        companyResult,
        systemTaskCountResult,
        subscriptionResult,
        unreadThreadCountResult,
        accountsResult,
        legalResult,
      ] = await Promise.all([
        getGetCompanySettingsInteractor().invoke(),
        getCountSystemTasksInteractor().invoke(),
        getGetSubscriptionInteractor().invoke(),
        getGetUnreadThreadCountInteractor().invoke(),
        getGetMyConnectedAccountsInteractor().invoke(),
        getLegalStatusService().getStatus(user),
      ]);
      company = companyResult.data;
      terminology = companyResult.data.terminology.presets;
      systemTaskCount = systemTaskCountResult.data;
      unreadThreadCount = unreadThreadCountResult.data;
      channelsNeedingActionCount = accountsResult.ok ? accountsResult.data.filter(accountNeedsAction).length : 0;
      subscription = subscriptionResult.data;
      legalStatus = legalResult;
      const trialEndDate = subscriptionResult.data?.trialEndDate ?? null;
      trialDaysLeft = trialEndDate ? Math.max(0, Math.ceil((trialEndDate.getTime() - Date.now()) / 86_400_000)) : null;
    }
  }

  return (
    <html
      suppressHydrationWarning
      className={`${latin.variable} ${mono.variable} ${serif.variable} ${latin.className}`}
      lang={displayLanguage}
    >
      <body className="h-svh flex flex-col font-sans antialiased">
        <Providers
          appMode={env.APP_MODE}
          defaultTheme={themeCookie}
          displayLanguage={displayLanguage}
          messages={messages}
        >
          <NavigationSwitch
            channelsNeedingActionCount={channelsNeedingActionCount}
            company={company}
            defaultSidebarOpen={initialSidebarOpen}
            emailVerified={emailVerified}
            isAuthenticated={isAuthenticated}
            legalStatus={legalStatus}
            onboardingComplete={onboardingComplete}
            subscription={subscription}
            systemTaskCount={systemTaskCount}
            terminology={terminology}
            trialDaysLeft={trialDaysLeft}
            unreadThreadCount={unreadThreadCount}
            user={user}
          >
            {children}
          </NavigationSwitch>
        </Providers>

        <Analytics />

        <Script id="lemon-squeezy-affiliate-config" strategy="afterInteractive">
          {`window.lemonSqueezyAffiliateConfig = { store: "customermates" };`}
        </Script>

        <Script defer src="https://lmsqueezy.com/affiliate.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
