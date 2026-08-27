import { notFound } from "next/navigation";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";

import { Toaster } from "@/components/ui/sonner";
import { env } from "@/env";
import { isContentLocale } from "@/i18n/locale-registry";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function StaticLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!isContentLocale(locale)) notFound();

  return (
    <>
      {children}

      <Toaster />

      {env.APP_MODE === "cloud" ? (
        <>
          <Analytics />

          <Script id="lemon-squeezy-affiliate-config" strategy="beforeInteractive">
            {`window.lemonSqueezyAffiliateConfig = { store: "customermates" };`}
          </Script>

          <Script defer src="https://lmsqueezy.com/affiliate.js" strategy="beforeInteractive" />
        </>
      ) : null}
    </>
  );
}
