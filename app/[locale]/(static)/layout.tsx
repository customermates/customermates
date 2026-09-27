import { notFound } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";

import { Toaster } from "@/components/ui/sonner";
import { env } from "@/env";
import { isContentLocale } from "@/i18n/locale-registry";
import { MarketingShell } from "@/app/components/navigation/marketing-shell";
import { enableStaticLocale } from "@/i18n/static-locale";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export const revalidate = 86400;

export default async function StaticLayout({ children, params }: Props) {
  const locale = await enableStaticLocale(params);

  if (!isContentLocale(locale)) notFound();

  return (
    <>
      <MarketingShell>{children}</MarketingShell>

      <Toaster />

      {env.APP_MODE === "cloud" ? (
        <>
          {env.VERCEL_ENV ? <Analytics /> : null}

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
