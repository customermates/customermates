import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { FAQSection } from "@/components/marketing/faq-section";
import { MarketingContainer } from "@/components/marketing/marketing-container";
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
    <div className="flex flex-col items-center justify-center">
      <section className="w-full pt-12 md:pt-16">
        <MarketingContainer>
          <div className="flex flex-col items-center text-center">
            <h1 className="text-display m-0 max-w-5xl">{page.data.title}</h1>

            <p className="text-lede mt-6">{page.data.description}</p>
          </div>
        </MarketingContainer>
      </section>

      <FAQSection {...page.data.faq} />

      <Footer />
    </div>
  );
}
