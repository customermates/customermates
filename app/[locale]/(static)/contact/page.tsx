import type { Metadata } from "next";

import { Mail, MessageCircle, Zap } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ContactForm } from "./contact-form";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { PageHero } from "@/components/marketing/page-hero";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { Footer } from "@/app/components/footer";
import { enableStaticLocale, type StaticLocaleProps } from "@/i18n/static-locale";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/contact" });
}

export default async function ContactPage({ params }: StaticLocaleProps) {
  await enableStaticLocale(params);

  const t = await getTranslations();

  const highlights = [
    {
      icon: Zap,
      title: t("ContactPage.highlights.fast.title"),
      body: t("ContactPage.highlights.fast.body"),
    },
    {
      icon: MessageCircle,
      title: t("ContactPage.highlights.personal.title"),
      body: t("ContactPage.highlights.personal.body"),
    },
    {
      icon: Mail,
      title: t("ContactPage.highlights.direct.title"),
      body: t("ContactPage.highlights.direct.body"),
    },
  ];

  return (
    <>
      <div className="flex flex-1 flex-col items-center" data-marketing-flow="continuous">
        <PageHero
          description={t("ContactPage.description")}
          showOpenSourceBadge={false}
          title={t("ContactPage.title")}
          visual={<ContactForm />}
        />

        <MarketingSection className="mk-section-tight pt-0">
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {highlights.map(({ icon: Icon, title, body }) => (
              <li key={title} data-reveal className="mk-card flex gap-4 p-6">
                <span aria-hidden className="mk-icon-tile size-9 text-muted-foreground">
                  <Icon aria-hidden className="size-4" />
                </span>

                <div className="min-w-0">
                  <p className="text-base font-semibold tracking-tight">{title}</p>

                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </MarketingSection>
      </div>

      <Footer />
    </>
  );
}
