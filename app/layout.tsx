import "@/styles/globals.css";

import type { Metadata, Viewport } from "next";

import { Inter, JetBrains_Mono, Lora } from "next/font/google";
import { getLocale, getMessages } from "next-intl/server";
import { cookies } from "next/headers";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { Status } from "@/generated/prisma";

import type { SubscriptionStatus } from "@/generated/prisma";

import type { Company } from "@/generated/prisma";

import { Providers } from "./providers";
import { NavigationSwitch } from "./components/navigation/navigation-switch";

import {
  getAuthService,
  getUserService,
  getGetCompanyDetailsInteractor,
  getCountSystemTasksInteractor,
  getGetSubscriptionInteractor,
} from "@/core/app-di";
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
  maximumScale: 1,
  userScalable: false,
  themeColor: "white",
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
  let company: Company | null = null;
  let subscriptionStatus: SubscriptionStatus | null = null;
  let trialDaysLeft: number | null = null;
  let emailVerified: boolean | null = null;
  let isAuthenticated = false;
  const onboardingComplete = user?.onboardingWizardCompletedAt != null;

  if (isRegistered) {
    isAuthenticated = user?.status === Status.active;
    const authSession = await getAuthService().getSession();
    emailVerified = authSession?.user?.emailVerified ?? false;

    if (isAuthenticated) {
      const [companyResult, systemTaskCountResult, subscriptionResult] = await Promise.all([
        getGetCompanyDetailsInteractor().invoke(),
        getCountSystemTasksInteractor().invoke(),
        getGetSubscriptionInteractor().invoke(),
      ]);
      company = companyResult.data;
      systemTaskCount = systemTaskCountResult.data;
      subscriptionStatus = subscriptionResult.data?.status ?? null;
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
      <head>
        <link href="https://demo.customermates.com" rel="preconnect" />
      </head>

      <body className="h-screen flex flex-col font-sans antialiased">
        <Providers
          defaultTheme={themeCookie}
          displayLanguage={displayLanguage}
          initialNavbarVisible={!isAuthenticated}
          initialSidebarOpen={initialSidebarOpen}
          isCloudHosted={env.CLOUD_HOSTED}
          isDemoMode={env.DEMO_MODE}
          messages={messages}
        >
          <NavigationSwitch
            company={company}
            defaultSidebarOpen={initialSidebarOpen}
            emailVerified={emailVerified}
            isAuthenticated={isAuthenticated}
            onboardingComplete={onboardingComplete}
            subscriptionStatus={subscriptionStatus}
            systemTaskCount={systemTaskCount}
            trialDaysLeft={trialDaysLeft}
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
