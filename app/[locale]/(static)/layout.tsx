import { Analytics } from "@vercel/analytics/next";

import { LemonSqueezyAffiliateScript } from "@/components/acquisition/lemon-squeezy-affiliate-script";
import { Toaster } from "@/components/ui/sonner";
import { env } from "@/env";
import { MarketingShell } from "@/app/components/navigation/marketing-shell";
import { enableMarketingShellLocale } from "@/i18n/static-locale";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export const revalidate = 86400;

export default async function StaticLayout({ children, params }: Props) {
  await enableMarketingShellLocale(params);

  return (
    <>
      <MarketingShell appMode={env.APP_MODE}>{children}</MarketingShell>

      <Toaster />

      {env.APP_MODE === "cloud" ? (
        <>
          {env.VERCEL_ENV ? <Analytics /> : null}

          <LemonSqueezyAffiliateScript />
        </>
      ) : null}
    </>
  );
}
