import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { Toc } from "@/components/shared/toc";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { aboutSource } from "@/core/fumadocs/source";
import { founderProfileSchema } from "@/core/seo/schemas";
import { contentLocaleOrDefault } from "@/i18n/locale-registry";
import { enableStaticLocale, type StaticLocaleProps } from "@/i18n/static-locale";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/about" });
}

export default async function AboutPage({ params }: StaticLocaleProps) {
  await enableStaticLocale(params);

  const locale = contentLocaleOrDefault(await getLocale());
  const page = aboutSource.getPage(["about"], locale);

  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <div className="flex flex-col items-center justify-center">
      <JsonLd schema={founderProfileSchema(locale)} />

      <section className="pt-12 md:pt-16 pb-16 md:pb-24 w-full">
        <article className="max-w-6xl mx-auto px-4">
          <Toc items={page.data.toc}>
            <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
              <MDX components={getMDXComponents()} />
            </div>
          </Toc>
        </article>
      </section>

      <Footer />
    </div>
  );
}
