import type { Metadata } from "next";

import { Mail, MessageCircle, Zap } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ContactForm } from "./contact-form";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { PageHero } from "@/components/marketing/page-hero";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { Footer } from "@/app/components/footer";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/contact" });
}

export default async function ContactPage() {
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

        <MarketingSection divider flush className="border-b border-border !py-0">
          <ul className="grid grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
            {highlights.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4 px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
                  <Icon aria-hidden className="size-4" />
                </span>

                <div className="min-w-0">
                  <p className="text-base font-medium tracking-tight">{title}</p>

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
