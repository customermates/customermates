import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { XFAQSection } from "@/components/x-faq-section";
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
      <section className="pt-12 md:pt-16 pb-16 md:pb-24 w-full">
        <div className="max-w-4xl mx-auto px-4">
          <div className="mb-12 flex flex-col items-center">
            <h1 className="text-x-4xl px-4 max-w-4xl text-center">{page.data.title}</h1>

            <p className="text-x-lg pt-4 md:pt-6 px-4 max-w-4xl text-center text-subdued">{page.data.description}</p>
          </div>

          <XFAQSection {...page.data.faq} />
        </div>
      </section>

      <Footer />
    </div>
  );
}
