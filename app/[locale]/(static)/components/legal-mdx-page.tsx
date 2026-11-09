import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { legalSource } from "@/core/fumadocs/source";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { Toc } from "@/components/shared/toc";

export async function LegalMdxPage({ slug }: { slug: string }) {
  const locale = await getLocale();
  const page = legalSource.getPage([slug], locale);

  if (!page) notFound();

  const MDX = page.data.body;
  const components = getMDXComponents();

  return (
    <div className="flex flex-col items-center justify-center" data-marketing-flow="continuous">
      <section className="relative isolate w-full pt-14 pb-20 sm:pt-20 md:pb-28">
        <div aria-hidden className="mk-hero-light" data-tone="plain" />

        <article className="marketing-container [--toc-anchor-offset:5.5rem] [--toc-sticky-top:5.5rem]">
          <Toc items={page.data.toc}>
            <div className="prose prose-neutral max-w-[82ch] text-[0.9375rem] leading-7 dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-[clamp(2rem,1.55rem+1.8vw,3rem)] prose-h1:leading-[1.08] prose-h1:tracking-[-0.034em] prose-h2:mt-12 prose-h2:text-[1.375rem] prose-a:font-medium prose-a:decoration-foreground/30 prose-a:underline-offset-4">
              <MDX components={components} />
            </div>
          </Toc>
        </article>
      </section>

      <Footer />
    </div>
  );
}
