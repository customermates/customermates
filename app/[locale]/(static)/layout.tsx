import { notFound } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { cookies } from "next/headers";

import { env } from "@/env";
import { isContentLocale } from "@/i18n/locale-registry";
import { MarketingShell } from "@/app/components/navigation/marketing-shell";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function StaticLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!isContentLocale(locale)) notFound();

  const [account, cookiesStore] = await Promise.all([resolveRequestAccountState(), cookies()]);
  const sidebarCloseCookie = cookiesStore.get("sidebar-close")?.value;

  return (
    <>
      <MarketingShell
        accountState={account.state}
        defaultSidebarOpen={sidebarCloseCookie !== undefined ? sidebarCloseCookie !== "true" : undefined}
      >
        {children}
      </MarketingShell>

      {env.APP_MODE === "cloud" ? (
        <>
          <Analytics />

          <script
            dangerouslySetInnerHTML={{
              __html: 'window.lemonSqueezyAffiliateConfig = { store: "customermates" }',
            }}
          />

          <script defer src="https://lmsqueezy.com/affiliate.js" />
        </>
      ) : null}
    </>
  );
}
