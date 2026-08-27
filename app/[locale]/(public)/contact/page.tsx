import type { Metadata } from "next";

import { Mail, MessageCircle, Zap } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ContactForm } from "./contact-form";

import { Footer } from "@/app/components/footer";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";

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
      <div className="flex flex-1 flex-col items-center">
        <section className="flex w-full flex-1 items-center">
          <MarketingContainer className="py-12 md:py-20">
            <div className="grid gap-10 md:grid-cols-5 md:gap-12 lg:gap-16">
              <div className="flex flex-col gap-6 md:col-span-2">
                <h1 className="text-display-sm m-0">{t("ContactPage.title")}</h1>

                <p className="text-lede">{t("ContactPage.description")}</p>

                <ul className="flex flex-col gap-4 pt-2">
                  {highlights.map(({ icon: Icon, title, body }) => (
                    <li key={title} className="flex gap-3">
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </div>

                      <div>
                        <p className="font-medium">{title}</p>

                        <p className="text-meta">{body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="md:col-span-3">
                <ContactForm />
              </div>
            </div>
          </MarketingContainer>
        </section>
      </div>

      <Footer />
    </>
  );
}
