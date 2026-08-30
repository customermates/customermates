import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { FAQSection } from "@/components/marketing/faq-section";
import { PageHero } from "@/components/marketing/page-hero";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { helpAndFeedbackSource } from "@/core/fumadocs/source";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/help-and-feedback" });
}

export default async function HelpAndSettingsPage() {
  const locale = await getLocale();
  const page = helpAndFeedbackSource.getPage(["help-and-feedback"], locale);

  if (!page) notFound();

  return (
    <div className="flex flex-col items-center justify-center" data-marketing-flow="continuous">
      <PageHero description={page.data.description} showOpenSourceBadge={false} title={page.data.title} />

      <FAQSection {...page.data.faq} />

      <Footer />
    </div>
  );
}
